## Problème

Quand l'utilisatrice génère un post Instagram à partir d'une photo qu'elle a **retouchée via PhotoRoom** (notamment "Détourer / supprimer le fond"), Anthropic renvoie :

> `messages.0.content.1.image.source.base64: The image was specified using the image/jpeg media type, but the image appears to be a image/png image`

### Cause racine

1. `supabase/functions/photoroom-edit/index.ts` renvoie un `data:image/png;base64,...` quand le mode est `remove_bg` (logique normale : PNG transparent).
2. Côté client, `PhotoUploadZone.applyEditedPhoto` remplace `base64` par cette data URL PNG mais **ne met pas à jour `mimeType`** sur le `PhotoItem` (le champ n'est même pas typé).
3. Côté edge function `creative-flow`, deux endroits envoient l'image à Claude :
   - ligne ~899 (LinkedIn photo streaming)
   - ligne ~1376 (chemin photo non-streamé, utilisé entre autres pour Instagram post)
   
   Les deux font :
   ```ts
   const cleanB64 = p.base64.replace(/^data:image\/[a-z]+;base64,/, "");
   source: { type: "base64", media_type: p.mimeType || "image/jpeg", data: cleanB64 }
   ```
   → le préfixe `data:image/png` est jeté **sans être lu**, et comme `p.mimeType` est absent, on retombe sur `image/jpeg` alors que les octets sont du PNG → 400 Anthropic.

Le même bug touche aussi la branche `inspire-ai` / les images de questions (`questionsContent` ligne 1320) qui font confiance à un `mime` venant du client sans le vérifier contre les octets.

## Correctifs

### 1. `supabase/functions/creative-flow/index.ts` — source de vérité

Ajouter un helper unique en tête de fichier :

```ts
function extractImagePayload(input: string, fallbackMime?: string) {
  // 1) data URL → on lit le mime du préfixe (vérité absolue)
  const m = input.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (m) return { media_type: m[1].toLowerCase(), data: m[2] };

  // 2) base64 brut → sniff magic bytes sur les premiers caractères
  //    PNG : iVBORw0KGgo  | JPEG : /9j/  | WEBP : UklGR  | GIF : R0lGOD
  const head = input.slice(0, 16);
  let sniffed: string | undefined;
  if (head.startsWith("iVBORw0KGgo")) sniffed = "image/png";
  else if (head.startsWith("/9j/")) sniffed = "image/jpeg";
  else if (head.startsWith("UklGR")) sniffed = "image/webp";
  else if (head.startsWith("R0lGOD")) sniffed = "image/gif";

  return { media_type: sniffed || fallbackMime || "image/jpeg", data: input };
}
```

Remplacer **les trois sites** par ce helper :

- ligne ~896-900 (canStreamPhoto / LinkedIn streaming) ;
- ligne ~1372-1377 (chemin photo non-streamé — celui qui casse pour Instagram) ;
- ligne ~1318-1321 (`questionsContent.push({ type: "image", ... })`).

Ainsi le `media_type` envoyé à Anthropic correspond **toujours** aux octets réellement transmis, indépendamment de ce que le client envoie.

### 2. `src/components/creer/PhotoUploadZone.tsx` — cohérence client

- Ajouter `mimeType?: string` au type `PhotoItem` (déjà attendu par `use-content-generator.ts` et `CreerUnifie.tsx`, mais jamais peuplé).
- Dans `resizeAndEncode`, retourner `mimeType: "image/jpeg"` (le canvas force JPEG).
- Dans `applyEditedPhoto(idx, newBase64)`, parser le préfixe `data:(image/[^;]+);base64,` et stocker `mimeType` mis à jour (PNG après `remove_bg`, JPEG après `replace_bg`).
- Dans `revertPhoto`, restaurer aussi le `mimeType` d'origine (ou le re-déduire depuis `originalBase64`).

Cela rend le payload propre dès le client et évite que d'éventuelles futures intégrations (au-delà de creative-flow) retombent dans le même piège.

### 3. Vérification

- Relancer le flow : Créer → Instagram post → uploader une photo → **Retoucher → Détourer le fond → Appliquer** → Générer.
- Vérifier dans les logs `creative-flow` qu'on n'a plus de 400 Anthropic ; le post se génère.
- Tester aussi le chemin sans retouche (la photo reste JPEG) et le chemin LinkedIn photo (streaming) pour s'assurer qu'aucune régression n'est introduite.

## Hors scope

- Les fonctions `carousel-ai`, `carousel-visual`, `pinterest-*` ont aussi `media_type: "image/jpeg"` en dur, mais elles reçoivent des photos issues d'autres pipelines (Pinterest, scraping) où la garantie JPEG tient. Je ne les touche pas dans ce ticket pour rester ciblé sur le bug remonté (Instagram post à partir d'image retouchée).
