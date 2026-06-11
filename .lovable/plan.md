## Objectif

Ajouter un 3ᵉ type de carrousel Instagram **"Carrousel juste photo"** : les photos uploadées sont recadrées au format Insta (4:5/1:1) et utilisées telles quelles, **sans aucun texte overlay ni slide texte ajoutée**. L'IA ne rédige que la légende du post.

Les 3 cartes carrousel-photo dans `CreerStepFormat` deviendront, dans l'ordre :

1. 📸 **Carrousel photo + texte** *(existant* `photo`*)* — texte overlay sur chaque photo
2. ✨ **Carrousel texte** *(existant `mix`)* — alterne photos et slides texte design
3. 🖼️ **Carrousel juste photo** *(nouveau `pure_photo`)* — photos seules, aucun texte sur les visuels

La 4ᵉ carte "📝 Carrousel texte" reste affichée uniquement si aucune photo n'est préchargée (comportement actuel inchangé).

## Périmètre

### 1. Front — UI sélecteur (`src/components/creer/CreerStepFormat.tsx`)

- Ajouter `"pure_photo"` à l'union `useState<"text" | "photo" | "mix" | null>` → `"text" | "photo" | "mix" | "pure_photo" | null`.
- Ajouter une 3ᵉ carte (emoji 🖼️, libellé "Carrousel juste photo", desc "Tes photos cadrées Insta, sans aucun texte par-dessus. L'IA écrit la légende.").
- Ajouter l'entrée correspondante dans `subModeMeta` du chip réduit.
- `hasPreloadedPhotos` → la grille devient `sm:grid-cols-3` (3 modes photo) au lieu de 2.
- Sans `hasPreloadedPhotos`, la grille reste `sm:grid-cols-4` (text + 3 modes photo).
- Étendre les conditions `carouselSubMode === "photo" || === "mix"` à `|| === "pure_photo"` pour : déclenchement de `PhotoUploadZone`, validation `uploadedPhotos.length === 0`, et envoi au flow suivant.
- Étendre la prop `onNext`'s union de `carouselSubMode`.

### 2. Front — Plomberie `CreerUnifie.tsx`, `ContentCoachingDialog.tsx`, `CreerStepIdea.tsx`, `StructureReviewStep.tsx`, `use-content-generator.ts`, `demo-data.ts`, `demo-auriana-data.ts`

- Élargir toutes les unions `"text" | "photo" | "mix"` → `"text" | "photo" | "mix" | "pure_photo"`.
- Toutes les branches `=== "photo" || === "mix"` qui transmettent `photos`, `photoDescription`, `carouselType`, `carousel_type`, `photo_description`, `vision_mode`, etc., doivent inclure `=== "pure_photo"`. Le payload backend devient `carouselType: "pure_photo"` mais conserve les mêmes photos/description.
- `visionMode` (`use-content-generator.ts:503`) → `hasPhotos && (subMode === "photo" || === "mix" || === "pure_photo")`.
- Le rendu résultat (`CreerStepResult.tsx:325`, `CreerUnifie.tsx:1445/1452/2098`) : ajouter une branche `r.carousel_type === "pure_photo"` qui rend les photos **sans overlay texte** (réutiliser le composant photo existant en passant `overlayText={null}` / désactiver le bloc texte).

### 3. Backend — `supabase/functions/carousel-ai/index.ts`

- Ajouter le case `carousel_type === "pure_photo"` aux branches existantes (lignes ~179, 245, 312-315, 452, 558, 1310, 1816, 2033).
- Dans le prompt de génération : quand `pure_photo`, instruire Claude de **ne produire aucun texte de slide** ni d'overlay, et de renvoyer un JSON où chaque slide a uniquement `photo_index` (pas de `text`, pas de `title`). La légende du post (`caption`) reste générée normalement.
- `getStructureGuide("pure_photo")` retourne une consigne minimale : "Pas de texte sur les visuels. La narration passe par la légende et l'ordre des photos."
- Vision Claude (analyse photo) reste appelée pour informer la **légende** mais le prompt indique de ne pas écrire de texte par-dessus.

### 4. Export PPTX / preview

- Réutiliser le générateur PPTX `photo` existant en désactivant la couche texte quand `carousel_type === "pure_photo"`. Si l'export est centralisé dans `pptx-generator` / similaire, ajouter un flag `noOverlay`.
- Preview `ContentPreview.tsx:430` : afficher "🖼️ {n} slides · juste photo" pour `carousel_type === "pure_photo"`.

### 5. Recadrage 4:5 

- Déjà géré côté `PhotoUploadZone` (`resizeAndEncode`) qui sort des images normalisées. Vérifier que le format de sortie est bien 4:5 ; ajuster les contraintes si besoin (rien à coder si déjà conforme).

## Hors scope

- Pas de changement au mode `text` (carrousel texte pur), `photo` ni `mix`.
- Pas de modification du flow LinkedIn (le carousel sub-mode existe aussi côté LinkedIn — on étend l'union pour la cohérence des types mais on n'ajoute pas de carte spécifique LinkedIn dans cette itération).
- Pas de migration DB : `carousel_type` est déjà `string`, accepte naturellement `"pure_photo"`.

## Vérification

- Navigation Créer → Instagram → Carrousel : avec photos préchargées, voir 3 cartes ; sans photos, voir 4 cartes.
- Sélectionner "Carrousel juste photo", uploader 3 photos, générer : 
  - le résultat affiche 3 slides photo **sans texte** ;
  - la légende est rédigée ;
  - l'export PPTX ne contient aucun text-box overlay.
- Aucun warning TS sur les unions `carouselSubMode`.
- Les modes `photo` et `mix` continuent de fonctionner comme avant (non-régression).