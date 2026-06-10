# Mini-fix : heartbeat SSE pour carrousels (sans toucher à la génération)

## Objectif
Éviter les `FunctionsFetchError` sur les carrousels Instagram **sans modifier une ligne** de la logique de génération actuelle (2 passes, prompts, modèles, parsing). On ajoute juste un canal de "ping" parallèle qui maintient la connexion vivante.

## Principe

Aujourd'hui :
```text
Client ──fetch──► Edge fn
                    └─ [silence 30-90s pendant les 2 appels Anthropic]
                              └─ JSON final
        ◄────────────────────────────────────────────
        (si > 60s sans rien : connexion coupée = erreur)
```

Après :
```text
Client ──fetch (Accept: text/event-stream)──► Edge fn
                    ├─ ping toutes les 10s ──► relayé au client
                    ├─ [Anthropic call #1 inchangé]
                    ├─ ping toutes les 10s
                    ├─ [Anthropic call #2 correction inchangé]
                    └─ event "done" { result: <JSON final exact d'aujourd'hui> }
```

La fonction de génération reste **identique au caractère près**. On l'enveloppe juste dans un wrapper qui émet des pings pendant qu'elle tourne.

## Changements (minimaux)

### 1. `supabase/functions/_shared/anthropic-stream.ts`
Ajouter une fonction utilitaire `runWithHeartbeatSSE(corsHeaders, work)` :
- Ouvre un `ReadableStream` SSE.
- Lance `work()` (une promesse qui retourne le JSON final).
- Toutes les 10 s, envoie `data: { "type": "heartbeat" }\n\n`.
- À la résolution, envoie `data: { "type": "done", "result": <obj> }\n\n` puis ferme.
- Si erreur, envoie `data: { "type": "error", "message": ... }\n\n`.

### 2. `supabase/functions/creative-flow/index.ts`
Dans le bloc `if (isCarousel)` (ligne 1116) :
- Si le client envoie `Accept: text/event-stream`, wrapper les 2 appels existants dans `runWithHeartbeatSSE(...)` et retourner la réponse SSE.
- Sinon, comportement actuel **strictement inchangé** (fallback de sécurité).

Aucune ligne des prompts, températures, max_tokens, parsing ou merge n'est touchée.

### 3. `src/hooks/use-content-generator.ts`
Pour les générations carrousel, basculer l'appel vers `useStreamingInvoke` au lieu de `invokeWithTimeout`. Le hook existe déjà et sait gérer `done` → on récupère `event.result` comme on récupérait le JSON aujourd'hui. Heartbeats ignorés silencieusement.

## Fichiers touchés
- `supabase/functions/_shared/anthropic-stream.ts` (ajout d'1 fonction)
- `supabase/functions/creative-flow/index.ts` (1 `if` autour du bloc carrousel existant)
- `src/hooks/use-content-generator.ts` (changement d'invocation pour carrousel)

## Ce que je NE touche pas
- Prompts (génération + correction restent mot pour mot identiques)
- Logique 2 passes
- Modèles, températures, max_tokens
- Parsing JSON, merge, fallback
- Autres formats (LinkedIn, Reels, Stories, Newsletter, etc.)
- DB, RLS, sécurité

## Validation
1. Carrousel 7 slides → arrive sans `FunctionsFetchError`, contenu **identique** à aujourd'hui (mêmes appels, mêmes prompts).
2. Logs `creative-flow` montrent les heartbeats émis.
3. Si je désactive le streaming côté client (test), fallback non-stream marche toujours.

## Risque
Très faible : la seule vraie nouveauté est le wrapper SSE. Si bug, le client peut retomber sur l'ancien mode en n'envoyant pas le header `Accept: text/event-stream`.
