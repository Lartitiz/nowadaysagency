# Audit sécurité — react-router-dom (17/08/2026)

## Contexte

`bun audit` remonte des failles react-router non corrigées dans la branche 6.x, alors que
`package.json` déclare `^6.30.1`. Cet audit vérifie l'exposition réelle de l'app et documente
la décision de ne PAS migrer vers react-router v7.

## Correctif appliqué

Le lockfile installait en réalité **react-router-dom 6.30.1** (pas 6.30.4, la dernière 6.x
disponible) — `@remix-run/router` était donc figé à 1.23.0. `bun update react-router-dom` a
remonté à **6.30.4** (`@remix-run/router@1.23.3`), ce qui corrige 4 failles déjà patchées en
amont :

| Advisory | Sévérité | Corrigée par la montée à 6.30.4 |
|---|---|---|
| GHSA-9jcx-v3wj-wh4m — redirect externe via chemin non fiable | modérée | ✅ |
| GHSA-2j2x-hqr9-3h42 — redirect via `//` en début de chemin | modérée | ✅ |
| GHSA-2w69-qvjg-hvjx — XSS via open redirect (`@remix-run/router`) | haute | ✅ (fix en 1.23.2, on a 1.23.3) |

## Failles restantes (non corrigeables en 6.x)

Trois advisories restent, tous corrigés seulement en **react-router 7.18.0** :

