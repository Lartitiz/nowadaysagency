

## Simplification + harmonisation des téléchargements partout

### Décision

**Supprimer "PowerPoint — image fidèle" partout.** C'est de la redondance pure : un PPTX où chaque slide = une image, c'est exactement les PNG dans un autre conteneur. On garde **2 options uniquement**, identiques sur toutes les surfaces :

1. **🖼️ Images PNG** — *À publier directement (Insta, LinkedIn…)*
2. **📝 PowerPoint — éditable ✨** — *Modifie le texte dans PowerPoint, fond préservé*

Plus de fallback "PPTX basique" visible côté carrousel non plus : le hybride éditable couvre déjà ce besoin et fait mieux.

### Audit + actions par surface

| Surface | État actuel | Action |
|---|---|---|
| **Calendrier — preview compact** (`CalendarPostPreview.tsx`) | 3 options + bouton icône peu visible | Garder 2 options. Bouton devient `Button` visible avec label "Télécharger" |
| **Calendrier — plein écran** (même composant) | idem | idem (même composant) |
| **Atelier carrousel** (`CreerStepResult.tsx` + `CreerUnifie.tsx`) | 3 options PPTX, **pas d'option PNG** | Ajouter "Images PNG" en 1er. Supprimer "PowerPoint — image fidèle" et "PowerPoint — basique (fallback)". Garder "PowerPoint — éditable ✨" |
| **Atelier épingle Pinterest** (`CreerStepResult.tsx`) | 3 options : Éditable / Image fidèle / PNG | Garder 2 options : "Image PNG" en 1er + "PowerPoint — éditable ✨" |
| **Atelier brief photo Pinterest** | PNG seul | Inchangé (c'est un brief, pas un visuel à publier) |

### Composant partagé

Création de `src/components/exports/DownloadMenuItems.tsx` qui prend `{ onPng, onPptxEditable, downloadingPng?, downloadingPptx?, count? }` et rend les 2 items avec wording strictement identique partout :

- **🖼️ Images PNG** *(ZIP si N>1)* — *À publier directement*
- **📝 PowerPoint — éditable ✨** — *Modifie le texte dans PowerPoint, fond préservé*

### Factorisation export PNG

Création de `src/lib/export-carousel-png.ts` exportant `exportCarouselPng(visualSlides, fileName)` qui contient la logique de `CalendarPostPreview.handleDownloadImages` (boucle html2canvas → PNG single ou ZIP via JSZip, 1080×1350, scale 1). Réutilisé par calendrier ET atelier → zéro duplication.

### Bouton "Télécharger" visible

Côté **calendrier** : remplacer l'`IconButton` 28px par un vrai bouton avec label :

```tsx
<Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
  <Download className="h-3.5 w-3.5" /> Télécharger <ChevronDown className="h-3 w-3" />
</Button>
```

Côté **atelier** : remplacer "Exporter" par "Télécharger" pour aligner le wording.

### Code mort à nettoyer

- `src/lib/export-carousel-visual-pptx.ts` : le fichier reste pour l'instant (au cas où on veut le rebrancher), mais aucun import ne le référence plus → marqué `@deprecated` en commentaire.
- `src/lib/export-pinterest-visual-pptx.ts` : la fonction `exportPinterestVisualPptx` (image fidèle) n'est plus appelée → marquée `@deprecated`. `exportPinterestVisualPng` reste utilisée.
- Handlers correspondants dans `CreerUnifie.tsx` (`handleExportVisualPptx`, `handlePinterestPptx`) : retirés ou conservés non-branchés.

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| **Nouveau** `src/lib/export-carousel-png.ts` | Util `exportCarouselPng(visualSlides, fileName)` |
| **Nouveau** `src/components/exports/DownloadMenuItems.tsx` | Items menu unifiés (PNG + PPTX éditable) |
| `src/components/calendar/CalendarPostPreview.tsx` | Supprime option "PowerPoint — image fidèle". Bouton "Télécharger" visible. Utilise `DownloadMenuItems` et `exportCarouselPng`. |
| `src/components/creer/CreerStepResult.tsx` | Ajoute "Images PNG" via nouvelle prop `onExportVisualPng`. Supprime "PowerPoint — image fidèle" et "PowerPoint — basique". Pour Pinterest : supprime "Image fidèle (PPTX)". Utilise `DownloadMenuItems` côté carrousel. Wording "Télécharger" partout. |
| `src/pages/CreerUnifie.tsx` | Nouveau handler `handleExportVisualPng` (réutilise `exportCarouselPng`). Retire le branchement `onExportVisualPptx` côté carrousel et `onExportPinterestPptx`. |

### Hors scope

- Brief photo Pinterest : reste PNG seul.
- Exports PDF (Voice guide, Mirror, Offres) : autre stack, pas concerné.
- Reels / stories / newsletter : pas de visuels carrousel.
- Pas de migration DB, pas de touche backend.

### Validation

1. Calendrier : clic "Télécharger" (bouton avec label visible) → 2 options.
2. Atelier carrousel : clic "Télécharger" → 2 options identiques au calendrier.
3. Atelier Pinterest : clic "Télécharger" → 2 options.
4. Le PNG depuis l'atelier = pixel-identique au PNG depuis le calendrier (même fonction).
5. Le PPTX éditable depuis les 2 endroits = même fichier (déjà le cas, on confirme).
6. Plus aucune option "image fidèle" nulle part dans l'UI.

### Risques

Très faibles. Suppressions d'options redondantes + factorisation. Aucune logique nouvelle. Le moteur d'export hybride (PPTX éditable) reste celui qu'on a livré au plan précédent.

