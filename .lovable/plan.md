# Plan — Fix toggle photo "Rien ne se passe" + audit zones d'upload

## Symptôme
Tu cliques sur le toggle "📸 J'attache une photo à mon post" (LinkedIn, et probablement Reel) : visuellement rien ne change, donc la zone d'upload (qui dépend de `photoMode === true`) n'apparaît jamais. Code lu : `src/components/creer/CreerStepFormat.tsx` lignes 555–615, `src/components/creer/PhotoUploadZone.tsx`, `src/components/creer/CreerStepIdea.tsx`.

## Diagnostic
Le pattern actuel (ligne 557) :
```tsx
<div role="button" onClick={() => setPhotoMode(!photoMode)} ...>
  <Switch checked={photoMode} onCheckedChange={setPhotoMode}
          className="pointer-events-none flex-shrink-0" />
  ...
</div>
```
empile **deux** mécanismes de toggle (wrapper `onClick` + Switch contrôlé) en neutralisant le second via `pointer-events-none`. C'est fragile : sur certains événements (touch, focus + clavier, libellé clic) la propagation peut soit ne pas atteindre le wrapper, soit déclencher le toggle puis l'annuler. Symptôme exact rapporté = "rien ne change visuellement", ce qui colle.

L'idem pattern existe pour **chaque format mono-photo** (post, reel, story, linkedin, newsletter — `formatAcceptsSinglePhoto`), donc le même bug touche tous ces formats, pas seulement LinkedIn. C'est cohérent avec ton "je crois que c'était reel aussi".

## (a) Ce que je vais faire

### 1. Simplifier le toggle photo — `CreerStepFormat.tsx` (lignes ~556-582)

Remplacer le double-mécanisme par un seul, sans wrapper `onClick`. Le `<Switch>` redevient pleinement interactif, et la zone cliquable (texte) appelle `setPhotoMode(!photoMode)` via un bouton explicite. Résultat : un seul handler, état toujours synchrone.

Modification ciblée :
- Retirer `pointer-events-none` du Switch
- Retirer `role="button" tabIndex onClick onKeyDown` du wrapper
- Garder le wrapper purement visuel (highlight selon `photoMode`)
- Le `<Switch>` ET un `<button type="button" onClick={() => setPhotoMode(!photoMode)}>` autour du texte → 2 hit zones indépendantes, jamais en conflit

### 2. Garde-fou visibilité de la zone d'upload (ligne ~598)

Aucun changement de condition (toujours `formatAcceptsSinglePhoto(selectedFormat) && photoMode`) mais ajout d'un `console.log` temporaire **non**, je préfère : pas de logs en prod. À la place : vérifier que `animate-fade-in` n'a pas un état initial `opacity-0` qui reste bloqué. Si oui, ajout d'un `key={photoMode ? "on" : "off"}` pour forcer le remount propre de l'animation à chaque flip.

### 3. Audit des autres endroits avec PhotoUploadZone

Inventaire complet pour vérifier qu'aucun autre toggle ne souffre du même pattern :
- `CreerStepFormat.tsx` ligne 749 — carrousel sub-mode (photo/mix/pure_photo) : pas de toggle Switch, juste des boutons sub-mode → **OK, pas concerné**
- `CreerStepIdea.tsx` ligne 176 — relire les 30 lignes autour pour vérifier qu'il n'y a pas un toggle équivalent qui cache la zone d'upload
- Si je trouve la même cascade Switch+wrapper, appliquer le même fix

### 4. Validation
- `npx tsc --noEmit --skipLibCheck`
- Test manuel à confirmer par toi : sur LinkedIn ET sur Reel Instagram, le clic sur le toggle révèle immédiatement la zone de drag/drop

## (b) Propositions d'amélioration — à valider avant exec

Aucune en plus. Je reste strictement sur le périmètre "le toggle ne s'active pas → la zone d'upload n'apparaît pas". Pas de refonte du PhotoUploadZone, pas de touche au flow carrousel, pas de modification backend.

## Hors scope
- Refonte du composant `Switch` (shadcn) lui-même
- Modification du flow upload (validation, HEIC, library picker)
- Mémoire / persistance des photos entre étapes
- Toute modification backend