1. **GHSA-jjmj-jmhj-qwj2** — "Open redirect leading to XSS" (CVE-2026-53668, modérée).
   Bug dans `resolvePath()` : normalisation incorrecte des doubles slashs / chemins contenant
   un `:` passés à `useNavigate`/`<Link>`/`<Navigate>` (fix upstream : PR remix-run/react-router#14718).
2. **GHSA-wrjc-x8rr-h8h6** — "Open redirect via backslash in `<Link>` and `useNavigate`"
   (modérée). Même famille : un chemin malformé passé à la navigation peut être réinterprété
   par le navigateur comme une URL externe.
3. **GHSA-337j-9hxr-rhxg** — "Arbitrary Constructor Injection via `deserializeErrors()` in
   React Router SSR Hydration" (modérée). Touche uniquement le mode Framework/Data en
   **hydratation SSR côté serveur**, `react-router 6.4.0` → `7.17.x`.

## Analyse d'exposition

### GHSA-337j-9hxr-rhxg (hydratation SSR) — **exposition nulle, vérifiée**

L'app est une SPA React pure servie par Vite, sans rendu serveur :

- Aucune occurrence de `renderToString`, `renderToPipeableStream`, `hydrateRoot`,
  `createStaticHandler` ou `deserializeErrors` dans `src/` (`grep -rn` négatif).
- `src/App.tsx:378` monte `<BrowserRouter>` (mode déclaratif, rendu 100% client), pas
  `createBrowserRouter`/`RouterProvider` (mode Data) ni un mode Framework/RSC.
- `deserializeErrors()` n'est appelé que côté hydratation serveur → jamais exécuté ici.

→ Le vecteur d'attaque n'existe tout simplement pas dans ce déploiement. Pas de correctif
nécessaire, pas de migration v7 justifiée pour cette faille.

### GHSA-jjmj-jmhj-qwj2 et GHSA-wrjc-x8rr-h8h6 (open redirect via `resolvePath`) — **exposition négligeable, sous condition déjà respectée**

Ces deux failles nécessitent, de l'aveu même des advisories, que **l'application passe elle-même
une valeur non fiable** comme cible à `navigate()`, `<Link to>` ou `<Navigate to>` (le bug de
la librairie ne fait qu'échouer à neutraliser un chemin déjà dangereux — il ne rend pas
dangereux un chemin qui ne l'était pas). Audit de tous les points d'entrée dynamiques dans
`src/` :

- **`?redirect=` après connexion** (le seul cas où une valeur vient réellement de l'URL) :
  - [`src/pages/LoginPage.tsx:13-16,58-59`](../src/pages/LoginPage.tsx) — `isValidRedirect()`
    n'autorise que les préfixes `/invite/`, `/dashboard`, `/onboarding` avant d'appeler
    `<Navigate to={redirectTo}>`.
  - [`src/contexts/AuthContext.tsx:128,164`](../src/contexts/AuthContext.tsx) — même garde,
    n'autorise que `redirectTo.startsWith("/invite/")`.
  - Un chemin `//evil.com` ou `evil.com` ou `javascript:...` ne matche aucun de ces préfixes
    exacts : il est rejeté avant d'atteindre `navigate`/`<Navigate>`, indépendamment du bug
    react-router.

- **Retour après détour OAuth/paiement** —
  [`src/lib/retour-apres-detour.ts:46-53`](../src/lib/retour-apres-detour.ts) :
  `cheminInterneValide()` rejette explicitement tout chemin ne commençant pas par `/`, tout
  chemin commençant par `//`, et tout chemin contenant `://`, avant de le repasser à `navigate`.

- **Liens cliquables dans les réponses du coach IA** —
  [`src/components/coach/CoachChat.tsx:419,428`](../src/components/coach/CoachChat.tsx) :
  seuls les segments matchant `^\/[a-z][a-z0-9\-\/]*$` (uniquement minuscules/chiffres/tirets/
  slashs, ni `:` ni `.`) sont transformés en lien cliquable — un chemin protocolaire ou
  externe ne peut pas être produit par cette regex.

- **Notifications** (`notif.link`,
  [`src/components/NotificationBell.tsx:22`](../src/components/NotificationBell.tsx)) :
  la table `notifications` n'a qu'une policy RLS d'insertion `"Service can insert
  notifications"` (rôle service uniquement) — aucun utilisateur ne peut écrire `link`. Les
  valeurs insérées côté edge functions sont des chemins internes codés en dur (ex.
  [`supabase/functions/stripe-webhook/index.ts:300`](../supabase/functions/stripe-webhook/index.ts:300) → `"/parametres"`).

- **Suggestions branding** (`s.link`,
  [`src/components/branding/BrandingSuggestionsCard.tsx:170`](../src/components/branding/BrandingSuggestionsCard.tsx:170)) :
  proviennent de [`src/hooks/use-branding-suggestions.ts`](../src/hooks/use-branding-suggestions.ts),
  tableau de routes internes codées en dur.

- Tous les autres appels `navigate(...)`/`<Link to>` recensés (`grep -rn "navigate("`,
  `grep -rn "to={"`) construisent leur cible à partir de routes internes littérales
  (`` `/creer?format=${...}` ``, `item.route`, `section.editRoute`, etc.) où seule la query
  string varie — jamais le chemin lui-même à partir d'une entrée externe.

→ Aucun point d'entrée de l'app ne transmet une chaîne non validée provenant d'une source
externe (URL, IA, DB écrivable côté client) directement à la navigation react-router. Le bug
de la librairie reste réel et non corrigé en 6.x, mais **rien dans ce code ne l'active**.

## Décision

- ✅ Montée à `react-router-dom@6.30.4` (dans ce PR) — corrige les failles déjà patchées.
- ❌ Pas de migration vers react-router v7 : les 3 failles restantes n'ont pas de vecteur
  d'exploitation dans cette app (SPA déclarative sans SSR, aucune cible de navigation non
  validée). Une migration majeure (API `RouterProvider`/data routers, breaking changes sur
  `useNavigate`, loaders/actions) représenterait un risque de régression bien plus élevé que
  le risque résiduel réel.
- ⚠️ À revérifier si un jour l'app introduit : un nouveau paramètre d'URL utilisé comme cible
  de redirection sans allowlist de préfixes, un mode SSR/hydratation, ou un `createBrowserRouter`
  (mode Data). Dans ces cas, réévaluer la nécessité de ces correctifs upstream (ou du passage à
  react-router 7.18.0+).
