

## Plan — Workspace switcher dans la sidebar

### Constat
Le `WorkspaceContext` gère déjà tout : liste des workspaces, switch, rôle actif, persistance en localStorage. Mais la sidebar affiche uniquement le nom/plan du workspace actif sans possibilité de changer.

### Modification

**Fichier unique** : `src/components/AppSidebar.tsx`

1. **Importer** `useWorkspace` depuis `WorkspaceContext`
2. **Remplacer le bloc footer statique** (L353-361) par un composant cliquable :
   - Si `isMultiWorkspace` est `true` : afficher un chevron et au clic, ouvrir un mini-dropdown (popover) listant tous les workspaces avec leur initiale et nom
   - Le workspace actif est marqué (check icon)
   - Cliquer sur un autre workspace appelle `switchWorkspace(id)` et ferme le popover
   - Si un seul workspace : garder l'affichage actuel (pas de chevron, pas cliquable)

3. **UI du switcher** :
   - Utiliser le composant `Popover` de shadcn (déjà dans le projet)
   - Chaque workspace : avatar (initiale colorée) + nom + rôle si manager
   - Workspace actif : icône check à droite
   - Style cohérent avec le reste de la sidebar (mêmes tailles de texte, couleurs)

### Aucune modification backend
Tout repose sur le `WorkspaceContext` existant — pas de nouvelle requête, pas de migration.

### Détail technique
- Le `switchWorkspace` invalide déjà toutes les queries React Query → le dashboard se rafraîchit automatiquement
- Le workspace sélectionné est persisté en `localStorage` → survit au rechargement

