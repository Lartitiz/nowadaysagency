## Audit visuel — Carrousels mixtes

J'ai inspecté les 3 maillons du rendu : structure proposée (`carousel-ai/index.ts buildMixCarouselPrompt`), HTML rendu (`carousel-visual/index.ts` branche `isMixCarousel`) et l'éditeur front (`CarouselPhotoResult.tsx`). Voici les **6 problèmes visuels concrets** trouvés, classés par impact, puis le plan correctif.

## Problèmes identifiés

### P1 — Les schémas visuels (visual_schema) ne sont PAS définis pour le mixte (impact #1)

Dans `carousel-visual/index.ts`, le bloc complet "═══ SCHÉMAS VISUELS — TEMPLATES HTML/CSS ═══" (lignes 333-421) qui définit les templates BEFORE_AFTER, TIMELINE, STATS, CHECKLIST, MATRIX_2X2, PYRAMID, EQUATION, FLOWCHART, SCALE, ICON_GRID est **uniquement présent dans la branche du carrousel texte pur**. Le prompt `isMixCarousel` (lignes 583-685) ne contient ni les templates, ni `visualBlock`, ni `schemaInstructions`.

→ Conséquence : quand une slide texte du mixte a `visual_schema: { type: "before_after", ... }`, le LLM doit l'inventer → rendu pauvre, layout incohérent, parfois ignoré et remplacé par un mur de texte. C'est exactement le sentiment de "schémas plats" sur les slides texte du mixte.

### P2 — Pas de directive de qualité photo (lisibilité, contraste, focal area)

