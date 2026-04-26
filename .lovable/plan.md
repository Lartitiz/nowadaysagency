# Plan — Sécurité : rate-limiting sur `analyze-branding-impact`

## Contexte

`analyze-branding-impact` appelle le **Lovable AI Gateway** (et non Anthropic directement, contrairement à ce qu'indiquait le ticket initial — détail vérifié à la lecture du fichier ligne 109). Elle n'utilise ni `runPipeline` ni `checkRateLimit`. Sans rate-limit, un user authentifié peut spammer l'endpoint et :

- faire exploser les coûts gateway,
- contourner le quota `suggestion` en envoyant N requêtes en parallèle avant que `logUsage` n'écrive en DB.

Pattern de référence retenu : `engagement-coaching/index.ts` lignes 31-32, déjà en prod et conforme aux conventions du projet.

## Fichier impacté

**1 seul fichier** : `supabase/functions/analyze-branding-impact/index.ts`

## Comportement attendu

### 1. Import (ligne 5)

Ajouter sous l'import de `getCorsHeaders` :

```ts
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
```

### 2. Vérification rate-limit

Insérer le bloc ci-dessous **juste après la ligne 22** (`if (userError || !user) throw new Error("Unauthorized");`) et **avant la ligne 24** (parsing du body) :

```ts
const rateCheck = checkRateLimit(user.id);
if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);
```

⚠️ **Note variable cors** : dans ce fichier la variable s'appelle `corsHeaders` (pas `cors` comme dans `engagement-coaching`). À respecter pour éviter une `ReferenceError`.

### 3. Pourquoi placer le rate-limit AVANT le parsing du body et le `checkQuota`

- Avant `req.json()` : on évite de payer le coût de parsing si le user spamme.
- Avant `checkQuota` : on évite une requête DB par tentative spammée (le rate-limit est en mémoire, gratuit).

C'est exactement l'ordre d'`engagement-coaching` (rate-limit ligne 31, parsing ligne 34, quota ligne 40).

## Ce qui NE DOIT PAS bouger

- Le `checkQuota` existant ligne 30 (logique métier et fallback `suggestions: []` conservés tels quels)
- L'appel au gateway Lovable AI ligne 102+
- Le parsing du tool call et le save en DB
- `_shared/rate-limiter.ts` et `_shared/plan-limiter.ts` (intacts)
- Aucun changement front
- Pas de migration vers `runPipeline` (hors scope, à ouvrir séparément si besoin)

## Critères de validation

1. `grep -n "checkRateLimit\|rateLimitResponse" supabase/functions/analyze-branding-impact/index.ts` → 1 ligne d'import + 2 lignes (déclaration + return)
2. Le bloc rate-limit doit apparaître **avant** `await req.json()` (vérifiable au diff)
3. Test fonctionnel : déclencher 25 modifs branding rapides en moins d'une minute → la 21e doit retourner HTTP 429 avec header `Retry-After` (limite par défaut `checkRateLimit` = 20 req/min, cf. `_shared/rate-limiter.ts`)
4. Test non-régression : une seule modif branding → la fonction répond normalement avec ses suggestions (ou `suggestions: []` si quota dépassé)

## Améliorations identifiées (hors scope, à valider séparément si tu veux les ouvrir)

**(a) Périmètre demandé** : strictement le rate-limit sur cette fonction. ✅

**(b) Propositions d'amélioration repérées en lisant le fichier** (ne PAS exécuter dans ce ticket) :

1. **Réponse 200 sur quota épuisé (ligne 31)** : la fonction renvoie `200 + suggestions: []` au lieu d'un `429` standardisé via `quotaDeniedResponse`. Conséquence : la `QuotaWallModal` côté front ne s'affiche jamais sur cette feature. C'est exactement le bug qu'on a déjà corrigé sur `engagement-coaching` et `pinterest-ai`. → **Ticket dédié recommandé**.

2. **Double client Supabase (lignes 17 + 20)** : un client service-role + un client anon créés à chaque requête. Pattern moins propre que celui d'`engagement-coaching` qui utilise un seul client anon avec le header Authorization. Cosmétique, pas urgent.

3. **`logUsage` en fire-and-forget (ligne 169)** : actuellement `await logUsage(...)` est bien awaité ✅, c'est conforme à la règle Core mémoire. Pas d'action.

Confirme si tu veux que j'ouvre le ticket (b.1) en suivant immédiatement après celui-ci.
