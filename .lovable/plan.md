# Plan — Bouton « Créer un contenu » dans le détail photo

Chemin inverse du picker : `/photos` → ouvrir une photo → arriver directement sur `/creer` étape « format » avec la photo préchargée, comme si l'utilisatrice était passée par « Partir de photos ».

## Fichiers modifiés

1. `**src/components/photos/PhotoDetailDialog.tsx**` — nouveau bouton primaire « ✨ Créer un contenu », navigate avec `state.libraryPhotoIds`.
2. `**src/pages/CreerUnifie.tsx**` — nouvelle branche dans le `useEffect` d'initialisation (lignes ~395-455).

Aucun autre fichier touché. `PhotoCard`, `PhotosPage`, `PhotoLibraryPickerDialog`, `PhotoUploadZone` : intacts.

## 1. `PhotoDetailDialog`

- Importer `useNavigate` depuis `react-router-dom` + icône `Sparkles`.
- Dans le footer (avant le bouton Télécharger), ajouter :

```tsx
<Button
  onClick={() => {
    navigate("/creer", { state: { libraryPhotoIds: [photo.id] } });
    onOpenChange(false);
  }}
>
  <Sparkles className="h-4 w-4 mr-2" /> Créer un contenu
</Button>
```

- Bouton visible uniquement quand `photo.status === "ready"` (sécurité — le dialog ne s'ouvre déjà que sur ready, mais on garde la garde).
- Le bouton Télécharger devient `variant="outline"` pour hiérarchiser visuellement « Créer un contenu » comme action primaire. Layout footer : `flex justify-end gap-2`.

## 2. `CreerUnifie` — branche `libraryPhotoIds`

Dans le `useEffect` d'initialisation (avant la logique `fmt`/`subject` ou en tout début pour éviter conflits), ajouter :

```ts
const libraryIds = Array.isArray(locState?.libraryPhotoIds) ? locState.libraryPhotoIds.filter((x): x is string => typeof x === "string") : [];
if (libraryIds.length > 0 && workspaceId) {
  setStep("format"); // landing immédiat, loader géré localement
  setIsLoadingLibraryPhotos(true);
  (async () => {
    try {
      const { data, error } = await supabase
        .from("user_photos")
        .select("*")
        .in("id", libraryIds)
        .eq("workspace_id", workspaceId)
        .eq("status", "ready");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Photo introuvable");

      // Conserver l'ordre demandé
      const ordered = libraryIds
        .map((id) => data.find((p) => p.id === id))
        .filter(Boolean) as UserPhotoRow[];

      const results = await Promise.allSettled(ordered.map(userPhotoToBase64));
      const items: PhotoItem[] = [];
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          items.push({
            id: crypto.randomUUID(),
            base64: r.value.base64,
            preview: r.value.base64,
            name: r.value.name,
            mimeType: r.value.mimeType,
            context: "",
          });
        }
      });
      if (items.length === 0) throw new Error("Impossible de charger la photo");
      setUploadedPhotos(items);
    } catch (e: any) {
      toast.error(e?.message || "Impossible de charger la photo de la photothèque.");
      setStep("idea");
    } finally {
      setIsLoadingLibraryPhotos(false);
    }
  })();
  // Le nettoyage existant en fin d'effect (window.history.replaceState) supprime locState
  return; // court-circuit : on n'enchaîne pas sur la logique paramFormat/sujet
}
```

- Nouvel état local : `const [isLoadingLibraryPhotos, setIsLoadingLibraryPhotos] = useState(false);`
- Loader : afficher un overlay simple (`Loader2` + texte « Préparation de ta photo… ») au-dessus de la zone d'étape tant que `isLoadingLibraryPhotos`. Pattern minimaliste, réutilise les composants existants (pas de nouveau spinner global).
- Dépendances du `useEffect` : ajouter `workspaceId` pour que la branche s'exécute quand le workspace devient disponible (avec la garde `initDone.current` existante qui empêche la double init). Si `workspaceId` n'est pas encore prêt au premier run, l'effet s'exécutera au tick suivant.
- Le nettoyage `window.history.replaceState({}, '', window.location.href)` existant couvre déjà `libraryPhotoIds` — pas de duplication.

Imports à ajouter en haut du fichier :

- `import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";`
- `Loader2` depuis `lucide-react` si pas déjà importé.

## 3. Atterrissage utilisateur

Après init :

- `step === "format"` avec `uploadedPhotos` non vide
- Le bandeau « N photo(s) déjà prête(s) » et le filtrage des formats compatibles photo s'activent automatiquement (logique existante de `CreerStepFormat`).
- Choix carrousel photo / post photo / story photo → contexte par photo, génération : identiques à « Partir de photos ».

## Ce qui ne bouge PAS

- `handlePhotosNext`, `handleFormatNext`, `handleCoachingSelect`
- Toutes les autres branches d'init (`paramFormat`, `fromCalendar`, `paramSujet`, newsjacking, `existingContent`, `context`)
- `PhotoLibraryPickerDialog`, `PhotoUploadZone`, `PhotoCard`, `PhotosPage`
- Pas de bouton sur les vignettes (uniquement dans le dialog détail)

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe
- `/photos` → ouvrir une photo ready → « Créer un contenu » → arrivée sur `/creer` étape format avec photo préchargée → carrousel photo → génération OK
- Entrées existantes de `/creer` (calendrier, boîte à idées, dashboard, newsjacking) : comportement identique
- Changement d'onglet après l'arrivée → pas de ré-initialisation (state nettoyé par `replaceState` existant)
- Photo d'un autre workspace dans l'URL state → 0 résultats → toast d'erreur + atterrissage sur `step="idea"`

## Hors scope (confirmé)

- Sélection multiple depuis `PhotosPage`
- Suggestion automatique de format selon la photo
- Bouton sur les vignettes `PhotoCard`

## Améliorations connexes proposées

(a) **Demandé** : tout ce qui précède.

(b) **Propositions optionnelles** — j'attends ton go individuel :

1. **Pré-remplir `ideaText**` avec `photo.name` quand il est descriptif (≥ 8 caractères, pas un nom de fichier `IMG_xxxx`). Petit gain : l'utilisatrice arrive avec un sujet pré-suggéré modifiable. ok
2. **Pré-remplir le contexte de la photo** avec `photo.background_prompt` quand il existe. Cohérent avec la promesse « la photo a déjà été pensée », gain d'une étape. non
3. **Conserver l'id source `user_photo_id**` sur le `PhotoItem` (champ optionnel, aucun impact ailleurs) pour plus tard tracker conversions photothèque → contenu publié. ok

Dis-moi lesquelles inclure, ou « aucune ».