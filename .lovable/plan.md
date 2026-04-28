## Problème actuel

Le coaching d'idées (`/creer` → "Idées") génère **tout d'un coup** : sujet + hook + angle + brief + why_it_works + objective_tag pour 3 idées. Conséquences :

- Génération longue (2000 tokens, JSON lourd, beaucoup de règles à respecter)
- L'écran affiche le **hook** en gros alors que tu veux d'abord voir le **sujet/idée**
- Hook + brief sont du travail "à jeter" si l'idée n'est pas retenue → tu as déjà la rédaction qui se fait derrière

## Objectif

**Étape 1 — rapide** : générer juste 3 idées (sujet court + angle). Affichées en clair.
**Étape 2 — à la demande** : quand tu cliques sur une idée pour la rédiger, on génère le hook + brief uniquement pour celle-là (ou on laisse la rédaction `/creer` s'en occuper).

## Plan

### 1. Edge function `content-coaching` — mode "ideas only"

- Réduire le prompt : on garde les règles d'ancrage métier, la règle d'or, l'anti-TU et les catégories A-F. On retire toute la mécanique "hook irrésistible / TEST DE PROFONDEUR du hook / structures de hook / interdits hooks".
- Réduire le JSON de sortie à :
  ```
  { "ideas": [
      { "subject": "...", "angle": "...", "objective_tag": "...", "why_it_works": "..." }
    ],
    "recommended_format": "...",
    "redirect_route": "..."
  }
  ```
- Baisser `max_tokens` de 2000 → ~800.
- Garder le modèle actuel (Sonnet via `getModelForAction("coaching")`) — la baisse de tokens et de complexité du prompt fera le gros gain.

### 2. UI `ContentCoachingDialog`

- Carte d'idée affiche **le sujet en gros** (pas le hook).
- Au clic : panneau déplié montre `why_it_works` (1 ligne). Pas de hook, pas de brief.
- Bouton "Rédiger cette idée" → passe le `subject` + `objective_tag` à `/creer` exactement comme aujourd'hui. La rédaction (qui appelle `creative-flow` / `linkedin-ai` / `carousel-ai` etc.) génère déjà le hook et le contenu — donc rien à recréer côté front.
- Mettre à jour le type `ContentIdea` (champs `hook` et `brief` deviennent optionnels).

### 3. Compatibilité

- `recommended_subject` / `subject_alternatives` (ancien format) : on garde le fallback existant lignes 219-230, inchangé. Seules les clés `hook` et `brief` deviennent optionnelles dans le type — pas de migration DB, c'est un payload volatil.

## Gains attendus

- **Temps de génération** : ~40-50 % plus rapide (prompt allégé + ~60 % de tokens de sortie en moins).
- **Lisibilité** : tu vois 3 sujets clairs au lieu de 3 hooks.
- **Moins de gâchis** : le hook n'est créé qu'une fois pour l'idée que tu choisis vraiment, par le pipeline de rédaction qui le fait déjà mieux (avec ton, format, voix).

## Fichiers touchés

- `supabase/functions/content-coaching/index.ts` (prompt + JSON shape + max_tokens)
- `src/components/dashboard/ContentCoachingDialog.tsx` (affichage carte + type optionnel)