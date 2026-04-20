

## Phase 3 (étape 1 isolée) — `_shared/request-pipeline.ts`

Objectif : extraire le bloc `auth → demo guard → rate limit → quota` qui se répète au début de **5 edge functions**, sans toucher aux prompts ni aux contrats API.

### Ce qui est dupliqué aujourd'hui (audit)

Au début de chaque fonction (`creative-flow`, `carousel-ai`, `reels-ai`, `stories-ai`, `newsletter-ai`), on retrouve la même séquence :

```ts
// 1. CORS preflight
if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

// 2. Auth
const { userId, supabase } = await authenticateRequest(req);

// 3. Demo guard
if (isDemoUser(userId)) return new Response(...403...);

// 4. Rate limit
const rl = checkRateLimit(userId, 20, 60_000);
if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs!, corsHeaders);

// 5. Parse body + Zod
const body = await req.json();
const parsed = Schema.safeParse(body);
if (!parsed.success) return new Response(...400...);

// 6. Quota
const quota = await checkQuota(userId, category, workspaceId);
if (!quota.allowed) return quotaDeniedResponse(quota, corsHeaders);
```

→ ~50 lignes × 5 fonctions = **~250 lignes dupliquées**, et chaque évolution (ex. nouveau header CORS, nouvelle politique de rate limit) doit être répliquée 5 fois.

### Ce que je vais créer

**Nouveau fichier unique : `supabase/functions/_shared/request-pipeline.ts`**

Une fonction `runPipeline(req, options)` qui :
1. Gère le preflight OPTIONS
2. Authentifie (réutilise `authenticateRequest`)
3. Bloque le demo user
4. Applique le rate limit (paramètres configurables : `maxRequests`, `windowMs`)
5. Vérifie le quota (catégorie configurable, workspace_id optionnel extrait du body)
6. Renvoie soit une `Response` (early return) soit `{ userId, supabase, body, quota, corsHeaders }`

Signature proposée :
```ts
type PipelineOk = { ok: true; userId: string; supabase: any; corsHeaders: Record<string,string>; quota: QuotaResult };
type PipelineBlocked = { ok: false; response: Response };

runPipeline(req, {
  category: "content" | "audit" | "carousel" | ...,
  rateLimit?: { max: number; windowMs: number },  // défaut 20/60s
  workspaceId?: string,                           // si déjà extrait
  skipQuota?: boolean,                            // pour endpoints sans coût IA
}): Promise<PipelineOk | PipelineBlocked>
```

Usage côté fonction :
```ts
const r = await runPipeline(req, { category: "content", workspaceId: body.workspace_id });
if (!r.ok) return r.response;
const { userId, supabase, corsHeaders, quota } = r;
// ... logique métier
```

### Précautions de sécurité (ce qui m'inquiète et comment je m'en protège)

1. **Rate limit cold-start partagé** : déjà partagé via `_shared/rate-limiter.ts`, donc pas de nouveau risque. ✅
2. **Body déjà lu** : un `req.json()` ne peut être appelé qu'une fois. → Le pipeline NE lit PAS le body lui-même ; il prend `category` en option et le `workspaceId` est passé par l'appelant après son propre `req.json()`. C'est l'appelant qui garde la main sur le parsing Zod (qui est spécifique à chaque fonction).
3. **Catégories de quota différentes par step** : dans `creative-flow`, `step="dictation"` et `step="generate"` peuvent avoir des catégories différentes. → Le pipeline est appelé APRÈS la décision de catégorie, dans le routeur, pas en pré-traitement aveugle.
4. **Logging d'usage** : `logUsage()` reste à l'appelant (après succès AI), je n'y touche pas.
5. **Pas de changement sur `_shared/auth.ts`, `rate-limiter.ts`, `plan-limiter.ts`** : on ne fait qu'agréger.

### Plan d'application — ULTRA conservateur

**Étape A** : Créer `_shared/request-pipeline.ts` SEUL (aucun appel ajouté). Vérifier que les 5 fonctions compilent toujours (rien ne change pour elles).

**Étape B** : Migrer **UNE SEULE fonction** d'abord — la plus simple : **`newsletter-ai`** (247 lignes, 1 step, peu de risque).
- Refactor → deploy → curl smoke test (1 appel POST génération newsletter)
- Si KO : revert immédiat, on s'arrête.

**Étape C** : Si A+B OK, migrer dans l'ordre : `stories-ai`, `reels-ai`, `carousel-ai`, `creative-flow`. Chaque migration = 1 fichier modifié + 1 deploy + 1 curl. Si une casse, revert juste celle-là.

### Validation

- `tsc --noEmit --skipLibCheck` après chaque étape
- Curl smoke test après CHAQUE migration (pas en batch) :
  - newsletter-ai : POST génération
  - stories-ai : POST `daily`
  - reels-ai : POST `hooks`
  - carousel-ai : POST `suggest_topics`
  - creative-flow : POST `angles` + `generate`
- Vérifier qu'aucune réponse ne renvoie 500 (un 400/429 attendu sur payload minimal est OK)

### Ce que je NE touche PAS

- Les prompts (`prompts/` de creative-flow et carousel-ai)
- Les schemas Zod
- La logique de quota/rate-limit elle-même (juste leur orchestration)
- `linkedin-ai`, `pinterest-ai`, `generate-content` (out of scope phase 3 minimale)
- Le front (phase 4)

### Plan B si ça tourne mal

Si la migration d'une fonction casse :
1. Revert UNIQUEMENT le `index.ts` de cette fonction (le pipeline reste créé mais non utilisé)
2. On documente le cas particulier qui empêche la migration
3. Les autres fonctions migrées restent en place

### Estimation

- Fichier `request-pipeline.ts` : ~80 lignes
- Migration par fonction : ~40 lignes supprimées, ~5 lignes ajoutées
- Risque : **faible** grâce au rollout 1-par-1

