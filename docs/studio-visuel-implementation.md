# Studio visuel — premier lot photo

État du 28 septembre 2026. Branche `codex/studio-visuel-photo`.
Conception de référence : [studio-visuel.md](./studio-visuel.md).

## Périmètre de ce lot

- Entrées depuis la bibliothèque et la fiche d’une photo.
- Conversation à gauche, original/versions au centre, confirmation à droite ; conversation et confirmation en panneau mobile.
- Changement de fond Photoroom, y compris pour les portraits. La compréhension utilise Haiku 4.5 et une réponse structurée. Les demandes relevant d’un autre outil sont orientées vers la bibliothèque.
- Original copié dans un bucket privé au début de la session. Sessions, demandes et versions conservées séparément de la bibliothèque.
- Envoyer prépare une proposition. Générer confirme un identifiant de proposition précis. Ajouter à la bibliothèque est une action distincte et rejouable sans doublon.
- Créer un contenu transmet la photo au parcours `/creer` existant ; aucune publication.
- Packshot, mise en scène, préparation individuelle, collections, kits, montages et autres outils existants conservés.

Ce lot ne couvre pas encore la création libre, le packshot ou la mise en scène **dans la conversation**, ni la vidéo. Les idées du Studio sont des suggestions de fond fixes ; la charte est transmise à l’interpréteur. Le bouton d’entrée est nommé « Studio visuel » pour ne pas annoncer de création sans photo alors que ce premier lot nécessite une source.

## Fonctionnement et choix techniques

Tables : `visual_studio_sessions`, `visual_studio_versions`, `visual_studio_interpretations`. Lecture des sessions et versions autorisée aux membres de l’espace ; écritures et RPC réservées au serveur, avec vérification owner/manager/editor. Les objets privés sont servis par URL signées de quinze minutes. Une expiration d’aperçu se recharge sans régénérer.

La fonction `visual-studio` a cinq actions : create, read, message, generate, save. Elle vérifie l’identité et l’espace avant d’accéder aux sources. L’original réellement utilisé est indiqué avant confirmation, y compris quand une autre version est sélectionnée.

