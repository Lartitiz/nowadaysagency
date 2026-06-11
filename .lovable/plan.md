## Diagnostic

La légende n'est pas tronquée à la génération : c'est la **passe de correction anti-tics IA** qui corrompt l'objet `caption`.

Flux du bug (carrousel photo) :

1. `carousel-ai` retourne un JSON où `caption` est un **objet** `{ hook, body, cta, hashtags }` (schéma défini ligne ~1572 de `carousel-ai/index.ts`).
2. `extractCarouselTexts` (`_shared/correction-pass.ts:367-370`) fait `` `[CAPTION] ${caption}` `` sur cet objet → produit la chaîne `[CAPTION] [object Object]` envoyée à Claude pour correction.
3. Claude renvoie une chaîne « corrigée » d'une phrase.
4. `reinjectCarouselTexts` (`correction-pass.ts:427-428`) écrase `result.caption` (l'objet) par cette chaîne plate.
5. Côté front, `buildCaptionWithFallback` (`CarouselPhotoResult.tsx:213-237`) ne trouve ni `.hook` ni `.body` ni `.cta` ni `.hashtags` sur la chaîne → `hasContent = false` → fallback sur `firstSlide.overlay_text` (une seule phrase courte). C'est exactement le symptôme observé.

## Fichier modifié

`supabase/functions/_shared/correction-pass.ts` — uniquement `extractCarouselTexts` et `reinjectCarouselTexts`.

## Changement

### `extractCarouselTexts` (ligne ~366-370)

Si `caption` est un objet, sérialiser ses sous-champs séparément (et conserver le format objet en mémoire pour la réinjection). Pousser :

- `[CAPTION - HOOK] {hook}`
- `[CAPTION - BODY] {body}`
- `[CAPTION - CTA] {cta}`

Les hashtags ne passent **pas** par la correction (pas de tics IA à corriger là-dessus, et on évite que Claude les reformate).

Si `caption` est déjà une string (compatibilité legacy / `instagram_caption`), garder le comportement actuel `[CAPTION] {string}`.

### `reinjectCarouselTexts` (ligne ~426-430)

- Détecter le type original de `result.caption` (objet vs string) avant de réinjecter.
- Si objet : remplir `.hook`/`.body`/`.cta` depuis les clés `CAPTION - HOOK/BODY/CTA` si présentes, en gardant la structure et les hashtags intacts.
- Si string : comportement actuel via la clé `CAPTION`.

## Hors scope (NE PAS TOUCHER)

- `carousel-ai/index.ts` (schéma, prompt, `max_tokens` 8192) — pas le problème.
- `CarouselPhotoResult.tsx` (`buildCaptionWithFallback`) — son fallback est légitime.
- `callAnthropicSimple`, le filtre `skipIfShorterThan`, le reste de `correction-pass.ts`.
- Les chemins slide (HOOK / TITLE / BODY / PUNCHLINE / OVERLAY) — inchangés.

## Validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Générer un carrousel photo : la textarea « Légende du carrousel » contient hook + corps + CTA + hashtags, plus seulement la phrase d'overlay.
- Un éventuel ancien chemin où `caption` arrive en string continue de fonctionner.