

## Audit : Carrousels mixtes (photos + texte)

### Vue d'ensemble du flux

```text
CreerStepFormat (choix mix)
  → upload photos
  → carousel-ai (type: structure_proposal) ──→ structure (slide_type, photo_index)
  → StructureReviewStep (assignation manuelle photos ↔ slides)
  → carousel-ai (type: express_full, carousel_type: "mix") ──→ JSON slides + caption
  → CarouselPhotoResult (preview édition)
  → carousel-visual (mode mix) ──→ slides_html (avec {{PHOTO_N}} → base64)
  → exportCarouselPptx (rendu natif PPTX par layout)
```

---

### 🐛 Bugs identifiés

**1. Indexation photo incohérente — risque de mauvaise photo affichée**
La convention `photo_index` est **1-based** partout (validators, prompts, structure review, export PPTX qui fait `photo_index - 1`).
**MAIS** dans `src/lib/demo-data.ts` (lignes 313-335), le carrousel démo utilise `photo_index: 0, 1, 2, 3` (0-based).
→ Conséquence : le rendu démo PPTX montre la photo 0 (qui n'existe pas → fallback `photos[0]`) à la place de la bonne. Toutes les slides photo affichent **la même image**.

**2. Fallback silencieux quand `photo_index` est manquant**
`CarouselPhotoResult.tsx:262` : si l'IA oublie le `photo_index` sur une slide `photo_full`, on tombe sur `photos[idx]` (idx = position de la slide), ce qui mappe **photo 4 → slide 4** au lieu de respecter le mapping voulu.
→ Le user voit la "bonne" preview mais le PPTX (qui fait `photo_index || 1`) affiche **photo 1 partout**. Désynchro UI/export.

**3. Slides `photo_integrated` mal détectées dans la preview**
`CarouselPhotoResult.tsx:253` n'affiche la photo que si `slide_type === photo_full || photo_integrated || (!slide_type && overlay_text !== undefined)`.
Ligne 282 : le branchement édition utilise un autre check (`photo_full || (!slide_type && overlay_text)`), donc une slide `photo_integrated` tombe dans le bloc texte pur (title + body éditables) **sans aperçu du layout**. L'utilisateur ne voit pas qu'elle est censée porter une photo intégrée.

**4. Mismatch nom de champ entre AI et export**
- Le prompt mix (carousel-ai) attend `body` pour `text_only` et `photo_integrated`.
- Le mapping côté front (`CreerUnifie.tsx:1722-1727`) fait `title: s.title || s.overlay_text` et `body: s.body || s.note`.
- Si l'IA met le contenu dans `note`, le `body` est rempli avec une note de DA technique → texte pourri visible dans le PPTX.

**5. `carousel-visual` mix peut renvoyer du HTML avec `{{PHOTO_N}}` non remplacé**
Quand l'IA inverse les `photo_index` ou en invente un > nb photos, le placeholder reste tel quel. Le code logge un warning (`carousel-visual:824`) mais **n'applique aucun fallback**. L'iframe affiche `url({{PHOTO_2}})` cassée → slide visuellement vide.

**6. Duplication d'instructions photo dans le prompt structure**
Lignes 251-253 de `carousel-ai/index.ts` : le mode photo dit "chaque slide a une photo" et le mode mix dit "tu n'es PAS obligé d'utiliser toutes les photos" → en pratique l'IA en mode mix produit régulièrement 8 slides dont 1 seule a un `photo_index` valide (les autres ont `photo_index: null` même si déclarées `photo_full`).

**7. Sequencing hardcodé non respecté**
Le prompt mix (ligne 1470) impose : "Commence TOUJOURS par photo_full, termine par text_only".
Mais `StructureReviewStep` permet à l'utilisateur de réordonner librement. Si la slide 1 finit en `text_only`, le système ne corrige rien et le résultat est moins fort visuellement.

**8. Quality check UI affiché mais pas représentatif**
`CarouselPhotoResult.tsx:392` montre `slides_with_text / slides_without_text` mais ces compteurs viennent de l'IA (souvent faux quand elle se trompe sur les types). Trompeur.

---

### ⚠️ Problèmes UX

**A. La structure review n'a pas de mode "auto" pour mix**
Pour mix, l'utilisateur DOIT cliquer sur chaque photo + chaque slide pour assigner. Aucun bouton "laisse l'IA répartir" alors que l'IA a justement déjà proposé une répartition. Friction inutile.

**B. Pas de feedback si une photo n'est utilisée nulle part**
`isPhotoAssigned` est calculé mais pas exposé visuellement comme un warning. L'utilisateur peut valider une structure qui ignore 3 photos sur 5.

**C. Édition côté preview limitée**
On peut éditer `overlay_text`, `title`, `body`. Mais on ne peut pas :
- Changer `slide_type` (passer photo_full → photo_integrated par ex)
- Changer `photo_layout`
- Changer `overlay_position` ou `overlay_style`
→ Si l'IA choisit mal, il faut tout régénérer.

**D. Aperçu visuel peu lisible**
La photo de référence est affichée en `h-20 w-auto` (preview), un timbre-poste. L'utilisateur ne voit pas le rendu. Le `VisualSlidesCarousel` (en bas) corrige ça mais n'apparaît qu'après génération visuelle (étape supplémentaire).

**E. Pas de cohérence entre modèle "directrice artistique" et résultat PPTX natif**
Le prompt parle de "design system Nowadays", le visuel HTML rendu est riche (gradients, bandeaux), mais l'export PPTX natif (`buildPhotoIntegratedSlide`) propose 5 layouts plats sans gradient. Le user voit un super preview HTML puis un PPTX décevant.

---

### 💡 Améliorations recommandées (priorisées)

**P0 — Bugs critiques**
1. **Corriger demo-data.ts** : passer les `photo_index: 0,1,2,3` en `1,2,3,4`
2. **Auto-assigner `photo_index` si manquant** : dans le mapping `CreerUnifie.tsx:1699`, calculer un index séquentiel pour les slides `photo_full`/`photo_integrated` sans `photo_index`, et logger l'erreur IA
3. **Fallback `{{PHOTO_N}}` orphelin dans carousel-visual** : remplacer par la dernière photo valide ou par un placeholder de couleur, pas laisser le markup cassé
4. **Unifier les checks de type** dans `CarouselPhotoResult.tsx` (un seul helper `isPhotoSlide(s)`) pour éviter les divergences entre preview et édition

**P1 — UX**
5. **Bouton "Répartition automatique IA"** dans `StructureReviewStep` (pré-coche les `photo_index` proposés par la structure_proposal)
6. **Warning visuel** dans le bandeau photos : "2 photos non utilisées" en orange avec bouton "ajouter une slide pour"
7. **Aperçu plus grand** des photos dans la preview édition (h-32 au lieu de h-20) + badge `slide_type` cliquable pour basculer entre les 3 types
8. **Validation post-IA** : forcer slide 1 en `photo_full` (ou hook visuel) et dernière en `text_only` (CTA), corriger silencieusement si l'IA dévie

**P2 — Qualité contenu**
9. **Réduire la duplication des règles** dans `buildMixCarouselPrompt` (les instructions sur tirets/inclusif/anti-jargon sont déjà dans `BASE_SYSTEM_RULES` injecté via `buildSystemPrompt`)
10. **Aligner le rendu PPTX natif** avec ce que le HTML mix propose : ajouter gradient overlay, couleur de fond charte sur les zones texte des `photo_integrated`
11. **Quality check côté front** : recalculer `slides_with_text`, `all_photos_used` etc. depuis les slides réelles, pas depuis le retour IA

---

### 📁 Fichiers concernés

- `src/lib/demo-data.ts` (P0 fix indexation)
- `src/pages/CreerUnifie.tsx` lignes 1688-1730 (P0 mapping)
- `supabase/functions/carousel-visual/index.ts` lignes 820-827 (P0 fallback placeholder)
- `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` (P0+P1 unification + UX preview)
- `src/components/creer/StructureReviewStep.tsx` (P1 bouton auto + warning)
- `supabase/functions/carousel-ai/index.ts` lignes 1419-1515 (P2 nettoyage prompt)
- `src/lib/export-carousel-pptx.ts` lignes 350-450 (P2 cohérence visuelle)

---

### Ce que je propose comme premier chantier

**Pack "stop the bleeding"** = P0 (1+2+3+4) — environ 5 changements ciblés, aucun risque de régression. Corrige les 4 bugs qui font qu'aujourd'hui un user peut générer un carrousel mix avec photos mal placées ou cassées.

Si tu valides, j'attaque ce pack. Sinon dis-moi quelle priorité te parle le plus (P0 only, P0+P1, full audit).
