# Enrichissement des cards du dashboard AdaptiveHome

Périmètre strict : `src/pages/AdaptiveHome.tsx` uniquement. Aucun changement de structure, navigation, ou autre fichier.

## 1. Nouveaux imports

- `useWorkspaceFilter` depuis `@/hooks/use-workspace-query`
- `getBrandingCompletion` depuis `@/lib/branding-completion`

## 2. Hook unifié dans le composant

Ajouter `const wsFilter = useWorkspaceFilter();` (donne `{ column, value }`).

## 3. Nouvelles queries react-query (toutes filtrées workspace, staleTime 2 min)

### a. `adaptive-home-upcoming-posts`

- queryKey : `["adaptive-home-upcoming-posts", wsFilter.column, wsFilter.value]`
- Fetch `calendar_posts` : `select("date, theme, format, canal, status")`, `.eq(column, value)`, `.gte("date", todayISO)`, `.neq("status", "idea")`, `.order("date", asc)`, `.limit(2)`
- Retourne `{ date, theme, format, canal }[]`

### b. `adaptive-home-latest-idea`

- queryKey : `["adaptive-home-latest-idea", wsFilter.column, wsFilter.value]`
- Fetch `saved_ideas` : `select("title, content, created_at")`, `.eq(column, value)`, `.order("created_at", desc)`, `.limit(1)`, `.maybeSingle()`
- Conservé séparé pour ne pas casser le compteur `adaptive-home-ideas-count`

### c. `adaptive-home-branding-completion`

- queryKey : `["adaptive-home-branding-completion", wsFilter.column, wsFilter.value]`
- `getBrandingCompletion({ column: wsFilter.column, value: wsFilter.value })` → `percent`

### d. `adaptive-home-latest-audit`

- queryKey : `["adaptive-home-latest-audit", wsFilter.column, wsFilter.value]`
- Fetch en parallèle `instagram_audit` et `website_audit` : `select("score_global, created_at")`, ordonnés desc, limit 1, `maybeSingle()`
- Comparer `created_at`, garder le plus récent
- Retourne `{ score_global, created_at, type: "Instagram" | "Site" } | null`

## 4. Helpers locaux (top-level fichier)

- `formatShortDate(iso)` → "Jeu. 12" (Intl.DateTimeFormat fr-FR weekday short + day)
- `formatRelative(iso)` → "aujourd'hui" / "hier" / "il y a N jours" (calcul jours)
- `formatPill(format, canal)` → label court (Carrousel/Post/Story/Reel/Newsletter/Pin) + classes (insta = `bg-rose-soft text-bordeaux`, défaut = `bg-rose-pale text-bordeaux`)

## 5. Modifications des cards

### Card "Voir mon calendrier" (lignes ~351-369)

- Sous `<p>...Planifie tes contenus...</p>`, ajouter un bloc conditionnel :
  - Si `isLoading` : 2 skeletons (`h-4 w-full bg-muted/50 rounded animate-pulse`)
  - Si `upcomingPosts.length > 0` : map → ligne flex `pill + date courte + thème tronqué`
  - Sinon : `<p className="text-xs text-muted-foreground italic mt-2">Rien de prévu pour l'instant — et si on créait ton prochain post ?</p>`
- Conserver titre, sous-titre, icône, ArrowRight, navigation `/calendrier`

### Card "Piocher dans mes idées" (lignes ~371-400)

- Conserver compteur, titre, paragraphe existant
- Après le `<p>` : si `ideaCount > 0 && latestIdea` → encart `rounded-lg bg-rose-pale/60 px-3 py-2 mt-3` avec label `Dernière pépite` (mono-ui xs uppercase) + extrait italique `truncate` (title ?? content)

### Card "Affiner mon identité de marque" (lignes ~408-426)

- Sous le `<p>` :
  - Si `percent === 100` : remplacer le `<p>` actuel par "Ton branding est complet ✨" + Progress à 100
  - Sinon : garder le `<p>` + `<Progress value={percent} className="h-1.5 mt-2" />` + `<span className="text-[11px] mono-ui">{percent}%</span>`
- Skeleton léger pendant chargement

### Card "Lancer un audit" (lignes ~428-446)

- Sous-titre dynamique :
  - Si `latestAudit` : remplacer "Instagram ou site web." par bloc avec score `<span className="font-display text-2xl text-bordeaux">{score}/100</span>` + `<p className="text-xs">Dernier audit {type} — {formatRelative(created_at)}</p>`
  - Sinon : garder "Instagram ou site web."

## 6. Garanties (ne touche pas)

- Structure mono-colonne, sections Piloter/Approfondir, OnboardingBanner, hero, channel pills, dialog audit picker
- Tous les `data-tour`, handlers, navigation, démo Auriana
- useEffect d'invalidation cache branding, tour guidé, WelcomeOverlay
- AppHeader, AiCreditsCounter, useGuideRecommendation
- Le compteur `ideaCount` reste sur sa query dédiée
- Aucun autre fichier modifié

## 7. Validation

- `npx tsc --noEmit --skipLibCheck` passe
- Vérif visuelle preview : cards enrichies, états vides propres, pas de saut de layout
- Vérif changement de workspace → queryKey changent → refetch automatique

## Propositions connexes (optionnel, à valider individuellement)

**(b) Proposition n°1** : Gérer un cas d'erreur réseau silencieux sur chaque nouvelle query (try/catch, retour `null`/`[]` sans toast) pour éviter de casser le dashboard si une table est temporairement inaccessible. **Recommandé** car react-query par défaut retry mais expose une `error` non utilisée ici. OUI

**(b) Proposition n°2** : Extraire les 4 nouvelles queries dans un petit `useDashboardCards()` interne au même fichier pour ranger le composant. **Optionnel**, purement cosmétique, pas de gain fonctionnel. NON Plan validé. Je prends la proposition n°1 (erreur réseau silencieuse → état vide). Je ne prends pas la n°2 (on garde les queries dans le composant, pas d'extraction). Deux points avant exec : (1) `todayISO` en date LOCALE format YYYY-MM-DD, aligné sur le helper `toLocalDateStr` existant, pas un toISOString UTC ; (2) vérifie que la classe `mono-ui` existe, sinon remplace par `text-[11px] uppercase tracking-wide text-muted-foreground`. Tu peux passer en Exec.

Aucune autre proposition (le périmètre est volontairement étroit).