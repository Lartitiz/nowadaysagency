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
- `reel-angles-live.spec.ts` — quotidien, **zéro crédit** : l'écran « Choisis ton
  angle d'attaque » du reel (étape `hook_selection`, lot 7) n'était couvert par
  rien. On PROVOQUE la panne vécue le 03/08 — `creative-flow` `step:"hooks"` qui
  répond **200 avec `hooks: []`** — sur le « 3 autres angles », et on exige un
  message lisible + des sorties (« Laisser l'IA choisir », « Revenir aux
  questions ») jamais désactivées. Le 2ᵉ test du fichier joue le parcours réel
  (lundi, ~1-2 crédits, `FORCE_REEL_ANGLES=1`).
  Le test tient les deux entrées possibles : des angles (cas nominal) **ou** le
  repli si le 1er appel réel revient déjà vide — au 04/08 c'est le cas sur le
  workspace de Camille, l'edge n'étant pas encore redéployé. La charge vide de
  l'edge ressort alors en `⚠️ SIGNAL EDGE` dans la sortie **sans faire rougir le
  run** : ce test garde le front, c'est celui du lundi qui sanctionne l'edge.
  ⚠️ Ne JAMAIS relire la réponse via `route.fetch()` + `route.fulfill()` : le
  détour renvoie les en-têtes d'origine (`content-encoding: gzip`) avec un corps
  déjà décodé, le SDK Supabase lit une charge vide, et on fabrique soi-même le
  bug qu'on croit observer (perdu 40 min dessus le 04/08). `page.on("response")`
  + `res.text()` lit sans rien altérer.
  ⚠️ Signal « reel généré » = les onglets `role=tab` (Script / Légende), **pas**
  `publish-or-schedule` : depuis la PR #689 ce bouton n'apparaît qu'à la dernière
  étape du parcours reel — l'attendre, c'est attendre le timeout.
- `ecran-fige-sonde.spec.ts` — quotidien, **zéro crédit** (appels interceptés,
  ils n'atteignent jamais le serveur) : « le chargement tourne sans fin ».
  Mode quotidien = 500 immédiat sur les écrans de `ecrans.ts` ; mode lundi =
  serveur muet sur le mini-diagnostic, pour vérifier les minuteurs de sécurité
  (force manuelle : `FORCE_ECRAN_FIGE_MUET=1`). A trouvé dès sa création le
  squelette éternel de `/dashboard/complet` quand le profil échoue à charger.

## Sonde « contenu coupé » (quotidien)

Classe de bug du 01/08/2026 : la case du calendrier portait un plafond CSS
(`max-h-[150px] overflow-hidden`) **en plus** de la limite de 3 cartes déjà
appliquée en JS. Le plafond étant plus bas que 3 cartes, la 3ᵉ était tranchée en
deux et le bouton « +6 autres » poussé hors du cadre — la journée devenait
illisible **et sans issue**. Rien ne le voyait : ni le type-check, ni les 468
tests, ni aucune sonde (pas d'erreur console, pas de 4xx, et le seul débordement
surveillé était **horizontal**).

`detect-clipped.ts` cherche donc les conteneurs qui **cachent** une partie de
leur contenu à la verticale (`scrollHeight - clientHeight > 16px`). Il écarte
tout ce qui coupe **volontairement** : `line-clamp`, `text-overflow: ellipsis`,
zones scrollables, éléments masqués, conteneurs animés. Sur le site live, 0
signal sur 5 écrans — une sonde qui crie au loup finit ignorée.

Le signal atterrit en 🟡 observation (une coupe *peut* être un choix de design) :
c'est le regard qui tranche, mais on ne tranche que ce qu'on voit passer.

`sonde-contenu-coupe.spec.ts` **fabrique le bug** (la case réelle plafonnée) et
vérifie que le détecteur le voit, puis qu'il se tait sur les coupes volontaires.
Une sonde ne vaut que si on a prouvé qu'elle attrape ce qu'elle surveille.

## Sonde « code mergé pas en ligne » (quotidien)

`node e2e-visite/edges-a-redeployer.mjs` — l'angle mort du 01/08/2026 : la PR
#666 a mergé un correctif de l'Assistant, le Publish Lovable a bien mis le
**front** en ligne… mais Publish **ne redéploie pas les edge functions**. Le
front attendait des données que l'edge n'émettait pas, et rien ne le disait.
`edge-deploy-health.mjs` voit une fonction **absente**, pas une fonction
**périmée** — d'où cette seconde sonde.

Purement git : zéro réseau, zéro login, zéro crédit. Pour chaque fonction, on
prend le dernier commit touchant son dossier **ou un `_shared/` qu'elle importe**
(transitivement — un `_shared/` modifié ne redéploie pas ses consommateurs, piège
connu : une modif de `plan-limiter.ts` concerne 74 fonctions) et on le compare au
registre `~/.nowadays-visite/edges-deployed.json` (hors worktree, le cron tourne
dans un worktree frais).

- premier passage → `VERDICT: SEED` (pose la référence, ne peut rien détecter ce jour-là)
- écart détecté → `VERDICT: WARN` + la liste + le prompt Lovable prêt à coller
- après confirmation de Lovable → `node e2e-visite/edges-a-redeployer.mjs --marque <fn> [<fn>…]`

Trois états par fonction dans le registre :

| valeur | sens | signalée ? |
|---|---|---|
| un sha | déploiement confirmé à ce commit | seulement si le code a bougé depuis |
| `""` | déploiement **jamais confirmé** (retard connu) | oui, chaque matin, jusqu'au `--marque` |
| absente | fonction neuve | non — l'absence est couverte par `edge-deploy-health.mjs` |

`--a-redeployer <fn>…` pose l'état `""`. Utilisé le 01/08 pour faire remonter les
retards antérieurs à la pose de la référence : `analyze-brand`, `audit-site-auto`
et le lot D (`prospect-dm`, `analyze-documents`, `analyze-excel-mapping`,
`newsjacking-ai`), qui traînaient depuis le 26/07 sans que rien ne les rappelle.

⚠️ **Un retard ASSUMÉ n'est pas un retard oublié.** Le correctif de facturation vit
dans `_shared/plan-limiter.ts` et concerne ~65 consommateurs : le choix documenté
est de le laisser embarquer au prochain redéploiement groupé plutôt que de forcer
une passe massive (risque type 23/07). Ces fonctions restent marquées déployées
**exprès** — ne pas les « démarquer » : une sonde qui sort 65 lignes chaque matin
ne sera pas lue.
