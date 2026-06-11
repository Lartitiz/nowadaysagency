## Fix — Retry silencieux sur 401/403 dans `use-streaming-invoke.ts`

### Analyse de co-occurence

- Fichier référence `src/lib/invoke-with-timeout.ts` : utilisé partout ailleurs, déjà robuste, ne pas toucher.
- `useStreamingInvoke` est consommé par les hooks de génération (carrousel, LinkedIn, newsletter, etc.). Sa signature publique (`content/streaming/done/error/invoke/reset`) reste inchangée → pas d'impact sur les consommateurs.
- Le retry est strictement borné (401/403, une seule fois) → aucune incidence sur la logique quota (429 = JSON `limit_reached`, traité après le fetch, ne passe pas par le retry) ni sur les autres erreurs.
- Le `clearTimeout` actuel est appelé une seule fois après le fetch. En extrayant `doFetch`, on s'assure que chaque tentative possède son propre timeout et que `clearTimeout` est appelé dans tous les chemins → pas de fuite de timer ni de double abort.
- `AbortController` : on garde **un seul** controller exposé via `abortRef` (pour que `reset()` continue d'annuler la requête en cours), mais on associe un timeout par tentative. Si le 1er fetch n'a pas été abort, on peut réutiliser le même controller pour le retry.

### Changements dans `invoke` (lignes 34–164)

1. **Extraire** une fonction locale `doFetch(token: string)` qui :
   - crée son propre `setTimeout(() => controller.abort(), 180000)`
   - exécute le `fetch` avec headers/body/signal identiques à l'actuel
   - retourne `{ resp, timeout }` pour que l'appelant fasse `clearTimeout`
   - utilise le `controller` déjà stocké dans `abortRef.current` (créé une seule fois en amont)

2. **Premier appel** : `let { resp, timeout } = await doFetch(token); clearTimeout(timeout);`

3. **Bloc de retry** juste après :
   ```ts
   if (resp.status === 401 || resp.status === 403) {
     const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
     const newToken = refreshed?.session?.access_token;
     if (!refreshErr && newToken) {
       ({ resp, timeout } = await doFetch(newToken));
       clearTimeout(timeout);
     }
     // sinon : on laisse `resp` tel quel → le flux existant (JSON parse / !resp.ok) produira le message d'erreur habituel
   }
   ```

4. **Aucune autre modification** : le parsing JSON, le fallback `!resp.ok`, le SSE reader, le catch final, la détection `_isQuota`, le timeout 180s et la signature publique restent identiques.

### Garanties

- Retry uniquement sur 401/403, jamais sur 429/500/autres.
- Maximum 1 retry (pas de boucle).
- Pas de fuite de timer : chaque `doFetch` a son propre `timeout`, `clearTimeout` appelé dans les deux chemins.
- `reset()` continue de fonctionner (même `abortRef`).
- Si `refreshSession` échoue → comportement actuel inchangé (l'erreur 401/403 retombe dans le flux JSON/`!resp.ok` existant).
- `npx tsc --noEmit --skipLibCheck` reste OK (pas de changement de types).

### Hors scope (non touché)

- `src/lib/invoke-with-timeout.ts`
- Toute autre logique du hook
- Tout autre fichier
