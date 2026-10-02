# Studio visuel — la proposition se lit comme un message du chat, l'action principale passe dans le champ de saisie

## Demande

Dans le Studio photo, la carte « À confirmer / La scène à valider / Ce que j'ai compris » est trop dense dans le chat : on ne comprend pas pourquoi tout ce texte arrive d'un coup. Laetitia veut :

1. Que la proposition se lise comme un vrai message de chat (une bulle simple, comme les autres messages).
2. Que le bouton principal (« Créer la scène », « Générer cette image », etc.) arrive **à la place d'« Envoyer »**, dans la barre de saisie en bas — c'est là qu'on cherche naturellement l'action.
3. Ne rien toucher à la logique derrière : mêmes données, mêmes règles de décompte, mêmes conditions de blocage.

## Ce qui change

### 1. Côté chat — la carte devient une conversation

La fonction `confirmation()` dans `src/pages/VisualStudioPage.tsx` (lignes ~898-1100) est restructurée :

- **Bulle de chat** : le résumé (`cleanStudioSummary(proposal.summary)`) s'affiche dans une bulle `studio-message` identique aux autres messages du Studio, précédée de l'étiquette « Studio » comme les autres. Une seule ligne courte en dessous : le coût (« Cette scène compte 1 image ») et, pour les scènes, le rendu Soul choisi en une ligne.
- **Tout le reste va dans un bloc replié** « Voir les détails de la demande » (un `<details>` discret, fermé par défaut) : position du produit, point de vue, références, textes exacts, métadonnées (outil, format, images utilisées), presets Soul alternatifs, avertissements, notice d'accès/quota, option « D'abord une image pilote », contexte de marque. Rien n'est supprimé, tout reste atteignable.
- **Plus de bouton « Modifier ma demande »** : pour modifier, on répond simplement dans le champ du chat (« plutôt un escalier moderne »…). Une phrase courte sous la bulle le dit : « Pour changer quelque chose, réponds-moi simplement ci-dessous. » Le texte d'aide du champ devient « Réponds pour ajuster la proposition… » quand une proposition attend.
- Le bloc « Envoie ta demande pour actualiser la proposition » (quand le champ contient déjà du texte) reste dans les détails ; le bouton principal de la carte disparaît (il déménage en bas).
- L'état vide (« Une idée, une question, une image ») reste tel quel. La section d'intégration « Ta scène est prête à être examinée » n'est pas touchée (périmètre chirurgical).

### 2. Côté champ de saisie — le bouton principal remplace « Envoyer »

Dans le composer (ligne ~1595-1612) :

- **Quand une proposition attend confirmation et que le champ est vide** : le bouton bordeaux arrondi affiche le libellé actuel de la proposition (« Créer la scène · 1 image », « Générer cette image · 1 image », « Valider cette scène et intégrer mes références · 1 image », « Générer la série · N images ») et déclenche exactement le même appel `mutate("generate", …)` avec les mêmes conditions de désactivation (quota, Premium, busy, génération en cours…).
- **Dès que l'utilisatrice tape du texte** : le bouton redevient « Envoyer » (comportement actuel : envoyer le message actualise la proposition). Une micro-phrase d'aide le précise quand une proposition est en attente.
- Les icônes Importer / Bibliothèque et la rangée d'outils ne changent pas.

### 3. Styles (`src/features/visual-studio/studio.css`)

- Petites classes pour le `<details>` replié (résumé discret, couleur atténuée, curseur pointeur) et pour la phrase d'action sous la bulle — dans l'esprit des `.studio-chat-actions` existants.
- La carte `.studio-confirm` reste utilisée par la section d'intégration et l'état vide : pas de suppression de styles partagés.

## Ce qui ne change pas

- Aucune logique, aucun appel backend, aucun décompte, aucune condition de blocage.
- La phrase d'actions sur l'image livrée précédemment, le composer (outils, pastille, accordéon photos), les onglets, la préparation, la bibliothèque, les vidéos.
- Fichier `ReferenceCards.tsx` : NE PAS TOUCHER.

## Vérifications

- Mettre à jour `src/test/visual-studio.test.tsx` : les tests qui cliquent le bouton de génération dans la carte cliquent désormais le bouton du composer (même libellé) ; nouveaux tests — la bulle de chat affiche le résumé, les détails sont repliés et s'ouvrent, « Modifier ma demande » remplit le champ, le bouton du composer affiche « Envoyer » quand le champ contient du texte.
- `npx tsgo --noEmit -p tsconfig.app.json`, suite Studio au vert, build OK.
- Capture Playwright de l'état vide ; pour une session avec proposition, vérification par les tests automatisés (limite connue du bac à sable qui ne charge pas les sessions).
