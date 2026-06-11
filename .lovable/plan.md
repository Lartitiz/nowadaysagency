# Refonte du dashboard — direction "Hero + outils colorés"

## Objectif

Remplacer la mise en page colonne unique 680px de `/dashboard` (AdaptiveHome) par un layout magazine 2 colonnes asymétriques (~65/35), avec en colonne de droite une **card "Idées sauvegardées" enfin visible**. La palette, la typo et tous les tokens existants du projet sont **conservés** — seule la structure et la hiérarchie changent.

## Fichiers touchés

- `src/pages/AdaptiveHome.tsx` — refonte du layout principal (le seul fichier modifié).

Pas de changement à : `App.tsx` (routes), `Dashboard.tsx` (route `/dashboard/complet`), `use-guide-recommendation.ts`, composants enfants (`AppHeader`, `WelcomeOverlay`, `ContentCoachingDialog`, `CalendarCoachingDialog`, `ChatGuidePage`), aucun fichier backend.

## Structure cible

```text
┌────────────────────────────────────────────────────────────────┐
│  AppHeader                                                      │
├────────────────────────────────────────────────────────────────┤
│  max-w-[1100px] mx-auto                                         │
│                                                                  │
│  Header : "Salut [Prénom]" (font-display) + sous-label mono     │
│                                                                  │
│  ┌──────────────────────────────┬───────────────────────────┐   │
│  │ COL GAUCHE (lg:col-span-8)   │ COL DROITE (lg:col-span-4)│   │
│  │                              │                            │   │
│  │ HERO "Ton prochain contenu"  │ CARD IDÉES SAUVEGARDÉES    │   │
│  │ - micro-header mono          │ (compteur dynamique +      │   │
│  │ - h2 font-display 26-30px    │  lien vers /idees)         │   │
│  │ - sous-ligne motivation      │                            │   │
│  │ - chips formats              │ CARD MISSIONS (compacte,   │   │
│  │ - CTA bordeaux + brainstorm  │  progress bar + 3 items)   │   │
│  │                              │                            │   │
│  │ GRILLE 2x2 OUTILS            │ CARD COACH (gradient       │   │
│  │ - Identité / Audit /         │  bordeaux → rose-medium,   │   │
│  │   Planifier / Calendrier     │  CTA "Discuter avec elle") │   │
│  │ - fonds pastel existants     │                            │   │
│  └──────────────────────────────┴───────────────────────────┘   │
│                                                                  │
│  Mobile (<lg) : tout empilé en colonne unique, hero d'abord,    │
│  puis card Idées, puis outils, puis missions, puis coach.       │
└────────────────────────────────────────────────────────────────┘
```

## Détails d'implémentation

1. **Container racine** : passe de `max-w-[680px]` à `max-w-[1100px]` avec `grid grid-cols-12 gap-8` à partir de `lg:`. Sur mobile, conserve l'empilement single-column actuel.

2. **Header "Salut [Prénom]"** : conservé tel quel, déplacé au-dessus de la grille (full width).

3. **Hero (col-span-8)** : on garde 100% de la logique existante (titre, sous-ligne `recommendation.explanation`, chips formats avec leurs `route`, CTA `handleNavigate(recommendation.ctaRoute)`, lien brainstorm secondaire, séparateur, lien alternatives). On ajuste uniquement le wrapper Tailwind pour le nouveau ratio.

4. **Grille outils (col-span-8, sous le hero)** : les 4 mini-cards passent d'une grille `md:grid-cols-4` à `grid-cols-2 gap-4` pour mieux remplir la colonne large. Les bg pastel actuels (`card.bg`) sont conservés.

5. **NOUVELLE card "Idées sauvegardées" (col-span-4, en tête de colonne droite)** :
   - Récupère le compteur via une requête `saved_ideas` `count: 'exact', head: true`, filtrée par `user_id` et `workspace_id` (en réutilisant `useWorkspaceContext()` déjà importé) — wrappée dans un `useQuery` avec clé `['adaptive-home-ideas-count', workspaceId, user.id]` et `enabled` sur la présence du user.
   - UI : card blanche `rounded-2xl` border subtile, micro-label mono "Inspiration", chiffre en `font-display italic` grande taille, h3 "Idées sauvegardées", sous-ligne courte. Au clic → `navigate('/idees')`.
   - Affichée même si compteur = 0, avec un copy adapté ("Aucune idée encore — lance un brainstorm").

6. **Missions (col-span-4)** : on réutilise `CollapsibleMissions` existant tel quel, juste replacé dans la colonne droite.

7. **Coach (col-span-4)** : on garde la card "Ta coach de com'" telle quelle, replacée en bas de la colonne droite. Pas de changement de gradient — on conserve `from-rose-pale to-card`.

8. **Tokens** : aucune nouvelle couleur n'est introduite. On utilise uniquement les classes Tailwind déjà définies dans `tailwind.config.ts` (`bg-rose-pale`, `bg-bordeaux`, `text-bordeaux`, `font-display`, `font-mono-ui`, `shadow-bento`, etc.). Si la maquette montre des fonds pastel multi-couleurs (bleu/orange/vert/violet) pour les 4 outils, on **n'adopte pas** ces couleurs — on garde les `card.bg` existants pour rester cohérent avec le reste du projet.

9. **Motion** : conservé tel quel (`hover:-translate-y-[2px]`, `transition-all duration-[250ms]`). Pas de nouvelle animation.

## Hors scope

- Pas de modification du composant `Dashboard.tsx` (route `/dashboard/complet`) — il garde sa propre card Idées déjà en place.
- Pas de changement des routes dans `App.tsx`.
- Pas de modification du contenu des recommandations (`use-guide-recommendation.ts`).
- Pas de nouvelle table ni de migration backend (la table `saved_ideas` et son RLS existent déjà).
- Pas de refonte des dialogs `ContentCoachingDialog`, `CalendarCoachingDialog`, `auditPickerOpen`.

## Validation

- `npx tsc --noEmit --skipLibCheck` doit passer.
- Vérification visuelle sur `/dashboard` : hero à gauche, card Idées visible en haut à droite avec compteur correct, missions et coach empilés dessous, mobile = colonne unique propre.
- Compteur d'idées : tester avec un compte ayant >0 idées sauvegardées et avec un compte vide.
