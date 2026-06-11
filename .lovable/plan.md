## Périmètre confirmé

3 fichiers, aucune migration, aucun touch aux exports legacy ni aux templates de schémas.

- **Frontend** : `src/lib/pptx-font-mapping.ts`, `src/lib/export-carousel-hybrid-pptx.ts`
- **Backend** : `supabase/functions/carousel-visual/index.ts` (prompt uniquement)

Vérifications faites pendant l'audit :

- `extractShapeBlocks` skipe actuellement à `pptx-font-mapping.ts:534-542` via un test groupé `gradient || shadow || transform`. À éclater proprement pour traiter `shadow` séparément.
- Le CSS de masquage (`export-carousel-hybrid-pptx.ts:115-119`) inclut déjà `box-shadow: none !important` sur `[data-pptx-shape-hide="true"]` → quand on promeut une carte ombrée en shape natif, la capture PNG ne dessine plus l'ombre CSS. **Aucun risque de double ombre.** Rien à toucher sur ce CSS.
- `slide.addShape("roundRect", { ... })` est appelé à `export-carousel-hybrid-pptx.ts:639` — c'est le seul point d'injection à enrichir.

## Ce que tu m'as demandé (a)

### 1. `src/lib/pptx-font-mapping.ts`

a. Étendre `ShapeBlock` avec :
```ts
shadow?: { blurPt: number; offsetPt: number; angle: number; color: string; opacity: number };
```

b. Dans `extractShapeBlocks`, remplacer le test groupé `hasGradient || hasShadow || hasTransform` par :
- skip si `gradient` ou `transform` (inchangé)
- pour `box-shadow !== "none"` → tenter un parsing via un helper local `parseSimpleBoxShadow(raw: string): ShapeBlock["shadow"] | null` :
  - rejet si la valeur contient une virgule **hors parenthèses** (ombres multiples)
  - rejet si `inset` présent
  - extraction `offsetX`, `offsetY`, `blur`, `spread?` en px ; rejet si `spread` présent et `!== 0`
  - extraction couleur via regex acceptant `rgba(...)`, `rgb(...)`, `#hex` ; alpha par défaut `1`
  - conversion : `PX_TO_PT = 0.75`, `blurPt = min(blur * 0.75, 100)`, `offsetPt = hypot(offsetX, offsetY) * 0.75`, `angle = ((atan2(offsetY, offsetX) * 180 / PI) % 360 + 360) % 360`
  - `color` via `normalizeHex(...)` (hex 6 chars sans `#`)
- si parsing ok → `shadow = parsed`, on **n'interrompt plus** le pipeline
- si parsing null → `console.debug("[hybrid] shape skipped (unsupported shadow)", { type, raw })` puis `continue`

c. Ajouter le champ `shadow` (peut être `undefined`) au `blocks.push(...)`.

### 2. `src/lib/export-carousel-hybrid-pptx.ts`

Dans la boucle `usableShapes` (ligne 620), au `slide.addShape("roundRect", { ... })` (ligne 639), ajouter conditionnellement :
```ts
...(sb.shadow && {
  shadow: {
    type: "outer" as const,
    blur: sb.shadow.blurPt,
    offset: sb.shadow.offsetPt,
    angle: sb.shadow.angle,
    color: sb.shadow.color,
    opacity: sb.shadow.opacity,
  },
}),
```
Le cas `type === "background"` (ligne 621) reste inchangé : pas d'ombre sur `slide.background`.

### 3. `supabase/functions/carousel-visual/index.ts`

À la ligne 893, remplacer :
> - L'élément a une box-shadow (les shapes natifs perdent l'ombre — préfère le PNG)

par :
> - L'élément a une box-shadow complexe : **autorisé uniquement** une ombre externe simple (forme `Xpx Ypx blur rgba(...)` sans `spread` ni `inset`). **Interdit** : ombres multiples (virgule), `inset`, `spread` non nul.

Aucune autre ligne du bloc « CONDITIONS D'ANNOTATION » ne change.

## Mes propositions connexes (b — à valider avant exec)

**P1 — Cap dur sur l'angle quand `offsetPt < 0.1pt`** : si l'ombre n'a quasi pas d'offset (ex. `0 0 12px rgba(...)`), `atan2(0,0) = 0` → angle arbitraire. Forcer `angle = 0` pour éviter un bruit de rendu inutile dans le XML PPTX. Trivial, 1 ligne.

**P2 — Logger les shapes promus avec ombre** au moins un `console.debug` agrégé (`shapes natifs ombrés : N/total`) à la fin de la boucle, pour valider en QA visuelle qu'Opus a bien généré des ombres convertibles. Aide au diagnostic Phase 0.7+. Trivial.

**P3 — Tester le parser avec les ombres réellement utilisées par les templates** : j'ai listé via grep les `box-shadow` actuels dans `carousel-visual/index.ts` (lignes 46, 73, 94, 107, 136, 146). Toutes sont de la forme `0 Xpx Ypx rgba(0,0,0,0.0X)` → **toutes convertibles** par le parser proposé. Pas un changement, mais une garantie de couverture immédiate. Je ne l'ajoute pas au code, je le signale.

**Non proposé** (volontairement, hors scope) : compression PNG→JPEG, bordures natives `line`, refonte des templates.

## Hors scope confirmé

`mapFontToPptx` (fix Canva déjà mergé), `extractAnnotatedBlocks`, `extractEditableBlocks`, `extractRunsFromElement`, photos natives, z-order, `SHAPE_CAP_PER_SLIDE`, CSS `data-pptx-shape-hide`, exports legacy, `carousel-ai`, templates HTML.

## Validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Carrousel avec schéma `checklist` ou `story_arc` : cartes blanches éditables dans Canva, ombre douce identique au preview.
- Carrousel photos + slide texte simple : diff visuel nul vs avant.
- Console : `[hybrid] shape skipped (unsupported shadow)` n'apparaît que sur ombres réellement complexes.