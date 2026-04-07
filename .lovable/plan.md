

# Plan : Résilience de l'audit Instagram

## Résumé

Ajouter un fallback Gemini quand Anthropic échoue, un timeout de 10s sur le fetch d'images, un auto-retry frontend, un refresh de session préventif, et des messages d'erreur contextualisés. La limite d'images reste à 3 (inchangée).

## Fichier 1 : `supabase/functions/audit-instagram-ai/index.ts`

### A) Timeout 10s sur fetchImageAsBase64

Ajouter un `AbortController` avec timeout de 10s dans `fetchImageAsBase64` pour éviter les blocages réseau :

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
const resp = await fetch(url, { signal: controller.signal });
clearTimeout(timeout);
```

### B) Fallback Gemini via Lovable AI Gateway

Entourer les deux appels Anthropic (vision et text-only) d'un try/catch. En cas d'échec (429, 529, timeout, ou toute erreur), tenter un appel text-only via Lovable AI Gateway (`google/gemini-2.5-flash`). Le fallback n'envoie pas d'images (text-only) mais utilise le même prompt système.

```typescript
// Après échec Anthropic :
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
if (!LOVABLE_API_KEY) throw anthropicErr;

const geminiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: "Analyse mon profil Instagram..." }
    ],
    temperature: 0.7,
  }),
});
```

### C) Messages d'erreur spécifiques au lieu du générique 500

Dans le catch final, distinguer les erreurs et retourner des messages adaptés :
- 429/surcharge → `{ error: "L'IA est momentanément surchargée, réessaie dans 2 minutes.", retryable: true }`
- Timeout → `{ error: "Le traitement a pris trop de temps, réessaie.", retryable: true }`
- Autre → `{ error: "Erreur interne du serveur" }` (comportement actuel)

### D) Limite d'images : INCHANGÉE

La limite reste à 3 images pour les posts (ligne 135) + 1 screenshot profil. Pas de modification.

## Fichier 2 : `src/pages/InstagramAudit.tsx`

### A) Session refresh préventif

Au début de `handleSubmit`, avant le traitement :

```typescript
await supabase.auth.refreshSession();
```

### B) Auto-retry sur erreur transitoire

Extraire la logique d'appel AI dans une sous-fonction. Si l'erreur contient `retryable: true` ou est un timeout, tenter automatiquement 1 retry après 3s avec un message de progression adapté ("L'IA met un peu plus de temps, on réessaie...").

### C) Messages d'erreur contextualisés

Mapper les messages d'erreur du backend vers des messages utilisateur :
- "surchargée" → "L'IA est surchargée, réessaie dans 2 minutes"
- "trop de temps" → "Le traitement a pris trop de temps, réessaie"
- Erreur auth → "Ta session a expiré, reconnecte-toi"

## Ce qui ne change PAS

- La limite d'images (reste à 3 pour les posts)
- Le modèle Anthropic principal (Claude Sonnet pour l'audit)
- Le formulaire d'input (`AuditInputForm`)
- Le format de réponse JSON attendu
- La logique de sauvegarde en base
- Les autres Edge Functions

