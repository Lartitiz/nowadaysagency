# Alléger l'en-tête du chat du Studio visuel

## Constat

En haut de la colonne de conversation, un bandeau affiche le nom de la session (« Ta demande » ou le titre de la discussion) plus une ligne d'aide « Fais défiler la conversation ↓ · tout reste dans cette session ». Sur un écran de 721 px de haut, ce bandeau prend de la place au détriment des messages, et son information est redondante : le nom de la session est déjà visible dans la colonne de gauche (liste des sessions) et dans le fil d'Ariane en haut de page.

## Ce qui change

Dans `src/pages/VisualStudioPage.tsx` (fonction `chat`) :

- Sur grand écran (vue deux colonnes) : le bandeau d'en-tête du chat est supprimé — la conversation commence directement par les messages.
- Sur mobile : le bandeau est conservé tel quel (il sert de repère quand la liste des sessions n'est pas visible).
- Rien d'autre ne bouge : messages, suggestions sélectionnables, poignée de séparation, galerie d'images.

## Vérifications

- Aperçu (session connectée, 982 et 1270 px de large) : le chat commence par les messages, plus de bandeau ; la hauteur gagnée est bien récupérée par la zone de messages.
- Compilation TypeScript sans erreur.

Le frontend ne sera pas publié.
