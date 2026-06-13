# Plan — Carrousels dans la boîte à idées

## (a) Ce que tu m'as demandé

### 1. `src/components/SaveToIdeasDialog.tsx`

Ajouter deux props optionnelles :

```ts
visualSlides?: { slide_number: number; html: string }[];
onUploadVisuals?: (ideaId: string) => Promise<string[]>;
```

Refactor `handleSave` :

- L'insert `saved_ideas` devient `.select("id").single()` pour récupérer l'`id`.
- Si `visualSlides?.length > 0 && onUploadVisuals` :
  - `try { const urls = await onUploadVisuals(newIdea.id); if (urls.length) await supabase.from("saved_ideas").update({ content_data: { ...contentData, visual_urls: urls, visual_html: visualSlides } }).eq("id", newIdea.id); } catch (e) { console.warn(...) }`
  - L'upload ne bloque jamais : catch silencieux, idée texte reste sauvegardée, toast succès affiché dans tous les cas.
- Reset tags/note + toast succès : inchangés.
- Comportement pour formats non-carrousel (props absentes) : strictement identique.

### 2. `src/pages/CreerUnifie.tsx`

`**handleSave` (ligne ~1549)** — branche carrousel :

- Garder l'insert `generated_carousels` tel quel (champs, conditions workspace, `setSavedId`).
- Supprimer le `return` ligne 1577.
- Retirer le `toast.success("Contenu sauvegardé !")` ligne 1571 (cf. proposition validée ci-dessous — sinon je le garde).
- Garder le `try/catch/finally` pour `setSaving(false)`, mais après le `finally` laisser le flux atteindre `setSaveIdeaDialogOpen(true)`.

`**<SaveToIdeasDialog>` (ligne ~2880)** — brancher les nouvelles props :

```tsx
visualSlides={selectedFormat === "carousel" && visualSlides.length > 0 ? visualSlides : undefined}
onUploadVisuals={selectedFormat === "carousel" ? uploadVisualsToStorage : undefined}
```

## (b) Mes propositions — à valider une par une ok pour tout

1. **Retirer le toast** `"Contenu sauvegardé !"` **du** `handleSave` **carrousel.** Sinon : toast → dialog s'ouvre → 2e toast après save. Pas terrible UX. Je propose de le retirer. ✅/❌ 
2. **Double-toast / confusion UX** : le toast actuel suggère que c'est fini, puis le dialog s'ouvre = friction. Le retrait du toast (point 1) règle aussi ça. Pas d'action supplémentaire si tu valides 1.
3. **Vérifier la signature exacte de `uploadVisualsToStorage**` avant exec (j'ai vu `(postId) => Promise<string[]>` dans ta description, je confirme en lisant la fonction au moment de l'edit pour m'assurer qu'elle est compatible avec un `ideaId` UUID — c'est juste un identifiant arbitraire utilisé dans le path Storage, donc a priori OK). ✅/❌

## Hors scope (confirmé)

- `generated_carousels` insert : intact.
- `uploadVisualsToStorage` interne : non modifié.
- `ContentPreview` : non modifié.
- Autres sources d'insertion `saved_ideas` : intactes.

## Validation

1. `npx tsc --noEmit --skipLibCheck` : 0 erreur.
2. Carrousel sans visuels → apparaît dans /idees (texte).
3. Carrousel avec visuels → apparaît dans /idees avec images.
4. Post/reel/story → comportement inchangé.
5. Ligne `generated_carousels` toujours créée (com-score OK).