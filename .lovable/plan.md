

## Carrousels mixtes pour LinkedIn — analyse + plan

### État des lieux

Aujourd'hui, sur LinkedIn dans `CreerStepFormat.tsx` (ligne 273-290), seuls 2 choix existent :
- **Post texte** (1300-2000 caractères)
- **Carrousel PDF** (texte uniquement)

Le **mix photo+texte** et le **mode photo seul** sont réservés à Instagram (lignes 412-455). Pourtant :
- Le backend `carousel-ai/index.ts` gère déjà `carousel_type: "mix" | "photo" | "text"` indépendamment du canal
- L'export `export-carousel-pptx.ts` supporte déjà `slide_type: photo_full | photo_integrated | text_only`
- Le flag `isLinkedInCarousel` se propage déjà (ligne 879, 897, 921 de `CreerUnifie.tsx`) dans les payloads carousel-ai
- Le flux complet (upload → structure → génération → preview → export PDF/PPTX) est déjà mature côté Instagram

**Conclusion** : techniquement, on a 80% du chantier déjà fait. Il manque juste l'exposition UI + quelques ajustements de prompt pour le ton LinkedIn.

### Pourquoi c'est pertinent sur LinkedIn

Les carrousels mixtes performent fort sur LinkedIn en 2024-2025 :
- **Coulisses pro** (photos d'événement, conf, atelier + slides texte avec leçons)
- **Avant/après cliente** (photos + slides analyse)
- **Témoignages** (photo cliente + slides citations)
- **Process documenté** (photos terrain + slides méthodo)

C'est aussi un format différenciant face aux carrousels PDF "tout texte" qui saturent le feed LinkedIn.

### Plan : 3 niveaux d'ambition

**Niveau 1 — Réutilisation directe (faible effort, impact moyen)**

Ajouter une 3ème carte dans le sub-mode LinkedIn (`CreerStepFormat.tsx` ligne 273-290) : "Carrousel Mixte" qui réutilise exactement le flux Instagram mix. Le backend reçoit déjà `channel: "linkedin"` + `carouselType: "mix"`, donc le prompt s'adapte automatiquement (vouvoiement, ton expert, etc.).

Modifications :
- 1 carte UI ajoutée dans le bloc LinkedIn sub-mode
- Ouverture de `carouselSubMode` pour `selectedChannel === "linkedin"` (ligne 413, juste retirer la restriction Instagram)
- Le upload zone (ligne 458) fonctionne déjà sans condition de canal

Risque : très faible. Tout le pipeline existant est réutilisé.

**Niveau 2 — Adaptation éditoriale LinkedIn (recommandé)**

En plus du Niveau 1, dans `buildMixCarouselPrompt` (`carousel-ai/index.ts` ligne 1375), brancher la branche `isLinkedIn` qui n'existe pas encore pour le mix :
- Overlays photo plus pros (pas de "✨", pas de "girl chic"), vouvoiement
- Slides texte avec densité expert (chiffres, mécanismes, contexte marché)
- CTA fin = "Partagez si...", "Votre avis ?", "Envoyez à un·e collègue qui..." (déjà documenté ligne 490)
- Sequencing recommandé : photo terrain en slide 1 → 3-4 slides analyse → photo "preuve sociale" en slide milieu → slide texte conclusion → CTA

**Niveau 3 — Format natif LinkedIn (option avancée, pour plus tard)**

LinkedIn préfère le format **1080×1350 (4:5 portrait)** pour les carrousels documents, alors qu'Instagram c'est **1080×1350** aussi mais avec marges visuelles différentes. À voir s'il faut adapter `export-carousel-pptx.ts` pour ajouter une signature LinkedIn (logo discret + handle en bas) sur les slides photos. À traiter dans un Pack séparé après validation du Niveau 1+2.

### Ce que je recommande

**Pack "LinkedIn mix" = Niveau 1 + Niveau 2** dans la même livraison, ~30 min de modif, risque faible :

1. **`CreerStepFormat.tsx`** :
   - Remplacer la grille LinkedIn 2 colonnes par 3 colonnes : Post texte / Carrousel texte / Carrousel mixte
   - Quand "mixte" est cliqué : `setLinkedinSubMode("carousel")` + `handleFormatSelect("carousel")` + `setCarouselSubMode("mix")` directement
   - Retirer la restriction `selectedChannel === "instagram"` ligne 413 pour exposer aussi le sub-mode mix sur LinkedIn (au cas où l'user veut basculer entre text/photo/mix après avoir choisi "carousel" en haut)
   - Adapter le label : "Carrousel PDF" → "Carrousel texte" (8-10 slides) + "Carrousel mixte" (photos + texte, 6-8 slides)

2. **`carousel-ai/index.ts` (`buildMixCarouselPrompt`)** :
   - Ajouter le paramètre `isLinkedIn` à la fonction (~5 lignes)
   - Bloc conditionnel pour adapter ton, overlays, CTA selon canal
   - Réutiliser les règles déjà présentes dans `buildSystemPrompt` lignes 478-491

3. **`CreerUnifie.tsx`** :
   - Vérifier que `channel: isLinkedInCarousel ? "linkedin" : undefined` est bien passé pour le type `express_full` mix (déjà le cas ligne 879)
   - Adapter le fallback caption pour LinkedIn (vouvoiement, pas d'emojis fleur)

### Fichiers modifiés

- `src/components/creer/CreerStepFormat.tsx` (~25 lignes : nouvelle carte + retrait restriction)
- `supabase/functions/carousel-ai/index.ts` (~30 lignes dans `buildMixCarouselPrompt`)
- `src/pages/CreerUnifie.tsx` (~3 lignes : adapter fallback caption si LinkedIn)

### Ce qui ne change pas

- Toute la logique upload, structure review, génération mix, preview, export PPTX
- Le flag `isLinkedInCarousel` déjà propagé partout
- Le mode "Carrousel texte" LinkedIn existant reste identique

### Risque

Très faible. On expose une feature backend déjà complète, on ne crée pas de nouveau pipeline.

### Question : option Niveau 3 (signature LinkedIn dans le PPTX) ?

Tu veux que j'inclue l'adaptation visuelle LinkedIn (logo + handle en bas des slides photo, marges plus pro) dans ce pack, ou on garde ça pour un pack ultérieur après validation du flux ?

