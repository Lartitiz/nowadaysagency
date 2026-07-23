# Visite guidée (captures + jugement design)

Pilote le **site live** déployé, capture chaque écran connecté en **desktop et mobile**,
puis on relit les PNG pour juger design / responsive / états. Distinct des tests E2E CI
(`playwright.config.ts`, qui tournent sur `localhost`).

## Mise en route

1. `cp .env.visite.local.example .env.visite.local` (jamais commité) et renseigne
   `VISITE_PASSWORD` (mot de passe du compte test « Camille »).
2. `npm run visite` — la visite se connecte une fois, puis parcourt les écrans.
3. Les captures atterrissent dans `e2e-visite/shots/` (`<écran>-<desktop|mobile>-fold.png`
   et `-full.png`).

`npm run visite:ui` ouvre le mode interactif Playwright.

## États non-nominaux (loading / erreur)

`etats.spec.ts` capture les états qu'on ne voit pas en navigation normale, en
manipulant le réseau (sans toucher `/auth/`, pour garder la session) :
- **loading** : les appels de données sont retardés → on fige le loader.
- **erreur réseau** : les appels de données échouent (500) → on capture le fallback.
- **erreur formulaire** : login avec mauvais identifiants → message d'erreur.

Captures dans `e2e-visite/shots/` préfixées `etat-`.

## Adapter

- Liste des écrans visités : en haut de `visite.spec.ts`.
- Cible un autre environnement : `VISITE_BASE_URL` dans `.env.visite.local`.
- Modules masqués (`/site`, `/seo`, `/pinterest` — `feature-flags.ts` `enabled:false`)
  redirigent un compte non-admin vers `/dashboard` : ne pas les mettre dans la liste.

## Reveals au scroll

Les sections en `opacity-0` révélées au scroll (IntersectionObserver, cf
`src/components/landing/Reveal.tsx`) restent invisibles sur une capture `fullPage`
brute. La visite scrolle donc de bout en bout (`revealAllByScrolling`) **avant** chaque
capture pleine page : `*-fold.png` reste prise avant scroll (première impression),
`*-full.png` est prise après. À conserver si tu modifies le spec.

## Règle anti-« grille figée » (bugs d'UX invisibles)

Classe de bug vécue (#618, puis Packshot / Mise en scène) : on agit (nouveau
fond, ajout d'une photo…), l'écriture en base réussit, **mais l'écran ne bouge
pas** tant qu'on ne quitte/revient pas de la page — une mutation qui oublie
d'invalider sa query. Deux règles pour l'attraper au lieu de la masquer :

1. **Jamais de `page.goto` / reload entre l'action et la vérification.** Le test
   doit voir ce que voit l'utilisatrice qui RESTE sur la page. Un rechargement
   re-lit tout et rend le test vert alors que le bug est là. Vérifie le résultat
   en place (la carte surgit toute seule), puis seulement navigue si besoin.
2. **Tester aussi le Realtime en panne.** Le bug ne se montre que quand le
   WebSocket Supabase ne pousse rien (flaky en prod) et que le filet de secours
   (invalidation + polling) doit prendre le relais. `retouche-realtime-coupe.spec.ts`
   coupe le WebSocket (`page.routeWebSocket(/\/realtime\/v1\//, …)` sans le relier
   au serveur) et vérifie que la retouche s'affiche quand même, sans reload.

3. **Tester aussi le serveur EN PANNE.** Un chargement bloqué ne se voit jamais
   quand tout va bien : il faut PROVOQUER la panne (interception réseau) puis
   vérifier que l'écran s'en sort. `ecran-fige-sonde.spec.ts` force un 500 sur
   tous les écrans et exige qu'aucun chargement ne tourne encore après 30 s.
   ⚠️ Le sélecteur DOIT inclure `animate-bounce-dot` (le loader 3 points de
   `SuspenseFallback`/`ProtectedRoute`) : sans lui la sonde est un vert menteur.
   À l'inverse, ne PAS cibler `[role=progressbar]` (c'est `<Progress>`, une
   progression de contenu — « Tes premiers pas 0/6 » — pas un chargement).

Specs de garde dédiées :
- `photos-refresh-inplace.spec.ts` — quotidien, **sans crédit** : un upload doit
  produire une carte optimiste immédiate puis la vraie vignette, sans reload.
- `retouche-realtime-coupe.spec.ts` — hebdo (lundi), ~1 crédit : « Modifier le
  fond » temps réel coupé (force manuelle : `FORCE_RT_COUPE=1`).
- `ecran-fige-sonde.spec.ts` — quotidien, **zéro crédit** (appels interceptés,
  ils n'atteignent jamais le serveur) : « le chargement tourne sans fin ».
  Mode quotidien = 500 immédiat sur les écrans de `ecrans.ts` ; mode lundi =
  serveur muet sur le mini-diagnostic, pour vérifier les minuteurs de sécurité
  (force manuelle : `FORCE_ECRAN_FIGE_MUET=1`). A trouvé dès sa création le
  squelette éternel de `/dashboard/complet` quand le profil échoue à charger.
