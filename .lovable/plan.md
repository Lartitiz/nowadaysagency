## Contexte

Les photos retouchées via PhotoRoom ("Fond transparent") sont en PNG. Le frontend stocke leur `mimeType` dans `PhotoItem` mais le perd en route, et les Edge Functions `carousel-ai` / `carousel-visual` déclarent toutes les photos en `image/jpeg` hardcodé. L'API Anthropic rejette les bytes PNG annoncés JPEG → la génération de carrousel photo/mix échoue dès qu'une photo a été retouchée.

`creative-flow/index.ts` (lignes 21-36) gère déjà ça correctement avec `extractImagePayload` : c'est le modèle à répliquer.

## Demandé par l'utilisateur

### Backend

**1. `supabase/functions/_shared/image-utils.ts` (NOUVEAU)**
Helper partagé :
```ts
extractImagePayload(input: string, fallbackMime?: string): { media_type: string; data: string }
```
Copie exacte de la logique de `creative-flow/index.ts` lignes 21-36 :
- (a) data URL → extraire mime + data
- (b) sinon sniffer magic bytes (PNG / JPEG / WEBP / GIF)
- (c) sinon `fallbackMime`, sinon `"image/jpeg"`

**2. `carousel-ai/index.ts`**
- `pushPhotoWithContext` (~31-43) : remplacer strip regex + media_type hardcodé par `extractImagePayload(photo.base64, photo.mimeType)`. Signature : `(messageContent, photo: { base64: string; context?: string; mimeType?: string }, index)`.
- Schéma zod (~74) : ajouter `mimeType: z.string().max(50).optional()` dans l'objet photos.

**3. `carousel-visual/index.ts`**
- Bloc vision photo/mix (~818-826) : remplacer strip regex + `"image/jpeg"` hardcodé par `extractImagePayload(...,  reqBody.photos[i].mimeType)`.
- Schéma zod (~237) : ajouter `mimeType: z.string().max(50).optional()` ET `context: z.string().max(200).optional()` dans l'objet photos.
- Post-processing `{{PHOTO_N}}` (~1042 et ~1079) : quand le base64 n'a pas de préfixe `data:`, construire le data URL avec le mimeType fourni : `` `data:${p.mimeType || "image/jpeg"};base64,${raw}` ``.

### Frontend

**4. `src/pages/CreerUnifie.tsx`**
Propager `mimeType` dans tous les mappings de photos `{ base64, context }` → ajouter `mimeType: p.mimeType`. Emplacements :
- ~955 (`structureBody.photos`)
- ~986-989, ~1010-1013, ~1029-1032 (`doGenerate`)
- ~1199-1202 (régénération)
- ~2140 (`requestBody` carousel-visual : `photos: photosForVisuals.map(...)`)

## Hors scope (confirmé)

- `creative-flow/index.ts` : ne pas toucher (migration vers helper partagé reportée).
- Quota / streaming SSE / prompts éditoriaux : aucun changement.
- Prompts système/user de `carousel-visual` : aucun changement.
- `PhotoUploadZone.tsx`, `PhotoEditDialog.tsx`, `photoroom-edit` : déjà corrects.
- Fallback `"image/jpeg"` conservé par défaut quand rien n'est détectable.

## Validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Test manuel : photo → "Fond transparent" → carrousel **photo** → structure → génération → visuels OK.
- Test manuel : même parcours sans retouche (JPEG) → comportement inchangé.
- Idem pour carrousel **mix**.

---

## Propositions complémentaires (à valider séparément, NON inclus dans l'exec)

En cherchant `media_type: "image/jpeg"` hardcodé dans les Edge Functions qui parlent à Anthropic, j'ai trouvé 3 autres endroits affectés par exactement le même bug dès qu'une photo PhotoRoom (PNG) y arrive :

- **a)** `pinterest-photo-brief/index.ts` ligne 187 — `source: { type: "base64", media_type: "image/jpeg", data: rawBase64 }`
- **b)** `pinterest-visual/index.ts` ligne 317 — idem
- **c)** `pinterest-inspiration/index.ts` ligne 136 — idem (ici les images viennent probablement de scraping/upload utilisateur, à confirmer côté front)

Si tu valides, je remplace chacun par `extractImagePayload(...)` avec le même helper partagé, dans un second passage. **Je ne touche pas à ces fichiers tant que tu n'as pas confirmé point par point.**

Autres fichiers contenant `image/jpeg` mais qui ne posent **pas** ce problème (juste pour info, aucune action prévue) :
- `photoroom-edit`, `photo-background-replace` : fallback de décodage entrant (sain).
- `audit-instagram-ai`, `website-ai`, `_shared/scraping.ts` : usages non liés à un payload Anthropic image base64.
- `generate-comment/index.ts` ligne 115 : déjà paramétré via `screenshot_media_type` (correct).