Le prompt mixte donne 3 styles d'overlay (sensoriel/narratif/minimal) mais ne contient **aucune règle adaptative** :
- pas de détection de zone claire/sombre de la photo pour choisir la position de l'overlay,
- pas de fallback si la photo n'a pas la luminosité attendue (ex: forcer un bandeau si gradient illisible),
- pas de règle sur la "safe zone" Instagram (les 80px du haut et du bas masqués par l'UI),
- pas de règle d'éviter de poser l'overlay sur un visage/sujet principal (alors que c'est mentionné en demi-teinte dans le prompt mais sans procédure).

→ Conséquence : overlays parfois illisibles, ou collés sur le visage du sujet.

### P3 — Layouts `photo_integrated` peu différenciés visuellement

Les 5 layouts proposés (top_photo / left_photo / right_photo / card_photo / banner_photo) sont décrits en 1 phrase chacun, sans :
- ratio précis (top_photo dit "55-60%", banner_photo dit "400px" → ratios incohérents),
- gestion du rythme (rien n'oblige à varier les layouts ; le LLM peut faire 4 `top_photo` à la suite),
- éléments de design qui les distinguent (pas d'instruction sur les éléments décoratifs spécifiques à chaque layout : barre latérale colorée pour left_photo, badge numéro pour card_photo, etc.).

→ Conséquence : les slides photo_integrated se ressemblent, perte du "rythme visuel" promis.

### P4 — Continuité visuelle entre photo et texte non outillée

Le prompt dit "crée une continuité visuelle entre les trois types" mais ne précise rien :
- pas de règle pour reprendre une couleur dominante de la photo précédente sur la slide texte suivante,
- pas de règle pour répéter un élément graphique (badge pilule, soulignement) entre photo_integrated et text_only,
- pas de gestion du rythme (alternance, transitions).

→ Conséquence : l'œil perçoit un patchwork (slide photo très visuelle, puis slide texte très Canva, puis re-photo) au lieu d'un carrousel cohérent.

### P5 — Pas de regénération visuelle après édition

Si l'utilisatrice édite un `overlay_text` ou un `body` après la première génération visuelle, **rien ne re-déclenche `carousel-visual`**. Les `visualSlides` (HTML rendu) restent figés avec l'ancien texte. Vu côté `CarouselPhotoResult.tsx` lignes 472-514, l'édition n'a aucun effet sur le rendu.

→ Conséquence : décalage entre la slide visuelle affichée et le texte édité (l'utilisatrice corrige, le visuel ne reflète pas, elle exporte → mauvaise surprise).

### P6 — Pas de guidance "safe zones" / format Instagram

Le HTML est généré en 1080×1350, mais le prompt mixte ne mentionne pas :
- les 220px du bas (zone qui sera tronquée dans le feed et où Instagram pose l'icône carrousel),
- les 60px du haut (zone tronquée dans certains crops),
- le besoin d'avoir des éléments importants centrés verticalement.

→ Conséquence : overlays critiques parfois coupés sur mobile.

## Plan correctif

### Étape 1 — Injecter les visual_schema dans le prompt mixte (impact #1)

Refactoriser `supabase/functions/carousel-visual/index.ts` :
- Extraire le bloc "═══ SCHÉMAS VISUELS — TEMPLATES HTML/CSS ═══" (lignes 333-421) dans une **constante partagée** `VISUAL_SCHEMA_TEMPLATES_BLOCK`.
- L'injecter à la fois dans `isTextCarousel` (déjà fait) ET dans `isMixCarousel` (nouveau), juste avant la section "═══ DESIGN PAR TYPE DE SLIDE ═══".
- Construire et passer `schemaInstructions` + `visualHints` aussi dans le `finalUserPrompt` du mode mixte (actuellement seulement dans le mode texte).

### Étape 2 — Renforcer les règles photo (lisibilité, sujet, safe zone)

Dans la section `TYPE "photo_full"` du prompt mixte (lignes 607-613), ajouter :

```
RÈGLES DE LISIBILITÉ (analyse VISUELLE de chaque photo fournie) :
- Identifie la zone CLAIRE et la zone SOMBRE de la photo. Pose l'overlay sur la zone qui maximise le contraste avec ton style :
  · Texte clair (blanc) → zone sombre, ou sur gradient sombre
  · Texte foncé → zone claire, ou sur bandeau blanc
- Identifie le SUJET PRINCIPAL (visage, produit, élément central). N'écris JAMAIS dessus. Décale l'overlay vers le 1/3 opposé.
- Si la photo est globalement texturée/floue, IMPOSE un bandeau opaque (rgba 0.92) — pas de simple gradient.
- Safe zones : laisse 80px de marge en haut, 200px en bas (zone tronquée par l'UI Instagram). Aucun texte dans ces zones.
```

### Étape 3 — Différencier les layouts photo_integrated

Dans la section `TYPE "photo_integrated"` (lignes 615-623), enrichir chaque layout avec un élément distinctif :

```
· "top_photo" : photo 55%, badge pilule numéroté en haut à gauche du bloc texte, soulignement coloré sous le titre.
· "left_photo" : photo 40%, barre verticale color_accent (4px) entre photo et texte, titre en color_secondary, body avec retrait à gauche.
· "right_photo" : symétrique, barre à gauche du texte, badge "→" décoratif.
· "card_photo" : photo 50% en haut de la carte (carte ~85% largeur, blanche, ombre douce), padding intérieur 48px, accent décoratif (filet ou point) sous le titre.
· "banner_photo" : photo 380px en bandeau, titre LARGE en dessous, body en 2 colonnes.

RÈGLE DE RYTHME : sur 3 slides photo_integrated d'un même carrousel, utilise 3 layouts DIFFÉRENTS. Ne répète jamais le même layout 2 fois de suite.
```

### Étape 4 — Outiller la continuité visuelle

Ajouter une section dans le prompt mixte :

```
═══ CONTINUITÉ VISUELLE ═══
- Reprends UN élément graphique de transition entre une slide photo et la slide texte suivante (même couleur de badge, même style de soulignement, même typo de titre).
- Les slides text_only entre deux slides photo doivent utiliser un fond color_background (pas blanc pur) pour adoucir la transition.
- Le numéro de slide (badge pilule en coin) DOIT être présent sur toutes les slides — c'est l'élément qui unifie le carrousel.
```

### Étape 5 — Bouton "Mettre à jour les visuels" après édition

Dans `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` :
- Détecter quand le contenu d'une slide a été édité depuis la dernière génération visuelle (comparer `slides` vs snapshot au moment de la génération).
- Afficher un nudge discret au-dessus de `<VisualSlidesCarousel>` : *"Tu as édité des slides depuis le dernier rendu visuel. Mettre à jour ?"* avec un bouton qui rappelle `carousel-visual`.
- Exposer un callback `onRegenerateVisuals` géré dans `CreerUnifie.tsx` qui réutilise la fonction existante de génération visuelle.

### Étape 6 — Vérification

- Générer un carrousel mixte 5 photos avec un sujet narratif. Vérifier :
  - Les slides texte avec `visual_schema` rendent un vrai schéma (timeline, stats, before/after) et pas un mur de texte.
  - Sur 3 slides `photo_integrated`, au moins 3 layouts distincts.
  - Les overlays photo n'écrasent pas le sujet visible.
  - Après édition d'un body, le bouton "mettre à jour les visuels" apparaît et fonctionne.
- Tester l'export PPTX/PNG après regénération pour confirmer la propagation.

## Hors-scope

- Pas de refonte de l'export PPTX (déjà séparé).
- Pas de changement du flow upload photos.
- Pas de modification de l'IA de génération de **texte** (déjà traité dans la passe précédente sur le slop).
- Pas de modification du carrousel photo pur ni du carrousel texte pur.
