## Bug : "erreur de format" lors de la génération depuis une idée actualité

### Diagnostic

**Le bug ne vient pas de la sauvegarde**, il vient de la **taille du payload** envoyé à la génération quand un contexte d'actualité est en jeu.

#### Chaîne actuelle (newsjacking → questions → génération)

1. L'utilisateur sélectionne un angle d'actualité dans `NewsjackingPanel`.
2. `handleNewsjackingSelect` (CreerUnifie:484) stocke le bloc actu complet dans le state `newsjackingContext` (titre + source + résumé + pertinence + véhicule + hook + description + format suggéré).
3. L'utilisateur passe l'étape format → questions (le `newsjackingContext` n'est PAS injecté ici, donc les questions ne sont pas teintées par l'actu — sous-bug séparé).
4. L'utilisateur répond → `doGenerate` (CreerUnifie:761) construit `enrichedSubject` :
   ```
   <ideaText>
   --- CONTEXTE ACTUALITÉ ---
   <bloc actu complet>
   --- FIN CONTEXTE ACTUALITÉ ---
   IMPORTANT : Ce contenu est un newsjacking. Le HOOK / ACCROCHE (slide 1...) DOIT partir de l'actualité elle-même... [≈640 chars d'instruction]
   ```
5. Ce `enrichedSubject` est envoyé tel quel comme `context` à l'edge function de génération.

#### Ce qui casse

| Edge function | Champ | Cap Zod | Risque |
|---|---|---|---|
| `creative-flow` (post / linkedin / newsletter / pinterest) | `context` | **8000 chars** | **BLOQUANT** — facile à dépasser car le bloc actu (titre + 2 phrases résumé + pertinence + véhicule + hook + description + format suggéré + 640 chars d'instruction) peut peser 1500-2500 chars, et le `ideaText` déjà long (= `angle.hook` ou `actu.titre`). Avec un sujet/contenu existant ajouté, on dépasse. |
| `carousel-ai` `express_full` | `subject` | 15000 chars | Marge plus large mais dépassable sur actu très détaillée + contenu calendrier existant. |

`creative-flow/index.ts:39` : `context: z.string().max(8000).optional().nullable()` → quand on dépasse, `validateInput` lève une `ValidationError` :
```
"Données invalides: context: String must contain at most 8000 character(s)"
```
Cette erreur remonte dans le toast comme "erreur de format" (« Données invalides: ... »).

#### Pourquoi ce n'est pas attrapé pour le calendrier

Pour le contenu calendrier existant, il existe déjà un mécanisme de split (CALENDAR_MARKER + truncation à 7800 chars dans `use-content-generator.ts:527-541`) — mais **uniquement pour l'étape questions**, et **uniquement pour le bloc calendrier**, **pas pour le bloc actualité**. L'étape `generate` passe `subject` raw (line 693).

#### Sous-bugs détectés au passage

1. **`handleCreateFromActu`** (IdeaDetailSheet:175-184) passe `context` dans `navigate state`, mais CreerUnifie **ne lit jamais `locState.context`**. → l'utilisateur·ice qui clique "Créer depuis cette actu" depuis la fiche idée perd tout le contexte newsjacking : le contenu généré ne sera pas un newsjacking du tout.
2. **Les questions d'approfondissement** ne reçoivent pas le `newsjackingContext` → questions hors-sujet sur un brief actu (perte de qualité, pas un crash).

### Plan de correction

#### Fix #1 (PRIORITAIRE — résout l'erreur format) : externaliser le contexte actu

Plutôt que de stuffer le bloc actu dans `subject`/`context`, le faire voyager dans un champ dédié `launch_context` ou un nouveau champ `news_context` qui a son propre cap Zod.

- **Frontend** : dans `doGenerate` (`CreerUnifie.tsx:756-762`), arrêter d'injecter le bloc dans `enrichedSubject`. À la place, passer un nouveau paramètre `newsContext` à `generateStream` / `generate`.
- **`use-content-generator.ts`** : étendre `GenerateStreamParams` et `GenerateOnceParams` pour accepter `newsContext?: string`. Le passer à `creative-flow` et `carousel-ai` sous une clé dédiée (ex: `news_context`).
- **Edge functions** :
  - `creative-flow/index.ts` schema : ajouter `news_context: z.string().max(4000).optional().nullable()` (cap large mais borné).
  - `carousel-ai/index.ts` schema : pareil.
  - Côté prompt : injecter le `news_context` comme bloc séparé (avec l'instruction "le hook DOIT partir de l'actualité…") au lieu de le faire en suffixe du subject.
- **Truncation défensive frontend** : si `newsjackingContext` dépasse 3500 chars, le tronquer (peu probable vu la structure mais ceinture+bretelles).

#### Fix #2 : injecter `newsjackingContext` aussi à l'étape questions

Pour que les questions soient ancrées dans l'actu (sinon : génériques) :
- `generateQuestions` reçoit `newsContext` optionnel.
- Côté edge `carousel-ai` `deepening_questions` et `creative-flow` `questions` : si `news_context` présent, l'ajouter au bloc de prompt avec instruction "tes 3 questions doivent aider à faire le pont entre cette actualité et le vécu / l'opinion / l'expertise de l'utilisateur·ice".

#### Fix #3 : réparer `handleCreateFromActu` (IdeaDetailSheet)

Aujourd'hui, l'entrée "Créer depuis cette actu" depuis Mes Idées passe `state.context` mais CreerUnifie l'ignore.

Deux options :
- (a) Ajouter dans CreerUnifie l'init `if (locState.context && locState.subject) setNewsjackingContext(locState.context)` dans le `useEffect` de prefill (vers ligne 380).
- (b) Plus propre : passer aussi `state.fromNewsjacking: true` + `state.actuPayload` et reconstruire le contexte côté CreerUnifie.

Option (a) est plus simple et suffit.

#### Fix #4 : robustesse côté error handling

Quand `validateInput` échoue, le toast affiche "Données invalides: …". C'est cryptique pour l'utilisateur·ice. Côté edge functions, retourner un `error.code = "payload_too_large"` quand un champ texte dépasse, et côté frontend afficher un message clair "Le contexte est trop long pour cette actualité, on le tronque automatiquement et on relance" + retry auto avec troncature.

(Optionnel — le Fix #1 supprime la cause racine.)

### Fichiers concernés

- `src/pages/CreerUnifie.tsx` (doGenerate ligne 756, useEffect prefill ligne 370)
- `src/hooks/use-content-generator.ts` (GenerateStreamParams, GenerateOnceParams, GenerateQuestionsParams)
- `src/components/calendar/IdeaDetailSheet.tsx` (handleCreateFromActu)
- `supabase/functions/creative-flow/index.ts` (schema + prompt builder)
- `supabase/functions/carousel-ai/index.ts` (schema + prompt builders : `express_full`, `deepening_questions`)

### Résultat attendu

- Plus de "Données invalides: context: String must contain at most 8000 character(s)" sur les briefs actu.
- Les questions d'approfondissement deviennent ancrées dans l'actualité (qualité).
- L'entrée "Créer depuis cette actu sauvegardée" depuis Mes Idées fonctionne enfin comme un newsjacking complet.
