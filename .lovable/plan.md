

## Audit — Pertinence des questions de la phase /creer

### Comment ça marche aujourd'hui

```text
[Format choisi]
   │
   ▼
generateQuestions()  ──►  Edge Function (1 seul appel, 3 questions)
   │                       ├─ creative-flow (LinkedIn / Instagram / Newsletter)
   │                       └─ carousel-ai (carrousels)
   ▼
3 questions affichées une par une
   │
   ▼
onNext(answers)  ──►  generate (toutes les réponses sont envoyées d'un bloc)
```

**Ce qui est passé au prompt aujourd'hui pour générer les questions :**
- ✅ Sujet exact
- ✅ Format / canal
- ✅ Angle éditorial + structure
- ✅ Objectif (vente, engagement, visibilité, crédibilité)
- ✅ Contexte branding (ton, cible, offres)
- ❌ **Aucune mémoire des briefs précédents** (briefsCount est juste affiché dans un bandeau "tes réponses sont sauvegardées" mais jamais injecté dans le prompt)
- ❌ **Aucun chaînage entre questions** (les 3 sont générées d'un coup, sans regarder ce que l'utilisatrice répond à la Q1 avant de poser la Q2)
- ❌ **Aucun follow-up** (pourtant `creative-flow` a déjà un step `follow-up` codé… mais jamais appelé depuis `/creer`)

### Diagnostic — pourquoi certaines questions semblent peu pertinentes

| Faiblesse observée | Cause technique | Impact |
|---|---|---|
| Questions parfois trop "scolaires" / abstraites (ex : "raconter en coulisses ton process de création de valeur") | Prompt riche en règles méta mais pauvre en exemples du **domaine d'activité** | Les questions sonnent IA, pas amie experte |
| Q2 ne tient pas compte de la réponse à Q1 | Génération en **batch unique**, pas de chaînage | Manque l'effet "ah elle m'écoute vraiment" |
| Pas de mémoire entre briefs (mêmes questions reviennent sur des sujets similaires) | `briefsCount` jamais injecté, juste compté | Sentiment de répétition après 3-4 utilisations |
| Vocabulaire générique ("ton process", "ta valeur") | Le prompt connaît le branding mais ne force pas à **réutiliser le vocabulaire métier** de l'utilisatrice | Questions interchangeables d'un user à l'autre |
| Pas de "mode 1 question minimum" | Le flux force 3 questions d'un coup | Friction sur les sujets simples |

### 3 leviers d'amélioration (par ordre de ROI)

**Levier 1 — Enrichissement du prompt SANS appel supplémentaire (gratuit)**

Améliorer la qualité des 3 questions générées en un seul appel, en :
- Injectant **les 2-3 derniers briefs** de l'utilisatrice (sujet + une réponse marquante) → l'IA évite les questions déjà posées et peut faire écho ("la dernière fois tu disais X, ici c'est différent ?")
- Forçant l'IA à **citer 1 mot du vocabulaire branding** dans chaque question (nom de l'offre, terme métier, nom de la cible)
- Ajoutant des **exemples de mauvaises questions à ne PAS poser** spécifiques au domaine détecté
- Demandant à l'IA de **raisonner en silence** avant (chain-of-thought : "qu'est-ce que je sais déjà / qu'est-ce qui manque ?")

→ **Coût : 0 appel supplémentaire** (juste un prompt plus dense, +15% de tokens input)
→ **Gain : ~70% de la perception "questions pertinentes"**

**Levier 2 — Chaînage progressif (1 appel léger en plus, optionnel)**

Activer le step `follow-up` déjà codé dans `creative-flow` mais inutilisé :
- Après les 3 réponses, **1 appel court** qui pose 1-2 questions de creusage basées sur le détail le plus saillant des réponses
- Affiché en **opt-in discret** : "Veux-tu creuser un détail ? +1-2 questions ciblées" (bouton vert, pas obligatoire)
- L'utilisatrice peut skipper et générer directement

→ **Coût : 1 appel additionnel uniquement si l'utilisatrice clique** (estimation : 30% des cas)
→ **Gain : effet "elle m'a vraiment écoutée", contenu plus singulier**

**Levier 3 — Vrai chaînage Q1→Q2→Q3 (3 appels, à éviter)**

Générer les questions **une par une** en se basant sur la réponse précédente.
→ **Coût : x3 appels, +latence importante, +crédits consommés**
→ **Gain marginal vs Levier 1+2**
→ **Recommandation : NON sauf en mode "Premium deep brief"**

### Recommandation

**Faire Levier 1 + Levier 2** (et garder Levier 3 hors scope).

### Plan d'implémentation

**Périmètre : 3 fichiers**

1. **`supabase/functions/_shared/`** — nouveau helper `getRecentBriefsContext(userId, limit=3)` : récupère sujets + 1 réponse-clé des 3 derniers briefs, formatte un bloc texte court pour le prompt.

2. **`supabase/functions/creative-flow/index.ts`** + **`supabase/functions/carousel-ai/index.ts`** :
   - Accepter un nouveau body field `recent_briefs_context?: string`
   - L'injecter dans `buildDeepeningQuestionsPrompt` et le step `questions`
   - Ajouter au prompt : règle "cite 1 mot du vocabulaire branding par question", règle "évite les angles déjà couverts dans les briefs récents", bloc "exemples de questions ratées dans ce métier"

3. **`src/hooks/use-content-generator.ts`** :
   - Avant l'appel `generateQuestions`, faire un `select` léger sur `content_briefs` pour récupérer les 3 derniers (sujet + answers JSON)
   - Construire le `recent_briefs_context` côté front et le passer dans le body

4. **`src/components/creer/CreerStepQuestions.tsx`** + **`CreerUnifie.tsx`** :
   - Après les 3 réponses, afficher un encart opt-in : « ✨ Creuser un détail ? +1-2 questions ciblées · 10 sec »
   - Si clic → appel à `creative-flow` avec `step: "follow-up"` (déjà codé côté backend)
   - Les follow-up answers sont concaténées dans `answers` et passées à la génération finale

### Ce qu'on ne touche pas

- La logique de génération du contenu final
- Le nombre de questions par défaut (reste à 3)
- Le bouton "passer les questions"
- Le compteur de briefs déjà affiché
- Les autres prompts (slides, hooks, etc.)

### Estimation coût utilisateur

- Levier 1 seul : **0 appel ajouté**, ~+10% de tokens input sur l'appel `questions` (négligeable)
- Levier 2 (opt-in) : **+1 appel court** (≈ 1 crédit) uniquement si l'utilisatrice choisit de creuser

### Question avant de coder

Une seule décision à confirmer :

**Le levier 2 (follow-up opt-in) — tu le veux dans ce pack, ou on commence par le Levier 1 seul (impact massif, zéro coût) et on fait le levier 2 en pack 2 après avoir mesuré l'effet ?**

