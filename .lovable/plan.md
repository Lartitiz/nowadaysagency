## Objectif

Quand `/creer` est ouvert avec `?idea_id=...` (depuis "Rédiger" / "Continuer la rédaction"), la sauvegarde doit METTRE À JOUR cette idée existante au lieu d'insérer un doublon dans `saved_ideas`. Sans `idea_id`, comportement actuel inchangé (insert).

## Fichiers impactés

1. `src/hooks/use-flow-persistence.ts`
2. `src/pages/CreerUnifie.tsx`
3. `src/components/SaveToIdeasDialog.tsx`

## Changements

### 1. `use-flow-persistence.ts`

- Dans l'interface `FlowState`, ajouter le champ optionnel `editingIdeaId?: string | null;`
- (Pas besoin de l'ajouter au tableau de dépendances du `useEffect` du hook : `saveFlowState` est déjà appelé directement depuis `CreerUnifie` avec tout l'objet.)

### 2. `CreerUnifie.tsx`

- ~ligne 105, lire le param URL :
`const paramIdeaId = searchParams.get("idea_id");`
- Ajouter le state, priorité au persisté puis URL :
`const [editingIdeaId, setEditingIdeaId] = useState<string | null>(ps?.editingIdeaId ?? paramIdeaId ?? null);`
- ~ligne 366, inclure `editingIdeaId` dans l'objet `saveFlowState({...})` et dans le tableau de dépendances ligne 384.
- Dans `handleReset` (~ligne 1482-1517), ajouter `setEditingIdeaId(null);`
- Dans le bloc "fresh navigation reset" (~ligne 215-227), ajouter aussi `setEditingIdeaId(null);` pour cohérence.
- ~ligne 2881, passer la prop au dialog : `editingIdeaId={editingIdeaId}`

### 3. `SaveToIdeasDialog.tsx`

- Ajouter à `Props` : `editingIdeaId?: string | null;`
- Déstructurer la prop dans le composant.
- Dans `handleSave` :
  - Si `editingIdeaId` fourni → `supabase.from("saved_ideas").update({ titre, angle, format: formatLabel, canal: canalValue, objectif: objectif || null, notes: note || null, content_draft, content_data: contentData, personal_elements: personalElements || null, updated_at: new Date().toISOString() }).eq("id", editingIdeaId).select("id").single();`
  Ne PAS toucher : `user_id`, `workspace_id`, `created_at`, `status`, `type`, `source_module`.
  - Sinon → insert actuel inchangé.
- Récupérer l'id cible : `const targetId = editingIdeaId ?? newIdea?.id;` puis appliquer le bloc upload visuels existant (inchangé dans sa logique) avec `targetId`.
- Toast :
  - update → `"💡 Idée mise à jour !"`
  - insert → `"💡 Idée sauvegardée ! Tu la retrouveras dans Mes idées."` (inchangé)

## Ce qui NE DOIT PAS bouger

- `IdeasPage.handleRediger` : déjà correct.
- Comportement quand `idea_id` est absent : strictement identique (insert).
- `savedId` du FlowState (id de `generated_carousels`) : distinct de `editingIdeaId`, ne pas confondre.
- Insert `generated_carousels` dans `handleSave` de CreerUnifie : inchangé.
- Autres chemins d'insertion `saved_ideas` (Calendar, InspireFlow, Newsjacking…) : hors scope.
- `status`, `user_id`, `workspace_id`, `created_at`, `type`, `source_module` d'une idée mise à jour : préservés.

## (b) Propositions / vigilance

- **Reset "fresh navigation" ligne 215-227** : je propose d'y ajouter `setEditingIdeaId(null)` aussi (pas dans ta liste explicite mais cohérent — sans ça, si l'utilisateur ouvre `/creer?idea_id=X` puis revient sur `/creer` sans params via la sidebar, l'`editingIdeaId` pourrait survivre via state React si le bloc reset n'efface pas tout). ok
- **Point 5 (survie au refresh)** : OK natif. `ps?.editingIdeaId` est lu à l'init, et `saveFlowState` est appelé à chaque changement avec le champ inclus, donc l'id persiste tant que le flow est restauré (`shouldRestore = true`). ok
- **Risque résiduel** : si l'utilisateur change radicalement de sujet en gardant `editingIdeaId`, l'update écrasera l'idée d'origine — c'est le comportement voulu d'après ton critère 4 (changement de format reflété sur l'idée d'origine).

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` : 0 erreur.
- Reprendre une idée → générer → sauvegarder → même id, pas de doublon (count `/idees` identique).
- Créer sans idée existante → nouvelle idée créée.
- Changer le format pendant la reprise → idée d'origine mise à jour, pas de doublon.
- Refresh en cours de rédaction → `editingIdeaId` survit, update à la sauvegarde.
- Après "Nouvelle idée" → `editingIdeaId` à null, insert normal.

## Hors scope

- Emoji "📋 " dans le titre des briefs (cosmétique).
- Nettoyage `isBrief` dans `handleStatusChange`/`handleSaveNotes`.