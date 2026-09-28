# Studio visuel : conception (photo, puis vidéo)

Conçu le 28/09/2026. Rien n'est encore codé. Ce document fixe le parcours et les règles validés en conception ; il sert de cahier des charges pour l'implémentation.

Maquette cliquable (11 écrans, avec les règles dans les notes du canevas) : https://claude.ai/artifact/NHGLtqqNXzZ3sK9Gj7aPPX

## Existant à réutiliser (état du code au 28/09/2026)

- Bibliothèque : `src/pages/PhotosPage.tsx`, table `user_photos`, bucket `user-photos`, description et tags IA par l'edge `photo-describe`.
- Génération d'image OpenAI `gpt-image-2` :
  - `supabase/functions/product-on-model` : mise en scène d'une photo produit (images/edits), toujours à partir de la photo d'origine, recette « anti-effet IA » et charte injectées dans le prompt ;
  - `supabase/functions/carousel-slide-image` : création pure à partir d'une consigne (images/generations).
  - Les deux sont réservées au Premium (décision du 09/07/2026, réponse `premium_required`).
- Photoroom (visage jamais régénéré) : `photo-background-replace` (changer le décor, portrait pro), `photoroom-edit` (packshot).
- Montages par code, offerts : `AvantApresDialog`, `OfferMockupDialog` (accès actuel par `CreateVisualDialog`).
- Crédits : catégorie `photo_retouch` dans `supabase/functions/_shared/plan-limiter.ts` (5 gratuit, 50 Premium, 100 Binôme), 1 crédit par image, `logUsage` uniquement après succès. Coût indicatif d'une image gpt-image : environ 0,17 € (commentaire du 09/07/2026, à revérifier).
- Reels : `reel-render` (JSON2Video), clips Pexels via `stock-video-search`, montage dans `src/components/creer/ReelMontage.tsx`.

## Parcours

### Bibliothèque (/photos)

- Deux portes en haut : « Ajouter des photos » et « Créer avec l'IA » (ouvre le Studio visuel).
- Sous « Créer avec l'IA », une ligne indique ce qui est inclus et ce qui est Premium.
- Lien explicite « Créer un avant/après ou un mockup » vers les montages existants.
- Les onglets Mes photos / Mes préparations / Photos à prendre restent visibles.
- Fiche photo : tous les outils actuels restent en place ; ajout de « Retravailler dans le Studio visuel », qui ouvre le Studio avec la photo au centre.

### Studio visuel : un seul espace, pas d'étapes

- À gauche : la conversation. Écrire librement, joindre une photo, idées tirées du branding (dont au moins une pour une prestation de service et une pour une offre numérique), suggestions d'ajustement.
- Au centre : les visuels. Original, version sélectionnée et variantes, côte à côte ; on clique une version pour indiquer celle qu'on modifie ; bouton de comparaison avec l'original.
- À droite : les détails. Outil choisi, ce qu'il peut et ne peut pas ajuster, format, historique, coût, et la confirmation avant chaque génération.
- Sessions conservées pour reprendre un travail.
- Sorties : « Enregistrer dans ma bibliothèque », « Utiliser dans un contenu ».
- Mobile : le visuel prend l'écran, la conversation et la confirmation sont dans un panneau en bas.

## Règles

1. **Le Studio prolonge les outils existants, il ne les remplace pas.** Il comprend la demande et oriente vers l'outil adapté (mise en scène, changer le décor, portrait, packshot, création libre), puis permet d'ajuster le résultat.
2. **Aucune image sans confirmation.** Première demande, message libre ou suggestion : tout passe par « Vérifier ma demande », qui affiche ce qui a été compris (à préserver, à changer, lumière, format), l'outil, la version visée et le coût. La personne corrige en français, sans prompt technique.
3. **Chaque outil annonce ce qu'il peut faire.** Mise en scène : décor, lumière, cadrage, porté ou posé. Changer le décor ou portrait : le fond seulement. Création libre : tout, sans garantie de fidélité.
4. **Promesses prudentes.** Jamais « identique » : « Je préserverai la forme et les couleurs… Compare le résultat à l'original avant de l'utiliser. »
5. **Historique.** Il vit dans le Studio : il relie l'original, chaque demande, chaque version et ses variantes, et permet de revenir à n'importe quelle version. Quand un produit ou un visage est en jeu, chaque ajustement repart de la photo d'origine (sinon le produit se déforme). Seules les images enregistrées entrent dans `user_photos`.
6. **Portraits.** Par défaut, on passe par Photoroom : le visage est détouré, pas redessiné. La transformation générative n'est proposée que comme option explicite (« ton visage sera redessiné ») et l'image est marquée « générée par IA ».
7. **Formule gratuite.** Le Studio est accessible, mais limité aux outils Photoroom (décor, portrait, packshot) dans la limite des images du mois. Création libre, mise en scène et variantes sont Premium, et c'est affiché dès l'entrée. Une demande Premium faite en gratuit propose l'alternative incluse.
8. **Coût.** Seule une image confirmée et réussie est décomptée. Une question, une réponse ou une demande refusée ne coûte rien.
9. **Interdits hérités.** Pas de personnalité réelle, pas de logo d'une autre marque, pas de texte incrusté par l'IA d'image.

## Vidéo (hors V1)

Aucun bouton vidéo n'est affiché tant que la vidéo n'est pas prête. Le Studio est seulement conçu pour l'accueillir.

- **Animer une image.** Uniquement des mouvements de caméra doux au départ (approche lente, léger panoramique, plan fixe vivant, recul). Pas de « produit qui tourne » à partir d'une seule photo, car la vidéo inventerait les faces cachées. Avertissement : un mouvement de caméra peut révéler des détails absents de la photo.
- **Créer un plan de coupe (B-roll).** Accessible depuis le Studio et depuis le montage d'un reel. Dans le montage, pour une phrase à illustrer, trois choix : « Utiliser ma vidéo », « Chercher un plan existant » (Pexels), « Générer un plan de coupe ». Un plan généré est marqué « plan illustratif » et ne doit jamais être présenté comme une vraie scène de l'activité.
- **Fournisseur.** Pas encore choisi (Runway, Veo, Kling, en direct ou via un agrégateur). À décider après des tests comparatifs sur des cas réels :
  - produit à partir de sa photo ;
  - prestation de service sans photo source ;
  - offre immatérielle ;
  - produit : plan à partir de la photo comparé à un plan à partir du texte seul ;
  - série de trois plans cohérents ;
  - insertion dans un vrai reel.

  Critère principal : le nombre de générations nécessaires pour obtenir un plan utilisable, ainsi que le délai et le coût. Le coût en crédits d'un clip sera fixé ensuite.

## Ordre d'implémentation proposé

1. Tables de sessions et de versions du Studio (avec RLS et filtrage par workspace).
2. Edge function « Studio » qui :
   - comprend la demande et prépare la vérification ;
   - appelle ensuite `product-on-model`, `photo-background-replace`, `photoroom-edit`, ou une création libre dérivée de `carousel-slide-image` ;
   - respecte le schéma `checkQuota` avant, `logUsage` après succès.
3. Écran en trois zones, puis la version mobile.

## Points ouverts

- La compréhension de chaque message demande un appel à un modèle de langage, non décompté. C'est un coût pour Nowadays : prévoir une limite de fréquence.
- Plus tard, pour les Premium : option « ne plus me demander pour les ajustements à 1 image ».
- Vérifier les coûts et le nom du modèle d'image avant de fixer les règles commerciales.
