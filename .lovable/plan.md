

## Audit + refonte du PowerPoint éditable (double texte + mauvais cadrage)

### Diagnostic — ce qui se passe vraiment

Trois bugs cumulés dans `src/lib/export-carousel-hybrid-pptx.ts` produisent ce que tu vois sur tes captures :

**Bug 1 — On essaie de masquer le mauvais texte.** Ligne 178 :
```ts
const overlayText = (data?.overlay_text || data?.title || data?.body || "").trim();
```
Sur tes slides "LE PROBLÈME" et "PHASE STRATÉGIQUE", il n'y a **pas d'`overlay_text`** (c'est réservé aux slides photo full). Donc on prend `body` — un bloc de 400-600 caractères avec `<strong>`, `<span class="accent">` au milieu. Le walker DOM cherche un élément dont le `textContent` matche EXACTEMENT cette chaîne → match foiré dans 90 % des cas.

**Bug 2 — Quand le match foire, le texte d'origine reste visible.** Et **on dessine quand même** ce body en overlay PPTX par-dessus, à une position arbitraire bottom_center → **double texte** + scrim noir hideux que tu vois en bas de la capture 2.

**Bug 3 — Coords génériques.** `getOverlayCoords` retourne des positions calculées (bottom/center/top), aucun lien avec la **vraie position** du texte dans le HTML d'origine. D'où le cadrage cassé.

**Bug bonus** — Le titre stylisé en italique tout en bas ("Ce que personne ne vous dit") est dans le HTML, n'est jamais masqué, et n'est jamais rendu en éditable non plus → toujours image figée.

### Pourquoi c'est devenu pire qu'avant

L'ancien export PPTX (`src/lib/export-carousel-pptx.ts`) ne tentait PAS le mode hybride : il rendait juste l'image complète OU il dessinait des blocs natifs en se basant sur les coords de `slide.photo_layout`. Pas de double texte possible. Le nouveau moteur hybride a été conçu pour les slides **photo+overlay** uniquement, mais on le déclenche aussi sur les slides texte → ça casse.

### Solution — refonte ciblée

**Principe :** ne plus jamais deviner ce qu'il faut masquer dans le HTML. À la place, **détecter le type de slide** et appliquer la bonne stratégie.

#### Stratégie A — Slide photo avec `overlay_text` court (5-20 mots)

Cas idéal du moteur hybride. On le garde mais on le fiabilise :
1. Masquage robuste : remplacer le walker par un sélecteur DOM direct (`querySelectorAll`) qui cherche le **plus petit** élément contenant `overlay_text`, on accepte la correspondance même partielle. **Si rien trouvé** → on ne dessine PAS l'overlay PPTX (on garde l'image telle quelle, pas de double texte).
2. Récupérer la **vraie bounding box** de l'élément masqué (`getBoundingClientRect`) et la convertir en coords PPTX (px → inches via ratio 1080→7.5). Plus de coords génériques.
3. Récupérer la **vraie couleur**, **font-size**, **font-family**, **text-align** depuis `getComputedStyle`. Tout ce qui s'affiche sera identique à l'original.
4. Pas de scrim noir automatique (on hérite du fond capturé).

#### Stratégie B — Slide texte (pas d'`overlay_text`, juste `title` + `body`)

C'est tes captures. Approche complètement différente :
1. **Capturer le fond complet AVEC le texte** (donc pas de masquage), exactement comme une image figée.
2. Identifier les blocs **éditables** dans le DOM par sélecteurs structurels (`h1`, `h2`, `p`, éléments avec `font-size > 30px` ou `font-weight bold`). Pour chacun :
   - Récupérer bbox + styles calculés
   - **Masquer ces éléments** puis recapturer le fond
   - Ajouter un `addText` PPTX par-dessus avec la bonne position, taille, couleur, font
3. Si la détection foire → **fallback image-only** (pas d'overlay éditable plutôt qu'un overlay cassé). C'est mieux d'avoir un PowerPoint non-éditable qu'un PowerPoint avec double texte.

#### Stratégie C — Marqueurs côté générateur (optionnel, V2)

Pour fiabiliser à 100 %, ajouter dans `carousel-visual` un attribut `data-pptx-editable="title|body|overlay"` sur les éléments texte clés. Le front n'aurait plus à deviner. **Pas dans ce fix** (impact prompt IA), mais à noter pour la suite.

### Fichier touché

| Fichier | Changement |
|---|---|
| `src/lib/export-carousel-hybrid-pptx.ts` | Refonte complète : détection type slide, masquage par bbox, extraction styles calculés, fallback safe |
| `src/lib/pptx-font-mapping.ts` | Ajout helper `pxToInches(px, ratio)` + helper `extractEditableBlocks(doc)` |

Pas de migration, pas de touche back, pas de changement de prompt.

### Validation visuelle

Sur tes 2 captures actuelles, après fix :

| Capture | Avant | Après attendu |
|---|---|---|
| 1 (LE PROBLÈME, fond clair) | Texte du body figé + même texte dupliqué + scrim noir | Texte body éditable, positionné exactement comme l'original, fond clair sans scrim, titre "Ce que personne ne vous dit" en bas éditable aussi |
| 2 (PHASE STRATÉGIQUE, fond sombre + photo) | Texte body figé + même texte dupliqué en blanc + scrim noir parasite | Photo capturée en haut, texte body en blanc éditable au bon endroit, titre stylisé éditable, pas de doublon |

Tu pourras :
- Modifier le texte directement dans PowerPoint (titre, body, accroches).
- Garder la photo et tous les éléments décoratifs (badges, lignes, ronds en arrière-plan) figés en image.
- Aucune zone fantôme ni scrim parasite.

### Risques

- **Détection structurelle** : si une slide a une mise en page très atypique générée par l'IA, la détection peut rater 1-2 blocs. Le fallback image-only garantit qu'on n'aura JAMAIS pire que le PNG (vs aujourd'hui où on a pire). Acceptable.
- **Performance** : capture supplémentaire après masquage (2× html2canvas par slide). +1s par slide environ. Sur 8 slides = +8s. Acceptable pour un export éditable.
- **Fonts** : on continue de mapper les fonts custom vers Calibri/Georgia/etc. via `mapFontToPptx`. Pas de régression.

### Note sur "avant c'était mieux"

C'est exact. Avant la refonte hybride, l'export PowerPoint éditable rendait les slides via l'ancien `export-carousel-pptx.ts` qui faisait du **vrai layout natif** (card, photo+text à gauche/droite) en se basant sur `slide.photo_layout`. Ça marchait bien sur les layouts simples mais cassait dès qu'on avait des designs IA complexes. La refonte hybride a voulu généraliser → trop ambitieuse, bugs introduits. Le fix proposé garde l'ambition (hybride) mais ajoute les garde-fous qui manquaient.

