

## Audit — état actuel

### Cartographie des edge functions de création

| Fonction | Lignes | Steps/types gérés | Appelée depuis |
|---|---|---|---|
| **creative-flow** | **1897** ⚠️ | `angles`, `questions`, `follow-up`, `generate`, `adjust`, `recycle`, `dictation` + branche vision | post Insta, LinkedIn, recyclage, dictée, ajustement |
| **carousel-ai** | **1654** ⚠️ | `suggest_topics`, `suggest_angles`, `deepening_questions`, `structure_proposal`, `express_full`, `slides`, `hooks` + branche vision photo/mix | carrousel Insta + LinkedIn |
| **reels-ai** | 623 | `analyze_inspiration`, `hooks`, `script` | reel Insta |
| **stories-ai** | 646 | `clarify_subject`, `suggest_subjects`, `sequence`, `daily` | stories Insta |
| **newsletter-ai** | 247 | (1 seul mode : génération) | newsletter |
| **linkedin-ai** | 258 | 13 actions (titre, résumé, expérience, recos, crosspost…) — **pas la génération de post** (passe par creative-flow) | pages profil LinkedIn |
| **generate-content** | 758 | bio, idées, audit, playground… | bio Insta, dashboard |

### Les 3 vrais problèmes

**1. `creative-flow` est devenu un god-object (1897 lignes)**
- 7 steps (`angles`, `questions`, `follow-up`, `generate`, `adjust`, `recycle`, `dictation`) dans un seul `if/else if` géant
- Un switch parallèle interne sur `contentType` (Insta/LinkedIn/Newsletter/Reel/Story) à 2 endroits (questions + generate)
- La branche vision (lignes 1755-1862) est dupliquée pour `questions` et `generate`
- Difficile de modifier un format sans risquer de casser les autres

**2. `carousel-ai` (1654 lignes) duplique presque tout `creative-flow`**
- Même quotas, même rate limit, même contexte utilisateur
- Mêmes étapes conceptuelles (questions → angle → génération) mais nommées différemment (`deepening_questions`, `suggest_angles`, `express_full`)
- Branche vision dupliquée
- Justification historique : carrousel = sortie multi-slides JSON. Mais les **80% de logique de prompt sont identiques**.

**3. Le front a 4 manières d'appeler la génération**
- `useContentGenerator.generate()` → switch sur format (carousel→carousel-ai, reel→reels-ai, story→stories-ai, post→creative-flow, linkedin→creative-flow, newsletter→newsletter-ai)
- `useContentGenerator.generateQuestions()` → idem mais carousel→carousel-ai vs autres→creative-flow
- `CreerUnifie.tsx` ligne 754 → streaming direct vers `creative-flow`
- `ContentRecycling`, `CreerStepEdit`, `ChatGuidePage` → invokes éparpillés vers `creative-flow` ou `carousel-ai`

→ Pour ajouter un format ou changer un comportement transversal, il faut toucher 3-5 endroits.

## Plan de refactoring — sans perte de qualité

**Principe directeur** : on garde tous les prompts existants (qualité de sortie identique), on réorganise uniquement la **structure** du code. Refactoring conservateur, par étapes, validable individuellement.

### Étape 1 — Découper `creative-flow` en modules (impact zéro côté front)

Créer `supabase/functions/creative-flow/` :
```text
creative-flow/
├── index.ts              ← router + auth + quotas (≈200 lignes)
├── steps/
│   ├── angles.ts         ← step "angles"
│   ├── questions.ts      ← step "questions" + branche vision
│   ├── follow-up.ts
│   ├── generate.ts       ← step "generate" + streaming + vision
│   ├── adjust.ts
│   ├── recycle.ts
│   └── dictation.ts
└── prompts/
    ├── format-briefs.ts  ← le switch ctype (linkedin/reel/story/newsletter)
    └── vision.ts         ← prompts vision factorisés (questions + generate)
```
Côté Deno, on importe les sous-fichiers via chemin relatif. Aucun changement front, aucun changement de contrat API. **Gain : 1897 lignes → 7 fichiers de 100-300 lignes lisibles.**

