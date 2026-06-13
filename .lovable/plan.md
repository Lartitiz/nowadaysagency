## Objectif

À court de crédits sur "générer les slides visuelles", ouvrir le `QuotaWallModal` (avec bilan + date renouvellement + CTA), au lieu d'un toast rouge brut.

## Cause racine (confirmée par lecture)

1. **Edge** `supabase/functions/carousel-visual/index.ts` ligne 225-229 :
   ```ts
   return new Response(JSON.stringify({ error: quota.message, quota }), { status: 429, ... })
   ```
   `error` vaut le **message** au lieu de la sentinelle `"limit_reached"`.

2. **Front** `src/pages/CreerUnifie.tsx` ligne 2297 :
   ```ts
   if (data?.error) throw new Error(data.error);
   ```
   Cette ligne perd l'objet `data.quota` (Error n'a que `message`). Et le catch ligne 2304-2310 fait `toast.error` directement sans passer par `handleQuotaError`.

`handleQuotaError` (déjà importé) lit `error?.data?.error === "limit_reached"` et `error?.data?.quota` pour décider d'ouvrir le modal.

## Modifications (a) — Demandé

### EDGE — `supabase/functions/carousel-visual/index.ts`

**Ligne 225-229 :**
```ts
if (!quota.allowed) {
  return new Response(
    JSON.stringify({ error: "limit_reached", message: quota.message, quota }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```
Seule la forme de la réponse change. La logique de `checkQuota` est inchangée.

### FRONT — `src/pages/CreerUnifie.tsx`, `handleGenerateVisuals`

**Lignes 2293-2313 :** intercepter le cas quota AVANT le throw générique, et brancher `handleQuotaError` aussi dans le catch.

```tsx
const { data, error: fnError } = await invokeWithTimeout("carousel-visual", {
  body: requestBody,
}, 120000);
if (fnError) throw fnError;

// Quota épuisé : ouvrir le QuotaWallModal avec l'objet quota complet,
// avant le throw générique qui perdrait data.quota.
if (data?.error === "limit_reached" || data?.quota) {
  if (handleQuotaError({ data })) return;
}

if (data?.error) throw new Error(data.error);
setVisualSlides(data.result?.slides_html || []);
if (downgradeReason === "user_chose_text") {
  toast.success("Carrousel généré en mode texte (aucune photo disponible).");
} else {
  toast.success("Visuels générés !");
}
} catch (e: any) {
  // Quota remonté par throw (ex: invokeWithTimeout retourne déjà l'erreur typée)
  if (handleQuotaError(e)) return;
  posthog.capture("carousel_visual_error", {
    error_message: e?.message || "unknown",
    had_slides: !!result?.raw?.slides,
    slides_count: result?.raw?.slides?.length || 0,
  });
  toast.error(e?.message || "Erreur lors de la génération des visuels");
} finally {
  setVisualLoading(false);
}
```

Le `return` après `handleQuotaError` court-circuite proprement : le `finally` existant reste seul responsable du `setVisualLoading(false)`.

## Ce qui NE BOUGE PAS (confirmé)

- Logique `checkQuota`, mapping slides, downgrade photo/mix, `PhotoMissingDialog`, `generatedWithPhotos`, snapshots photos.
- Bypass démo Auriana, `posthog.capture` (conservé après le court-circuit quota).
- Autres handlers (`handleGenerateText`, `handleGeneratePinterest`, carrousel structure, brief) qui gèrent déjà `handleQuotaError`.
- `carousel-ai/index.ts` : hors scope.
- Import `handleQuotaError` ligne 3 : déjà présent, pas re-importé.
- Le `finally { setVisualLoading(false); }` : unique endroit qui reset le loading.

## Validation

1. `npx tsc --noEmit --skipLibCheck` : 0 erreur.
2. Compte à 0 crédit → "générer les slides" → `QuotaWallModal` s'ouvre avec bilan du mois (pas un toast rouge).
3. Régression : avec crédits, génération normale, toast de succès, visuels affichés.
4. Régression : carrousel photo sans photo → `PhotoMissingDialog` (pas le mur quota), inchangé car ce flow n'atteint pas l'appel `carousel-visual`.
5. Régression : autres erreurs (timeout, 500) → toast d'erreur classique inchangé.

## Propositions séparées (b) — non implémentées

- **b1.** `carousel-visual` retourne d'autres erreurs avec `{ error: "<message brut>" }` (ex. Anthropic 529, timeout, "Aucune slide générée"). Les typer (`error: "overloaded"`, `"timeout"`, `"empty_output"`) permettrait au front d'afficher des toasts métier (ex. "L'IA est saturée, réessaie dans 30s"). Hors scope ici, à inclure dans le plan d'harmonisation globale.
- **b2.** `invokeWithTimeout` pourrait, sur status 429, attacher `e._isQuota = true` et `e.data = await res.json()` côté wrapper, ce qui simplifierait tous les call-sites (un seul `if (handleQuotaError(e)) return`). Refacto utile mais transverse — à proposer dans le plan global.

## Hors scope (plans séparés)

- `carousel-ai` : ajouter l'objet `quota` complet dans son `limit_reached`.
- Harmonisation des ~11 fonctions à 429 artisanal.
- Suppression de `useFormPersist`.