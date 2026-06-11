# Pourquoi les questions sont lentes — et comment accélérer

## Diagnostic (mesuré dans le code et les logs)

Les logs edge (`creative-flow`) montrent un appel récent avec :
```
model: claude-sonnet-4-5-20250929
system_length: 42 327 caractères (~10 500 tokens)
```
…pour produire **3 questions** (sortie ~600 tokens).

Quatre causes additives expliquent le temps perçu :

### 1. System prompt énorme (~10 500 tokens d'entrée)
`supabase/functions/creative-flow/index.ts:158` empile dans `COMMON_PREFIX` (utilisé tel quel pour le step `questions`) :
- `BASE_SYSTEM_RULES`
- `incarnationBlock`
- bloc "voix personnelle"
- `CORE_PRINCIPLES` + `EMBEDDED_EDUCATION` + `ANTI_SLOP` + `ETHICAL_GUARDRAILS`
- `fullContext` = profil + branding complet + voix
Puis on rajoute encore `brandingContext` + `brandVocabBlock` + bloc "sujet" + bloc "angle" + 60 lignes de règles/exemples spécifiques aux questions (lignes 275-358).

Pour générer 3 questions, on envoie au modèle **20× plus de tokens que sa réponse**. Sonnet 4.5 met ~5-10s rien que pour lire ça.

### 2. Modèle Sonnet 4.5 partout
`anthropic.ts:58` route l'action `"content"` (utilisée par le step `questions`) vers `claude-sonnet-4-5`. Sonnet est lent (~30-50 tokens/s) — surdimensionné pour une tâche de 3 questions.

### 3. Prompt caching cassé en pratique
Le `cache_control: ephemeral` est posé sur **tout** le `system` (`anthropic.ts:96-102`). Mais le system inclut le **sujet courant**, l'**angle**, l'**historique récent des briefs** → il change à chaque génération. Le cache ne hit jamais entre 2 sujets différents. Le commentaire "maximizes Anthropic prompt caching" (ligne 157) est donc trompeur : le préfixe est commun, mais il n'est pas isolé dans un bloc cacheable séparé.

### 4. Fetch séquentiel avant l'appel IA
Dans `use-content-generator.ts:454-491`, on attend `supabase.auth.getUser()` puis le SELECT des 8 derniers briefs **avant** de lancer l'appel IA. ~200-500 ms perdues à chaque fois.

### Pour le carousel
Même histoire côté `carousel-ai/index.ts` (deepening_questions, ligne 450+) : Sonnet + prompt très long. Le timeout client est fixé à 60s (90s en vision) — preuve que le flow est dimensionné pour des appels lents.

---

## Plan d'optimisation (3 leviers, indépendants, réversibles)

### Levier 1 — Modèle adapté pour les questions (gain attendu : ~3-5s)

Les questions ne demandent pas la finesse rédactionnelle de Sonnet : c'est de la formulation interrogative bornée par des règles. Router le step `questions` (et `deepening_questions` du carousel) vers un modèle plus rapide.

**Changement :**
- Dans `anthropic.ts`, ajouter une clé d'action `"questions"` → `claude-haiku-4-5` (ou Sonnet 3.5 si Haiku 4.5 indispo) — à confirmer côté catalogue Anthropic disponible sur le compte.
- Dans `creative-flow/index.ts` ligne 1416 et `carousel-ai/index.ts` (cas `deepening_questions`), remplacer `getModelForAction("content")` par `getModelForAction("questions")` **uniquement** quand `step === "questions"` ou `type === "deepening_questions"`.

**Risque qualité :** faible. Les règles strictes du prompt et le format JSON contraint limitent la dérive. À tester sur 5-10 sujets avant validation.

### Levier 2 — Système prompt allégé pour le step `questions` (gain : ~2-4s)

Beaucoup des blocs du `COMMON_PREFIX` ne servent à RIEN pour générer des questions (ex : `EMBEDDED_EDUCATION`, `ANTI_SLOP`, les règles d'écriture inclusive sur les VARIANTES de réponse, les règles anti-fabrication, etc. — ces règles s'appliquent au CONTENU généré, pas aux questions).

**Changement :** créer un `QUESTIONS_PREFIX` minimal :
- `BASE_SYSTEM_RULES` (ton/voix)
- `incarnationBlock`
- `fullContext` (profil + branding) — utile pour personnaliser les questions

Et SUPPRIMER du prompt questions : `CORE_PRINCIPLES`, `EMBEDDED_EDUCATION`, `ANTI_SLOP`, `ETHICAL_GUARDRAILS`, bloc voix personnelle (ces 4 blocs concernent la rédaction de contenu, pas la formulation de questions).

Objectif : passer d'~10 500 tokens à ~3 000-4 000 tokens d'input.

**Risque qualité :** faible si on garde branding + voix. À valider sur 5 sujets : les questions doivent rester ancrées dans le métier.

### Levier 3 — Préfetch parallèle (gain : ~200-500 ms)

Dans `use-content-generator.ts` :
- Lancer `supabase.auth.getUser()` une seule fois en amont du hook (déjà dispo via `useAuth` context probablement).
- Lancer le SELECT briefs **en parallèle** d'autres préparations (pas avant `await`).

Très petit gain, mais gratuit.

---

## Total attendu

| Aujourd'hui | Après L1 | Après L1+L2 | Après L1+L2+L3 |
|---|---|---|---|
| ~8-15 s | ~5-10 s | ~2-5 s | ~2-4 s |

## Recommandation

Implémenter **L1 + L2 ensemble** (même fichier, même test). L3 en bonus si on veut être minutieux. Garder Sonnet comme fallback configurable via une variable pour pouvoir revenir en arrière en 30 s si la qualité régresse.

## Hors-scope (à ne PAS toucher)

- Les prompts de génération de **contenu** (carousel, post, reels, newsletter) : on n'y touche pas, c'est là que Sonnet sert vraiment.
- Le 2-pass carousel et le heartbeat SSE récemment ajoutés : intacts.
- Les modèles pour vision, scoring, branding : intacts.

Dis-moi si tu valides ce plan (notamment les leviers L1 et L2), ou si tu préfères qu'on commence par juste **L2** (alléger le prompt sans changer de modèle) — c'est l'option la plus safe côté qualité.
