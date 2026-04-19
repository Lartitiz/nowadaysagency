

## Pack P2 complet + corrections de bugs résiduels

### 1. Bugs résiduels (quick wins)

**A. Mapping CTA propre** (`src/pages/CreerUnifie.tsx` ~ligne 1785)
Quand on convertit la dernière slide en `text_only` CTA, on supprime explicitement `overlay_text` et `photo_index` du résultat. Mapping clean : `{ slide_type: "text_only", role: "cta", title, body }`.

**B. `handleAutoDistribute` robuste** (`src/components/creer/StructureReviewStep.tsx`)
Si aucune slide n'est de type photo, on convertit silencieusement les N premières slides (N = nombre de photos) en `photo_full` avant d'assigner. Plus de clic mort.

### 2. PPTX natif aligné sur le rendu HTML

**Fichier : `src/lib/export-carousel-pptx.ts`**

Pour `photo_full` :
- Ajouter un gradient overlay sombre (bottom→top, noir 60% → transparent) sur la moitié basse pour lisibilité
- Texte overlay en blanc gras Libre Baskerville/IBM Plex sur ce gradient
- Bordure arrondie simulée (rectangle blanc 2pt en bas pour signature)

Pour `photo_integrated` :
- Bande de fond rose pâle `#FFF4F8` derrière la zone texte (au lieu du blanc plat)
- Accent rose `#FB3D80` (barre verticale 4pt à gauche du titre)
- Titre en `#91014b`, body en gris foncé

Pour `text_only` :
- Fond `#FFF4F8` au lieu de blanc
- Titre serif `#91014b`, body sans-serif
- Petit accent rose (point ou trait) en haut à gauche

### 3. Quality check côté front (fiable)

**Fichier : `src/components/creer/formatRenderers/CarouselPhotoResult.tsx`**

Remplacer le bloc qui lit `quality_check.slides_with_text` etc. par un calcul à partir de `slides` :
```ts
const computed = useMemo(() => ({
  slides_with_text: slides.filter(s => s.overlay_text || s.body || s.title).length,
  slides_without_text: slides.filter(s => isPhotoSlide(s) && !s.overlay_text).length,
  all_photos_used: photos ? photos.every((_, i) => slides.some(s => s.photo_index === i + 1)) : true,
}), [slides, photos]);
```
Affichage inchangé visuellement, juste fiable.

### 4. Dégraissage du prompt mix

**Fichier : `supabase/functions/carousel-ai/index.ts` (lignes ~1419-1515)**

Retirer de `buildMixCarouselPrompt` :
- Règles tirets cadratins (déjà dans `BASE_SYSTEM_RULES`)
- Règles écriture inclusive
- Règles anti-jargon AI / anti-slop
- Règles "pas d'emoji en début de phrase"

Garder uniquement les règles **spécifiques au mix** : sequencing photo/text, overlay short, body length, CTA en fin.
Économie estimée ~150 lignes / ~30% tokens sur le prompt mix.

### 5. Fichiers modifiés (récap)

- `src/pages/CreerUnifie.tsx` — cleanup mapping CTA (~5 lignes)
- `src/components/creer/StructureReviewStep.tsx` — `handleAutoDistribute` robuste (~10 lignes)
- `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` — quality check calculé (~15 lignes)
- `src/lib/export-carousel-pptx.ts` — refonte visuelle 3 layouts (~80 lignes touchées)
- `supabase/functions/carousel-ai/index.ts` — nettoyage prompt mix (~150 lignes retirées)

### Risque

- **PPTX** : moyen — visuel change pour tous les exports futurs. Pas de régression fonctionnelle (juste plus joli).
- **Prompt** : faible — on retire des règles déjà appliquées ailleurs via `BASE_SYSTEM_RULES`.
- **Front** : très faible — refactor local, pas de changement d'API.

### Ce qui ne change pas

- Le flux complet (upload → structure → génération → preview → export)
- Les types de slides et le schéma JSON
- L'UX du `StructureReviewStep` (juste plus robuste)
- Le rendu HTML/visuel (déjà aligné sur la charte)

### Test après livraison

Tu testes sur le compte démo Auriana avec un carrousel mix 6-8 slides (mélange `photo_full` + `photo_integrated` + `text_only`), puis tu exportes en PPTX pour vérifier que le rendu match le preview.

