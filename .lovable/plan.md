## Contexte métier

7 Edge Functions de branding construisent leur réponse de refus quota « à la main ». Conséquence : le `QuotaWallModal` ne reçoit pas la forme attendue (`error: "limit_reached"`, objet `quota` complet) et la personne tombe sur un toast générique au lieu du bilan de crédits + CTA.

## Fichiers impactés (backend uniquement)

1. `supabase/functions/charter-coaching/index.ts`
2. `supabase/functions/offer-coaching/index.ts`
3. `supabase/functions/generate-voice-guide/index.ts`
4. `supabase/functions/audit-branding/index.ts`
5. `supabase/functions/analyze-brand/index.ts`
6. `supabase/functions/branding-structure-ai/index.ts`
7. `supabase/functions/generate-branding-summary/index.ts`

Le helper `quotaDeniedResponse(quota, corsHeaders)` existe déjà dans `supabase/functions/_shared/plan-limiter.ts` — il ne sera pas modifié.

## Changements par fichier

Pour chacun, uniquement 2 actions : (a) ajouter `quotaDeniedResponse` à l'import existant, (b) remplacer le bloc `if (!quota.allowed)` / `if (!usageCheck.allowed)` par un appel au helper.

| Fichier | Import actuel | Lignes ciblées | Changement |
|---------|--------------|----------------|------------|
| charter-coaching | `import { checkQuota, logUsage }` | ~276–281 | Remplacer `new Response(JSON.stringify({ error: quota.message, quota: true }), { status: 429 ... })` par `quotaDeniedResponse(quota, corsHeaders)` |
| offer-coaching | `import { checkQuota, logUsage }` | ~42–47 | Remplacer `new Response(JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }), { status: 403 ... })` par `quotaDeniedResponse(usageCheck, corsHeaders)` (passe de 403 à 429 — correct) |
| generate-voice-guide | `import { checkQuota, logUsage }` | ~46–48 | Remplacer `new Response(JSON.stringify({ error: quota.message, quota }), { status: 429 ... })` par `quotaDeniedResponse(quota, corsHeaders)` |
| audit-branding | `import { checkQuota, logUsage }` | ~110–114 | Remplacer `new Response(JSON.stringify({ error: quota.message, quota }), { status: 429, headers: { ...cors ... } })` par `quotaDeniedResponse(quota, cors)` |
| analyze-brand | `import { checkQuota, logUsage }` | ~32–37 | Conserver le `clearTimeout(timeout)` AVANT le return. Remplacer le `new Response` par `quotaDeniedResponse(quota, corsHeaders)` |
| branding-structure-ai | `import { checkQuota, logUsage }` | ~123–127 | Remplacer `new Response(JSON.stringify({ error: quota.message, quota }), { status: 429 ... })` par `quotaDeniedResponse(quota, corsHeaders)` |
| generate-branding-summary | `import { checkQuota, logUsage }` | ~57–62 | Remplacer `new Response(JSON.stringify({ error: quota.message, quota }), { status: 429 ... })` par `quotaDeniedResponse(quota, corsHeaders)` |

## Ce qui ne bouge pas

- Aucune logique métier (prompts, `checkQuota`, `logUsage`, appels Anthropic, schemas Zod, rate-limiting, auth).
- Le `clearTimeout(timeout)` dans `analyze-brand` reste en place.
- `_shared/plan-limiter.ts` inchangé.
- Aucun fichier frontend touché.
- Les 4 fonctions déjà conformes (branding-coaching, persona-ai, voice-analysis, branding-mirror) inchangées.

## Validation

1. `npx tsc --noEmit --skipLibCheck` passe sans régression.
2. `grep -rn "quota: true" supabase/functions/charter-coaching/` retourne vide.
3. `grep -rn "status: 403" supabase/functions/offer-coaching/` retourne vide (hors blocs auth si applicable).
4. Test manuel compte free à 0 crédit : le `QuotaWallModal` s'ouvre avec bilan + CTA.

## Recherche additionnelle

Aucune autre réponse de refus quota non standardisée détectée dans ces 7 fichiers. Chacun contient exactement un seul bloc `if (!quota.allowed)` (ou `if (!usageCheck.allowed)`), déjà listé ci-dessus.