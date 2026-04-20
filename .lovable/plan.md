

## Audit du flow d'invitation — Option C : éviter les workspaces en double

### Ce que j'ai trouvé en auditant le code + la base

**Cause racine** : il existe **3 endroits** qui créent un workspace pour un client, et **aucun** ne vérifie si ce client a déjà un workspace avant de le faire. Résultat : à chaque action coach, on risque de créer un doublon.

| Endroit | Comportement actuel | Problème |
|---|---|---|
| **Trigger DB `create_default_tasks`** | À l'inscription d'une utilisatrice, crée auto un workspace nommé `prenom` et la passe `owner` | OK pour un compte solo, mais ce workspace devient "le vrai" du client |
| **`KickoffPreparation.tsx` ligne 124-148** (bouton "Ajouter une cliente") | Si createWorkspace coché et que la cliente n'a **aucun** workspace `owner`, en crée un. Sinon, **skip silencieux** sans rien faire | Si la cliente a déjà un workspace (quasi toujours, à cause du trigger), le coach **n'est jamais ajouté** au workspace existant. Donc le coach ne voit rien. |
| **`handleCreateStandaloneWs` dans `CoachingProgramList.tsx`** (bouton "Nouvel espace") | Crée un workspace tout neuf au nom saisi, avec coach = owner | Aucune vérif si une cliente avec ce nom/email existe déjà → **doublon garanti** si utilisé pour une cliente existante |

**Vérif base** : workspace `b361a5f2…` de Marion a bien été créé par Laetitia le 20/04 → c'est le bouton "Nouvel espace" (ou Ajouter une cliente avec checkbox) qui l'a généré, alors que Marion avait déjà son workspace `e56b291c…` créé à son inscription le 09/03.

### Ce qu'on corrige

#### 1. `KickoffPreparation.tsx` — quand le client existe, on attache, on ne crée pas

Bloc lignes 124-148, nouveau comportement :

- Si la cliente a déjà au moins un workspace `owner` → **ajouter le coach comme `manager` à son workspace existant** (le plus ancien) au lieu de skip.
- Si elle n'en a pas (cas rare, compte créé sans trigger) → créer un nouveau workspace + ajouter coach + cliente.
- Toujours afficher un toast clair : "Tu as été ajoutée à l'espace existant de Marion" vs "Espace créé pour Marion".
- Vérifier en plus que le coach n'est pas déjà membre (évite l'erreur `23505`).

#### 2. `CoachingProgramList.tsx` — `handleCreateStandaloneWs` devient plus prudent

Le bouton "Nouvel espace" sert à créer un espace **vide** pour une cliente non encore inscrite (cas légitime). On ne change pas le comportement de base, mais on ajoute :

- Un champ optionnel "email de la cliente" dans l'input (à côté du nom).
- Si email rempli ET qu'un profil + workspace existent déjà pour cet email → **propose d'attacher au workspace existant** au lieu d'en créer un (confirm dialog).
- Si email rempli mais pas de profil → comportement actuel (création workspace standalone que le client rejoindra plus tard).
- Si email vide → comportement actuel (création workspace standalone "anonyme").

#### 3. `invite-to-workspace` (edge function) — déjà correcte, pas de changement

Cette fonction prend un `workspace_id` existant et y ajoute un membre. Elle est saine. Le bug n'a jamais été là.

#### 4. Petit garde-fou DB optionnel

Pas obligatoire, mais utile pour le futur : ajouter dans `delete_workspace_with_cleanup` un message d'erreur clair si le workspace n'existe plus (pour ne pas confondre suppression silencieuse et permission refusée). À voir si tu veux.

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/components/admin/KickoffPreparation.tsx` | Bloc `if (createWorkspace)` : si client a déjà un workspace owner, ajouter le coach comme manager au lieu de skip |
| `src/components/admin/CoachingProgramList.tsx` | Ajouter input email optionnel à `handleCreateStandaloneWs` + détection workspace existant + dialog d'attachement |

### Validation

1. Créer un programme pour une nouvelle cliente test (compte tout neuf) → 1 seul workspace, coach = manager, cliente = owner.
2. Créer un programme pour une cliente existante (qui a déjà rempli son onboarding) → **pas de nouveau workspace**, coach ajouté à son workspace existant, toast "ajoutée à l'espace existant".
3. Bouton "Nouvel espace" avec un nom + email d'un compte existant → proposer "Attacher au workspace existant de Marion ?" (Oui/Non).
4. Bouton "Nouvel espace" avec un nom seul (pas d'email) → comportement actuel (espace vide standalone).
5. Pour les anciens cas comme Marion : la fix d'Option A reste la solution manuelle. Les nouveaux clients sont protégés.

### Hors scope

- Pas de migration des doublons historiques existants (à part Marion déjà traitée). Si tu en repères d'autres, on les traite au cas par cas.
- Pas de touche au trigger DB `create_default_tasks` (il est correct de créer un workspace à l'inscription).
- Pas de refonte de l'edge function d'invitation (elle est saine).

### Risque

Faible. On ajoute des vérifications avant un INSERT, on n'enlève rien. Si une vérif rate, fallback sur le comportement actuel. Pas de migration DB obligatoire.

