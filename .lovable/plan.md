

## Le vrai problème — Marion a 2 workspaces, tu es membre du mauvais

### Ce que je vois dans la base

Marion (`7860d5e5…`) possède **deux workspaces** qui s'appellent tous les deux "Marion" :

| Workspace ID | Créé le | Membres | Données branding | Tes droits |
|---|---|---|---|---|
| `e56b291c…` | **09/03/2026** | Marion seule (owner) | ✅ **Tout** : storytelling, persona, 3× brand_*, brand_charter, 1 idée sauvegardée | ❌ **Tu n'es PAS membre** |
| `b361a5f2…` | 20/04/2026 (aujourd'hui) | Marion (owner) + toi (manager) | ❌ Vide complet | ✅ Tu es manager |

Quand tu cliques sur "Marion" dans ton sélecteur de workspaces, tu atterris forcément sur `b361a5f2…` parce que c'est le seul où tu es invitée. Mais Marion a fait tout son travail dans son workspace original `e56b291c…` créé le 09/03, et **personne ne t'y a jamais invitée**. C'est un workspace solo Marion.

Le code de la fix précédente fonctionne correctement — il affiche bien les données du workspace actif. Le problème, c'est qu'on regarde un workspace **vide par construction** parce qu'il vient d'être créé et qu'il ne sera jamais rempli automatiquement avec les données de l'autre workspace de Marion.

### Pourquoi ça arrive

Un workspace est créé automatiquement à l'inscription d'un user. Marion s'est inscrite le 09/03 → workspace `e56b291c` créé pour elle, elle l'a rempli. Puis, plus tard (peut-être quand tu as activé le mode coaching agence ou quand elle t'a invitée), un **nouveau** workspace `b361a5f2` a été créé au lieu d'attacher ton accès au workspace existant. Probablement un bug de l'invitation/onboarding agence.

### 3 options pour résoudre — à toi de choisir

**Option A — Ajouter ton accès manager au vrai workspace de Marion (le plus propre, immédiat)**

Une seule ligne SQL à exécuter :
```sql
INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES ('e56b291c-5577-440f-bf4b-7d87be94d6f9',
        'ec5e783c-e89d-44f0-aff2-bca434869740',
        'manager');
```

Ensuite tu rafraîchis la page, et "Marion" apparaît **deux fois** dans ton sélecteur de workspaces (les deux ont le même nom). Tu choisis celui de mars 2026 → toutes ses données apparaissent. Après vérification, on supprime le workspace `b361a5f2` (vide, créé par erreur).

Avantages : aucune perte de données, immédiat. Inconvénient : tu vois temporairement deux "Marion" dans le menu jusqu'à la suppression du doublon.

**Option B — Fusionner les deux workspaces en un seul (le plus propre à long terme)**

Migrer tout ce qui est attaché au workspace `b361a5f2` vers `e56b291c` (ton lien manager + l'éventuel reste), puis supprimer `b361a5f2`. Comme `b361a5f2` est vide à part toi, ça revient quasiment à l'option A mais en plus définitif (un seul workspace Marion à la fin).

Étapes SQL :
1. Repointer ton membership : `UPDATE workspace_members SET workspace_id = 'e56b291c…' WHERE workspace_id = 'b361a5f2…' AND user_id = 'ec5e783c…';`
2. Supprimer le workspace vide : `DELETE FROM workspaces WHERE id = 'b361a5f2…';` (CASCADE supprime le membership owner restant)

Avantages : un seul workspace Marion propre, pas de doublon dans ton menu. Inconvénient : si l'invitation a généré d'autres rows liées à `b361a5f2` (notifications, settings, etc.), il faut vérifier.

**Option C — Comprendre d'abord pourquoi un 2e workspace a été créé, puis corriger le bug d'invitation avant la fusion**

Avant de fusionner, on cherche dans le code le flow qui a créé `b361a5f2` à la place d'utiliser `e56b291c`. C'est probablement dans l'edge function ou le composant qui gère l'invitation agence/manager. On corrige le bug de fond (pour que les futurs invités atterrissent dans le workspace existant du client), puis on applique l'Option B.

Avantages : règle le problème pour tes prochains clients. Inconvénient : prend plus de temps avant que tu retrouves les données de Marion.

### Ma recommandation

**Option A maintenant** (1 ligne SQL, accès immédiat aux données de Marion), **puis Option C** dans une 2e étape (audit du flow d'invitation pour éviter le doublon à l'avenir, et suppression propre du workspace vide).

### Ce qu'il te faut faire pour que je lance

Choisis A, B ou C. Si tu veux A, je crée la migration SQL d'1 ligne et tu rafraîchis. Si tu veux B ou C, on cadre les étapes en plus.

