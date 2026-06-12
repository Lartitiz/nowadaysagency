# Plan — Transporter le récit entre les deux pass carrousel

Plan validé tel que fourni. Périmètre strict : 1 fichier backend + 3 fichiers frontend. Aucun changement d'UI, aucune réintroduction des photos dans le pass d'écriture.

## Fichiers impactés

**Backend**
- `supabase/functions/carousel-ai/index.ts`
  - Schéma Zod racine
  - Prompt du handler `type === "structure_proposal"` (+ max_tokens 2048 → 3000)
  - `confirmedStructureBlock` dans `buildPhotoCarouselPrompt` (ligne ~1523)
  - `confirmedStructureBlock` dans `buildMixCarouselPrompt` (ligne ~1698)
  - PAS de modification de `buildMixCarouselNewsReactionPrompt` ni `buildExpressFullPrompt`

**Frontend**
- `src/components/creer/StructureReviewStep.tsx` — interfaces uniquement
- `src/pages/CreerUnifie.tsx` — capture + transport
- `src/hooks/use-content-generator.ts` — types + payload

## Comportement

### 1. Sortie enrichie de `structure_proposal`
Nouveau JSON demandé au modèle :
- Racine : `narrative_thread` (2-3 phrases : situation → tension → bascule → résolution → ouverture)
- Par slide : `story_beat` (1 phrase, intention narrative — ce que la slide RACONTE, jamais une description photo)
- Par slide photo uniquement : `visual_anchor` (3-8 mots, un détail concret mobilisable)

Consigne ajoutée au prompt : story_beat = ce que la slide raconte ; visual_anchor = un détail, pas une description ; les deux servent le narrative_thread.

`max_tokens` du handler structure_proposal : 2048 → 3000.

### 2. Frontend transport
- `StructureReviewStep` : ajout des champs optionnels à `SlideProposal` (`story_beat?`, `visual_anchor?`) et `StructureProposal` (`narrative_thread?`). Spreads existants des handlers (réordo/suppression/rename) les préservent. Aucune UI ajoutée.
- `CreerUnifie` : dans `handleConfirmStructure`, capturer `structureProposal?.narrative_thread` AVANT le reset, le stocker dans un nouveau state `lastNarrativeThread`, le passer à `generate()` via param `narrativeThread`. Idem dans le chemin régénération qui réutilise `lastConfirmedStructure`.
- `use-content-generator` : ajouter `story_beat`/`visual_anchor` aux types de `confirmedStructure`, ajouter `narrativeThread?: string` aux params, envoyer dans le body sous `narrative_thread` UNIQUEMENT pour `format === "carousel"`.

### 3. Schéma Zod + injection prompts d'écriture
- Zod : `story_beat: z.string().max(300).optional()` et `visual_anchor: z.string().max(120).optional()` dans les objets `confirmed_structure` ; `narrative_thread: z.string().max(1000).optional().nullable()` à la racine.
- `confirmedStructureBlock` (photo + mix) :
  - Si `narrative_thread` présent, ouvre par : « RÉCIT À EXÉCUTER (décidé en voyant les photos) : {narrative_thread}. Chaque slide écrit UNE étape de ce récit. Tu n'inventes pas une autre histoire, tu exécutes celle-ci. »
  - Par slide : enrichir la ligne avec « Raconte : {story_beat} » et « Détail mobilisable : {visual_anchor} » quand présents.
  - Garde-fou ajouté : « INTERDIT de décrire la photo. L'overlay écrit l'étape du récit définie par le story_beat ; le visual_anchor est une matière optionnelle (un détail à glisser dans la phrase si naturel), JAMAIS un contenu à réciter. »

## Ne bouge pas
- Optimisation latence : pas de réinjection des photos quand `confirmed_structure` est présent.
- Blocs CHAÎNAGE NARRATIF et INTERDICTION CASCADE conservés (story_beat s'ajoute).
- Champs existants intacts, tout nouveau champ optionnel (rétrocompat).
- UI `StructureReviewStep`, mode `pure_photo`, news_reaction, express_full, quota, workspace, routage, correction pass, fallback structure_proposal.

## Validation
1. `npx tsc --noEmit --skipLibCheck` clean.
2. Carrousel photo 2-3 photos : réponse réseau contient `narrative_thread` + `story_beat` par slide ; overlays exécutent l'histoire validée ; aucun overlay ne décrit la photo.
3. Carrousel mix : idem + slides texte suivent le récit.
4. Régénération sur structure ancienne (sans nouveaux champs) : pas d'erreur.

## Propositions (optionnel, à valider séparément)
Aucune proposition hors périmètre identifiée à ce stade — le plan tel que rédigé est cohérent et autosuffisant. Je signalerai en exec si un ancrage plus sûr apparaît pendant l'écriture.

## Hors scope
Affichage UI du récit, harmonisation newsjacking mix, adaptation LinkedIn photo (Plan 4), story_beat pour carrousels texte.
