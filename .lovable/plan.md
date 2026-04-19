

## Suite de l'audit carrousels mixtes : Pack P1 (UX)

Le P0 est livré (bugs critiques fixés). Voici ce que je propose comme prochaine étape.

### Pack P1 — Réduire la friction utilisateur

**5. Bouton "Répartition automatique IA" dans `StructureReviewStep`**
- Aujourd'hui : pour un carrousel mix, l'utilisateur doit assigner manuellement chaque photo à chaque slide en cliquant
- L'IA a déjà proposé une répartition dans `structure_proposal` mais on l'ignore au moment du review
- Ajouter un bouton "✨ Laisse l'IA répartir" en haut de l'étape qui pré-remplit les `photo_index` avec ce que l'IA a suggéré
- L'utilisateur peut ensuite ajuster manuellement s'il veut

**6. Warning visuel "photos non utilisées"**
- Dans le bandeau photos en haut de `StructureReviewStep`, afficher en orange : "⚠ 2 photos non utilisées dans cette structure"
- Bouton "Ajouter une slide pour" qui crée une slide `photo_full` avec la photo orpheline
- Empêche les utilisateurs de valider une structure qui ignore 3 photos sur 5 sans s'en rendre compte

**7. Aperçu plus grand + badge type cliquable dans `CarouselPhotoResult`**
- Photo de référence en `h-32` au lieu de `h-20` (passe de timbre-poste à miniature lisible)
- Badge `slide_type` (photo_full / photo_integrated / text_only) cliquable pour basculer entre les types sans tout régénérer
- Au clic : ouvre un petit menu déroulant pour choisir le type
- Permet de corriger un mauvais choix de l'IA en 2 clics

**8. Validation post-IA "structure narrative"**
- À la réception de la réponse IA dans `CreerUnifie.tsx` (mapping mix), vérifier silencieusement :
  - Slide 1 = `photo_full` ou `photo_integrated` (jamais `text_only` au début)
  - Dernière slide = `text_only` avec CTA (sinon convertir)
- Si l'IA dévie, on corrige sans bloquer l'utilisateur, juste un log console
- Garantit le sequencing voulu sans friction

### Fichiers modifiés

- `src/components/creer/StructureReviewStep.tsx` (bouton auto + warning photos non utilisées)
- `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` (preview h-32 + badge type cliquable)
- `src/pages/CreerUnifie.tsx` (validation sequencing post-IA, ~10 lignes)

### Ce qui ne change pas

- Tous les fixes P0 livrés restent en place
- Le flux global (upload → structure → génération → preview → export) reste identique
- L'utilisateur peut toujours ignorer la suggestion auto et tout faire à la main

### Risque

Faible. Aucune modification du backend ni des prompts IA. Que de l'UX qui ajoute des raccourcis sans casser le flux existant.

### Alternative si tu veux pousser plus loin

**Pack P2 — Qualité du rendu** (à faire ensuite ou à la place) :
- Aligner le PPTX natif avec le rendu HTML (gradients, charte Nowadays sur `photo_integrated`)
- Nettoyer les redondances dans `buildMixCarouselPrompt` (~150 lignes en moins)
- Recalculer les quality checks côté front au lieu de faire confiance à l'IA

Dis-moi : **P1 maintenant**, **P2 directement**, ou **autre priorité** (autre feature, autre bug).

