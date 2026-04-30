## Plan — Marge de sécurité hauteur de box éditable

### (a) Demande utilisateur

**Fichier** : `src/lib/export-carousel-hybrid-pptx.ts`, fonction `addBlockToSlide` (ligne 235).

```ts
// AVANT
const h = Math.min(PPTX_H_IN - y, pxToInches(block.rect.h, PX_PER_IN) + 0.1);

// APRÈS
const safetyMargin = Math.max(
  0.15,
  pxToInches(block.style.fontSizePx, PX_PER_IN) * 0.5,
);
const h = Math.min(
  PPTX_H_IN - y,
  pxToInches(block.rect.h, PX_PER_IN) + safetyMargin,
);
```

Aucune autre logique touchée.

### (b) Propositions d'amélioration (à valider individuellement)

J'ai relu `addBlockToSlide` et identifié 3 ajustements pertinents pour réduire le risque de débordement / chevauchement.

**Proposition #1 — Élargir aussi la box horizontalement (`w`)**
Le kerning différent entre Chrome et PowerPoint peut faire qu'un mot final déborde à droite et provoque un retour à la ligne supplémentaire. Une marge horizontale modeste absorbe cet écart.
```ts
const widthSafety = Math.max(0.05, pxToInches(block.style.fontSizePx, PX_PER_IN) * 0.15);
const w = Math.min(
  PPTX_W_IN - x,
  pxToInches(block.rect.w, PX_PER_IN) + widthSafety,
);
```
Risque : faible. La box reste plafonnée par la largeur de slide. Pourrait élargir un titre court centré sans impact visuel (texte centré reste centré dans une box plus large).
**Note** : tu as dit explicitement « Tout ajustement sur les marges horizontales (à voir dans un plan séparé) » dans le hors-scope. **Je laisse cette proposition pour plus tard** — à mentionner uniquement, pas à appliquer dans cet exec.

**Proposition #2 — Recalibrer `lineSpacingMultiple` (lignes 261-263 actuelles)**
Le calcul actuel :
```ts
lineSpacingMultiple: Math.max(0.9, Math.min(1.6, block.style.lineHeight / Math.max(1, block.style.fontSizePx)))
```
Sur un body avec `line-height: 1.5` HTML, PPTX rend souvent un poil plus serré qu'attendu. Proposition : ajouter +0.05 sur le ratio pour matcher visuellement.
```ts
lineSpacingMultiple: Math.max(0.9, Math.min(1.6, (block.style.lineHeight / Math.max(1, block.style.fontSizePx)) + 0.05))
```
Risque : moyen. Peut creuser légèrement les écarts entre lignes et donc augmenter la hauteur réelle, ce qui combiné à la marge de sécurité de #1 pourrait être redondant. **Je recommande d'attendre les résultats du test #1 avant d'ajuster.**

**Proposition #3 — `valign` adapté au type de bloc**
Actuellement `valign: "top"` pour tous. Pour un `kind === "overlay"` (texte court ancré sur photo), `"middle"` ou `"bottom"` selon `overlay_position` matche mieux le HTML d'origine.

**Recommandation** : ne PAS appliquer maintenant. La box éditable est dimensionnée au plus près du contenu rasterisé donc `valign` change peu. À reconsidérer si tu observes un décalage vertical dans les overlays.

### Synthèse

J'applique uniquement le fix demandé en (a). Les 3 propositions sont **documentées mais NON appliquées** par défaut — réponds avec celles que tu veux activer :
- Proposition #1 (marge horizontale) : ❌ par défaut (hors scope explicite)
- Proposition #2 (lineSpacingMultiple +0.05) : ❌ par défaut (à tester après #1)
- Proposition #3 (valign adapté) : ❌ par défaut (effet faible)

### Hors scope confirmé
Pinterest exports, export classique, export PNG, edge functions, extraction styles, masquage/rasterisation, calcul de `x/y/w` — tous intacts.

### Validation
- `tsc --noEmit` (lancé par le harness Lovable).
- Test manuel : 5 carrousels variés à exporter en PPTX hybride et ouvrir dans PowerPoint (à ta charge).

Réponds « approve » pour le fix seul, ou indique les propositions à inclure.
