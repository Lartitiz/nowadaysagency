
## Fix suppression des espaces clients qui “reviennent”

### Diagnostic confirmé

Le problème ne vient pas d’un simple refresh visuel. Il y a en fait **2 bugs distincts** dans le flow actuel :

1. **Le front affiche un succès même si la suppression a échoué**
   - `src/components/admin/CoachingProgramList.tsx`
   - `handleDeleteStandaloneWs()` ne vérifie pas les erreurs des requêtes `delete()`
   - le workspace est masqué localement via `removedWsIds`, puis il réapparaît au reload

2. **Le bouton “Supprimer” ne supprime pas toujours**
   - si l’espace a d’autres membres, le code fait seulement un `DELETE` sur **ta ligne dans `workspace_members`**
   - donc l’action réelle est “quitter l’espace”, pas “supprimer l’espace”

3. **Les workspaces solo avec données ne peuvent probablement pas être supprimés en brut**
   - plusieurs tables ont un `workspace_id` relié à `workspaces`
   - certains espaces de ta liste ont déjà des données branding
   - un `DELETE FROM workspaces` direct peut donc être refusé par les contraintes SQL
   - aujourd’hui cette erreur est silencieuse côté UI

### Ce qu’on va corriger

#### 1. Rendre l’UI honnête
Dans `src/components/admin/CoachingProgramList.tsx` :

- attendre explicitement le résultat des suppressions
- vérifier `error` après chaque requête
- ne faire `toast.success(...)` + `setRemovedWsIds(...)` **que si la suppression a vraiment réussi**
- afficher `toast.error(...)` avec le vrai message sinon

#### 2. Séparer clairement les 2 actions
Toujours dans `CoachingProgramList.tsx` :

- si l’espace a d’autres membres :
  - libellé/action = **“Quitter”**
  - suppression de ta ligne `workspace_members`
- si tu es seule sur l’espace :
  - libellé/action = **“Supprimer définitivement”**
  - appel d’une vraie suppression complète backend

Ça évite l’ambiguïté actuelle où “Supprimer” veut parfois dire “me retirer seulement”.

#### 3. Ajouter une vraie suppression backend du workspace
Créer une migration avec une fonction SQL sécurisée, par exemple :

- `public.delete_workspace_with_cleanup(_workspace_id uuid)`

Cette fonction devra :

- vérifier que l’utilisatrice courante a le droit de supprimer l’espace
- nettoyer les données liées au workspace dans le bon ordre
- supprimer ensuite la ligne `workspaces`

Pourquoi une fonction backend :
- la suppression directe côté client est trop fragile
- certaines tables liées bloquent le delete
- il faut centraliser la logique et contourner proprement les limites RLS

#### 4. Nettoyer les tables liées au workspace
Dans cette fonction, faire un audit des tables `workspace_id` et appliquer la bonne stratégie :

- **tables purement workspace-scoped** : suppression des rows liées
  - ex. branding, contenu, idées, calendrier, etc.
- **tables plus “profil utilisateur”** : décider au cas par cas si on supprime ou si on remet `workspace_id = null`

Le but est d’éviter :
- les erreurs de contrainte SQL
- la suppression accidentelle de données utilisateur qui ne doivent pas disparaître

#### 5. Corriger la création des nouveaux espaces standalone
Dans `src/components/admin/CoachingProgramList.tsx`, `handleCreateStandaloneWs()` :

- aujourd’hui un espace créé via “Nouvel espace” ajoute l’utilisatrice comme **manager**
- le comportement attendu est plutôt **owner**

Je corrigerai ça pour éviter des états incohérents sur les espaces créés depuis cette section.

### Fichiers concernés

| Fichier | Changement |
|---|---|
| `src/components/admin/CoachingProgramList.tsx` | gestion d’erreurs, distinction Quitter/Supprimer, appel RPC de suppression réelle, correction owner/manager sur création standalone |
| `supabase/migrations/...sql` | création de la fonction SQL sécurisée de suppression complète du workspace |
| éventuellement autres fichiers/types auto-sync | seulement si nécessaires après ajout de la RPC |

### Validation

1. Supprimer un espace **sans autre membre** → il disparaît et **ne revient pas** après refresh
2. “Supprimer” un espace **avec autre membre** → le bouton devient “Quitter”, l’espace disparaît de ta liste et ne revient pas
3. Si une suppression backend échoue → **pas de faux succès**, message d’erreur visible
4. Créer un nouvel espace via “Nouvel espace” → tu es bien `owner`, pas `manager`

### Risque

Moyen-faible :
- le bug UI est simple
- la partie sensible est la suppression complète des données liées au workspace, qui doit être faite proprement table par table pour éviter toute perte de données non voulue
- mais c’est la bonne solution pour arrêter définitivement ces “faux deletes”
