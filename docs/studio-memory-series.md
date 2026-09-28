# Studio visuel — mémoire, références et séries

## Capacités livrées

- Conversation ouverte, avec ou sans source ; catalogue de compétences versionné et règles de fidélité propres au rôle de chaque référence.
- Huit références maximum : produit, personne, mannequin fictif, ambiance, composition et logo exact. Références visuelles de la charte choisies explicitement, recherche de photos par leurs métadonnées au-delà des 60 dernières.
- Mémoire d’espace : préférences explicites, directions visuelles et mannequins fictifs réutilisables. Une demande ponctuelle ne devient jamais automatiquement une préférence. Le mannequin est une image de référence conservée, pas un entraînement Soul ID ni une identité garantie.
- Séries de 2 à 4 images, coût total avant confirmation, option d’une image pilote, reprise d’un échec seulement. Les résultats réussis restent dans la session ; ajout à la bibliothèque explicite.
- Compositions avec texte et logo éditables, sauvegardées dans la session, PNG 1080 px, formats 1:1, 4:5, 9:16. Une composition courante par session ; pas d’historique des modifications textuelles. Le PNG exporté est aplati ; son texte se réédite dans le Studio.
- Avant/après et mockup accessibles depuis le Studio avec les images sélectionnées ; leur résultat enregistré peut revenir comme référence de composition.

## Livraison

Appliquer dans l’ordre les quatre migrations `20260928200000` à `20260928203000`, puis déployer `visual-studio`, puis publier le frontend. Les anciens clients version 2 continuent à recevoir des propositions d’une seule image pour éviter toute charge de série cachée.

## Higgsfield images : branchement préparé, activation séparée

L’adaptateur serveur utilise uniquement les routes officielles `marketing-studio/image/flare` et `marketing-studio/image/sunburst`, avec `enhance_prompt=false` pour préserver notre brief. Paramètres initiaux : 2K, qualité high, modération auto. Les images de référence sont envoyées via l’upload officiel ; les résultats sont archivés dans notre stockage privé.

L’activation requiert **tous** les paramètres suivants, conservés côté serveur :

- `HIGGSFIELD_API_KEY` au format `KEY_ID:KEY_SECRET` ; jamais côté navigateur.
- `HIGGSFIELD_IMAGE_ENABLED=true`.
- `HIGGSFIELD_DATA_USE_REVIEWED=true`, après vérification réelle des paramètres de réutilisation des données du compte et de leur compatibilité avec les photos confiées au service. Ce drapeau n’effectue pas cette démarche chez Higgsfield.
- `HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD` positif, choisi par l’exploitante. Réservation atomique sur les **estimations** fournisseur ; ce n’est pas une garantie de plafond de facture réel pour une facturation variable. Une estimation > 2 USD par image est refusée.

À défaut, le Studio garde les moteurs image déjà configurés. Aucun achat ni recharge API automatique, aucun basculement payant après une réponse incertaine.

Une soumission est unique par version. Après acceptation, les lectures et callbacks vérifient seulement cette demande. Résultat perdu, incident réseau ou 5xx : état incertain, jamais un second POST payant. Un callback peut retrouver l’identifiant perdu. Sans callback ni identifiant, une intervention d’exploitation est nécessaire ; ne pas marquer arbitrairement la demande comme échouée pour autoriser une régénération. Les estimations incertaines restent réservées. Aucune clé ni URL de callback privée n’est exposée dans l’état frontend.

## Limites à conserver dans le discours produit

- Fidélité produit, visage et cohérence d’une série restent à vérifier sur chaque résultat. Pour un mannequin nouveau, approuver une première image avant la série.
- Pas d’outil de masque ni de modification fine garantie de l’expression d’un visage. La conversation explique ces limites et propose une approche possible.
- Pas de Soul ID activé, pas de promesse 4K native vidéo. L’intégration vidéo est un chantier indépendant.
- La recherche utilise les descriptions/noms disponibles, pas une recherche sémantique sur tous les pixels de la bibliothèque.
- Les essais automatisés de l’adaptateur n’établissent pas la qualité réelle de Flare/Sunburst ni l’accès effectif du compte. Une recette API réelle reste requise avant activation.

## Recette

- TypeScript app + Deno type-check.
- Tests React : droits, sessions, messages, confirmation, séries, mémoire, composition.
- Tests Deno : interprétation, rôles des sources, coût de série, ancien client, reprise fournisseur (callback, reçu perdu, 404 de suivi), original et quota.
- Fixture SQL réelle : droits NULL/viewer/extérieur, écritures/rejeux/conflits mémoire, quotas de séries, réservations de coût, composition, conservation bibliothèque et cascade compte/espace.
- PNG téléchargé depuis le navigateur puis ouvert et comparé à l’aperçu. Une police générique mal rendue à l’export a été corrigée avec une famille explicite sur les éléments texte.
