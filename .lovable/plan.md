

## Phase 5a — Fusion `stories-ai` dans `creative-flow` (rolling, ultra-prudente)

### Audit — état actuel

| Fonction | Lignes | Rôle réel |
|---|---|---|
| `stories-ai` | 622 | 4 types : `clarify_subject`, `suggest_subjects`, `daily`, `generate` (séquence) + garde-fou "3 ventes en 7j" + insertion `stories_sequences` |
| `creative-flow` | 1244 | Multi-format : déjà un `storiesBrief()` mais sortie `{ content }` plate, **pas** la séquence structurée |
| Front (`use-content-generator.ts` l. 274) | — | Appelle `stories-ai` avec `type: "generate"` uniquement |
| `StoryResult.tsx` / `ContentPreview.tsx` | — | Consomment `{ structure_type, narrative_angle, stories[], stickers_used, ... }` |

**Constat clé** : la difficulté n'est pas le prompt (déjà mutualisable), c'est le **schéma de réponse**. Le front s'attend à un objet `stories[]` riche. Une fusion naïve casserait le rendu.

**Constats secondaires** :
- `clarify_subject`, `suggest_subjects`, `daily` ne sont appelés par AUCUN fichier front (vérifié avec `grep`). Code mort côté flow principal.
- Le garde-fou "3 séquences vente en 7 jours" est unique à stories-ai et doit être préservé.

### Objectif (et SEULEMENT ça)

Faire en sorte que **`creative-flow` puisse générer une séquence stories au format JSON attendu par `StoryResult.tsx`**, puis basculer le front. **Sans** toucher au schéma de réponse côté UI.

### Stratégie en 4 étapes (rolling)

#### Étape A — Enrichir `_shared/format-briefs.ts > storiesBrief()`

Remplacer l'actuel `storiesBrief()` (court) par une version **complète** qui :
- inclut tout le contenu de `buildMainPrompt()` de `stories-ai` (structures par temps dispo, hooks, angles narratifs, garde-fous, instructions vente par price_range)
- impose le **JSON de sortie identique** à stories-ai : `{ structure_type, structure_label, narrative_angle, total_stories, stories[], stickers_used, garde_fou_alerte, personal_tip }`
- accepte des params : `{ objective, price_range, time_available, face_cam, is_launch, gardeFouAlerte, pre_gen_answers }`

Aucun consommateur n'est cassé : `creative-flow` utilise déjà `storiesBrief()` mais imposait ensuite un format `{ content }` à part. On va lever cette contrainte à l'étape B.

#### Étape B — Adapter `creative-flow/index.ts` pour les stories

Dans le bloc `step === "generate"` :
1. Si `isStories` est vrai :
   - Lire les params stories spécifiques du body (`price_range`, `time_available`, `face_cam`, `is_launch`, `pre_gen_answers`, `launch_context`)
   - Calculer le garde-fou "3 ventes en 7 jours" (copie de stories-ai l. 165-180, requête sur `stories_sequences`)
   - Appeler `storiesBrief({ ... })` enrichi
   - **Court-circuiter** la sortie JSON `{ content, accroche, format, ... }` — laisser le prompt imposer le schéma stories complet
   - **Pas de streaming** pour stories (la séquence est consommée en bloc)
   - Retourner `{ content: rawJsonString }` pour rester compatible avec le wrapper existant côté front (qui parse `data.content`)

À ce stade, `creative-flow` peut générer une séquence stories valide, mais `stories-ai` continue d'exister et le front continue de l'appeler. **Aucun changement utilisateur.**

#### Étape C — Tester `creative-flow` stories en isolation

Via `supabase--curl_edge_functions` : appeler `creative-flow` avec `step: "generate"`, `contentType: "stories"`, des params réalistes. Vérifier que le JSON renvoyé matche celui de stories-ai (mêmes clés, même structure). Vérifier 2-3 cas : objectif "vente" + price_range, objectif "connexion" sans price, séquence "5min".

