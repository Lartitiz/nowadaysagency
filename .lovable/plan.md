## Diagnostic — pourquoi l'export PPTX éditable est bancal

L'étude `etude-design-claude.docx` met le doigt sur la bonne tension : HTML est expressif et fluide, PPTX est rigide (canvas fixe, polices limitées, pas de wrap auto). Aujourd'hui notre exporter `export-carousel-hybrid-pptx.ts` essaie de faire les deux en même temps — capturer le HTML en image **et** superposer du texte éditable — et c'est là que ça casse.

Les 4 problèmes concrets identifiés :

1. **Double-rendu incohérent** — Stratégie A masque *un seul* élément (le smallest container du `overlay_text`), Stratégie B masque les blocs détectés heuristiquement. Mais beaucoup de slides ont **du texte qui n'entre dans aucune des deux logiques** : il reste imprimé dans l'image **et** rien ne le rend éditable. D'où l'impression "y'a des textes dans l'image et d'autres éditables".
2. **Heuristique de détection fragile** — `extractEditableBlocks` filtre sur `minFontPx ≥ 20`, écarte les ancêtres de candidats, exige `width ≥ 20px`. Sur des layouts denses (titre + sous-titre + numéro + footer), la moitié des textes passe à travers les mailles ou au contraire est dédupliquée trop agressivement.
3. **Mismatch visuel image vs texte PPTX** — On capture en `scale: 3` puis on ré-écrit le texte avec `mapFontToPptx` (Georgia/Calibri/Verdana/Trebuchet). La police remplaçante n'a ni les mêmes métriques, ni le même letter-spacing, ni le même line-height que la Google Font d'origine → décalage visible, surtout sur les titres serif.
4. **Pas de marqueur côté HTML** — Les slides générées par l'IA n'indiquent pas quels noeuds sont du "vrai contenu éditable" vs de la décoration. L'exporter doit deviner. C'est la racine du problème.

L'étude propose une vraie discipline : **ne pas chercher la fidélité littérale**, traiter PPTX comme un format d'**exécution**, pas d'exploration. On va appliquer ça au code.

---

## Plan — 3 chantiers

### Chantier 1 — Source de vérité unique : `data-pptx-editable`

Plutôt que de deviner, on **annote** le HTML des slides avec `data-pptx-editable="title|body|overlay|caption"` au moment de la génération. L'exporter ne fait alors que :

- masquer **tous** les noeuds annotés avant capture image
- ré-injecter ces noeuds (et eux seuls) en texte PPTX

Concrètement :

- Mettre à jour les prompts visuels (côté Edge Function `pinterest-visual` et le générateur de carrousel) pour qu'ils ajoutent `data-pptx-editable` sur les blocs texte significatifs (titre, sous-titre, corps, overlay, numéro de slide).
- Fallback : si **aucun** noeud annoté n'est trouvé, on retombe sur l'heuristique actuelle (rétro-compatibilité avec les slides déjà générées).

Bénéfice : fini le double-rendu. Ce qui est dans l'image n'est jamais aussi dans le texte, et inversement.

### Chantier 2 — Stratégie de capture cohérente

Dans `export-carousel-hybrid-pptx.ts` :

- **Étape 1** : parser le doc, sélectionner `[data-pptx-editable]`. Si vide → fallback heuristique.
- **Étape 2** : capturer chaque bloc → `BlockRender` (texte, rect, style).
- **Étape 3** : appliquer `data-pptx-hide="true"` sur **tous** les blocs retenus (et leurs descendants texte) — pas juste un.
- **Étape 4** : forcer un reflow (`getBoundingClientRect()` sur body), attendre 2 RAFs, puis capturer en `scale: 3`.
- **Étape 5** : ré-injecter les blocs en `slide.addText()` avec les coords pré-calculées.

Côté `pptx-font-mapping.ts`, ajouter :

- Détection `data-pptx-hide` étendue : si un parent est marqué hidden, ne pas ré-extraire ses enfants.
- `extractEditableBlocks` doit ignorer les noeuds annotés `data-pptx-editable` (pour éviter doublons quand on combine les deux).

### Chantier 3 — Réduire le mismatch visuel (polices + tailles)

L'étude liste les pairings PPTX-safe : Georgia+Calibri, Cambria+Calibri, Trebuchet+Calibri. On va :

- **Tailles** : `fontSizePxToPt` applique déjà un facteur `0.92`. On va le tuner à `0.94` après tests visuels (la majorité des cas actuels sont *trop petits* en PPTX par rapport à l'image).
- **Letter-spacing** : capturer `letterSpacing` du computed style et le passer à `pptxgenjs` via `charSpacing` (en centièmes de point). Aujourd'hui ignoré → écart visible sur les titres en small caps.
- **Couleur de fallback** : actuellement hardcodée `FFFFFF`. Utiliser `charter.color_text` quand l'élément n'a pas de couleur explicite.

### Détails techniques

Fichiers touchés :

- `src/lib/export-carousel-hybrid-pptx.ts` — refonte stratégie A/B → stratégie unique annotée + fallback.
- `src/lib/pptx-font-mapping.ts` — ajout `charSpacing`, ajustement `fontSizePxToPt`, exclusion des noeuds `data-pptx-editable` du fallback heuristique.
- `supabase/functions/pinterest-visual/index.ts` (et autres générateurs visuels actifs) — instruction prompt : ajouter `data-pptx-editable` sur les blocs texte significatifs.
- `src/lib/export-pinterest-editable-pptx.ts` — appliquer la même logique (à vérifier qu'elle existe et s'il faut factoriser).

Pas de changement DB, pas de changement UI utilisateur — juste un export qui marche.

### Validation

Après implémentation, tester sur 3 carrousels représentatifs (déjà générés en base) :

1. Un carrousel "photo + overlay court"
2. Un carrousel "tout texte" (3-4 blocs par slide)
3. Un carrousel mixte

Pour chacun :

- Exporter en PPTX éditable
- Ouvrir dans LibreOffice, convertir en PDF, vérifier visuellement
- Critères : aucun texte dupliqué (image+pptx), aucun texte manquant, écart de position < 10px, polices cohérentes.

### Hors-scope (suggéré pour plus tard)

- Refonte des prompts pour adopter le workflow de l'étude (HTML → PPTX en 2 phases avec invariants explicites).
- Ajout d'un mode "PDF depuis HTML" pour les livrables où l'édition n'est pas requise (qualité visuelle maximale, comme recommandé par l'étude pour audits/études).