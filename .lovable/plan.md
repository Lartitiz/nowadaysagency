## Audit : profondeur des questions d'approfondissement — Mixte vs Texte

Aucune modif de code dans ce plan : c'est un audit de la **logique actuelle** et un **plan d'alignement** à valider.

## Où sont définies les questions

Deux chemins distincts dans `supabase/functions/carousel-ai/index.ts`, branche `type === "deepening_questions"` :

1. **Branche photo/mix AVEC photos uploadées** (lignes 427-511) → prompt **inline vision** (envoie les photos à Claude).
2. **Branche texte (et photo/mix sans photos)** (lignes 513-518) → fonction `buildDeepeningQuestionsPrompt` (lignes 1044-1118).

Résultat : un carrousel mixte avec photos passe par un prompt **complètement différent** de celui d'un carrousel texte. C'est là que naît le déséquilibre.

## Comparatif structurel

| Dimension | Carrousel TEXTE (`buildDeepeningQuestionsPrompt`) | Carrousel MIXTE avec photos (prompt inline) |
|---|---|---|
| Ancrage sujet | Bloc "SUJET COURANT — PRIORITÉ ABSOLUE" très fort + règle "ANCRAGE SUJET non négociable" | Sujet présenté comme "ce qu'elle a en tête" parmi d'autres matières |
| Branding context | Injecté (`brandingBlock`) avec instruction "mentionne son domaine, sa cible, ses offres" | **Absent** du prompt inline |
| Vocabulaire métier | `brandVocabBlock` injecté | **Absent** |
| Mémoire anti-répétition | `recentBriefsContext` injecté + règle dédiée | **Absent** |
| Angle éditorial | `angleBlock` injecté si présent | **Absent** |
| Raisonnement interne pré-questions | Bloc "AVANT DE POSER — RAISONNEMENT INTERNE" en 3 étapes | **Absent** |
| Profondeur exigée | "AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND" + "vécu, anecdotes, opinions tranchées, exemples concrets" | "extraire le contexte INVISIBLE : pourquoi ce moment, quelle émotion, quel hors-champ" — plus mou, plus descriptif |
| Format LinkedIn | Instructions pro spécifiques (données, leçons métier, expertise) | Mention courte ("ton PRO, apprentissage business") |
| Anti-générique | Règle ferme "interchangeable d'un user à l'autre = invalide" | Règle équivalente présente |
| Spécificité mixte | N/A | Demande "quels passages textuels viennent s'intercaler" — bien |
| Pont texte/photo | N/A | Bien traité (2/3 questions doivent croiser) |

## Diagnostic

**Le mixte avec photos perd 5 leviers de profondeur** que le texte a :

1. **Pas de branding/vocabulaire métier injecté** → questions moins ancrées dans son activité, plus génériques côté business.
2. **Pas de mémoire anti-répétition** → risque de reposer une question déjà traitée sur un autre brief récent.
3. **Pas d'angle éditorial** → si l'utilisatrice a choisi un angle, les questions du mixte l'ignorent.
4. **Pas de raisonnement interne pré-questions** (les 3 étapes silencieuses du texte) → la qualité d'extraction est moins systématique.
5. **Profondeur formulée mollement** : "extraire le contexte invisible" vs la règle texte "creuser le POURQUOI PROFOND + vécu/opinions tranchées/exemples concrets".

À l'inverse, le mixte gagne 1 levier : **le pont texte/photo** (croiser sujet écrit + élément visuel précis), ce qui est unique et bon.

**Conséquence concrète** : sur un mixte, les questions tendent à être **descriptives sur les photos** ("c'était dans quel contexte ?", "quelle émotion ?") plutôt qu'**extractives sur le vécu/l'opinion/l'expertise** comme le texte.

## Plan d'alignement (à valider)

Garder les **deux prompts séparés** (le mixte a besoin de la vision et du pont texte/photo), mais **transférer les 5 leviers manquants** dans le prompt inline mixte.

### 1. Injecter `brandingContext` et `brandVocabBlock` dans le prompt mixte
Les deux variables sont déjà calculées en amont (lignes ~96-104, à vérifier). Les passer au bloc `messageContent` du mixte avec la même instruction que le texte : "mentionne son domaine d'activité, sa cible, ses offres ou son positionnement quand c'est pertinent".

### 2. Injecter `recentBriefsContext` (mémoire anti-répétition)
Ajouter le bloc + la règle "n'importe JAMAIS leur contenu, vocabulaire ou scènes dans tes questions".

### 3. Injecter l'angle éditorial s'il est présent
Reprendre le `angleBlock` du texte : "ANGLE ÉDITORIAL : X — Les questions doivent aider l'utilisatrice à remplir les étapes de cette structure avec son vécu personnel."

### 4. Ajouter le bloc "RAISONNEMENT INTERNE" pré-questions
Adapter les 3 étapes au contexte mixte :
1. Quel est le SUJET COURANT ? (re-extraire 1 mot-clé)
2. Quel vocabulaire métier puis-je intégrer ?
3. Quels DÉTAILS VISUELS PRÉCIS sur les photos puis-je nommer (pas "l'ambiance", mais le geste, l'objet, la couleur exacte) ?
4. Y a-t-il un sujet identique dans l'historique récent ? Quelle question NE PAS reposer ?

### 5. Renforcer la règle de profondeur
Remplacer "extraire le contexte invisible" par la formulation forte du texte :
> "AU MOINS 1 question sur 3 doit creuser le POURQUOI PROFOND (vécu, conviction, opinion tranchée). Pas seulement décrire ce que les photos montrent ou évoquer une émotion floue."

Et ajouter explicitement l'objectif d'extraction du **vécu / des anecdotes / des opinions tranchées / des exemples concrets** — pas juste du sensoriel.

### 6. Mutualiser ce qui peut l'être
Extraire les blocs partagés (raisonnement interne, règle profondeur, anti-générique, branding/vocab/historique) dans une constante locale au fichier (ex: `SHARED_DEEPENING_RULES`) injectée dans les deux prompts. Évite que les deux re-divergent à chaque future modif.

## Fichiers concernés
- `supabase/functions/carousel-ai/index.ts` (uniquement la branche `deepening_questions` lignes 425-520, et éventuellement extraction d'une constante partagée)
- Aucun changement frontend, aucun changement DB

## Résultat attendu
- Sur un mixte, les questions deviennent aussi **profondes et ancrées-business** que sur un texte (branding, vocabulaire, mémoire, angle, POURQUOI profond).
- Le pont texte/photo et l'analyse vision restent l'avantage unique du mixte.
- Une seule source de vérité pour les règles partagées → moins de drift à l'avenir.
