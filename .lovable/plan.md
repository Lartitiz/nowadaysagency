# Fix bug "impossible de changer le logo"

## Diagnostic

Dans `src/pages/BrandCharterPage.tsx` il y a **deux inputs file** pour le logo :

1. **Premier upload** (ligne 719, état vide) — `accept="image/*,.heic,.heif,..."`, `disabled={logoUploading}`. OK, modifié au tour précédent.
2. **"Changer le logo"** (ligne 712, état avec logo existant) :
   ```tsx
   <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
   ```
   - `accept="image/*"` **n'inclut pas HEIC/HEIF** → sur Mac la boîte de dialogue grise les fichiers iPhone, donc impossible d'en sélectionner un.
   - Pas de `disabled={logoUploading}` → on peut re-déclencher pendant un upload en cours et casser l'état.
   - Pas de `key` → si on ré-sélectionne **le même fichier** que la dernière fois, le `onChange` ne se redéclenche pas (comportement natif des inputs file).

Et un point structurel sur `handleLogoUpload` :
- Après conversion HEIC ou changement d'extension (ex. JPG → PNG), le nouveau fichier est écrit à un **path différent** (`logo.jpg` vs `logo.png`). Le `upsert: true` n'écrase que le même path → on accumule des vieux blobs morts dans le bucket et l'ancien `logo_url` peut rester servi en cache.

## Plan

### 1. Aligner le second input sur le premier
Remplacer ligne 712 par :
```tsx
<input
  type="file"
  accept="image/*,.heic,.heif,image/heic,image/heif"
  className="hidden"
  onChange={handleLogoUpload}
  disabled={logoUploading}
/>
```

### 2. Forcer un path unique stable
Dans `handleLogoUpload`, écrire systématiquement sur **un seul path** quelle que soit l'extension :
- Path = `${user.id}/logo/logo` (sans extension), avec `contentType` correct passé au `upload({ contentType })`.
- `upsert: true` écrasera toujours le même blob → pas de fichiers orphelins, pas de logo fantôme.
- L'URL publique reste stable, le cache-bust `?v=Date.now()` suffit à forcer le rafraîchissement.

### 3. Reset visuel pendant l'upload
- L'input file est déjà reset (`inputEl.value = ""`) dans `finally`. Bon.
- S'assurer que le `<label>` "Changer le logo" porte un attribut `aria-disabled` quand `logoUploading` est `true`, et affiche un état visuel (texte "Upload en cours…").

### 4. Logs de debug temporaires
Ajouter un `console.log` au tout début de `handleLogoUpload` (`name`, `type`, `size`) pour confirmer que le picker renvoie bien le fichier sur les prochains essais. À retirer une fois validé.

## Détails techniques

- Aucun changement DB, RLS, ni edge function.
- Bucket `brand-assets` inchangé.
- Si on veut nettoyer les anciens blobs (`logo.heic`, `logo.png`…) déjà en storage, on peut ajouter un `supabase.storage.from("brand-assets").remove([...])` ciblé avant l'upsert — proposé en option, hors scope par défaut.

## Hors scope

- Refonte de la section logo, gestion de plusieurs variantes (déjà demandée ailleurs), drag & drop.
