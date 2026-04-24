## Plan — Tag série dans le calendrier éditorial

### Constat

Les briques existent déjà :
- `calendar_posts.series_id` / `episode_number` sont persistés (fait dans la session précédente)
- `CalendarPostDialog` permet déjà de sélectionner une série → l'action "rattacher" est techniquement disponible mais peu découvrable
- `useActiveSeries()` retourne les séries actives du workspace
- Le pattern de filtre est en place (`CalendarCategoryFilters`)

Il manque trois choses **visibles** :
1. **Tag série visible sur les cards** du calendrier (mois, semaine, kanban, liste)
2. **Filtre par série** dans la barre de filtres
3. **Découvrabilité** de l'action "rattacher à une série" depuis un post existant

### Architecture cible

```text
┌─ CalendarPostDialog (déjà OK) ─── select série → save series_id/episode_number
│
└─ Affichage card ─── badge "📺 {série} · #{n}" en haut de la card
       │
       └─ CalendarCategoryFilters ─── chip "Par série ▾" déroulant
              │
              └─ filtre useMemo ajouté dans Calendar.tsx
```

### Étapes

**1. Badge série sur les cards (`CalendarContentCard.tsx`)**

Ajouter un badge compact au-dessus du titre quand `post.series_id` est non null :

- Variant `detailed` (semaine, kanban, liste) : pill `📺 {nom_série} · #{episode_number}` en `text-[10px]`, fond `bg-primary/10`, texte `text-primary`, tronqué à 22 caractères
- Variant `compact` (mois) : pill mini `📺 #{episode_number}` (juste le numéro pour économiser la place), tooltip enrichi avec le nom complet
- Le tooltip existant gagne une ligne `Série : {name} (épisode #{n})` quand applicable

Le composant a besoin du nom de la série → on le récupère via une `Map<series_id, name>` injectée en prop optionnelle `seriesNameById?: Record<string, string>`. Construit une seule fois dans `Calendar.tsx` à partir de `useActiveSeries()` (et fallback sur un fetch léger pour récupérer aussi les séries paused/archived référencées par des posts).

**2. Filtre par série (`CalendarCategoryFilters.tsx` + `Calendar.tsx`)**

Deux options de design considérées :
- (A) Ajouter un bouton "🎬 Série ▾" à côté du filtre objectif → ouvre un dropdown listant les séries actives
- (B) Étendre le composant filtre actuel avec une seconde ligne "Par série"

→ **Option A** retenue (plus clair, séparé du filtre objectif).

Implémentation :
- Nouveau composant léger `CalendarSeriesFilter.tsx` (DropdownMenu radix) à côté de `CalendarCategoryFilters`
- Affiche les séries `active` (avec compteur d'épisodes du workspace courant pour donner du contexte : `Stratégie facile (3)`)
- Option "Tout" + "Sans série" pour filtrer les posts orphelins
- Nouveau state `seriesFilter` dans `Calendar.tsx` : `"all" | "none" | <series_id>`
- Ajout au `filteredPosts` useMemo :
  ```ts
  if (seriesFilter === "none") result = result.filter(p => !p.series_id);
  else if (seriesFilter !== "all") result = result.filter(p => p.series_id === seriesFilter);
  ```
- Synchronisation URL via `?serie={id}` (cohérent avec `?canal=` existant)

**3. Découvrabilité du rattachement depuis un post existant**

Le sélecteur "Série" existe déjà dans `CalendarPostMetadata.tsx` (intégré au dialog). Pour le rendre plus découvrable :

- **Quick action sur la card** (variant detailed) : ajouter un 5ᵉ bouton dans le hover toolbar — icône 📺 (lucide `Tv` ou `Film`) "Rattacher à une série" — qui ouvre le dialog directement positionné/scrollé sur la section série (ouverture standard du dialog, pas besoin de scroll-to si la section est dans la fold haute du dialog)
- **Sur le badge "Sans série"** : non — n'affichons rien quand pas de série pour ne pas polluer
- **Tooltip enrichi** : la tooltip du card mentionne la série quand présente

### Fichiers touchés

**Modifiés**
- `src/components/calendar/CalendarContentCard.tsx` — badge série + tooltip + bouton hover
- `src/pages/Calendar.tsx` — state `seriesFilter`, filtre, lecture URL `?serie=`, passage de `seriesNameById` aux composants enfants
- `src/components/calendar/CalendarKanbanView.tsx`, `CalendarGrid.tsx`, `CalendarWeekGrid.tsx`, `CalendarListView.tsx` — propagation de la prop `seriesNameById` à chaque `<CalendarContentCard>`

**Nouveau**
- `src/components/calendar/CalendarSeriesFilter.tsx` — dropdown filtre par série (utilise `useActiveSeries`)

### Hors scope

- Édition inline de la série depuis la card (le clic ouvre le dialog où c'est déjà éditable)
- Création d'une nouvelle série depuis le dialog (renvoyer vers Branding comme aujourd'hui)
- Vue dédiée "Mes séries dans le calendrier" (Phase 2 si besoin)
- Affichage du badge dans les vues d'export CSV/XLSX (les colonnes existent déjà dans le payload, on peut les ajouter en Phase 2)
- Réordonnancement des numéros d'épisode

### Validation

- Créer un post rattaché à une série → badge `📺 {série} · #1` visible sur la card en vue mois/semaine/kanban/liste
- Cliquer sur le filtre série → liste les séries actives + "Sans série" + "Tout"
- Sélectionner une série → seuls les posts rattachés s'affichent ; URL contient `?serie={id}`
- Sélectionner "Sans série" → seuls les posts sans `series_id` s'affichent
- Hover sur une card sans série → bouton 📺 "Rattacher" disponible ; clic → dialog ouvert
- Régression : aucun post avec série ≠ aucune card rendue différemment (comportement inchangé pour `series_id = null`)
- Tooltip card avec série : ligne "Série : {name} (épisode #{n})" présente
