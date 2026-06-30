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
