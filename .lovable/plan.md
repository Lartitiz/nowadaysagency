# Onboarding : remplacer les notes par des niveaux en mots

## Ce qu'on fait

Plus aucun chiffre de note dans l'onboarding. Le diagnostic de fin d'onboarding affiche un **niveau en mots** au lieu du « /100 », et les canaux affichent un **état en mots** au lieu d'une barre notée.

### Écran « score » du diagnostic (fin d'onboarding)
Avant : jauge circulaire animée « 62/100 » + phrase.
Après : un grand mot-niveau + la même phrase bienveillante, sans jauge, sans chiffre.

- < 40 → « À construire »
- 40–59 → « À consolider »
- 60–79 → « De bonnes bases »
- 80 et + → « Bien posé »

La phrase en dessous reste (celle de `getScoreMessage`, déjà qualitative). Le titre « Ton premier repère de communication » devient « Où tu en es aujourd'hui ». La petite ligne d'explication reste, reformulée sans parler d'estimation chiffrée.

### Canaux (Instagram, Site, LinkedIn…)
Chaque canal affiche : emoji + nom + état en mots, sans barre ni chiffre :
- score ≥ 60 → « bien posé »
- 40–59 → « à consolider »
- < 40 → « à construire »
- pas de données → « À auditer » (inchangé)

### Pendant le chargement du diagnostic
Le message « Score global : 62/100. C'est un bon score… » devient une phrase sans chiffre : « Ton niveau global : de bonnes bases. Tu as de solides bases. » (même logique de seuils).

## Ce qui ne change pas
- Le score continue d'être calculé, stocké en base et envoyé à l'IA : seul l'affichage change. La logique des priorités (ex. branding < 80) reste intacte.
- Aucun autre écran : audits Instagram/Site, mini-diagnostic de la landing, tableau de bord gardent leur affichage actuel.
- Le mode démo « Léa » suit automatiquement le nouvel affichage (mêmes composants).
- Aucun changement de schéma SQL, aucune edge function touchée.

## Détails techniques

- `src/components/onboarding/DiagnosticView.tsx` :
  - `ScoreSection` → nouvelle section sans jauge SVG ni compteur animé : mot-niveau (`diagnosticLevel(score)`) + `getScoreMessage(score)`.
  - `ChannelBar` → suppression de la barre animée et du `{score}/100` ; remplacement par le libellé d'état. Le cas `score === null` (« À auditer ») reste tel quel.
- `src/components/onboarding/DiagnosticLoading.tsx` : le message d'insight du score global (ligne ~83) devient qualitatif.
- `src/lib/diagnostic-data.ts` : ajout d'un helper `diagnosticLevel(score)` (libellé en mots, mêmes seuils que `getScoreMessage`). `DEMO_DIAGNOSTIC` et les calculs internes inchangés.
- Vérification : `npx vitest run` sur les tests onboarding concernés + `tsc --noEmit -p tsconfig.app.json`. Ajuster les tests qui affichent le « /100 » s'il en existe.
