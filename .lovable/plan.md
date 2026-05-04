# Préserver le rich text inline à l'export PPTX éditable

## (a) Ce que tu m'as demandé — périmètre validé

### Problème
Quand Opus génère un titre type :
```html
<h2 data-pptx-editable="title">Le <span style="font-style:italic;color:#FB3D80">vrai</span> secret</h2>
```
- Preview HTML : "vrai" apparaît italic + accent.
- PPTX exporté : "Le vrai secret" en un seul style (couleur du `<h2>` parent), le mot accent est perdu.

### Cause confirmée
- `extractAnnotatedBlocks` (`src/lib/pptx-font-mapping.ts`, ligne ~306) appelle `el.textContent` → string aplatie.
- `addBlockToSlide` (`src/lib/export-carousel-hybrid-pptx.ts`, ligne 390) appelle `slide.addText(string, {style global})` → un seul style.

### Modifications

**1. `src/lib/pptx-font-mapping.ts`**

- Ajouter type exporté :
  ```ts
  export interface TextRun {
    text: string;
    bold?: boolean;
    italic?: boolean;
    color?: string;       // hex 6 chars sans `#` (déjà normalisé via normalizeHex)
    fontWeight?: number;  // poids brut pour info, addText utilise `bold`
  }
  ```
- Étendre `EditableBlock` avec un champ optionnel `runs?: TextRun[]`. Le champ `text: string` reste (rétrocompat + fallback).
- Refondre `extractAnnotatedBlocks` :
  - Pour chaque bloc annoté, walker les descendants (TreeWalker `NodeFilter.SHOW_TEXT`).
  - Pour chaque text node non vide : récupérer `getComputedStyle(parentElement)`, en extraire `fontStyle`, `fontWeight`, `color` (normalisés), comparer au style "frame" (celui du bloc lui-même).
  - Construire un `TextRun` par text node. Coalescer les runs adjacents qui partagent exactement les mêmes overrides (bold/italic/color identiques au frame ou identiques entre eux) pour éviter la fragmentation.
  - Si tous les runs sont strictement identiques au style frame → ne pas peupler `runs` (laisser `undefined`) pour garder le chemin actuel.
  - `block.text` reste le `textContent` concaténé (rétrocompat).
- `extractEditableBlocks` : NON touché.
- `mapFontToPptx`, `normalizeHex`, `fontSizePxToPt`, `letterSpacingPxToCharSpacing`, `pxToInches` : NON touchés.

**2. `src/lib/export-carousel-hybrid-pptx.ts`**

- Étendre l'interface locale `BlockRender` :
  ```ts
  interface BlockRender {
    text: string;
    runs?: TextRun[];     // nouveau
    rect: ...;
    style: ...;
    kind: ...;
  }
  ```
- Propager `runs` depuis `extractAnnotatedBlocks` (ligne 444) : `blocks.push({ text: ab.text, runs: ab.runs, rect, style, kind })`. Les chemins B et C n'ont pas de runs (inchangés).
- Refondre `addBlockToSlide` (ligne 390) :
  - Calculer `frameOptions` (toutes les options actuelles : x, y, w, h, fontFace, fontSize, bold, italic, color, align, valign, wrap, margin, charSpacing, lineSpacingMultiple) — INCHANGÉ.
  - Si `block.runs && block.runs.length > 1` :
    - Construire `pptxRuns: PptxGenJS.TextProps[]` :
      ```ts
      block.runs.map(r => ({
        text: applyTextTransform(r.text, block.style.textTransform),
        options: {
          bold: r.bold,
          italic: r.italic,
          color: r.color,
        },
      }))
      ```
    - `slide.addText(pptxRuns, frameOptions)` (signature multi-runs de pptxgenjs : 1er param = array d'objets `{text, options}`).
    - Les options de niveau frame (fontFace, fontSize de base, color de base, align, etc.) restent dans `frameOptions` ; les options de niveau run n'overrident QUE bold/italic/color.
  - Sinon → comportement actuel strictement inchangé.

### Garanties de non-régression

- `extractEditableBlocks` (chemin C fallback) inchangé → blocs sans `runs` → ancien chemin `slide.addText(string, options)`.
- Path B (overlay_text) inchangé → pas de runs → ancien chemin.
- Bloc annoté 100% uniforme → `runs` undefined → ancien chemin (zéro impact visuel).
- `applyTextTransform` appliqué AU TEXTE de chaque run (pas au frame), comme demandé.

### Critères de validation

1. `npx tsc --noEmit` passe.
2. Test manuel :
   - Générer un carrousel, exporter PowerPoint éditable, ouvrir dans PowerPoint.
   - Slide avec `<span italic+color>` inline → mot apparaît italic + dans la couleur accent du span.
   - Slide titre uniforme sans span → identique à avant.
   - Frame style (alignement, taille, fontFace, charSpacing, lineSpacing) préservé.
3. Aucune erreur console nouvelle pendant l'export.
4. Heuristique fallback (carrousels anciens sans annotations) fonctionne comme avant.

## (b) Mes propositions d'amélioration connexes (à valider individuellement)

Je les liste pour que tu puisses **dire oui/non à chacune** avant exec :

### B1. Détection sémantique `<strong>`/`<b>` et `<em>`/`<i>` ✅ recommandé
Pourquoi : Opus utilise parfois `<em>vrai</em>` au lieu de `style="font-style:italic"`. Sans ça on rate ces cas.
Implémentation : dans le walker, vérifier `parentElement.closest("strong,b")` → force `bold:true`, `closest("em,i")` → force `italic:true`. En complément (pas remplacement) du `getComputedStyle` qui devrait déjà les attraper, mais ceinture+bretelles.
Risque : nul.

### B2. Trimming intelligent des espaces ✅ recommandé
Pourquoi : un walker de text nodes peut produire des runs `" "` purs ou `"\n  "` issus de l'indentation HTML. Sans gestion → runs parasites visibles dans PowerPoint avec un style bizarre.
Implémentation : si `run.text.trim() === ""` ET il est entre deux runs de même style → fusionner avec le voisin. Si en début/fin → drop (sauf espace significatif entre deux mots).
Risque : faible si bien testé. Sans ça, risque de runs vides exportés.

### B3. Cap du nombre de runs par bloc ✅ recommandé
Pourquoi : protection défensive contre HTML malformé qui exploserait en 50 runs.
Implémentation : `MAX_RUNS = 12`. Si dépassé → fallback vers chemin actuel (text plat). Log warn.
Risque : nul.

### B4. Coalescing agressif des runs adjacents identiques ✅ recommandé
Pourquoi : `<h2>Le <span style="italic;color:X">vrai</span> <span style="italic;color:X">secret</span></h2>` → 2 runs italic+X côte à côte → mieux fusionner en 1.
Implémentation : pass de réduction sur le tableau final, fusionner runs N et N+1 si bold/italic/color identiques.
Risque : nul, juste plus propre dans le XML PPTX.

### B5. Préserver `text-decoration: underline` inline ⚠️ optionnel
Pourquoi : si un span a `text-decoration:underline`, on le perd. Mais Opus ne semble pas l'utiliser souvent dans le design system actuel.
Implémentation : ajouter `underline?: boolean` au TextRun + `cs.textDecorationLine.includes("underline")`.
Risque : nul. Skip si tu veux rester minimal.

### B6. NE PAS faire (signalé pour transparence)
- Ne pas changer `applyTextTransform` (reste appliqué par run, comme demandé).
- Ne pas toucher au prompt `carousel-visual` (hors scope).
- Ne pas toucher `extractEditableBlocks` (hors scope).
- Ne pas toucher exports Pinterest / PNG / pptx visual (hors scope).

## Recommandation

Approche minimale stricte = (a) seul.
Approche recommandée = (a) + B1 + B2 + B3 + B4 (tous à risque nul, gain robustesse net).
B5 = à ton choix.

Dis-moi quelles propositions tu valides et je passe à l'exec.
