# Intégrité du rattachement série dans le calendrier

## (a) Demandé

### 1. Migration — `saved_ideas`
Nouvelle migration Supabase ajoutant deux colonnes nullable :
- `series_id uuid` avec FK `REFERENCES public.series(id) ON DELETE SET NULL`
- `episode_number integer`

Aucun changement de RLS / GRANT (la table en a déjà). Aucun backfill.

### 2. `src/pages/Calendar.tsx`

**`handleUnplan` (L595)** — l'insert dans `saved_ideas` transmet en plus :
- `series_id: editingPost.series_id ?? null`
- `episode_number: editingPost.episode_number ?? null`

Note `media_urls` : la table `saved_ideas` **n'a pas** de colonne `media_urls` aujourd'hui (vérifié en base — 22 colonnes, aucune media). Donc on ne transmet pas `media_urls` lors de l'unplan. Si tu veux les conserver, il faut une seconde migration pour ajouter `media_urls text[]` à `saved_ideas` — à confirmer (hors plan actuel).

**`handleDragEnd` branche `ideas-sidebar` (L657-679)** — même ajout (`series_id`, `episode_number`) dans l'insert `saved_ideas`. Même limitation `media_urls`.

**`handleDragEnd` branche idée → date (L694-713)** — l'insert dans `calendar_posts` transmet :
- `series_id: idea.series_id ?? null`
- `episode_number: idea.episode_number ?? null`

**`handleQuickDuplicate` (L511)** — l'insert dans `calendar_posts` reçoit en plus :
- `content_draft: post.content_draft`
- `accroche: (post as any).accroche`
- `media_urls: post.media_urls`
- `category: (post as any).category`

Aucun `series_id` / `episode_number` (épisode unique → la copie devient un post libre). Statut reste `idea`. Pattern workspace existant (`column !== "user_id"`) inchangé.

**`postToRow` (L65)** — ajoute deux colonnes après "Objectif" :
- `Série: seriesNameById[p.series_id] || ""`
- `Épisode: p.episode_number ?? ""`

Comme `postToRow` est une fonction module-level, on la transforme en factory `makePostToRow(seriesNameById)` (ou on passe `seriesNameById` en argument). `ExportSection` reçoit `seriesNameById: Record<string, string>` en nouvelle prop ; le composant parent Calendar (qui déjà destructure `seriesNameById` via `useAllSeriesMap()` L249) la transmet aux deux usages JSX `<ExportSection .../>` (L879 + L944).

### 3. `src/components/calendar/IdeaDetailSheet.tsx`

**`handlePlan` (L99)** — l'insert `calendar_posts` transmet :
- `series_id: (idea as any).series_id ?? null`
- `episode_number: (idea as any).episode_number ?? null`

### 4. `src/components/calendar/CalendarIdeasSidebar.tsx`

**`handleMobilePlan` (L133)** — l'insert `calendar_posts` transmet `series_id` + `episode_number` de `planDialogIdea`.

`handleAdd` (AddIdeaDialog, L359) **inchangé** — c'est une création d'idée from scratch, pas une planification.

## (b) Propositions

Aucune amélioration connexe pertinente repérée dans le périmètre. Le pattern workspace est déjà uniforme dans les inserts touchés ; pas de refacto opportuniste sans sortir du scope.

## Hors scope respecté

Pas de touche à `handleMovePost`, `handleSave`, `handleDelete`, `fetchPosts`, `CalendarPostDialog`, edge functions, ni au DnD hors branches citées.

## Validation
1. `npx tsc --noEmit --skipLibCheck` clean.
2. Post avec série + épisode → unplan (bouton dialog) → ré-planifier depuis sidebar → série/épisode conservés.
3. Idem via drag du post vers la sidebar puis drag retour sur une date.
4. Dupliquer un post rédigé → la copie a `content_draft`, `accroche`, `media_urls`, `category`, statut `idea`, **aucun** `series_id`.
5. Export CSV : colonnes "Série" et "Épisode" présentes et remplies pour les posts liés.
