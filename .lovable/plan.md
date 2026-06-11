## Fix — Régénérer une épingle photo Pinterest depuis le calendrier

### Le bug
`pinterest-photo-brief` exige `reference_image_base64` (zod min(1)). Quand on relance un post calendrier `pinterest_photo`, l'image d'origine n'existe plus → 400. En plus, `deduceChannel` retourne `instagram` pour `pinterest_photo` → mauvais canal affiché.

### Changements

**1. `supabase/functions/pinterest-photo-brief/index.ts`**
- Schéma zod : `reference_image_base64: z.string().max(10000000).optional().nullable()` (au lieu de `.min(1)` requis).
- Construction du message Anthropic :
  - Si `reference_image_base64` présent → comportement actuel (image + texte "Voici l'épingle Pinterest d'inspiration…").
  - Sinon → message texte seul, userPrompt adapté (« Crée un brief photo + overlay depuis le sujet et la charte uniquement », sans mention « inspire-toi de l'image »).
- Tout le reste inchangé : quota (déjà avant `callAnthropic` après fix précédent), `assertWorkspaceMembership`, `getUserContext`, `brand_charter`, format de réponse `{photo_brief, overlay_html, title, description}`, post-processing fonts.

**2. `src/pages/CreerUnifie.tsx` (~ligne 976)**
Dans le body de l'appel `pinterest-photo-brief`, remplacer :
```ts
reference_image_base64: inspirationImageBase64 || "",
```
par un spread conditionnel (même pattern que le bloc `pinterest_visual`) :
```ts
...(inspirationImageBase64 ? { reference_image_base64: inspirationImageBase64 } : {}),
```

**3. `src/components/creer/CreerStepFormat.tsx` (ligne 34)**
Ajouter `pinterest_photo` à la liste :
```ts
if (format === "pinterest" || format === "pinterest_visual" || format === "pinterest_inspiration" || format === "pinterest_photo") return "pinterest";
```

### Hors scope (strictement inchangé)
- Flux inspiration complet (upload capture → proposition → brief AVEC image)
- Pattern quota / logUsage / workspace guard
- Bloc `pinterest_visual` de `CreerUnifie.tsx`
- Autres formats dans `deduceChannel`
- `PinterestPhotoBriefResult.tsx`

### Validation
- `npx tsc --noEmit --skipLibCheck` OK
- Test 1 : flux inspiration (avec image) → inchangé
- Test 2 : relance d'un post calendrier `pinterest_photo` (sans image) → brief + overlay + titre + description générés, pas de 400
- Test 3 : depuis le calendrier, le canal affiché pour `pinterest_photo` est bien Pinterest
