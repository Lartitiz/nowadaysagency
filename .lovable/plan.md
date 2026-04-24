

## Plan — Injection du contexte série dans les générateurs

### Constat

Les colonnes `calendar_posts.series_id` et `calendar_posts.episode_number` existent en DB et la table `series` est complète (promise, format_template, signature_description, cadence, channels), mais :
- aucune UI ne permet de **rattacher un post à une série** au moment de sa création/édition
- aucun générateur (`carousel-ai`, `linkedin-ai`, `generate-content` qui couvre stories/reels) ne lit ces colonnes ni n'injecte de contexte série dans les prompts

Conséquence : le concept "Mes séries" reste cosmétique. Ce plan le rend opérationnel.

### Architecture cible

```text
[Calendar UI] ─ select série + n° épisode ──► calendar_posts.series_id / episode_number
                                                        │
                                                        ▼
[Generator UI] ─ envoie series_id + episode_number ─► [Edge function]
                                                        │
                                                        ▼
                                          buildSeriesContext(supabase, series_id, episode_number)
                                          ├─ Récupère la série (name, promise, format, signature, cadence)
                                          ├─ Récupère les 3-5 derniers épisodes produits (theme + résumé court)
                                          └─ Calcule le numéro d'épisode (auto si absent = max+1)
                                                        │
                                                        ▼
                                          Injecte un bloc "CONTEXTE SÉRIE" dans systemPrompt
                                                        │
                                                        ▼
                                                  Génération
```

### Étapes

**1. Helper partagé `_shared/series-context.ts` (nouveau)**

Une fonction unique réutilisée par tous les générateurs :

```ts
buildSeriesContext(supabase, seriesId, episodeNumber?, channel?) →
  { block: string, episodeNumber: number } | null
```

Logique :
- Lit la série (workspace-scoped via RLS, le client serveur a déjà les bons droits)
- Liste les `calendar_posts` `WHERE series_id = ?` triés par `episode_number desc nulls last, date desc`, limit 5
- Pour chaque épisode listé : extrait `episode_number`, `theme`, et un **résumé court** = `accroche` si présente sinon premiers 200 caractères de `content_draft` (fallback `theme` seul)
- Calcule l'épisode courant : si `episodeNumber` fourni → utilisé tel quel ; sinon `max(episode_number) + 1` (ou 1 si vide)
- Si le canal courant n'est pas dans `series.channels` → ajoute une note "(série prévue pour {channels}, adaptation au canal {channel})"
- Retourne un bloc texte formaté prêt à être inséré dans `systemPrompt` (entre 400 et 1200 tokens max)

Format du bloc :
```text
══ CONTEXTE SÉRIE ══
Série : {name} (épisode #{n})
Promesse : {promise}
Format fixe : {format_template}
Signature : {signature_description}
Cadence : {cadence humanisée}

Derniers épisodes produits :
- #{n-1} : {theme} — {résumé}
- #{n-2} : ...

CONSIGNES :
- Cet épisode doit tenir la promesse de la série
- Respecte le format fixe et la signature visuelle/structurelle
- Évite de répéter exactement les angles des derniers épisodes (varie l'angle, pas la promesse)
- Numérote l'épisode dans le contenu si pertinent (ex: "Épisode #{n} —")
```

**2. UI : rattachement d'un post à une série**

Dans `src/components/calendar/CalendarPostDialog.tsx` :
- Nouveau champ "Série" (Select) listant les séries actives du workspace + option "Aucune"
- Si une série est sélectionnée : champ "N° épisode" auto-prérempli avec `max(episode_number)+1` mais éditable
- Si série sélectionnée et `canal` initial vide → préremplir `canal` avec le 1er canal de la série
- Persistance : `series_id` et `episode_number` dans le payload save (UPDATE et INSERT)

Hook léger `src/hooks/use-active-series.ts` : retourne les séries `status='active'` du workspace courant.

**3. Câblage des générateurs**

Pour chaque appel générateur, le frontend envoie en plus `series_id` et `episode_number` (lus depuis le post courant si on génère depuis le calendrier, ou depuis le formulaire de création unifiée).

Côté edge functions, ajout du bloc `CONTEXTE SÉRIE` dans le `systemPrompt` :

| Fonction | Fichier | Insertion |
|---|---|---|
| `carousel-ai` | `supabase/functions/carousel-ai/index.ts` | Après `buildSystemPrompt(...)` ligne ~131, avant `launch_context` |
| `linkedin-ai` | `supabase/functions/linkedin-ai/index.ts` | Au même endroit logique (après construction du system prompt) |
| `generate-content` | `supabase/functions/generate-content/index.ts` | Pour `format ∈ {reel, story, story_serie, post}` quand `series_id` est présent |

Schéma Zod : ajouter `series_id: z.string().uuid().optional().nullable()` et `episode_number: z.number().int().min(1).optional().nullable()` dans les validateurs des 3 fonctions.

**4. Auto-injection depuis le calendrier**

Quand on génère du contenu pour un post existant qui a `series_id` non null (cas le plus fréquent : "Générer le contenu" sur une card du calendrier), récupérer ces deux champs depuis le post et les passer automatiquement au générateur — l'utilisatrice n'a rien à refaire.

Points d'intégration : `src/hooks/use-content-generator.ts` (génération carrousel depuis calendrier) + `src/components/RedactionFlow.tsx` (génération texte).

### Fichiers touchés

**Nouveaux**
- `supabase/functions/_shared/series-context.ts`
- `src/hooks/use-active-series.ts`

**Modifiés**
- `src/components/calendar/CalendarPostDialog.tsx` — UI série + n° épisode
- `src/hooks/use-content-generator.ts` — passe `series_id`/`episode_number`
- `src/components/RedactionFlow.tsx` — idem
- `supabase/functions/carousel-ai/index.ts` — Zod + injection bloc
- `supabase/functions/linkedin-ai/index.ts` — Zod + injection bloc
- `supabase/functions/generate-content/index.ts` — Zod + injection bloc (pour reel/story)

### Hors scope

- Création/édition de série depuis le dialog de post (déjà gérée dans Branding)
- Migration de données existantes (rien à migrer, les colonnes sont vides)
- Pinterest/newsletter (l'utilisatrice a explicitement listé carousel/linkedin/stories/reels)
- Renumérotation automatique en cas de suppression d'épisode (Phase 2)
- Affichage badge "Série · Ep #N" sur les cards calendrier (visuel, peut suivre)

### Validation

- Créer un post calendrier, sélectionner une série → `series_id` sauvé, `episode_number` auto-incrémenté
- Générer un carrousel sur ce post → vérifier dans les logs edge function que `══ CONTEXTE SÉRIE ══` apparaît dans le system prompt
- Le contenu généré mentionne le n° d'épisode si pertinent et respecte le format de la série
- Régression : générer un post **sans** série → aucun bloc série injecté, comportement inchangé
- Multi-canal : si la série liste `[instagram, linkedin]` et qu'on génère pour LinkedIn, le bloc est bien injecté dans `linkedin-ai`

