

## Bug : photos `photo_integrated` toujours mal cadrées dans le PNG export

### Réponse rapide à ta question

**Non, ce n'est pas lié au "fix précédent".** Le fix précédent concernait l'option PowerPoint éditable (HTML stocké en BDD). Le PNG est toujours capturé en direct à partir du HTML à chaque clic — donc la date de génération du post ne change rien. Le bug est dans le moteur de capture lui-même.

### Diagnostic

Les carrousels photo ont **deux modes** :
- `photo_full` → photo en `background-image: cover` plein cadre. **Marche bien** (slide-1 dans tes captures).
- `photo_integrated` → `<img src="..." style="width:100%; height:auto; object-fit:cover">` dans une carte. **Cassé** (slides 3 et 6).

Le problème : on utilise `html2canvas` (v1.4.1), qui **ne supporte pas correctement `object-fit: cover`** sur les `<img>`. Il rend l'image à ses dimensions natives au lieu de respecter le cadre → impression de "compression" / mauvais cadrage.

Or, on a déjà `html2canvas-pro` (v2.0.2) installé dans le projet — c'est un fork qui **corrige précisément `object-fit`** et est déjà utilisé avec succès par `export-carousel-hybrid-pptx.ts` (qui capture sans souci ces mêmes slides).

Bonus secondaire : on capture `documentElement` au lieu de `body` (le hybrid PPTX capture `body`), ce qui peut introduire des artefacts de scroll vertical sur certains layouts.

### Solution

**Fichier touché : `src/lib/export-carousel-png.ts` uniquement.**

1. Remplacer `import html2canvas from "html2canvas"` par `import html2canvas from "html2canvas-pro"`.
2. Cibler `doc.body` au lieu de `doc.documentElement` dans `captureSlide` (alignement avec le hybride qui marche).
3. Garder le reste de la logique (iframe isolé, attente fonts/images, decode, scale 2, retries) — déjà solide.

C'est tout. Pas de changement d'API, pas de migration, pas de touche backend.

### Pourquoi ça va marcher

`html2canvas-pro` fait déjà le job sur les **mêmes HTML de slides** dans le pipeline PowerPoint éditable (`captureBackground` dans `export-carousel-hybrid-pptx.ts`). On reproduit exactement la même config → même résultat fidèle.

### Validation

1. Re-télécharger le carrousel des captures : slides 3 et 6 doivent être pixel-identiques au preview (cadre carte respecté, photo cropped proprement).
2. Vérifier slide-1 (photo_full) : pas de régression.
3. Tester un carrousel texte pur : pas de régression.
4. Tester depuis le calendrier ET depuis l'atelier : même rendu.

### Risques

Très faibles. `html2canvas-pro` est déjà en production sur le projet via le PPTX hybride. C'est un changement d'import à 1 ligne + un `body` au lieu de `documentElement`.

