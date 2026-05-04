## Problème

Sur les carrousels (mixte ET texte), les **titres de slides intermédiaires** (`title`, 4-7 mots) sont trop souvent génériques type "Le piège de la régularité", "L'art du détail", "Repenser sa stratégie", "Une nouvelle approche". Ils annoncent un sujet au lieu d'**entrer dans la scène/l'histoire**.

Les hooks (slide 1) sont bien cadrés avec exemples en JE et anti-listicles. Le problème se situe sur :
- les **titres des slides 2 à N-1** (text_only et photo_integrated)
- les **`title_suggestion`** générés à l'étape `structure_proposal` (qui sont ensuite réinjectés tels quels dans la génération via `confirmed_structure`)

## Diagnostic technique

Trois endroits dans `supabase/functions/carousel-ai/index.ts` définissent la règle "titre court 4-7 mots" sans contrainte anti-générique ni voix JE :

1. **Ligne 336** (`structure_proposal`) : `"Propose des titres courts (4-7 mots), percutants, en français"` — aucune règle de voix ni d'ancrage scène.
2. **Ligne 690 et 1279** (text carousel) : `"Mini-headlines (title) : 4-7 mots, percutant."` — pareil.
3. **Ligne 1614-1620** (mix carousel) : aucune règle dédiée aux titres des slides texte/intégrées du milieu.

Les titres de l'étape structure sont ensuite **réutilisés** par la génération (lignes 1124, 1381, 1516 : `"Utilise les titres proposés comme base"`), donc un titre générique à l'étape structure se propage dans le rendu final.

## Plan

### 1. Définir une règle partagée "Titres de slides"

Créer une constante `SLIDE_TITLE_RULES` (en haut de `carousel-ai/index.ts`, à côté de `PREGEN_INJECTION_RULES`) qui sera injectée dans les 3 endroits :

```text
═══ TITRES DES SLIDES (slides 2 à N-1) — CRITIQUE ═══

Les titres de slides ne sont PAS des têtes de chapitre. Ils entrent DIRECTEMENT dans la scène ou la pensée.

RÈGLES :
- Voix par défaut : JE (cohérent avec les hooks). Le TU est réservé aux 1-2 slides d'interpellation max.
- Longueur : 4-9 mots (pas de phrase qui s'étire).
- Doit pouvoir se lire seul comme un mini-hook : un fait, un détail, une bascule, une scène, une phrase entendue, un chiffre.
- Bannir absolument les titres "annonce de sujet" : "L'importance de X", "Repenser Y", "Le vrai problème", "L'art du détail", "Une nouvelle approche", "Le piège de Z", "Pourquoi c'est crucial", "Ce qui change tout".
- Bannir les titres-concepts abstraits sans ancrage ("Authenticité", "Cohérence", "Stratégie gagnante").
- Préférer : 
  · Une scène brute : "Lundi 7h, je relisais ma bio."
  · Une phrase entendue : "Une cliente m'a dit : 'tu fais peur'."
  · Un détail concret : "47 brouillons. 0 publié."
  · Une bascule en JE : "J'ai arrêté de checker à 22h."
  · Une question directe : "Pourquoi je postais sans y croire ?"
- Test : si le titre pourrait être collé sur un autre carrousel d'un autre métier sans changer un mot → INVALIDE, réécrire.
```

### 2. Injecter cette règle aux 3 endroits

- **`structureSystemPrompt`** (vers ligne 336) : remplacer la ligne unique par `SLIDE_TITLE_RULES`. Les `title_suggestion` proposés à l'étape structure seront déjà scène-first.
- **`buildExpressFullPrompt`** (vers ligne 690 et 1279) : ajouter `SLIDE_TITLE_RULES` dans le bloc règles, en remplacement de `"Mini-headlines (title) : 4-7 mots, percutant"`.
- **`buildMixCarouselPrompt`** (après le bloc "INTERDICTION CASCADE", vers ligne 1631) : ajouter `SLIDE_TITLE_RULES`. Particulièrement important pour les `photo_integrated` où le `title` accompagne la photo et tombe vite dans le générique ("L'art du détail").

### 3. Mettre à jour les placeholders JSON

Dans les exemples JSON des prompts (lignes 1691, 1701 du mix prompt notamment), remplacer `"placeholder — titre de slide"` par un placeholder plus directif :
```
"title": "placeholder — entrée scène/JE en 4-9 mots, PAS un titre-annonce"
```

### 4. Étendre la passe de correction (anti-slop)

Dans `supabase/functions/_shared/correction-pass.ts`, ajouter une règle dédiée aux titres :

> **Règle Titres** : Si un `title` de slide (≠ slide 1, ≠ dernière) commence par "L'art de", "L'importance de", "Repenser", "Pourquoi", "Le vrai", "Le piège de", "Une nouvelle", "Ce qui", ou est un mot-concept seul (1-2 mots abstraits) → réécrire en scène/JE/détail concret en respectant le sens.

Les fonctions `extractCarouselTexts` / `reinjectCarouselTexts` traitent déjà `title` (vérifier rapidement avant édition), il s'agit d'ajouter une règle dans le prompt de correction.

### 5. Pas de changement frontend

Le rendu visuel (`CarouselPhotoResult.tsx`) ne change pas : il continue d'afficher `slide.title`. Seule la qualité du contenu généré change.

## Fichiers concernés

- `supabase/functions/carousel-ai/index.ts` (constante + 3 injections + placeholders)
- `supabase/functions/_shared/correction-pass.ts` (règle Titres dans le prompt de correction)
- Redéploiement : `carousel-ai`

## Résultat attendu

- Étape "structure" : les `title_suggestion` proposés sont déjà des entrées de scène en JE, pas des têtes de chapitre.
- Génération mixte et texte : les slides 2 à N-1 portent des titres qui font avancer l'histoire (scène, détail, bascule, phrase entendue).
- Cohérence avec les hooks (déjà cadrés en JE).
- Passe de correction filtre les rares cas où le LLM retombe dans le générique.
