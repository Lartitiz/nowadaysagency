## Diagnostic

Sur ta capture d'écran : toast rouge `new row violates row-level security policy` au moment où tu cliques **"Lancer la retouche"**. Côté DB : aucune ligne `user_photos` n'a été créée → l'INSERT a été rejeté par la RLS.

### Cause racine

La policy INSERT sur `user_photos` exige :
```sql
with_check: user_has_workspace_access(workspace_id)
```
→ le `workspace_id` envoyé doit être un workspace dont tu es membre (owner/manager/editor/viewer).

Le hook `useWorkspaceId()` a un **fallback dangereux** :
```ts
return user?.id ?? "";   // ⚠️ user.id n'est PAS un workspace_id
```

Si `WorkspaceContext` n'a pas fini de charger au moment où tu cliques (tu as 4 workspaces : Nowadays Agency owner + 3 clients en manager — la résolution prend un peu de temps), `useWorkspaceId` renvoie `user.id` qui n'existe pas dans `workspace_members` → **RLS rejette l'INSERT**.

C'est pour ça que la page semble fonctionner mais que l'upload bug : le bouton n'attend pas que le workspace soit prêt.

---

## Plan de correction

### 1. `src/hooks/use-user-photos.ts` — garde-fou défensif dans `useCreatePhotoRetouch`

Avant l'upload, vérifier que `workspaceId !== user.id` (sinon c'est le fallback du hook, pas un vrai workspace) :

```ts
if (!workspaceId || workspaceId === user.id) {
  throw new Error("Espace de travail en cours de chargement, réessaie dans 1 seconde.");
}
```

Même garde dans `useRetryPhotoRetouch`.

### 2. `src/components/photos/PhotoUploadDialog.tsx` — désactiver le bouton tant que le workspace n'est pas prêt

Importer `useWorkspace` et désactiver "Lancer la retouche" + afficher un petit hint si `loading || !activeWorkspace` :

```tsx
const { activeWorkspace, loading: wsLoading } = useWorkspace();
const ready = !!activeWorkspace && !wsLoading;
…
<Button disabled={isPending || !file || !ready}>
  {!ready ? "Chargement de l'espace…" : "Lancer la retouche"}
</Button>
```

### 3. `src/pages/PhotosPage.tsx` — afficher le loader tant que le workspace n'est pas résolu

Afin que le bouton "Nouvelle photo" en haut ne soit pas cliquable trop tôt non plus :

```tsx
const { activeWorkspace, loading: wsLoading } = useWorkspace();
…
<Button onClick={() => setUploadOpen(true)} disabled={wsLoading || !activeWorkspace}>
  <Plus className="h-4 w-4 mr-2" /> Nouvelle photo
</Button>
```

### 4. (Optionnel mais propre) Améliorer le message d'erreur RLS

Dans `uploadPhotoOriginal` (`src/lib/photo-storage.ts`), si l'INSERT renvoie un message contenant `row-level security`, remplacer par un message clair :
```
"Espace de travail invalide. Recharge la page et réessaie."
```

---

## Pourquoi cette approche

- ✅ **Défensif sans toucher à la RLS** : on ne dégrade pas la sécurité, on empêche juste l'envoi d'un mauvais `workspace_id`.
- ✅ **UX claire** : tu vois "Chargement de l'espace…" plutôt qu'un toast technique cryptique.
- ✅ **Couvre les autres pages** plus tard : le pattern (`useWorkspace().loading` + bouton désactivé) est réutilisable.

### Hors scope

- Pas de migration SQL nécessaire.
- Pas de modification de la fonction edge `photo-background-replace` (elle n'est jamais atteinte vu que l'INSERT échoue avant).
- Le bug "page qui ne charge pas" mentionné précédemment était lié à `useUserPhotos` → ici on règle juste le bug RLS, qui est l'erreur visible aujourd'hui.

Tu valides ?