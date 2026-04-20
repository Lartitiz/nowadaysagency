

## Phase 5b — Fusion `reels-ai` dans `creative-flow` (rolling, ultra-prudente)

### Audit — état actuel

| Fonction | Lignes | Rôle réel |
|---|---|---|
| `reels-ai` | 591 | 3 types : `analyze_inspiration`, `hooks`, `script` |
| `creative-flow` | 1274 | A déjà une branche `isReel` qui appelle `reelBrief()` + JSON `{ format_type, duree_cible, sections[], personal_tip, accroche, pillar, objectif }` |
| Front (`use-content-generator.ts` l. 254) | — | Appelle `reels-ai` UNIQUEMENT avec `type: "script"` |
| `CreerUnifie.tsx` l. 1299-1311 | — | Consomme : `format_type, format_label, duree_cible, sections/script, caption, hashtags, cover_text, alt_text, amplification_stories` |
| `ReelResult.tsx` | — | Consomme : `format_type, duree_cible, sections, personal_tip` |

**Constats clés** :
1. `analyze_inspiration` et `hooks` ne sont appelés par AUCUN fichier front (vérifié `grep -rn "type.*hooks"` et `analyze_inspiration` dans `src/`). **Code mort**.
2. `creative-flow` produit aujourd'hui un JSON reel **incomplet** : il manque `caption`, `hashtags`, `cover_text`, `alt_text`, `amplification_stories`, `format_label`, `checklist`. Une bascule naïve perdrait ces données dans le calendrier.
3. Les params reels-spécifiques (`face_cam`, `time_available`, `selected_hook`, `pre_gen_answers`, `editorial_angle`, `content_structure`) ne sont actuellement PAS passés au prompt reel de `creative-flow`.

### Objectif

Faire en sorte que **`creative-flow` produise un JSON reel pixel-parfait** par rapport à ce qu'attendent `CreerUnifie.tsx` + `ReelResult.tsx`, **tout en intégrant les params reels-spécifiques** (hook choisi, face_cam, time_available, pre_gen_answers, etc.). Puis basculer le front et supprimer `reels-ai`.

### Stratégie en 4 étapes (rolling)

#### Étape A — Enrichir `_shared/format-briefs.ts > reelBrief()`

Étendre la signature actuelle pour accepter les params reels :
```ts
reelBrief({
  effectiveObjective, face_cam, time_available, is_launch,
  selected_hook, pre_gen_answers, subject,
  editorial_angle, content_structure, inspiration_context
})
```
- Garder tout le contenu actuel (qualité prompt déjà mature).
- Ajouter en queue les blocs verbatim de `reels-ai > buildScriptPrompt` : ancrage hook choisi, ancrage sujet, bloc `preGenBlock`, structure éditoriale imposée si fournie.
- Imposer le **JSON de sortie complet** : ajouter à l'actuel `{ format_type, duree_cible, sections[], personal_tip, accroche }` les champs manquants `format_label, caption {text, cta}, hashtags[], cover_text, alt_text, amplification_stories[], checklist[], garde_fou_alerte, editorial_angle_used`.

Aucun consommateur cassé : `creative-flow` appelle déjà `reelBrief(effectiveObjective)`. On adapte l'appel à l'étape B.

#### Étape B — Adapter `creative-flow/index.ts` branche `isReel`

Dans le bloc `step === "generate"` :
1. Lire les params reels du body (`face_cam`, `time_available`, `selected_hook`, `pre_gen_answers`, `is_launch`, `inspiration_context`, `editorial_angle`, `content_structure`).
2. Passer ces params à `reelBrief({...})` enrichi.
3. **Remplacer** le bloc JSON reel actuel (l. 517-544) par le schéma complet imposé directement dans le prompt via `reelBrief` (mêmes clés que `reels-ai`).
4. Préserver le `launch_context` injecté en système (déjà fait pour stories, à dupliquer pour reels).
5. **Pas de streaming** pour reels : ajouter `!isReel` à la condition de streaming l. 826 (le front parse le JSON en bloc, comme stories).

Élargir le Zod schema de `creative-flow` pour accepter `face_cam`, `time_available`, `selected_hook`, `pre_gen_answers`, `is_launch`, `inspiration_context`, `editorial_angle`, `content_structure` (déjà partiellement présents pour stories, on étend).

À ce stade, `creative-flow` peut générer un reel complet, mais `reels-ai` reste vivant et le front l'appelle toujours. **Aucun changement utilisateur.**

#### Étape C — Tester `creative-flow` reel en isolation

