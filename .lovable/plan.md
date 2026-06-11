## Objectif

Le logo uploadé dans la charte graphique (`brand_charter.logo_url`) n'est aujourd'hui utilisé nulle part hors de la page Charte. On l'active à 3 endroits, en gardant le contrôle utilisateur via une case à cocher pour les exports.

---

## 1. Logo dans les exports visuels (opt-in)

Périmètre concerné :
- **Carrousels** — exports `export-carousel-visual-pptx.ts`, `export-carousel-hybrid-pptx.ts`, `export-carousel-png.ts` (PPTX visuel, hybride, PNG).
- **Épingles Pinterest** — `export-pinterest-visual-pptx.ts` + `exportPinterestVisualPng`.
- **Couvertures PPTX** — slide de couverture du carrousel `export-carousel-visual-pptx.ts`.

Exports volontairement **exclus** : `export-carousel-pptx.ts` (version éditable texte pur), `export-pinterest-editable-pptx.ts` (template à remplir).

UX :
- Dans le dialog "Télécharger" de chaque export concerné (carrousel + Pinterest), ajouter une `Checkbox` shadcn :
  - Label : « Ajouter mon logo »
  - État par défaut : **coché si `logo_url` existe**, désactivée sinon avec tooltip « Upload ton logo dans Charte graphique pour l'activer ».
  - Préférence mémorisée par utilisateur dans `localStorage` (clé `export-include-logo`).
- Position du logo (non configurable pour rester simple) :
  - Carrousel slide couverture : coin bas-droit, hauteur ≈ 8% slide, padding 0.3"
  - Carrousel slides intérieures : même position, opacité 0.8
  - Pinterest visuel : coin bas-droit, hauteur 60px sur visuel 1500px
- Le logo est chargé une fois en base64 (via `fetch` + `FileReader`) avant la boucle de génération de slides ; embed base64 obligatoire pour PPTX (sinon LibreOffice casse).

Fallback : si le fetch du logo échoue (CORS, 404), l'export continue **sans logo** et un `toast` informe « Logo non chargé, export sans logo ».

## 2. Logo dans le header du workspace

- Dans `AppHeader.tsx` (3 variantes desktop / tablet / mobile) : à côté du `WorkspaceSwitcher`, afficher le logo de la charte du **workspace actif** (taille `h-7 w-7` rounded, `object-contain`).
- Affiché **uniquement si `brand_charter.logo_url` existe pour le workspace actif** ; sinon rien (pas de placeholder).
- Le texte « L'Assistant Com' » + badge beta restent en place (c'est notre marque produit, pas remplacée).
- Nouvelle hook légère `useWorkspaceLogo()` qui réutilise `useBrandCharter()` et retourne `{ logoUrl }`.

## 3. Logo dans les briefs photo / visuels AI

Edge functions concernées :
- `supabase/functions/pinterest-visual/index.ts` (génère la structure visuelle de l'épingle)
- `supabase/functions/pinterest-photo-brief/index.ts` (brief photo)

Changements :
- Côté client : passer `logo_url` au payload d'invocation (lecture depuis `brand_charter`).
- Côté edge function : si `logo_url` présent, ajouter au prompt système un bloc :
  > « La personne a un logo de marque (URL : …). Mentionne dans le brief où placer le logo (coin discret, watermark, ou sur un objet de la scène pour les photos), sans imposer — c'est une suggestion. Pour les visuels Pinterest générés, réserve un espace bas-droit. »
- Aucune modification de schéma ; juste enrichissement de contexte prompt.

---

## Détails techniques

**Helper partagé** `src/lib/export-logo.ts` :
```ts
export async function fetchLogoAsBase64(logoUrl: string | null): Promise<string | null>
// fetch → blob → FileReader.readAsDataURL ; null sur erreur
```
Utilisé par les 4 fonctions d'export concernées.

**Préférence checkbox** : helper trivial `localStorage.getItem("export-include-logo") !== "false"`.

**Pas de migration DB** : `brand_charter.logo_url` existe déjà, `brand-assets` bucket public déjà en place.

---

## Hors scope

- Configuration de la position du logo dans les exports (toujours bas-droit).
- Watermark sur les exports éditables texte-seul.
- Logo dans les emails, PDFs mirror, ou dans la `SharedBrandingPage` (séparé si besoin plus tard).
- Génération automatique de variantes du logo (clair/sombre).
