# Ne plus bloquer la réponse après la scène

## Ce qui se passe vraiment (vérifié dans ta session)
Ce n'est pas la scène qui manque. La scène devient bien l'image de départ quand tu réponds.

Le blocage vient d'une autre photo :
- Ta session contient 3 photos : « bag dino+S (2) », « dino1 (2) » et « Mannequin brutaliste urbain ».
- Pour la scène, le Studio n'a retenu que 2 d'entre elles : le mannequin et « dino1 (2) ».
- Quand tu réponds « intégrer mannequin brutaliste urbain », il voit que tes photos actuelles (3) ne sont pas exactement celles de la scène (2). Il s'arrête alors pour te demander lesquelles utiliser, sans rien lancer ni décompter.

C'est une précaution normale, mais ici elle n'a pas lieu d'être : rien n'a été retiré, une photo non utilisée est seulement restée dans la liste. Et le message ne dit pas de quelles photos il s'agit.

## Ce qui va changer
1. **Pas de question inutile après une scène.** Si toutes les photos retenues pour la scène sont toujours là et qu'il y en a simplement d'autres en plus, le Studio continue sans demander, avec les photos de la scène. La proposition d'intégration liste toujours les photos utilisées, et tu confirmes avant toute création.
2. **Question plus claire quand elle reste utile** (photo retirée ou changée) : l'encadré nomme les photos.
   - « Celles de cette version : Mannequin brutaliste urbain, dino1 (2) »
   - « Mes photos actuelles : bag dino+S (2), dino1 (2), Mannequin brutaliste urbain »

## Hors périmètre
- Aucun changement dans la création des images, les quotas ou le prix.
- Pour les autres images (retouches, intégrations), la règle actuelle reste la même.

## Détails techniques
- `supabase/functions/visual-studio/index.ts` (~ligne 570) : si la version parente est en phase `scene` et que chaque référence de `referencesAtVersion(parent.proposal)` existe toujours dans les références de la session (on n'a fait qu'en ajouter), ne pas renvoyer 409 `branch_reference_choice` et utiliser `branch_reference_mode = "version"` implicitement.
- Helper pur dans `branch-context.ts` (`onlyAdditions(versionRefs, currentRefs)`) + test Deno : ajout seul, cas de cette session, retrait et changement de rôle (qui posent toujours la question).
- `src/pages/VisualStudioPage.tsx` (~ligne 1564) : l'encadré affiche les noms des photos de chaque option (version sélectionnée et session).
- Vérifications : tests Deno ciblés, tests Studio, typage. Redéploiement de `visual-studio` uniquement. Site publié seulement si tu le demandes.
