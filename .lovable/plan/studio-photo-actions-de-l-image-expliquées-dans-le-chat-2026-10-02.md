# Studio photo — actions de l'image expliquées dans le chat

## Demande
Laetitia ne comprend pas les deux boutons sous l'image dans le chat du Studio (menu caché « Autres actions ⋯ » + « Créer un contenu »). Ses réponses :
- Les actions doivent être **expliquées dans le texte du chat** (« décrits-moi : est-ce que tu peux faire ci ou ça »), pas dans un menu.
- Le passage « Créer un contenu » est **supprimé pour l'instant**.

## Ce qui change (fichier unique : `src/pages/VisualStudioPage.tsx`)

Remplacer la section `studio-chat-actions` (lignes ~1215-1280 : DropdownMenu « Autres actions » + bouton « Créer un contenu ») par un bloc de chat assistant qui décrit les actions possibles en une phrase naturelle, avec les actions en **mots cliquables** (liens bordeaux, style `Button variant="link"` inline, comme « Corriger les textes de cette affiche » déjà présent).

Texte du bloc (contextuel, seuls les items applicables apparaissent) :

> « Avec cette image, tu peux [comparer avec la photo d'origine], [finaliser l'affiche avec ses textes], [créer une vidéo], [ajuster la lumière ou le format] ou [l'ajouter à ta bibliothèque]. »

- Chaque crochet = un lien cliquable qui déclenche exactement la même action qu'aujourd'hui (mêmes handlers : `setCompare`, `setCompositionOpen`, `chooseTab("video")`, `openPreparation()`, `save()`). Quand l'image est déjà dans la bibliothèque, l'item devient un texte non cliquable « elle est dans ta bibliothèque ».
- Conditions d'affichage conservées à l'identique : comparaison seulement si `version && comparisonSource` ; affiche seulement si `version.proposal.composition` ; vidéo seulement si `version.status === "ready"` ; lumière seulement si `display` ; bibliothèque seulement si `version`.
- Virgules / « ou » assemblés proprement selon les items visibles (petit helper local).
- Le bloc disparaît s'il n'y a ni version ni photo source (même condition que la barre actuelle).
- Le style reste Apple minimal : texte 13-14 px gris, liens bordeaux soulignés discrets ; la barre horizontale `studio-image-action-bar` et son trait de séparation sont retirés du CSS (`studio.css`) si plus utilisés ailleurs.

## Suppression
- Le bouton « Créer un contenu » (et sa navigation vers `/creer` avec `libraryPhotoIds`) disparaît de cette section. La logique `save(true)` reste dans le code mais n'est plus appelée ici — rien d'autre ne change.

## « NE PAS TOUCHER »
- Composer, conversation, confirmation de proposition, intégration, onglets, préparation, bibliothèque, vidéos : aucune autre modification.
- Les autres « Autres actions » de l'app (CréerStepResult, PhotoDetailDialog, BrandingIdentityCard…) ne sont pas concernés.

## Tests (`src/test/visual-studio.test.tsx`)
- Mettre à jour les 5 tests qui cliquent « Autres actions » (lignes 174, 278, 457, 466, 673) : ils cliquent désormais le libellé cliquable correspondant dans la phrase du chat (ex. « créer une vidéo », « comparer avec la photo d'origine »).
- Adapter le test « Créer un contenu » (ligne 187) : ce bouton n'existe plus — remplacer par une vérification que la phrase du chat affiche bien les actions disponibles, et que la navigation vers `/creer` n'est plus déclenchée depuis cette section.
- Vérifier qu'aucun autre test ne dépend de `studio-image-action-bar`.

## Validation
- Tests du Studio au vert + `tsgo` typage + build.
- Capture Playwright du chat avec une image prête pour vérifier la lisibilité (phrase + liens bordeaux, plus aucun menu ⋯ ni bouton « Créer un contenu »).

## Mise à jour documentation
- `AGENTS.md` : remplacer la règle « actions secondaires du Studio en menu overflow » par « les actions sur l'image du Studio sont décrites en phrases cliquables dans le chat (pas de menu caché ni bouton Créer un contenu dans cette section) ».