### Étape 2 — Découper `carousel-ai` symétriquement

```text
carousel-ai/
├── index.ts              ← router (≈150 lignes)
├── types/
│   ├── deepening.ts      ← deepening_questions + vision
│   ├── express-full.ts   ← génération complète JSON slides
│   ├── slides.ts
│   ├── hooks.ts
│   ├── suggest-topics.ts
│   ├── suggest-angles.ts
│   └── structure-proposal.ts
└── prompts/
    └── carousel-rules.ts
```
**Gain : 1654 lignes → 8 fichiers focalisés.**

### Étape 3 — Mutualiser ce qui est dupliqué dans `_shared/`

Ajouter dans `supabase/functions/_shared/` :
- `request-pipeline.ts` → wrapper qui fait : auth → demo guard → rate limit → quota → contexte → renvoie `{ user, ctx, body }`. Élimine ~50 lignes répétées au début de chaque fonction.
- `vision-prompts.ts` → factorise les prompts vision (utilisés par creative-flow ET carousel-ai)
- `format-briefs.ts` → le switch sur `ctype` (linkedin/reel/story/newsletter) sort des steps et devient une fonction pure réutilisable

### Étape 4 — Centraliser le routing front dans `useContentGenerator`

Aujourd'hui éparpillé entre `CreerUnifie.tsx` (streaming), `useContentGenerator.generate()` (non-stream), `ContentRecycling`, `CreerStepEdit`. Créer une seule API :
```ts
useContentGenerator.generate({ format, mode: "stream" | "json", ... })
```
qui gère elle-même le choix stream vs invoke et le routage vers la bonne edge function. `CreerUnifie.tsx` ligne 754 devient un appel à ce hook, plus de `streamInvoke` direct.

**Bénéfice** : pour ajouter un format ou changer un comportement transversal (ex. nouveau header, nouvelle vision), 1 seul endroit à modifier.

### Étape 5 (optionnel, plus tard) — Unifier `reels-ai` + `stories-ai` dans `creative-flow`

Aujourd'hui ces 2 fonctions (623 + 646 = 1269 lignes) ne font que des `step="generate"` avec un format spécifique. Elles pourraient devenir des cas du switch `format-briefs.ts` dans creative-flow. **Mais on garde ça pour une 2e passe**, pour pouvoir valider en isolation.

## Ordre d'exécution recommandé

```text
Phase 1 (1 PR) : découpage creative-flow      [risque faible, 0 changement contrat]
   ↓ on déploie + on teste tous les flows
Phase 2 (1 PR) : découpage carousel-ai
   ↓ on déploie + on teste carrousel
Phase 3 (1 PR) : mutualisation _shared
   ↓ déploie les 2 fonctions ensemble
Phase 4 (1 PR) : unification front useContentGenerator
   ↓ test e2e complet
Phase 5 (plus tard) : fusion reels-ai/stories-ai si on veut
```

Chaque phase est **indépendante, déployable, réversible**. À tout moment on peut s'arrêter.

## Ce qu'on NE touche PAS

- Les **prompts** (qualité de sortie strictement identique)
- Les **schemas Zod** (contrat API inchangé)
- Les **modèles Claude** utilisés
- La **logique vision** (juste déplacée dans un fichier dédié)
- Les **autres edge functions** : `linkedin-ai`, `pinterest-ai`, `newsletter-ai`, `generate-content` (déjà raisonnables)

## Validation

1. `tsc --noEmit --skipLibCheck` → 0 erreur après chaque phase
2. Smoke tests par format après chaque phase :
   - Carrousel texte / photo / mixte
   - Post Insta + photo
   - Reel + photo
   - Stories + photo
   - LinkedIn texte + photo
   - Newsletter
   - Recyclage 1→3 formats
   - Ajustement
3. Comparer 3 sorties avant/après pour vérifier qu'aucune régression de qualité

## Hors scope

- Réécriture des prompts
- Migration vers un autre LLM
- Changement du modèle de quotas
- Refonte UI du flow Créer

