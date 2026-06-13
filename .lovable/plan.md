# Plan — "Remettre en idée" depuis le calendrier perd les slides du carrousel

## Contexte métier

Sur `/calendrier`, quand l'utilisatrice ouvre un post déjà généré (carrousel avec slides, caption, hashtags) et clique "💡 Je veux le remettre dans mes idées" (ou drag → sidebar idées), le post réapparaît dans la liste d'idées **vidé de ses slides**. Mêmes symptômes pour les stories (sequence) et les posts avec photos.

## Cause

Dans `src/pages/Calendar.tsx` :

- `handleUnplan` (L. 643-672) et la branche `overId === "ideas-sidebar"` de `handleDragEnd` (L. 707-731) insèrent dans `saved_ideas` uniquement : `titre, format, objectif, notes, canal, content_draft, angle, series_id, episode_number`. Pas de `content_data`, pas de `accroche`, pas de `story_sequence_detail`, pas de `media_urls`, pas de snapshot des slides.
- Puis `DELETE FROM calendar_posts WHERE id = ...`. La FK `generated_carousels.calendar_post_id` est `ON DELETE SET NULL` → la ligne `generated_carousels` survit mais devient orpheline (plus rattachée à rien de visible côté UI), et la nouvelle `saved_ideas` n'a aucun moyen de la retrouver (pas de colonne `carousel_id` sur `saved_ideas`).

Résultat : l'idée existe mais le détail est vide de slides. C'est exactement ce que l'utilisatrice décrit ("ça me perd les slides").

## Objectif

Quand on remet un post en idée, **snapshoter dans `saved_ideas.content_data`** tout ce qui permet d'en restaurer le rendu (slides du carrousel s'il existe, sequence stories, accroche, médias) — exactement comme `SaveToIdeasDialog` le fait depuis `CreerUnifie` via `content_data`.

## Changements demandés (a)

### `src/pages/Calendar.tsx`

1. **Extraire un helper** `buildIdeaPayloadFromPost(post)` (in-file, juste avant `handleUnplan`) qui :
   - Lit le carrousel le plus récent lié au post :
     ```ts
     const { data: carousel } = await supabase
       .from("generated_carousels")
       .select("slides, caption, hashtags, carousel_type, quality_score, hook_text, subject")
       .eq("calendar_post_id", post.id)
       .order("updated_at", { ascending: false })
       .limit(1)
       .maybeSingle();
     ```
   - Construit `content_data` agrégé (champs renseignés seulement) :
     - `accroche: post.accroche`
     - `content: post.content_draft`
     - Si `carousel` : `carousel: { slides, caption, hashtags, carousel_type, quality_score, hook_text }` (et `slides` aussi à la racine pour compat avec lecteurs existants type IdeaDetailSheet)
     - Si `post.story_sequence_detail` : `story_sequence_detail`, `stories_count`, `stories_objective`, `stories_structure`, `stories_timing`
     - Si `post.media_urls?.length` : `media_urls`
   - Retourne un objet `{ insertFields, contentData }` regroupant aussi `accroche`, `story_sequence_detail`, `stories_count`, `stories_objective`, `stories_structure`, `stories_timing`, `media_urls`, `content_draft`, `theme→titre`, etc. à passer à l'insert `saved_ideas`.

2. **`handleUnplan`** (L. 643) : remplacer le payload d'insert pour utiliser `buildIdeaPayloadFromPost(editingPost)`. Conserver l'ordre actuel (insert idée → delete post → toast). En cas d'erreur sur l'insert, on n'efface pas le post (déjà le cas).

3. **`handleDragEnd` branche `ideas-sidebar`** (L. 707-731) : même remplacement avec `buildIdeaPayloadFromPost(post)`.

4. **Colonnes à ajouter à `saved_ideas` lors de l'insert** : aucune — toutes les nouvelles infos passent dans `content_data` (jsonb déjà présent). Pas de migration nécessaire. Les colonnes natives `content_draft`, `canal`, `format`, `series_id`, `episode_number`, `objectif`, `notes` restent renseignées comme aujourd'hui.

## Détails techniques

- Le carrousel survit physiquement (`ON DELETE SET NULL`), mais on n'a pas de moyen UI de le rattacher à l'idée après coup. Le snapshot dans `content_data.carousel.slides` est donc la source de vérité côté idée. C'est cohérent avec ce que fait déjà `SaveToIdeasDialog` (L. 97-99, 147 de `SaveToIdeasDialog.tsx`) qui stocke `slides`/`visual_html` dans `content_data`.
- `IdeaDetailSheet.tsx` lit déjà `content_data` (L. 175, 290) → aucune adaptation côté lecture pour faire réapparaître quelque chose. Affichage enrichi des slides dans la sidebar = hors scope.
- Garder `media_urls` au niveau racine de `content_data` permettra à un futur affichage idée-photo de retrouver les visuels.
- Pas de modification de `SaveToIdeasDialog`, `CreerUnifie`, `IdeasPage`, `IdeaDetailSheet`, `CalendarIdeasSidebar`.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` → 0 erreur.
- Test manuel A : générer un carrousel jusqu'au bout → l'envoyer au calendrier → ouvrir le post → cliquer "Remettre dans mes idées" → ouvrir l'idée → `content_data.carousel.slides` présent en DB, slides visibles si l'UI les rend.
- Test manuel B : même flux mais via drag du post vers la sidebar "Mes idées" → même résultat.
- Test régression : remettre en idée un post texte simple (sans carrousel/stories/photos) → toujours OK, juste sans `content_data.carousel`.

## Proposition d'amélioration (optionnel, non implémentée)

(b) Ajouter une colonne `saved_ideas.generated_carousel_id` (FK vers `generated_carousels.id`) pour rattacher proprement le carrousel d'origine à l'idée, plutôt que de snapshoter. Avantage : édition continue du carrousel. Inconvénient : migration DB + UI lecture à adapter. À traiter dans un plan séparé si pertinent.

## Hors scope

- Affichage des slides dans la sidebar idées ou IdeaDetailSheet (lecture déjà branchée sur `content_data`, ajustements visuels = autre plan).
- Persistance des photos dans `SaveToIdeasDialog` (plan séparé déjà mentionné).
- Migration de schéma `saved_ideas`.