Le moteur Photoroom est appelé directement dans un worker dédié. L’ancienne fonction `photo-background-replace` enregistre immédiatement dans `user_photos` et décompte après son propre succès : l’appeler telle quelle aurait ajouté automatiquement tous les essais à la bibliothèque. Le nouveau worker utilise le même endpoint de fond, puis conserve le résultat dans le Studio avant de valider l’usage. Paramètre JPEG vérifié dans la [documentation Photoroom](https://docs.photoroom.com/getting-started/changelog).

- Un verrou SQL par espace n’accepte qu’une génération Studio en cours. Le même identifiant ne relance jamais Photoroom.
- Le résultat et l’écriture `ai_usage` sont validés par une transaction après présence de l’objet Storage ; un nouvel appel à cette transaction ne décompte pas deux fois.
- Pas de relance automatique du fournisseur. Une réponse Storage/SQL incertaine laisse le résultat récupérable. Une lecture après dix minutes réconcilie le fichier éventuel, ou marque un résultat absent en échec.
- Les contrôles de plan/quota existants sont réutilisés ; exemptions QA/admin et bonus conservés. Le verrou concerne le Studio : les autres outils ne réservent pas encore leurs crédits avec lui. Une garantie globale contre la concurrence de plusieurs outils demanderait une évolution du système de quotas existant.
- L’interprétation n’entame pas le quota client. Ses tentatives sont bornées durablement à six par minute et cent sur vingt-quatre heures par compte, avec cinquante messages par session.
- Les brouillons locaux sont séparés par compte, espace et session. Les réponses tardives d’un espace quitté sont ignorées. Un nouveau texte saisi pendant une requête reste dans le champ.
- L’effacement d’un compte inventorie les fichiers Studio par session/espace avant la suppression des lignes. Le nettoyage existant par préfixe utilisateur ne suffisait pas pour ce bucket.

## Vérifications réalisées

Sur la combinaison avec `main` à `3a25bfb3` :

- 1 848 tests Vitest passés, puis contrôle ciblé des sept tests Studio après l’ajustement des dépendances React.
- 1 080 tests Deno passés. Les douze tests de la nouvelle fonction ont également été exécutés avec vérification des types.
- Typage TypeScript de l’application, typage Deno de la fonction, lint accessibilité, lint ciblé et knip.
- Build Vite de production réussi ; avertissements de taille de chunks préexistants.
- Migration exécutée dans une base PGlite jetable : accès viewer/étranger/anon, refus des RPC client, quotas, répétition de confirmation, absence de débit sans fichier, débit unique, enregistrement explicite/idempotent et conservation des anciennes photos, limites de conversation et cascade d’espace.
- Interface du **composant réel** parcourue dans Chromium à 1 440 × 1 000 et 390 × 844, avec authentification, images et services simulés. Ce contrôle ne valide pas un appel Photoroom réel ni une session Supabase connectée.

Les schémas actuels `user_photos` / `ai_usage` et les policies Storage ont été consultés en lecture seule. Aucune migration de production ni génération payante effectuée lors de cette livraison.

## Avant mise en service

1. Appliquer la migration additive `20260928120835_e16c6bbb-7c86-445f-b682-a3aa900d9629.sql` après contrôle du registre réel. Vérifier que `visual-studio` est privé et qu’aucune policy générale ne permet un accès client aux objets.
2. Déployer les fonctions `visual-studio` **et** `delete-account` depuis le même commit. Les clés Anthropic et Photoroom sont des secrets serveur déjà utilisés par le projet ; aucune clé n’est ajoutée au navigateur.
3. Sur un compte de recette, vérifier création/reprise de session, une génération réelle, conservation du fichier, exactement une ligne d’usage, enregistrement en bibliothèque, accès lecture seule et changement d’espace. Vérifier une réponse perdue sans nouvel appel fournisseur.
4. Publier le frontend une fois ces vérifications réussies, puis contrôler les assets et le parcours public connecté.

Le déploiement ciblé des fonctions Edge passe par l’agent Lovable, autorisé explicitement par Laetitia lors de l’activation ci-dessous. La publication frontend reste conditionnée à la recette décrite ci-dessous.

## Activation serveur — 28 septembre, 12:09 UTC

PR #1064 fusionnée : `45a60ff7`, version source `7c53cde6` validée par les cinq contrôles CI. Lovable a créé la migration `20260928120835` et régénéré uniquement les types Supabase (`5f091cc2`). Le SQL appliqué est identique au fichier initial sauf l'instruction de création du bucket, refusée par la plateforme avant toute exécution. Le fichier initial redondant a été retiré et le test SQL référence désormais le fichier du registre. Ne pas rejouer la migration.

Pour un nouvel environnement, provisionner nativement `visual-studio`, privé, limite exacte 15 000 000 octets, sans policy client sur Storage. L'outil natif ne permet pas de configurer les MIME autorisés : ils sont donc NULL sur le bucket ; les fonctions serveur vérifient jpeg/png/webp à la lecture et JPEG en sortie du fournisseur. Ce n'est pas une restriction MIME au niveau Storage.

Reçu natif : « Successfully deployed edge functions: visual-studio, delete-account ». Code identique à `45a60ff7`, aucune version individuelle exposée. Contrôle indépendant : quatre RPC definer avec search_path public ; EXECUTE refusé à anon/authenticated et autorisé à service_role ; bucket privé et taille confirmés. Les 112 photos préexistantes ont la même empreinte avant/après.

La session Studio a été créée depuis la fiche photo dans l'aperçu authentifié. L'essai d'interprétation puis de génération a été bloqué avant envoi par le contrôle automatique, qui exige une autorisation spécifique de transmission à Anthropic et Photoroom. Une question précise est en attente ; aucune génération réelle ni publication frontend à ce stade.
