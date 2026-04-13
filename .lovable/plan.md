

## Plan : Vider le state de création au changement de compte

### Problème
Quand on switch de compte via le multi-account switcher, le contenu généré (résultat carrousel, texte, etc.) reste en `sessionStorage` + `localStorage` backup. Comme le switch fait un `window.location.href = "/dashboard"` (même onglet), le `sessionStorage` persiste → quand Auriana va sur `/creer`, elle voit le carrousel de Laetitia.

### Solution
Appeler `clearFlowState()` juste avant le changement de session dans `use-account-switcher.ts`.

### Modification

**`src/hooks/use-account-switcher.ts`** (~2 lignes)
- Importer `clearFlowState` depuis `@/hooks/use-flow-persistence`
- Dans `switchToAccount`, avant l'appel `supabase.auth.refreshSession(...)`, ajouter `clearFlowState()` pour vider `sessionStorage` et `localStorage` backup

C'est tout. Un seul fichier, 2 lignes ajoutées.

### Résultat
- Chaque changement de compte repart avec un flux de création vierge
- Pas de contenu d'un autre compte qui traîne
- Le flow persistence continue de fonctionner normalement au sein d'une même session

