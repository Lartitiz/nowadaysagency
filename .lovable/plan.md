

## Audit — Upload photo par format aujourd'hui

| Canal / Format | Upload photo | Vision IA (questions + génération) |
|---|---|---|
| Insta — Carrousel **photo / mixte** | ✅ max 10 (`PhotoUploadZone`) | ✅ `carousel-ai` branche `photo`/`mix` |
| Insta — **Post simple** (toggle "J'accompagne une photo") | ✅ max 1 | ✅ `creative-flow` branche `photo_mode` |
| Insta — **Reel** | ❌ | ❌ |
| Insta — **Story** | ❌ | ❌ |
| LinkedIn — **Carrousel mixte** | ✅ (vient piocher Insta) | ✅ |
| LinkedIn — **Post texte** | ❌ | ❌ |
| **Newsletter** | ❌ (Zod accepte déjà 1 photo, mais aucune UI) | Backend prêt, jamais alimenté |
| Pinterest visuel / inspiration | ✅ (flow dédié) | n/a |

**Constat** : les Reels, Stories, LinkedIn texte et Newsletter **ne proposent aucun upload photo** alors que :
- Le backend `creative-flow` accepte déjà `photo_mode + photos[1]` quel que soit le format détecté (lignes 68-70, 1755-1813).
- La vision Claude est **déjà branchée pour `step=questions` ET `step=generate`** dès que `photo_mode = true`. Aucun blocage backend.

Donc tout le travail est **côté front** : étendre le toggle "📸 J'accompagne une photo" aux 4 formats manquants + transmettre les photos jusqu'à `handleFormatNext` / `generateQuestions`. Aucune nouvelle Edge Function, aucun changement de schema.

## Plan d'extension — front uniquement

### 1. `CreerStepFormat.tsx` — généraliser le toggle photo

Aujourd'hui le bloc lignes 450-493 (toggle + bannière + `PhotoUploadZone`) ne s'affiche que pour `selectedFormat === "post"`. Le rendre disponible pour :
- `reel` (Insta — accroche/script ancré dans l'image off-screen)
- `stories` (Insta — séquence de stories autour de la photo)
- `linkedin` (LinkedIn post texte avec une photo en pièce jointe)
- `newsletter` (header image / image éditoriale)

Implémentation :
- Ajouter un helper `formatAcceptsSinglePhoto(format, channel)` qui renvoie `true` pour `post`, `reel`, `stories`, `linkedin` (texte), `newsletter`.
- Remplacer `selectedFormat === "post"` par ce helper sur les 3 blocs (toggle, bannière préchargée, zone d'upload).
- Adapter le wording du toggle selon le format :
  - Post : "📸 J'accompagne une photo" (existant)
  - Reel : "📸 Mon Reel s'appuie sur une image (référence visuelle / vignette)"
  - Stories : "📸 Mes stories tournent autour d'une photo"
  - LinkedIn : "📸 J'attache une photo à mon post"
  - Newsletter : "📸 Image d'en-tête / illustration"
- Le `maxPhotos={1}` reste (limite Zod de `creative-flow`).
- Le mode **compact** reste actif quand `initialPhotos` préchargées (cohérence avec le travail des messages précédents).

### 2. `CreerStepFormat.tsx` — étendre la bannière "incompatible"

Ligne 434 : aujourd'hui `selectedFormat !== "carousel" && selectedFormat !== "post"` déclenche l'avertissement "Ce format n'utilisera pas tes photos". Une fois les 4 nouveaux formats compatibles, retirer cet avertissement pour eux (il ne reste que `pinterest_*` qui ont leur propre flow d'upload séparé).

### 3. `CreerStepFormat.tsx` — auto-préselection avec photos préchargées

Branche `isFirstSelectionWithPhotos` (ligne 105) : actuellement `post` → `photoMode=true + slice(0,1)`. Ajouter le même comportement pour `reel`, `stories`, `linkedin`, `newsletter` : `setPhotoMode(true)` + `setPostPhoto(initialPhotos!.slice(0, 1))`.

### 4. `CreerUnifie.tsx` — propager `photo_mode` jusqu'à la génération

Vérifier que `photoMode + uploadedPhotos[0]` partent bien dans le body de **toutes** les générations `creative-flow` (pas seulement post Insta). Bloc ligne 738 actuel :
```ts
...(photoMode ? { photo_mode: true, photo_description: photoDescription } : {}),
```
→ il manque `photos: [{ base64, mimeType, context }]`. À ajouter une seule fois, valable pour les 5 formats. Sinon vision côté backend ne se déclenche pas (cf. `body.photos?.[0]?.base64` ligne 1809).

### 5. Adapter les prompts vision selon le format (creative-flow)

Pour que la vision serve vraiment, ajouter dans la branche `step=generate + photo_mode` (ligne 1809) un switch léger sur `formatHint` :
- **Reel** → "À partir de ce que tu vois, propose hook + déroulé voix-off / face cam"
- **Stories** → "Découpe en 3-5 stories qui exploitent l'image (zooms, crops narratifs)"
- **LinkedIn** → "Post pro où l'image illustre un point précis du texte"
- **Newsletter** → "Image éditoriale en ouverture, texte qui prolonge l'ambiance"
- Post / défaut → comportement actuel inchangé

Idem pour `step=questions` (ligne 1755) : 3 questions ancrées dans le visuel + adaptées au format final.

### 6. `use-content-generator.ts` — déjà OK

`generateQuestions` accepte déjà `photos`, `photoDescription`, `photoMode` (ajoutés au tour précédent). Rien à modifier.

## Fichiers touchés
- `src/components/creer/CreerStepFormat.tsx` (helper + 3 blocs ré-utilisés)
- `src/pages/CreerUnifie.tsx` (1 ligne dans le body de génération)
- `supabase/functions/creative-flow/index.ts` (switch format dans 2 prompts vision)

## Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. **Reel + photo** : toggle visible → upload 1 photo → questions vision ancrées → script qui mentionne l'image
3. **Stories + photo** : idem, séquence narrative autour de l'image
4. **LinkedIn texte + photo** : idem, post pro qui s'appuie sur l'image
5. **Newsletter + photo** : header image prise en compte dans le ton
6. **Partir de photos → Reel/Stories/LinkedIn/Newsletter** : auto-préselection + bannière "1 photo chargée" (pas d'avertissement "incompatible")
7. **Aucune régression** : carrousel photo/mix + post photo continuent de fonctionner

## Hors scope
- Multi-photos (>1) pour Reel/Stories/LinkedIn/Newsletter : la limite Zod de `creative-flow` est `max(1)`. Si besoin un jour, c'est une 2e étape (étendre Zod + adapter prompts).
- Génération d'image IA pour ces formats (différent du upload).
- Pinterest (déjà géré séparément).

