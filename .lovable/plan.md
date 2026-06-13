## Résumé

Ajouter un flux opt-in de détourage du logo dans `BrandCharterPage.tsx`, juste après l'upload réussi (et accessible a posteriori). Réutilise l'Edge Function `photoroom-edit` (mode `remove_bg`) sans aucune modification backend. Aucun code d'export ne change : ils consomment déjà `logo_url`.

## Fichier impacté

- `src/pages/BrandCharterPage.tsx` (ajout d'un dialog + handler `runLogoCutout`)

Aucune modif : `photoroom-edit`, exports, `handleLogoUpload` (préservé tel quel, l'appel au dialog est ajouté à la fin), `extractLogoPalette` / `LogoPaletteDialog`.

## Implémentation

### 1. Nouveaux états (en haut du composant)

```ts
const [cutoutOpen, setCutoutOpen] = useState(false);
const [cutoutSource, setCutoutSource] = useState<{ blob?: Blob; url?: string } | null>(null);
const [cutoutPreviewUrl, setCutoutPreviewUrl] = useState<string | null>(null); // data URL "après"
const [cutoutResultBase64, setCutoutResultBase64] = useState<string | null>(null);
const [cutoutLoading, setCutoutLoading] = useState(false);
const [cutoutSaving, setCutoutSaving] = useState(false);
```

### 2. Ouverture du dialog après `handleLogoUpload`

Juste avant le bloc "Extraction couleurs" (ligne ~529), ajouter :

```ts
setCutoutSource({ blob: uploadFile });
setCutoutPreviewUrl(null);
setCutoutResultBase64(null);
setCutoutOpen(true);
```

L'extraction de palette reste à la suite (les deux dialogs peuvent coexister, le palette dialog se ferme manuellement par l'utilisatrice).

### 3. Bouton "Détourer le fond" sur logo existant

À côté du bouton "Extraire les couleurs" (autour de `handleExtractFromExistingLogo`) :

```tsx
<Button variant="outline" onClick={() => {
  setCutoutSource({ url: data.logo_url! });
  setCutoutPreviewUrl(null);
  setCutoutResultBase64(null);
  setCutoutOpen(true);
}}>Détourer le fond</Button>
```

### 4. Handler `runLogoCutout` (appel Photoroom)

```ts
const runLogoCutout = async () => {
  if (!cutoutSource) return;
  setCutoutLoading(true);
  try {
    // Convertir source → base64 (data URL)
    let base64: string;
    if (cutoutSource.blob) {
      base64 = await blobToDataUrl(cutoutSource.blob);
    } else {
      const r = await fetch(cutoutSource.url!);
      const b = await r.blob();
      base64 = await blobToDataUrl(b);
    }
    const wsId = activeWorkspace?.id && activeWorkspace.id !== "self" ? activeWorkspace.id : undefined;
    const { data: res, error } = await invokeWithTimeout("photoroom-edit", {
      body: { image_base64: base64, mode: "remove_bg", workspace_id: wsId },
    }, 90_000);
    if (error || !res?.image_base64) throw new Error(error?.message || "Pas de résultat");
    const outUrl = res.image_base64.startsWith("data:") ? res.image_base64 : `data:image/png;base64,${res.image_base64}`;
    setCutoutResultBase64(outUrl);
    setCutoutPreviewUrl(outUrl);
  } catch (e: any) {
    toast.error("Détourage impossible, on garde ton logo original.");
    console.error("[logo cutout]", e);
  } finally {
    setCutoutLoading(false);
  }
};
```

### 5. Handler `keepCutout` (upload + maj logo_url)

```ts
const keepCutout = async () => {
  if (!cutoutResultBase64 || !user) return;
  setCutoutSaving(true);
  try {
    const blob = await (await fetch(cutoutResultBase64)).blob();
    const path = `${user.id}/logo/logo-cutout.png`;
    const { error } = await supabase.storage.from("brand-assets")
      .upload(path, blob, { upsert: true, contentType: "image/png" });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
    // Append ancien logo_url dans logo_variants (sans perte)
    const oldUrl = data.logo_url;
    if (oldUrl) {
      const variants = Array.isArray(data.logo_variants) ? [...data.logo_variants] : [];
      variants.push({ url: oldUrl, kind: "original", saved_at: new Date().toISOString() });
      update("logo_variants", variants);
    }
    update("logo_url", `${urlData.publicUrl}?v=${Date.now()}`);
    toast.success("Logo détouré appliqué !");
    setCutoutOpen(false);
  } catch (e: any) {
    toast.error("Sauvegarde impossible");
    console.error(e);
  } finally {
    setCutoutSaving(false);
  }
};
```

### 6. Dialog JSX (en bas, à côté de `LogoPaletteDialog`)

- Titre : "Détourer le fond de ton logo ?"
- AVANT : `<img>` de la source (objectURL si blob, sinon url).
- APRÈS (si `cutoutPreviewUrl`) : `<img>` sur fond damier CSS (`backgroundImage: conic-gradient` ou bg checker via `bg-[url('data:image/svg+xml...')]`).
- Boutons :
  - Tant que pas de résultat : `Détourer le fond` (loading spinner si `cutoutLoading`), `Annuler`.
  - Après résultat : `Garder l'original` (ferme), `Garder cette version` (appelle `keepCutout`).

### 7. Helper `blobToDataUrl`

Petite fonction utilitaire en haut du fichier (ou inline) :

```ts
const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(b);
  });
```

## Ce qui NE bouge PAS

- Edge Function `photoroom-edit` (quota/logUsage géré côté serveur).
- Code d'export (carrousels, PNG, Pinterest, logo) — hérite automatiquement via `logo_url`.
- `handleLogoUpload` original (upload, cache-bust, extraction palette) — uniquement augmenté d'un appel à ouvrir le dialog cutout.
- `logo_variants` : append uniquement, pas d'écrasement.

## Validation

1. `npx tsc --noEmit --skipLibCheck` passe.
2. Upload logo fond blanc → dialog → "Détourer le fond" → aperçu damier transparent → "Garder cette version" → `logo_url` pointe vers `logo-cutout.png`, original présent dans `logo_variants`.
3. "Garder l'original" → `logo_url` inchangé.
4. Bouton "Détourer le fond" sur logo existant → même flux à partir de l'URL.
5. Export carrousel → plus de rectangle blanc.

## (b) Suggestions connexes (à valider séparément, pas exécutées dans ce plan)

- **Badge "Logo détouré ✓"** à côté de l'aperçu du logo dans la charte quand `logo_url` pointe sur `logo-cutout.png` — repère visuel rapide. ok
- **Aperçu sur fond coloré** (un mini swatch utilisant la couleur principale de la palette) dans le dialog cutout, en plus du damier — pour voir le rendu réel dans les carrousels. non
- **Bouton "Revenir à l'original"** si `logo_variants` contient une entrée `kind: "original"` — restaurer en un clic. ok

## Hors scope

- Nettoyage des éléments UI Pinterest dans sources de carrousels.
- Toute modif Edge Functions d'export/génération.
- Détourage automatique.