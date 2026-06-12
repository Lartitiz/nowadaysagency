# Restructuration du dashboard AdaptiveHome en mono-colonne

Fichier unique : `src/pages/AdaptiveHome.tsx`.

## (a) Demandé

### 1. Bandeau "Tes premiers pas" (pleine largeur, avant le greeting)

- Réécriture de `CollapsibleMissions` en **bandeau fin** : fond `--yellow`, rocket, titre "Tes premiers pas", `Progress` flex-1, compteur (`4/5 — plus qu'une !` si reste 1, sinon `X/5`), chevron de repli.
- Conserver toute la logique : `useOnboardingMissions`, localStorage `lac_missions_collapsed`, déplié → liste `MissionRow` inchangées, disparition si `allDone || dismissed`, `data-tour="card-missions"`.

### 2. Greeting + pastille coach

- Ligne `flex justify-between items-start` :
  - Gauche : greeting inchangé.
  - Droite : pilule `rounded-full` fond card + bordure fine, icône `MessageCircle` (lucide) + label "Parler à ma coach", `data-tour="card-assistant"`, `onClick → handleNavigate("/dashboard/guide")`.
- Supprimer `coachCard` et le state `coachHovered`.

### 3. Hero (modifications légères)

- Conserver gradient, kicker, titre, `recommendation.explanation`, bouton "Créer un contenu", bouton démo Auriana, `data-tour="card-next-step"`.
- **Supprimer** : séparateur + lien "Pas d'idée ? Discutes-en avec ta coach →", state `contentCoachingOpen`, import et rendu de `ContentCoachingDialog`.
- **Ajouter** entre sous-titre et bouton CTA : rangée de 4 pastilles décoratives (non cliquables, `pointer-events-none` ou simples `<span>`) — Instagram / LinkedIn / Newsletter / Pinterest — pilules fond `rose-pale`, bordure fine, icônes lucide `Instagram, Linkedin, Mail, Pin`, `text-xs`.

### 4. Zone "Piloter"

- Label discret `text-[11px] tracking-[0.18em] uppercase text-foreground/60` : "Piloter".
- Grid `sm:grid-cols-2 gap-4` :
  - **Voir mon calendrier** → `handleNavigate("/calendrier")`, icône `Calendar`.
  - **Piocher dans mes idées** → `navigate("/idees")`, conserve query `saved_ideas` count, compteur `font-display`, wording conditionnel sur `ideaCount > 0`, `data-tour="card-ideas"`, icône `Lightbulb`.
- Style cards : fond card, bordure fine, icône dans pastille `rounded-xl bg-rose-pale`, hover `translate + shadow-bento`.

### 5. Zone "Approfondir"

- Label "Approfondir" même style.
- Grid 2 colonnes, `data-tour="card-mini-actions"` sur le conteneur :
  - **Affiner mon branding** — sous-titre "Ton histoire, ton persona, ta voix" → `/branding`.
  - **Lancer un audit** — sous-titre "Instagram ou site web" → `__choose_audit__` (Dialog auditPicker inchangé).

### 6. Suppressions

- Card "Planifier ma semaine" : retirer state `planWeekOpen`, case `__plan_week__` de `handleNavigate`, import + rendu de `CalendarCoachingDialog`.
- Constante `MINI_CARDS` : supprimée.
- Colonne droite + grid 12 cols : remplacé par layout mono-colonne.
- Conteneur `max-w-[1100px]` → `max-w-[860px]`.

### 7. TOUR_STEPS

- Adapter textes/positions aux nouveaux emplacements :
  - `card-next-step` : `bottom` (hero toujours en haut).
  - `card-ideas` : `top` (Piloter, dans le scroll).
  - `card-mini-actions` : `top` (Approfondir, plus bas).
  - `nav-creer`, `nav-calendrier` : inchangés.
  - `card-missions` : `bottom` (bandeau désormais en haut).
  - `card-assistant` : `bottom` (pastille header).
- Aucune étape supprimée, aucun `data-tour` renommé.

### Ce qui ne bouge pas

AppHeader, hooks (`useGuideRecommendation`, `useOnboardingMissions`, `useAuth`, `useWorkspace`), useEffect cache branding, WelcomeOverlay + GuidedTour, logique démo Auriana, toast `/creer`, query `saved_ideas` (filtrage workspace identique, juste déplacée), Dialog auditPicker, composants `ContentCoachingDialog`/`CalendarCoachingDialog` eux-mêmes, aucun autre fichier.

## Validation

- `npx tsc --noEmit --skipLibCheck` OK.
- Ordre visuel : bandeau → greeting+pastille → hero (4 pastilles canaux) → Piloter (2 cards) → Approfondir (2 cards).
- Bandeau se replie/déplie, disparaît à 5/5.
- "Parler à ma coach" → `/dashboard/guide`. Audit → picker. Compteur idées OK. Démo Auriana OK. Tour OK.

---

## (b) Propositions — à valider individuellement

1. **Extraire `OnboardingBanner` en sous-composant** dans le même fichier (comme `CollapsibleMissions` aujourd'hui) plutôt que d'inliner le bandeau dans `AdaptiveHome`. Garde la lisibilité du return principal. oui
2. **Factoriser une mini-fonction `SectionLabel({ children })**` pour les labels "Piloter" / "Approfondir" (3 lignes, évite la duplication de classes utilitaires). **Oui**
3. **Petit `aria-label` sur la pastille "Parler à ma coach"** (accessibilité — actuellement la pastille a juste un emoji/icône + texte, mais autant être propre côté lecteur d'écran si l'icône est purement décorative). **Oui**
4. **Retirer l'import inutile `Sparkles**` s'il n'est plus utilisé après suppression du lien coach dans la hero (nettoyage des imports lucide orphelins en général : `ChevronDown` reste utilisé par le bandeau, à vérifier au moment de l'exec).non
5. **Wording compteur** : proposition de variante plus courte "4/5 · une dernière !" au lieu de "4/5 — plus qu'une !" (plus dans le ton minimal du reste de l'app). **O/N** — sinon je garde ta formulation.

Aucune de ces propositions n'est appliquée tant que tu ne les valides pas.

## Hors scope confirmé

Enrichissement des cards avec données réelles (Plan 2), bandeau semaine dans CreerUnifie (Plan 3), état vide calendrier, BinomeDashboard, démo Léa.