# Correction du bug "session expirée / contenu indisponible" — LinkedIn + photos

## Diagnostic

Quand tu fais **Partir de photos → 4 photos → Post LinkedIn → réponses aux questions → générer**, deux problèmes se cumulent :

### Cause 1 — Validation Zod côté serveur bloque > 2 photos
Dans `supabase/functions/creative-flow/index.ts` ligne 49 :
```ts
photos: z.array(...).max(2).optional()
```
→ Le serveur **rejette** toute requête avec plus de 2 photos avec une erreur 400. Le code de génération en aval (`photos.slice(0, 10)` ligne 1246) n'est jamais atteint. Le frontend affiche un message générique type "contenu indisponible".

### Cause 2 — Timeout client de 90 s sur le streaming
Dans `src/hooks/use-streaming-invoke.ts` ligne 49 : `setTimeout(() => controller.abort(), 90000)`.
La génération LinkedIn en mode photo enchaîne vision Claude sur N images + génération en 2 étapes + passe de correction. Avec plusieurs photos lourdes, ça dépasse 90 s → l'`AbortController` coupe et l'erreur ressemble à une session expirée.

## Correctifs (3 fichiers, frontend + edge function)

### 1. `supabase/functions/creative-flow/index.ts` ligne 49
Passer la limite Zod de 2 à 10 photos, alignée avec le `slice(0, 10)` déjà présent en aval :
```ts
photos: z.array(z.object({ base64: z.string(), mimeType: z.string().optional(), context: z.string().max(200).optional() })).max(10).optional(),
```

### 2. `src/hooks/use-streaming-invoke.ts` ligne 49
Allonger le timeout à 180 s (3 min) pour couvrir LinkedIn vision multi-photos :
```ts
const timeout = setTimeout(() => controller.abort(), 180000);
```
Et mettre à jour le commentaire ("multi-photo vision peut être long").

### 3. Message d'erreur plus clair
Toujours dans `use-streaming-invoke.ts`, si l'erreur abort survient encore, garder le message "La génération a pris trop de temps. Réessaie." (déjà en place) — pas de changement supplémentaire nécessaire.

## Hors scope

- Pas de migration DB
- Pas de changement de logique métier (le `slice(0,10)` et le mode "série / reportage" sont déjà en place dans la edge function lignes 1246–1283)
- Pas de refactor du flow `CreerUnifie`

## Test après correction

1. Créer un contenu → Partir de photos → uploader 4 photos
2. Choisir Post LinkedIn → répondre aux questions → générer
3. Vérifier que le post est généré avec les 4 photos en contexte (mode "série / reportage" déclenché à partir de 3 photos)
4. Republier pour propager sur `nowadays-assistant.fr`