Via `supabase--curl_edge_functions` : appeler `creative-flow` avec `step: "generate"`, `contentType: "reel"`, des params réalistes. Comparer le JSON produit avec l'ancien `reels-ai` (mêmes inputs). Vérifier 3 cas :
- Reel "saves" + face_cam + 30min, sans `selected_hook` (cas par défaut depuis `CreerUnifie`)
- Reel "conversion" + 5min + `pre_gen_answers` riches
- Reel + `editorial_angle` + `content_structure` (cas angle imposé)

Critère de validation : présence de TOUTES les clés attendues par `CreerUnifie.tsx` l. 1299-1311.

#### Étape D — Bascule front + suppression `reels-ai`

Dans `use-content-generator.ts` `case "reel"` (l. 242-272) :
- Remplacer l'appel `invokeWithTimeout("reels-ai", { type: "script", ... })` par `invokeWithTimeout("creative-flow", { step: "generate", contentType: "reel", context: subject, face_cam, time_available, selected_hook, pre_gen_answers, editorial_angle, content_structure, ... })`.
- Le parsing du résultat (`data.content` → JSON reel) reste identique.
- Modifier `src/lib/content-structures.ts` l. 503 : `edgeFunction: "creative-flow"`.
- **Supprimer** le dossier `supabase/functions/reels-ai/` + appeler `delete_edge_functions(["reels-ai"])`.

### Précautions (le « pas tout faire bugger »)

1. **Schéma de réponse identique** — `ReelResult.tsx` et le mapping calendrier (`CreerUnifie.tsx` l. 1299-1311) NE SONT PAS modifiés. Tous les champs (`caption`, `hashtags`, `cover_text`, `alt_text`, `amplification_stories`) doivent être produits.
2. **Code mort non migré** — `analyze_inspiration` et `hooks` ne sont PAS migrés (aucun appelant front). Ils disparaissent avec `reels-ai`.
3. **Pas de streaming** pour reels dans `creative-flow` — on retourne le JSON en bloc (le front fait `parseAIJson(data.content)`).
4. **Modèle IA préservé** — `creative-flow` utilise déjà `getModelForRichContent` pour les contenus riches ; ajouter `"reel"` à la liste s'il n'y est pas (à vérifier dans `_shared/anthropic.ts`).
5. **`launch_context`** dupliqué pour reels (comme stories).
6. **`reels-ai` n'est supprimé qu'à l'étape D**, après validation manuelle d'une génération réelle bout-en-bout.

### Tests par étape

- A : `tsc --noEmit --skipLibCheck`
- B : `deploy_edge_functions(["creative-flow"])` + `tsc`
- C : `curl_edge_functions` avec 3 payloads reels → comparer le JSON à `reels-ai` (mêmes inputs)
- D : test manuel sur `/creer` → générer un reel complet → vérifier que `ReelResult.tsx` rend tout (sections, timing, overlay, personal_tip) ET que sauvegarde calendrier conserve `caption`, `hashtags`, `cover_text`, `amplification_stories`

### Plan B si ça tourne mal

- A casse : revert `format-briefs.ts` (1 fichier)
- B casse : revert le bloc `isReel` de `creative-flow` (1 fichier)
- C signale un mismatch : on corrige `reelBrief()` jusqu'à parité, sans toucher au front
- D casse : revert le `case "reel"` de `use-content-generator.ts` + revert `content-structures.ts` (2 fichiers). `reels-ai` n'a pas encore été supprimé donc tout reflue. **Suppression `reels-ai` UNIQUEMENT après validation manuelle.**

### Fichiers modifiés

| Fichier | Étape | Changement |
|---|---|---|
| `supabase/functions/_shared/format-briefs.ts` | A | `reelBrief()` enrichi (params + JSON complet) (+~150 l) |
| `supabase/functions/creative-flow/index.ts` | B | branche `isReel` enrichie + Zod étendu + skip streaming (+~30 l) |
| `src/hooks/use-content-generator.ts` | D | `case "reel"` → `creative-flow` (~15 l modifiées) |
| `src/lib/content-structures.ts` | D | `edgeFunction: "creative-flow"` (1 ligne) |
| `supabase/functions/reels-ai/` | D | **supprimé** + `delete_edge_functions` |

### Hors scope

- Migration des types morts `analyze_inspiration` / `hooks` (pas d'appelant)
- Refactor de `CreerUnifie.tsx` (phase 6)
- Toucher au schéma DB `calendar_posts` ou aux renderers UI

### Estimation et risque

- Bilan lignes : `reels-ai` supprimé (-591), `format-briefs.ts` (+150), `creative-flow` (+30), front (~-5). Net : **-416 lignes**.
- Risque : **moyen** — plus de champs JSON à préserver que pour stories (`caption`, `hashtags`, etc.). Mitigé par le rolling 4 étapes et le fait que `reels-ai` reste vivant jusqu'à validation finale.

