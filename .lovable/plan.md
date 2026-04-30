## Problème

Dans le calendrier, l'option **"PowerPoint éditable ✨"** disparaît silencieusement du menu Télécharger pour certains posts. Seul "Images PNG" reste. L'utilisateur ne comprend pas pourquoi.

### Cause

Dans `src/components/calendar/CalendarPostPreview.tsx` (ligne 171), l'export PPTX éditable est conditionné à la présence de `visualHtml` :

```ts
onPptxEditable={visualHtml && visualHtml.length > 0 ? handleDownloadHybridPptx : undefined}
```

Or `visualHtml` provient de `story_sequence_detail.visual_html`. Ce champ n'est rempli que par les générations récentes via `/creer`. Pour les posts plus anciens (ou générés par un autre flow), seuls les PNG dans `visual_urls` sont stockés — pas le HTML brut. Résultat : l'option éditable est masquée sans aucun feedback.

## Objectif

L'utilisateur doit comprendre **pourquoi** l'option éditable n'est pas dispo et savoir **quoi faire** pour l'obtenir. Idéalement, on devrait aussi récupérer la situation sans tout regénérer quand c'est possible.

## Solution

### 1. Toujours afficher l'option PPTX éditable, mais désactivée quand impossible

Dans `src/components/exports/DownloadMenuItems.tsx`, accepter une prop `pptxDisabledReason?: string`. Si fournie : afficher l'item grisé (non cliquable) avec un sous-texte explicatif type *"HTML source manquant — régénère le carrousel pour activer l'export éditable"* au lieu d'un sous-texte marketing.

### 2. Brancher la raison dans `CalendarPostPreview.tsx`

Calculer :
- `hasVisualHtml = visualHtml && visualHtml.length > 0`
- `hasSlidesData = slidesData && slidesData.length > 0`

Trois cas :
- **`hasVisualHtml`** → option active, comportement actuel.
- **`!hasVisualHtml && hasSlidesData`** → option active avec un libellé légèrement adapté ; on tente une **régénération à la volée du HTML** depuis `slidesData` + `charterData` (voir étape 3).
- **`!hasVisualHtml && !hasSlidesData`** → option grisée, raison affichée + CTA "Régénérer le carrousel" (qui ouvre `/creer` pré-rempli, comme le fait déjà `onNavigateToGenerator`).

### 3. Fallback : régénérer le HTML à partir de `slidesData` quand il manque

Pour les posts où `visual_html` est null mais `slides` (la structure JSON) est présente, ajouter un mode de récupération côté Edge Function :

- Réutiliser la même Edge Function que `/creer` utilise pour produire le HTML des slides (chercher l'appel dans `CreerUnifie.tsx` autour des lignes 1525-1537 pour identifier la fonction exacte — vraisemblablement `linkedin-ai` / `instagram-ai` selon le canal en mode "render visual only").
- Dans `handleDownloadHybridPptx`, si `visualHtml` est vide mais `slidesData` est présent, appeler cette fonction d'abord, récupérer le HTML, puis enchaîner sur `exportCarouselHybridPptx`.
- Optionnel mais recommandé : persister le `visual_html` régénéré dans `story_sequence_detail` pour ne plus avoir à le refaire.

### 4. Tooltip / message d'aide

Quand l'option est grisée, afficher un tooltip clair :
> *"L'export PowerPoint éditable nécessite le HTML source des slides, qui n'a pas été conservé pour ce post. Régénère le carrousel depuis l'éditeur pour l'activer."*

## Fichiers à modifier

- `src/components/exports/DownloadMenuItems.tsx` — supporter état "disabled avec raison".
- `src/components/calendar/CalendarPostPreview.tsx` — calculer la raison, brancher le fallback de régénération HTML, propager le CTA "Régénérer".
- (éventuel) `src/lib/export-carousel-hybrid-pptx.ts` — exposer un helper qui accepte `slidesData` seul et génère le HTML manquant via Edge Function.

## Hors-scope

- Migration de masse pour re-remplir `visual_html` sur les anciens posts du calendrier (lourd, pas demandé).
- Refactoring de l'architecture de stockage des slides.
