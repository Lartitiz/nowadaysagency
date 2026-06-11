## Problème

Quand l'utilisatrice clique sur **"Lancer la recherche"** (ou plus rarement sur **"Voir les angles"**) dans Surfer sur l'actu, le loader tourne sans fin et rien ne s'affiche, alors qu'aucune erreur n'est jetée côté serveur.

### Cause racine

`supabase/functions/newsjacking-ai/index.ts` appelle Anthropic avec l'outil `web_search_20250305` configuré sur `max_uses: 10`. Ces appels durent **régulièrement 70–150 s** (10 recherches web séquentielles). Mais les timeouts en cascade sont mal alignés :

| Endroit | Timeout actuel | Conséquence |
|---|---|---|
| Client `invokeWithTimeout("newsjacking-ai")` | **90 s** | Coupe la promesse **avant** la fin d'Anthropic |
| `AbortController` dans la fonction | 120 s | Le serveur continue à attendre Anthropic après la coupure |
| Anthropic web_search 10 uses | ~70–150 s typiques | Souvent au-delà des 90 s client |

Résultat : `invokeWithTimeout` résout en `TIMEOUT` au bout de 90 s, mais sur le panneau `setLoading(false)` n'est appelé **que dans le `finally`** APRÈS `setError(...)` — donc l'UI affiche bien une erreur, sauf que **l'utilisatrice voit d'abord le spinner pendant 90 s** sans aucun feedback intermédiaire → impression de "ça tourne dans le vide". Et si la connexion est lente / un proxy coupe à 60 s, le SDK Supabase peut renvoyer un `FunctionsFetchError` qui re-tente une fois (encore 90 s d'attente).

Même problème, à plus petite échelle, sur `newsjacking-angles` :
- mode `primary` : 4 appels parallèles fan-out (`PRECOMPUTE_COUNT = 4`, délai 200 ms), client à 60 s, edge à 90 s — quand Claude est lent ou un appel hit 529, la 1ʳᵉ tuile reste en "Génération…" indéfiniment.
- mode `variants` : client à **100 s** mais l'`AbortController` côté edge est à **90 s** — donc la fonction abort AVANT que le client ait expiré, renvoyant un 502 silencieux.

## Correctifs

### 1. Aligner et allonger les timeouts (fix immédiat)

**`src/components/creer/NewsjackingPanel.tsx`** :
- `newsjacking-ai` : passer `invokeWithTimeout(..., 90000)` → **`180000`** (3 min).
- `newsjacking-angles` primary : passer `60000` → **`120000`**.
- `newsjacking-angles` variants : passer `100000` → **`130000`** (au-dessus de l'abort serveur).

**`supabase/functions/newsjacking-ai/index.ts`** :
- `AbortController` : 120 000 → **170 000 ms** (laisser une marge sous le client 180 s).
- `web_search` `max_uses` : **10 → 5**. C'est le principal levier wall-time. 5 recherches suffisent largement pour 3-6 actus selon le prompt.

**`supabase/functions/newsjacking-angles/index.ts`** :
- `AbortController` : 90 000 → **120 000 ms** (au-dessus du client primary 120 s et sous le client variants 130 s).

### 2. Réduire la pression du pré-calcul (fix immédiat)

**`src/components/creer/NewsjackingPanel.tsx`** :
- `PRECOMPUTE_COUNT` : 4 → **2**. Le délai inter-call passe à 600 ms (au lieu de 200 ms) :
  ```ts
  setTimeout(() => fetchPrimaryAngle(idx, actu), idx * 600);
  ```
  Conséquence : on évite de saturer Anthropic en bursts de 4 et on réduit le risque de 529 / file d'attente côté gateway. Les 2 autres tuiles fetchent à la demande quand on clique "Voir les angles" — c'est déjà le comportement de `handleToggleActu`.

### 3. Feedback utilisateur pendant l'attente (fix UX)

**`src/components/creer/NewsjackingPanel.tsx`** (rendu du bouton "Lancer la recherche") :
- Ajouter un compteur "Recherche en cours… 23s" sous le bouton dès que `loading` est `true`, basé sur un `useState<number>(0)` incrémenté toutes les 1 s. Au-delà de 30 s, afficher "L'IA explore le web, ça peut prendre jusqu'à 2 minutes…". Cela rassure et évite l'impression de "freeze".
- Idem pour le slow-state des tuiles : le `slowTimer` existe déjà à 15 s sur les angles, mais aucun message n'est affiché. Ajouter "Claude prend son temps sur celle-ci…" quand `slow === true`.

### 4. Vérification

- Ouvrir Surfer sur l'actu, cliquer "Lancer la recherche", attendre 2 min max — les actus s'affichent.
- Logs Supabase : `newsjacking-ai` doit renvoyer 200 sous 170 s avec ≤5 web_search uses.
- Cliquer sur "Voir les angles" sur 3 tuiles d'affilée : aucune ne reste bloquée plus de 120 s ; en cas de timeout, le message d'erreur typé s'affiche bien sur la tuile.
- Cliquer "Voir 2 autres angles" : la réponse arrive ou un message d'erreur clair s'affiche dans la limite des 130 s.

## Hors scope (à proposer plus tard si insuffisant)

- Refactor vers le pattern **job asynchrone + polling** (table `newsjacking_jobs`, `EdgeRuntime.waitUntil`, status polling client) — robuste mais lourd ; pertinent uniquement si même après allongement des timeouts on continue à dépasser les 3 min.
- Bascule de `newsjacking-ai` sur `invokeWithHeartbeat` (SSE keep-alive) — utile si on observe des coupures de proxy intermédiaires malgré les nouveaux timeouts. Requiert d'adapter la fonction pour émettre des events SSE de heartbeat.
