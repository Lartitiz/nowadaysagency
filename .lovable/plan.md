

## Audit complet des exports PowerPoint carrousel

### Ce qui existe aujourd'hui — état des lieux honnête

Tu as **3 chemins d'export PPTX** qui cohabitent dans le menu "Télécharger" :

| Bouton menu | Fichier | Méthode | Résultat réel |
|---|---|---|---|
| **Présentation (PPTX)** depuis URLs | `CalendarPostPreview.tsx` (`handlePptxFromUrls`) | Fetch des PNG Storage → un `addImage` plein cadre par slide | Fidèle (puisqu'on prend le PNG déjà rendu côté serveur). **Le meilleur des trois aujourd'hui.** |
| **Présentation (PPTX)** depuis HTML | `export-carousel-visual-pptx.ts` | `html2canvas` sur HTML hors écran, scale 2 | Souvent **flou ou cassé** : gradients mal rendus, fonts qui ne chargent pas à temps, `oklch` non supporté, attente d'images insuffisante |
| **PPTX éditable** | `export-carousel-pptx.ts` (2179 lignes) | Recompose chaque slide nativement avec shapes, badges, photos compressées | Texte modifiable mais **ne ressemble pas au preview HTML** : c'est un design "maison" pptxgenjs, pas un rendu fidèle de tes templates HTML |

### Les vrais problèmes

1. **L'utilisateur ne sait pas quoi choisir.** Trois options qui produisent trois rendus différents, sans guidance. "PPTX éditable" laisse croire à un éditable fidèle au preview → en réalité c'est un autre design.
2. **`exportCarouselVisualPptx` (HTML→image) est faible :**
   - `html2canvas` standard ne gère pas `oklch`, `color-mix`, `backdrop-filter`, certains gradients
   - le fallback "scale: 2" est bas pour PowerPoint (16/9 grand écran)
   - attente de fonts/images trop courte → captures partielles
   - pas d'iframe sandbox → conflits CSS Tailwind possibles
3. **Le PPTX éditable est bon mais orphelin :** beau code, mais visuellement différent du preview que voit l'utilisateur. Donc effet "surprise" à l'ouverture.
4. **Aucun calque texte natif sur le mode "image" :** même quand l'utilisateur veut juste retoucher un mot, il est obligé de relancer la génération.

### Ce qu'on fait — refonte en 3 livrables

#### Livrable 1 — Fiabiliser le mode "image fidèle" (rendu HTML)

Fichier : `src/lib/export-carousel-visual-pptx.ts` — refonte

- Remplacer `html2canvas` par **`html2canvas-pro`** (fork moderne qui gère `oklch`, `lab`, `color-mix`, gradients modernes)
- Capturer dans une **iframe sandbox isolée** (un `<iframe srcdoc>` avec les mêmes balises `<link>` Google Fonts), pas dans une div Tailwind du parent — finis les conflits de styles
- Attendre proprement : `iframe.contentDocument.fonts.ready` + toutes les `<img>` → `complete && naturalWidth > 0` + 2 `requestAnimationFrame` + 200ms tampon
- `scale: 3` (3240×4050 px) → ultra net dans PowerPoint
- Si la capture échoue sur une slide : retry une fois, sinon log + slide rouge "Slide non rendue, relancer l'export"

Effet : le mode image actuel devient **vraiment** fidèle au preview, même sur Safari et avec des gradients complexes.

#### Livrable 2 — Mode hybride "image + texte natif éditable"

Nouveau fichier : `src/lib/export-carousel-hybrid-pptx.ts` + mapping fonts dans `src/lib/pptx-font-mapping.ts`

Pour chaque slide :
1. Capturer le HTML **sans le texte overlay** (en retirant temporairement `[data-overlay-text]` ou via une variante CSS `.export-bg-only`) → PNG haute qualité = fond fidèle
2. Lire les overlays depuis `slidesData` (déjà disponible côté calendrier) : `overlay_text`, `title`, `body`, `overlay_position`, `overlay_style`
3. Ajouter les overlays comme **vrais TextBox PowerPoint** (`slide.addText`) par-dessus :
   - position calculée depuis `overlay_position` (mapping `bottom_left → x:0.5, y:7.8, align:left`, etc.)
   - couleur depuis la charte (`color_text` / `color_primary`)
   - police mappée Google Font → police PPTX sûre :

| Google Font (charte) | Police PowerPoint mappée |
|---|---|
| Playfair Display, Lora, Merriweather, Libre Baskerville | Georgia |
| Inter, Manrope, IBM Plex Sans | Calibri |
| Montserrat | Verdana |
| Poppins | Trebuchet MS |
| IBM Plex Mono, Consolas | Consolas |
| (autre) | Calibri |

Résultat : **le client peut modifier le texte directement dans PowerPoint** tout en gardant un rendu très proche du preview.

#### Livrable 3 — UX unifiée : 1 seul menu, 2 choix clairs

Dans `CalendarPostPreview.tsx` (et le miroir `CreerUnifie.tsx`), remplacer les 3 entrées actuelles par :

```
Télécharger ▾
├── Images PNG (ZIP)
├── PowerPoint — éditable (recommandé)        ← Livrable 2 (hybride)
└── PowerPoint — image fidèle                 ← Livrable 1 (rendu HTML net)
```

- "Éditable (recommandé)" : utilise le hybride si `slidesData` est dispo, sinon fallback sur l'image fidèle
- Le vieux `export-carousel-pptx.ts` (2179 lignes "design maison") est conservé en interne **uniquement comme fallback de dernier recours** quand on n'a ni `visualHtml` ni `visualUrls` — il n'est plus exposé comme bouton autonome
- Tooltips clairs sur chaque option : "Modifier le texte dans PowerPoint" vs "Identique au preview, non modifiable"

#### Bonus — Bouton "Aperçu PDF rapide" (optionnel)

Beaucoup de clients ouvrent le .pptx juste pour partager. Ajouter un export PDF parallèle (via `jspdf` côté client, en réutilisant les mêmes captures que le mode image) en 3ème option. À garder pour un round suivant si tu valides l'idée.

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/lib/export-carousel-visual-pptx.ts` | Refonte : iframe sandbox + html2canvas-pro + scale 3 + attentes robustes + retry |
| `src/lib/export-carousel-hybrid-pptx.ts` (nouveau) | Capture sans overlay + ajout texte PPTX natif par-dessus |
| `src/lib/pptx-font-mapping.ts` (nouveau) | Mapping Google Font → PPTX + mapping `overlay_position` → coords |
| `src/components/calendar/CalendarPostPreview.tsx` | Menu "Télécharger" simplifié à 3 entrées (PNG / éditable / image fidèle) |
| `src/pages/CreerUnifie.tsx` | Idem, alignement du menu d'export carrousel |
| `package.json` | Ajout `html2canvas-pro` |

### Validation

1. Sur le calendrier, ouvrir un carrousel mix Instagram avec photos + overlays.
2. Cliquer "PowerPoint — image fidèle" → ouvrir le .pptx :
   - Slides 100% identiques au preview (gradients, fonts, layout)
   - Pas de slide floue, pas de slide blanche
3. Cliquer "PowerPoint — éditable" → ouvrir le .pptx :
   - Le fond ressemble au preview
   - Les overlays sont **sélectionnables et modifiables** comme vrai texte
   - Les fonts utilisées sont raisonnables (mapping appliqué)
4. Tester sur un carrousel text_only (sans photo) : le rendu reste correct
5. Tester sur Chrome + Safari : pas de divergence majeure
6. Tester depuis `CreerUnifie` (page de création) : même comportement que depuis le calendrier

### Risques

- **Mapping fonts approximatif** : Playfair → Georgia n'est pas pixel-perfect. C'est inévitable côté PowerPoint. Le mode "image fidèle" reste là pour les cas où la typo doit être exacte.
- **`html2canvas-pro`** : nouvelle dépendance, à valider qu'elle build avec Vite (a priori oui, c'est un fork drop-in).
- **Calque texte mal positionné sur des layouts exotiques** : on garde TOUJOURS le PNG complet (avec l'overlay en dur) en arrière-plan dans le mode hybride → si le texte natif tombe mal, l'image en dessous reste cohérente. Le pire cas est juste "double texte", repérable à l'œil et corrigeable en supprimant le TextBox.
- **Pas de migration DB, pas de touche au backend.** Tout se passe côté client.

