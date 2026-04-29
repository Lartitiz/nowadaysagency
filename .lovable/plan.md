## Audit du flow "LinkedIn carousel mix à partir de photos"

J'ai parcouru le code (`CreerUnifie.tsx`, `use-content-generator.ts`, `carousel-ai/index.ts`) et inspecté les requêtes réseau de ta dernière session. Voici ce que j'ai trouvé.

### 🔴 Bug 1 — Aucun feedback visuel pendant 30-60s après les questions (cause principale du "rien ne s'affiche")

Quand tu cliques sur "Suivant" à l'étape questions en mode carousel photo/mix :

- L'écran reste **bloqué sur les questions**, sans loader, sans transition.
- Pendant ce temps, l'app appelle silencieusement `carousel-ai` (`structure_proposal`) qui prend 30-60s avec les photos.
- Ce n'est qu'à la fin que `setStep("structure_review")` s'exécute et l'écran de structure apparaît.

**Cause** : dans `handleQuestionsNext` (ligne 676-680), si `willProposeStructure` est vrai, on ne change PAS le step. L'utilisatrice voit donc son écran de questions figé sans aucun signal d'attente.

**Fix** : passer à un step intermédiaire `"structure_loading"` (ou réutiliser `step="result"` qui a déjà un loader pour `structureLoading`) avant le `await doGenerate`.

### 🟠 Bug 2 — `subject` vide envoyé à l'IA

Dans la requête réseau `deepening_questions`, `subject:""`. Idem pour `structure_proposal`. C'est parce qu'en flow photo, `ideaText` n'est pas un champ obligatoire — l'utilisatrice peut juste uploader des photos.

**Conséquences** :

- L'IA invente le sujet à partir des photos seules → questions hors-sujet possibles.
- Le brief est sauvegardé en BDD avec un sujet vide (le filtre ligne 658 bloque normalement `ideaText.trim().length > 0` mais le brief partira vide en aval).

**Fix** : 

- Soit rendre le champ "Sujet" obligatoire pour le flow photo/mix.
- Soit injecter `photo_description` comme sujet par défaut quand `ideaText` est vide.
- Soit fallback "Carrousel basé sur ces photos" pour ne pas envoyer une string vide.

### 🟡 Bug 3 — Channel codé "instagram" au lieu de "linkedin"

Dans `generateQuestions` (`use-content-generator.ts` ligne 479), le `channel` envoyé à `carousel-ai` est `params.channel || "instagram"`. Or `handleFormatNext` ne passe le channel `"linkedin"` que si `isLinkedInCarousel` — mais cette logique est appliquée dans `handleFormatNext` (ligne 642), donc OK… **sauf** que le prompt de l'edge function utilise probablement ce `channel` pour adapter le ton (ex: hashtags, ouverture).

À vérifier : que `carousel-ai` exploite bien `channel:"linkedin"` pour adapter ton/format. Dans le replay réseau actuel : `"channel":"instagram"` est envoyé, donc le routing LinkedIn n'est pas appliqué.

**Cause** : la condition `isLinkedInCarousel` dans `handleFormatNext` (ligne 642) dépend de l'état React (`selectedFormat`) qui vient juste d'être `setSelectedFormat(format)` quelques lignes plus haut — l'état n'est pas encore commit lors du `await generateQuestions`. C'est un classique de stale state.

**Fix** : calculer `isLinkedInCarousel` depuis le `format` argument et `sub`/`carouselSubMode` localement, pas depuis le state.

### 🟢 Bug 4 — Prompt structure_proposal sans `editorial_angle`

Dans la requête `structure_proposal`, `editorialAngle` n'apparaît pas dans le body (alors qu'il est passé en argument à `doGenerate`). À vérifier ligne 882-892, c'est bien envoyé (`editorial_angle: editorialAngle || undefined`), mais dans la requête observée il n'est même pas dans le payload — donc `editorialAngle` était `null` au moment du clic. Pas un bug technique mais pourrait expliquer pourquoi la structure proposée est générique.

---

## Plan de correction (ordre de priorité)

1. **Fix UX critique** : ajouter un step `"structure_loading"` (ou écran loader explicite) entre questions et structure_review pour les carrousels photo/mix. C'est ce qui te bloque visuellement.
2. **Fix subject vide** :
  - Si pas de sujet entré + photos uploadées : utiliser `photo_description` comme subject, ou afficher un message "Donne un sujet ou une description courte" en pré-questions.
  - Côté `carousel-ai`, refuser un subject vide ET sans photo_description (retour 400 explicite).
3. **Fix channel stale state** : refactorer `handleFormatNext` pour calculer `isLinkedInCarousel` à partir des arguments (`format`, `sub`) plutôt que du state React.
4. **Vérifier `editorial_angle**` : tracer pourquoi il est `null` dans le payload (probablement parce que tu n'as pas choisi d'angle éditorial dans le wizard, c'est OK, mais à confirmer).

### Fichiers concernés

- `src/pages/CreerUnifie.tsx` (handleQuestionsNext, handleSkipQuestions, handleFormatNext, doGenerate)
- `src/hooks/use-content-generator.ts` (generateQuestions — fallback channel)
- `supabase/functions/carousel-ai/index.ts` (validation subject + photo_description)
- (optionnel) `src/components/creer/CreerStepQuestions.tsx` pour rendre le sujet obligatoire en mode photo

### Question avant d'implémenter

Est-ce que tu veux qu'on rende le **sujet obligatoire** en mode photo/mix, ou plutôt qu'on accepte de partir des photos seules + description ? Les deux sont défendables : sujet obligatoire = meilleur résultat IA mais friction ; photos seules = friction zéro mais résultats parfois flous. non pas de sujet obligatoire

&nbsp;