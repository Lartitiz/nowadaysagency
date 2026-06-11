# Phase 0.6 — Ombres ET bordures natives sur shapes PPTX

## Constat exploration

Le terrain confirme le plan :
- `ShapeBlock` (pptx-font-mapping.ts l.518) a déjà `shadow?` ; il manque `border?`.
- `parseSimpleBoxShadow` existe déjà (l.547) et fait exactement ce que le plan décrit pour l'ombre. **Aucune modif à apporter à l'ombre côté parsing** — seul l'ajout bordure est nouveau.
- `extractShapeBlocks` (l.609) skippe déjà les shadows non convertibles. Il faut juste ajouter la détection bordure en miroir.
- Le CSS de masquage `[data-pptx-shape-hide="true"]` neutralise déjà `border-color: transparent` (export-carousel-hybrid-pptx.ts l.120) — RAS.
- `addShape` (l.639) pose déjà l'ombre native ; il faut juste injecter `line` quand `sb.border` est défini.
- Le prompt (carousel-visual l.926-929) interdit toute bordure ; à libéraliser.

Le plan tient. J'exécute tel quel.

## Périmètre — ce qui est demandé (a)

### 1. `src/lib/pptx-font-mapping.ts`

a. Étendre `ShapeBlock` avec :
```ts
border?: { widthPt: number; color: string; dashType: "solid" | "dash" | "sysDot" };
```

b. Ajouter `parseUniformBorder(cs)` qui retourne `ShapeBlock["border"] | null` :
- Convertible si les 4 côtés ont mêmes `borderTop/Right/Bottom/LeftWidth`, `…Style`, `…Color` (computed).
- Style ∈ {`solid`, `dashed`, `dotted`} → dashType `solid`/`dash`/`sysDot`.
- Width > 0 sinon `null` (= pas de bordure, pas un skip).
- Color non extractible ou style autre → `null` distinct → skip défensif.

c. Dans `extractShapeBlocks`, après le bloc shadow :
- Lire les 4 côtés. Si tous width = 0 → pas de bordure (border = undefined, continuer).
- Sinon appeler `parseUniformBorder`. Si retour `null` → `console.debug("[hybrid] shape skipped (unsupported border)", …)` + `continue`.
- Sinon `border = parsed`, pousser dans le `blocks.push({…, border})`.

d. **Ne pas toucher** : ombre, skips gradient/transform/transparent/<5px, normalizeHex, autres exports.

### 2. `src/lib/export-carousel-hybrid-pptx.ts`

e. Dans la boucle `usableShapes` (l.620-655), modifier l'appel `addShape("roundRect", …)` :
- Remplacer `line: { type: "none" }` par `line: sb.border ? { color: sb.border.color, width: sb.border.widthPt, dashType: sb.border.dashType } : { type: "none" }`.
- Le bloc `shadow` reste inchangé.

f. **Ne pas toucher** : CSS de masquage (déjà OK), z-order, cap, photos, background.

### 3. `supabase/functions/carousel-visual/index.ts`

g. Dans "CONDITIONS D'ANNOTATION" (l.924-929), réécrire les deux puces ombre + bordure pour exprimer ce qui est désormais AUTORISÉ :
- Ombre : une seule externe simple `Xpx Ypx blur rgba(...)`, sans spread ni inset (inchangé — déjà à jour).
- Bordure : autorisée si **uniforme sur les 4 côtés**, style `solid` / `dashed` / `dotted`.
- Toujours interdits : ombres multiples, `inset`, `spread` ≠ 0, bordures partielles (`border-left` seul…), styles `double` / `groove` / `ridge` / `inset` / `outset`.

h. **Ne pas toucher** : templates HTML, autres règles, branding, rythme.

## Propositions hors-périmètre (b) — pour validation

Aucune. Le plan couvre proprement le sujet ; toute extension (compression PNG, fix italique, autres prompts) est listée en hors-scope par toi.

## Validation

1. `npx tsc --noEmit --skipLibCheck` → 0 erreur.
2. Test manuel : un carrousel avec slide "schéma à cartes" (ombre légère) + slide Contexte à bordure pointillée.
   - Ouvrir dans Canva ET PowerPoint.
   - Cartes ombrées = shapes éditables, ombre visuellement proche.
   - Bordure pointillée = shape éditable avec sa bordure.
   - Aucune double ombre / double bordure.
3. Non-régression : carrousel photo identique à avant.

## Hors scope (rappel)

- Prompts branding/rythme, fix italique, compression image, exports legacy, carousel-ai.
