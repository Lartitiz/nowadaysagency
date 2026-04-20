

## Phase 4 — Centralisation front (rolling, ultra-prudente)

### Audit — état actuel

| Fichier | Lignes | Rôle |
|---|---|---|
| `src/hooks/use-content-generator.ts` | **618** | `generate`, `generateQuestions`, `generateFollowUp` (non-streaming, via `invokeWithTimeout`) |
| `src/hooks/use-streaming-invoke.ts` | 164 | Wrapper SSE bas niveau (utilisé aussi par `CoachingFlow`, `ChatGuidePage`) |
| `src/pages/CreerUnifie.tsx` | **2416** ⚠️ | Orchestrateur du flow — contient `streamInvoke("creative-flow", streamBody)` inline (lignes 700-781) avec mapping format→contentType, construction du body, parsing JSON. Duplique la logique de `use-content-generator.generate` mais en mode streaming. |

**Constat clé :** `useContentGenerator.generate()` ne fait QUE le mode non-streaming. Le streaming pour les formats texte (post, linkedin, newsletter, pinterest) est codé en dur dans `CreerUnifie.tsx` lignes 700-781. Donc :
- Ajouter un format = modifier 2 endroits (le hook + CreerUnifie)
- Le mapping `format → contentType → body` est dupliqué
- Le parsing JSON après stream est ré-implémenté inline (lignes 770-777)

### Objectif (et SEULEMENT ça)

Ajouter une méthode `generateStream(params)` à `useContentGenerator` qui encapsule la logique streaming des formats texte, **sans** toucher à `generate()` non-streaming, **sans** toucher à `useStreamingInvoke`, **sans** toucher aux autres usages (`CoachingFlow`, `ChatGuidePage`).

Résultat attendu : `CreerUnifie.tsx` lignes 700-781 deviennent ~10 lignes qui appellent `generateStream({ format, subject, ... })`.

### Précautions (le « faire très attention »)

1. **Aucune modification de `useStreamingInvoke`** — il est utilisé par 3 endroits, on ne le touche pas.
2. **Aucune modification de `generate()` non-streaming** — il sert encore au fallback carousel/reel/story.
3. **Préserver l'API publique du hook** — on ne fait qu'ajouter `generateStream` et exposer `streamingContent`/`streaming`/`streamDone` (qu'on lit déjà depuis `useStreamingInvoke` à l'intérieur du hook). Les composants existants qui consomment le hook (`CreerStepQuestions`, `CreerUnifie`) continuent de fonctionner.
4. **Pas de changement de signature** sur les params déjà en place.
5. **Préserver l'ordre des effets** — `streamReset()`, `setResult()`, gestion `_isQuota`, gestion mode démo, parsing JSON tolérant : tout est repris à l'identique depuis CreerUnifie.

### Plan d'application — rolling

**Étape A** — Ajouter `generateStream` dans `useContentGenerator`, sans toucher à CreerUnifie. Le hook expose en plus :
- `generateStream(params): Promise<ContentResult | null>`
- `streamingContent`, `streaming`, `streamDone`, `streamReset`, `streamError` (proxy de `useStreamingInvoke` interne)

À ce stade, **rien ne change pour personne**. CreerUnifie continue d'utiliser sa propre instance de `useStreamingInvoke`. On compile, on déploie, on vérifie 0 régression.

**Étape B** — Migrer **uniquement** le bloc `if (isTextFormat)` (lignes 700-781) de `CreerUnifie.tsx` vers un appel à `generateStream`. CreerUnifie continue d'instancier `useStreamingInvoke` pour le moment (pour ne pas casser les références à `streamingContent` ailleurs dans le fichier). On vérifie qu'un post Insta texte se génère encore.

**Étape C** — Une fois B validé, basculer les références `streamingContent`/`streaming` dans CreerUnifie pour qu'elles viennent du hook unifié, et retirer l'instance locale de `useStreamingInvoke`. Test final.

Si une étape casse → revert juste cette étape, les autres restent.

### Tests à chaque étape

- `tsc --noEmit --skipLibCheck`
- Manuel sur `/creer` :
  - Étape A : ouvrir la page, naviguer le flow → doit fonctionner à l'identique
  - Étape B : générer un **post Instagram** texte (le chemin streaming) → contenu doit s'afficher progressivement
  - Étape C : régénérer un **post LinkedIn** + une **newsletter** → vérifier streaming + parsing JSON OK

### Hors scope (explicitement)

- Carousel/reel/story (restent sur le path non-streaming de `generate()`)
- `pinterest_visual` (path direct `invokeWithTimeout`, hors streaming)
- Refactor de `CreerUnifie.tsx` au-delà du bloc 700-781
- `CoachingFlow`, `ChatGuidePage`, et tout autre consommateur de `useStreamingInvoke`
- Phase 5 (fusion edge functions)

### Plan B si ça tourne mal

- Étape A casse : on supprime `generateStream` du hook, on revient à l'export précédent. Aucun consommateur n'en dépend encore.
- Étape B casse : on remet le bloc inline lignes 700-781 (1 fichier, 1 revert).
- Étape C casse : on remet l'instance locale de `useStreamingInvoke` dans CreerUnifie.

### Estimation

- `use-content-generator.ts` : +80 lignes (ajout `generateStream` + proxy stream state)
- `CreerUnifie.tsx` : -70 lignes nettes (étapes B+C)
- Risque : **faible** grâce au rolling 3-étapes et à l'absence de breaking change sur l'API du hook