#### Étape D — Bascule front + suppression `stories-ai`

Dans `use-content-generator.ts` `case "story"` :
- Remplacer l'appel `invokeWithTimeout("stories-ai", ...)` par un appel `invokeWithTimeout("creative-flow", { step: "generate", contentType: "stories", context: ..., objective, price_range, time_available, face_cam, ... })`
- Le parsing du résultat (`data.content` → JSON séquence stories) reste identique
- Retirer `stories-ai` de `src/lib/content-structures.ts` (`edgeFunction: "creative-flow"`)
- **Supprimer** le dossier `supabase/functions/stories-ai/` + appeler `delete_edge_functions(["stories-ai"])`

### Précautions (le « faire très attention »)

1. **Schéma de réponse identique** — `StoryResult.tsx` et `ContentPreview.tsx` ne sont PAS modifiés. Le JSON doit être pixel-parfait.
2. **Garde-fou vente préservé** — copie 1:1 depuis stories-ai (requête `stories_sequences` sur 7j).
3. **Code mort non migré** — `clarify_subject`, `suggest_subjects`, `daily` ne sont PAS migrés (aucun appelant). Ils disparaissent avec `stories-ai`.
4. **Pas de streaming** pour stories dans creative-flow — on retourne JSON en bloc comme stories-ai le faisait.
5. **`launch_context`** préservé (utilisé par les contenus liés à un lancement).
6. **Aucune touche au schéma DB** — `stories_sequences` reste tel quel.

### Tests par étape

- A : `tsc --noEmit --skipLibCheck` (pas de typage cassé)
- B : `deploy_edge_functions(["creative-flow"])` + `tsc`
- C : `curl_edge_functions` avec 3 payloads stories différents → comparer le JSON à stories-ai (même endpoint mais ancien) avec mêmes inputs
- D : test manuel sur `/creer` → générer une séquence stories complète → vérifier que `StoryResult.tsx` rend tous les champs (narrative_angle, hook_options, stickers, etc.)

### Plan B si ça tourne mal

- A casse : revert `format-briefs.ts` (1 fichier)
- B casse : revert le bloc `isStories` de creative-flow (1 fichier)
- C signale un mismatch de schéma : on corrige le prompt dans `storiesBrief()` jusqu'à parité, sans toucher au front
- D casse : revert le `case "story"` de `use-content-generator.ts` (1 fichier), `stories-ai` n'a pas encore été supprimé donc tout reflue. **`stories-ai` n'est supprimé qu'après validation manuelle.**

### Fichiers modifiés

| Fichier | Étape | Changement |
|---|---|---|
| `supabase/functions/_shared/format-briefs.ts` | A | `storiesBrief()` enrichi (+~250 l) |
| `supabase/functions/creative-flow/index.ts` | B | branche `isStories` dans `step=generate` (+~40 l) |
| `src/hooks/use-content-generator.ts` | D | `case "story"` → `creative-flow` (~10 l modifiées) |
| `src/lib/content-structures.ts` | D | `edgeFunction: "creative-flow"` (1 ligne) |
| `supabase/functions/stories-ai/` | D | **supprimé** + `delete_edge_functions` |

### Hors scope

- Phase 5b (reels-ai) — sera attaquée après stabilisation 5a
- Refactor de `stories_sequences` (table inchangée)
- Migration des types `clarify_subject` / `suggest_subjects` / `daily` (code mort)
- `CreerUnifie.tsx` (reste à 2416 l, attendra phase 6)

### Estimation et risque

- Bilan lignes : `stories-ai` supprimé (-622), `format-briefs.ts` (+250), `creative-flow` (+40), front (~-10). Net : **-340 lignes**.
- Risque : **faible-moyen** grâce au rolling 4 étapes et au fait que `stories-ai` reste vivant jusqu'à validation finale (étape D).

