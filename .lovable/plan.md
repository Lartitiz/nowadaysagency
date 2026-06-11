# Plan — Fix faux succès "Sauvegarder en idée" (non-carousel)

## (a) Demandé

### 1. `handleSave` — split carousel / autres formats
Fichier : `src/pages/CreerUnifie.tsx` (~ligne 1526)

- Garder STRICTEMENT le chemin carousel actuel (insert `generated_carousels`, `setSavedId`, `toast.success("Contenu sauvegardé !")`, `setSaving(false)`).
- Pour `selectedFormat !== "carousel"` (ou carousel sans slides) : ouvrir le dialog `SaveToIdeasDialog` en mettant un nouvel état `saveIdeaDialogOpen` à `true`. Ne plus appeler `toast.success(...)` (le toast "💡 Idée sauvegardée !" est émis par le dialog après insertion réelle).
- Pas de changement à `effectiveHandleSave` ni au mode démo.

Pseudo-structure :

```ts
const handleSave = async () => {
  if (!session?.user?.id || !result?.raw || saving) return;
  const r = result.raw;
  if (selectedFormat === "carousel" && r?.slides) {
    setSaving(true);
    try {
      // … insert generated_carousels (identique) …
      toast.success("Contenu sauvegardé !");
    } catch (e:any) { toast.error(...); }
    finally { setSaving(false); }
    return;
  }
  // Tous les autres formats : ouvrir le dialog SaveToIdeasDialog
  setSaveIdeaDialogOpen(true);
};
```

### 2. Nouvel état + mapping contentType
Ajouter à côté des autres `useState` du composant :

```ts
const [saveIdeaDialogOpen, setSaveIdeaDialogOpen] = useState(false);
```

Mapping `selectedFormat` → `contentType` (valeurs exactes acceptées par le dialog : `"story" | "reel" | "post_instagram" | "post_linkedin" | "newsletter"`) :

| selectedFormat | contentType |
|---|---|
| `"newsletter"` | `"newsletter"` |
| `"story"` | `"story"` |
| `"reel"` | `"reel"` |
| `"linkedin"` | `"post_linkedin"` |
| autres (`post`, `pinterest_*`, …) | `"post_instagram"` |

### 3. Rendu du dialog
Près du JSX existant (par ex. juste après `<CreerStepResult … />` au niveau ~ligne 2632), ajouter :

```tsx
<SaveToIdeasDialog
  open={saveIdeaDialogOpen}
  onOpenChange={setSaveIdeaDialogOpen}
  contentType={mapFormatToContentType(selectedFormat)}
  subject={ideaText}
  contentData={result?.raw}
  sourceModule="creer"
  format={selectedFormat || undefined}
  objectif={objective || undefined}
/>
```

Import : `import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";`

Note : `SaveToIdeasDialog` utilise déjà `useWorkspaceId()` en interne et applique le pattern `workspace_id !== user.id` — donc on ne passe PAS `workspaceId` en prop (le composant ne l'accepte d'ailleurs pas). Conforme au "Le pattern workspace … : intouché".

### 4. Préservé strictement
- Branche carousel de `handleSave` (insert + `setSavedId` + toast)
- `handleSaveBackToCalendar`, `extractContentForCalendar`
- `SaveToIdeasDialog.tsx` (consommation uniquement, aucune modif)
- `effectiveHandleSave` / mode démo (`demoToast` continue de s'afficher avant que `handleSave` ne soit appelé)

## (b) Propositions connexes (à valider individuellement avant exec)

1. **Désactiver "Sauvegarder en idée" quand `!result?.raw`** : aujourd'hui le bouton peut être cliqué sans contenu généré ; on pourrait le griser. → trivial mais hors fichier `handleSave`.
2. **Re-fermer le dialog après save** : `SaveToIdeasDialog` appelle déjà `onOpenChange(false)` après succès (à vérifier dans le composant) — sinon ajouter un callback `onSaved`. À ne traiter QUE si le test manuel révèle un bug.
3. **Toast d'erreur explicite si `!ideaText`** avant ouverture du dialog (pour éviter une idée vide).

Aucune de ces propositions n'est appliquée sans validation.

## Validation

- `npx tsc --noEmit --skipLibCheck` OK
- Newsletter générée → "Sauvegarder en idée" → dialog → enregistrer → ligne dans `saved_ideas` avec `content_type = newsletter`, visible dans IdeasPage.
- Carousel généré → comportement identique (insert `generated_carousels`, toast actuel).
- Démo : clic affiche `demoToast`, aucune insertion, aucun dialog.
