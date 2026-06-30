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

## Adapter

- Liste des écrans visités : en haut de `visite.spec.ts`.
- Cible un autre environnement : `VISITE_BASE_URL` dans `.env.visite.local`.

## Piège connu

Une capture `fullPage` peut montrer des bandes vides quand les sections sont révélées
au scroll (`whileInView` / IntersectionObserver) — elles restent invisibles sans scroll
réel. Pour ces écrans, scroller section par section avant de capturer.
