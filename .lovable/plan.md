
# Shapes structurels natifs PPTX — Chemin 3 hybride enrichi

## Périmètre

Extraire 4 types de shapes (`background`, `card`, `pill`, `highlight`) du HTML rendu par carousel-visual et les poser comme shapes pptxgenjs natifs (couche middle, entre photos et PNG de fond). La cliente pourra alors éditer leur couleur/position/taille dans PowerPoint au lieu de les avoir figés dans le PNG.

**Fichiers touchés (3) :**
- `supabase/functions/carousel-visual/index.ts` — prompt système (après ligne 870, dans le bloc "ANNOTATIONS POUR EXPORT POWERPOINT ÉDITABLE")
- `src/lib/pptx-font-mapping.ts` — nouveau type `ShapeBlock` + fonction `extractShapeBlocks(doc)`
- `src/lib/export-carousel-hybrid-pptx.ts` — extraction, masquage, pose dans le z-order, CSS d'isolation

**NON touchés :** `export-carousel-pptx.ts` (chemin schema-native pptxgenjs pur), `carousel-ai`, les autres pipelines d'export, le système photos `data-pptx-photo*` (réutilise le même pattern mais reste indépendant).

---

## 1. Annotation HTML produite par Opus (carousel-visual)

Ajout d'un nouveau bloc dans le prompt système, **après la section ANNOTATIONS POUR EXPORT POWERPOINT ÉDITABLE existante** (ligne ~870) :

```
═══ SHAPES STRUCTURELS — POUR ÉDITABILITÉ MAXIMALE PPTX (RECOMMANDÉ) ═══

En complément des annotations data-pptx-editable sur les TEXTES, annote les éléments visuels STRUCTURELS avec data-pptx-shape pour qu'ils deviennent des shapes natifs éditables dans PowerPoint :

- data-pptx-shape="background" → le <div> 1080×1350 racine de la slide (couleur de fond unie). UN SEUL par slide.
- data-pptx-shape="card" → un bloc rectangulaire avec un fill uni + border-radius qui contient du texte
- data-pptx-shape="pill" → un badge très arrondi (border-radius >= 100px ou >= 50% de la hauteur) contenant un label court
- data-pptx-shape="highlight" → un fond coloré derrière un mot pour le mettre en valeur (style "marker")

CONDITIONS D'ANNOTATION (NE PAS annoter si une de ces conditions est vraie) :
- L'élément utilise un gradient (linear-gradient, radial-gradient, conic-gradient)
- L'élément a une box-shadow (les shapes natifs perdent l'ombre — préfère le PNG)
- L'élément a un backdrop-filter, mask, mix-blend-mode, filter, clip-path
- L'élément a un transform autre que none (rotate, scale ≠ 1, skew, matrix)
- L'élément a un border (les shapes natifs ne le restituent pas dans ce sprint)
- Le fill n'est pas un aplat opaque (pas de rgba avec alpha < 1, sauf "highlight" qui peut être translucide)

L'annotation est OPTIONNELLE : si tu n'annotes pas, l'élément reste figé dans le PNG (acceptable).

EXEMPLE :
<div style="width:1080px;height:1350px;background:#FB3D80" data-pptx-shape="background">
  <div style="background:#FFA7C6;border-radius:32px;padding:48px" data-pptx-shape="card">
    <span style="background:#FFE561;border-radius:100px;padding:8px 24px" data-pptx-shape="pill">
      <span data-pptx-editable="caption">CONSEIL #1</span>
    </span>
    <h2 data-pptx-editable="title">Mon titre avec un <span style="background:#FFE561" data-pptx-shape="highlight">mot surligné</span></h2>
  </div>
</div>
```

**Note clé :** un même élément ne porte JAMAIS à la fois `data-pptx-editable` et `data-pptx-shape` (un texte est un texte, un shape est un shape). Le texte vit DANS le shape comme enfant.

---

## 2. Nouveau type `ShapeBlock` + extracteur (pptx-font-mapping.ts)

Ajouter à la fin du fichier (après les exports existants) :

```ts
export interface ShapeBlock {
  el: Element;
  type: "background" | "card" | "pill" | "highlight";
  rect: { x: number; y: number; w: number; h: number };
  fill: string;            // hex 6 chars normalisé (sans #)
  borderRadiusPx: number;  // rayon en px (première valeur si shorthand)
  hasGradient: boolean;    // pour skip
  hasShadow: boolean;      // pour skip
  hasTransform: boolean;   // pour skip
}

export function extractShapeBlocks(doc: Document): ShapeBlock[] {
  const win = doc.defaultView;
  if (!win) return [];
  const nodes = Array.from(doc.body.querySelectorAll<HTMLElement>("[data-pptx-shape]"));
  const blocks: ShapeBlock[] = [];
  for (const el of nodes) {
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;

    const rawType = (el.getAttribute("data-pptx-shape") || "card").toLowerCase();
    const type: ShapeBlock["type"] =
      rawType === "background" || rawType === "card" ||
      rawType === "pill" || rawType === "highlight" ? rawType : "card";

    const bgImage = cs.backgroundImage || "none";
    const hasGradient = /gradient\(/i.test(bgImage);
    const hasShadow = (cs.boxShadow || "none") !== "none";
    const hasTransform = (cs.transform || "none") !== "none";

    // Skip silencieusement les cas non supportés (Opus est censé respecter les conditions
    // mais on défend en profondeur)
    if (hasGradient || hasShadow || hasTransform) continue;

    const bgColor = cs.backgroundColor || "transparent";
    if (bgColor === "transparent" || bgColor === "rgba(0, 0, 0, 0)") continue;

    const borderRadiusStr = cs.borderTopLeftRadius || cs.borderRadius || "0px";
    const borderRadiusPx = parseFloat(borderRadiusStr) || 0;

    blocks.push({
      el,
      type,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      fill: normalizeHex(bgColor, "FFFFFF"),
      borderRadiusPx,
      hasGradient,
      hasShadow,
      hasTransform,
    });
  }
  return blocks;
}
```

---

## 3. Modifications `export-carousel-hybrid-pptx.ts`

### 3a. Imports (ligne 4-14) — ajouter `ShapeBlock`, `extractShapeBlocks`

### 3b. CSS d'isolation dans `mountIframe` (après la règle photo, ligne ~108) — ajouter :

```css
/* Masquage des shapes structurels rendus en pptxgenjs natif :
   on retire UNIQUEMENT le fond/ombre du shape lui-même, JAMAIS celui des descendants
   (le texte enfant doit rester visible dans le PNG si non annoté éditable). */
[data-pptx-shape-hide="true"] {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border-color: transparent !important;
}
```

**Différence majeure avec `data-pptx-hide` :** PAS de sélecteur `[data-pptx-shape-hide="true"] *`. On ne touche pas aux descendants.

### 3c. Extraction + masquage (à insérer entre ligne 494 et 499, **AVANT extraction photos**)

```ts
// ---- Strategy D : extract structural shapes (background, card, pill, highlight)
// Doit s'exécuter AVANT que captureBody soit appelé, mais APRÈS extractAnnotatedBlocks
// (qui pose data-pptx-hide sur les textes — sans impact sur la géométrie des shapes parents).
const shapeBlocks = extractShapeBlocks(doc);
const usableShapes: ShapeBlock[] = [];
for (const sb of shapeBlocks) {
  if (sb.type !== "background") {
    if (sb.rect.y > SLIDE_H_PX || sb.rect.x > SLIDE_W_PX) continue;
    if (sb.rect.y + sb.rect.h < 0 || sb.rect.x + sb.rect.w < 0) continue;
  }
  usableShapes.push(sb);
  (sb.el as HTMLElement).setAttribute("data-pptx-shape-hide", "true");
}
```

### 3d. Pose dans le z-order — insérer **APRÈS la boucle photos natives (ligne 573) et AVANT `slide.addImage({ data: bg, … })` (ligne 575)** :

```ts
// ---- Pose des shapes natifs (couche middle) entre photos (bottom) et PNG de fond (top du middle).
// background → slide.background (pas un shape posé)
// card / pill / highlight → slide.addShape("roundRect")
for (const sb of usableShapes) {
  if (sb.type === "background") {
    slide.background = { color: sb.fill };
    continue;
  }
  const xRaw = pxToInches(sb.rect.x, PX_PER_IN);
  const yRaw = pxToInches(sb.rect.y, PX_PER_IN);
  const wRaw = pxToInches(sb.rect.w, PX_PER_IN);
  const hRaw = pxToInches(sb.rect.h, PX_PER_IN);
  const x = Math.max(0, xRaw);
  const y = Math.max(0, yRaw);
  const w = Math.min(PPTX_W_IN - x, wRaw - (x - xRaw));
  const h = Math.min(PPTX_H_IN - y, hRaw - (y - yRaw));
  if (w <= 0 || h <= 0) continue;

  // pptxgenjs rectRadius : valeur en inches, capée à min(w,h)/2 pour éviter overflow
  const radiusInches = pxToInches(sb.borderRadiusPx, PX_PER_IN);
  const cappedRadius = Math.min(radiusInches, Math.min(w, h) / 2);

  try {
    slide.addShape("roundRect", {
      x, y, w, h,
      fill: { color: sb.fill },
      line: { type: "none" },
      rectRadius: cappedRadius,
    });
  } catch (e) {
    console.warn("[hybrid] addShape failed for shape type", sb.type, e);
  }
}
```

**Z-order final :**
1. `slide.background` (color du shape `background`, ou fallback charter sur erreur)
2. Photos natives (couche bottom)
3. **Shapes natifs roundRect** (NOUVEAU — couche middle-bas)
4. PNG de fond rasterisé (couche middle-haut, transparent là où photos+shapes sont masqués)
5. Text frames natifs annotés (couche top)

Cet ordre garantit que les textes enfants (rendus dans le PNG) apparaissent visuellement par-dessus le shape natif (le PNG est posé APRÈS les shapes), et que les textes annotés `data-pptx-editable` viennent encore au-dessus.

---

## 4. Pièges identifiés et défense

### 4a. Conflit `data-pptx-hide` (sur enfants annotés éditables) avec lecture du `backgroundColor` du parent shape

`extractAnnotatedBlocks` (ligne 459) tourne AVANT `extractShapeBlocks` et pose `data-pptx-hide="true"` sur les éléments éditables. Le CSS d'isolation rend les **descendants** transparents (`color`, `background-image`) mais NE TOUCHE PAS au `background-color`. Donc lire `cs.backgroundColor` sur un parent shape reste valide même si un enfant est hidden. **Vérifié dans le CSS lignes 84-92.** Pas de risque.

### 4b. Highlight inline qui contient du texte annoté

Cas typique : `<h2 data-pptx-editable="title">titre <span data-pptx-shape="highlight">mot</span></h2>`. Le span highlight est un descendant d'un élément avec `data-pptx-hide="true"`. Le CSS hide rend `color: transparent` sur le span (donc le mot disparaît du PNG), mais le `background-color` du span reste. Comme on retire AUSSI ce background via `data-pptx-shape-hide` puis qu'on pose le shape natif derrière, le résultat sera : shape jaune natif + texte du run inline reconstruit dans le frame éditable (via `extractAnnotatedBlocks` qui gère déjà les runs colorés). **OK, c'est cohérent.**

### 4c. `extractAnnotatedBlocks` traite parfois les enfants éditables avec runs

Si un shape highlight est enfant d'un block éditable, l'extracteur récupère le texte avec ses runs. Le texte dans le span highlight sera donc reconstruit dans le frame éditable PPTX. **Pas de double rendu** car le PNG cache le texte (transparent) ET on pose le shape sans son texte (le span highlight n'a pas de fond dans le PNG, juste son texte transparent → invisible).

### 4d. Risque d'annotation par Opus de l'élément racine 1080×1350

Si Opus annote `data-pptx-shape="background"` ET utilise un gradient dessus, on skip silencieusement (cf. extracteur). Le fond reste alors dans le PNG. **Acceptable.**

### 4e. `border-radius` shorthand asymétrique (ex: "12px 12px 0 0")

Le `getComputedStyle.borderRadius` peut être vide quand les 4 coins diffèrent. On lit `borderTopLeftRadius` en priorité. Si Opus génère un coin différent par angle, on perd le détail (tous les coins prennent le rayon top-left). **Acceptable** pour ce sprint — Opus est instruit de faire des shapes simples.

### 4f. `slide.background` écrasé par le PNG ?

`slide.addImage({ data: bg, x: 0, y: 0, w: PPTX_W_IN, h: PPTX_H_IN })` reste posé après. Si le PNG n'a PAS de fond (le shape `background` a été masqué via `data-pptx-shape-hide`), le PNG est transparent sur toute la slide → `slide.background` (couleur du shape extrait) reste visible. **OK.**

### 4g. Photos natives qui chevauchent un card shape

Si Opus annote une carte `data-pptx-shape="card"` qui contient une photo `data-pptx-photo="1"`, on aura : photo native (z=1) + shape carte natif (z=2) qui RECOUVRE la photo. La photo disparaît visuellement. **Mitigation** : ajouter dans le prompt "Ne pas annoter en data-pptx-shape=card un bloc qui contient un data-pptx-photo enfant". Inclus dans la liste des conditions ci-dessus.

---

## (b) Propositions d'amélioration — à valider individuellement

### Proposition #1 — Annoter aussi le risque "card contient photo"

**Quoi :** ajouter dans les CONDITIONS D'ANNOTATION : "Ne PAS annoter un élément qui contient un descendant `data-pptx-photo` (la photo native serait recouverte)."

**Coût :** 1 ligne dans le prompt. **Risque régression :** zéro. **Recommandé.**

### Proposition #2 — Skip log Sentry pour shapes invalides

**Pourquoi :** si Opus annote un shape avec gradient/shadow/transform et qu'on le skip silencieusement, on n'a aucune visibilité sur le taux de respect des règles.

**Quoi :** dans `extractShapeBlocks`, quand on skip pour `hasGradient || hasShadow || hasTransform`, faire un `console.debug("[hybrid] shape skipped: …", { type, reason })`. Optionnellement, log Sentry niveau "info" si > 30% des shapes annotés sont skippés sur une slide.

**Coût :** ~5 lignes. **Risque :** zéro. **Recommandé** pour debug futur, sans Sentry pour ce sprint (juste console).

### Proposition #3 — Capper le nombre de shapes par slide

**Pourquoi :** un PPTX avec 50 shapes par slide devient lourd. Si Opus s'emballe et annote chaque `<div>`, on peut exploser la taille du fichier.

**Quoi :** dans la pose des shapes (3d), ajouter `if (usableShapes.length > 20) usableShapes.length = 20` avec un warn. 20 = très large, ne devrait jamais être atteint en usage normal.

**Coût :** 3 lignes. **Risque :** zéro. **Recommandé.**

### Proposition #4 — Tolérer alpha sur "highlight"

**Pourquoi :** un surlignage style marker est souvent semi-transparent (`rgba(255,229,97,0.6)`). Aujourd'hui on skip si pas opaque.

**Quoi :** dans l'extracteur, parser l'alpha du `backgroundColor` et le passer comme `transparency` à pptxgenjs (`fill: { color, transparency: 100 - alpha*100 }`) UNIQUEMENT pour `type === "highlight"`. Les autres types restent contraints à l'opaque.

**Coût :** ~10 lignes (parsing alpha + branche transparency). **Risque :** modéré (transparency pptxgenjs peut donner des résultats inattendus selon la version PowerPoint).

**Recommandation : EXCLURE de ce sprint.** À ajouter en Phase 2 si vraiment nécessaire après usage réel.

### Proposition #5 — Test unitaire `extractShapeBlocks`

**Pourquoi :** la fonction sera complexe et a plusieurs cas de skip. Sans test, régression facile.

**Quoi :** ajouter `src/lib/__tests__/pptx-shape-extraction.test.ts` avec ~6 cas (background OK, card OK, pill OK, highlight OK, gradient skipped, shadow skipped, transform skipped, transparent skipped, trop petit skipped).

**Coût :** ~80 lignes de test, JSDOM setup. **Risque :** zéro. **Recommandé** mais coût non trivial.

---

## Critères de validation

1. **TypeScript OK** : aucune erreur de typage après ajout de `ShapeBlock` et `extractShapeBlocks`.

2. **Test fonctionnel — 1 carrousel généré, ouvert dans PowerPoint :**
   - La couleur de fond de chaque slide est éditable (clic droit → format de l'arrière-plan)
   - Au moins une carte (visible dans le rendu) est sélectionnable comme "Forme" et sa couleur de remplissage modifiable
   - Au moins une pilule/badge est sélectionnable comme forme arrondie
   - Les textes annotés `data-pptx-editable` restent éditables comme avant (non-régression)

3. **Test visuel — comparer le PPTX exporté avec le PNG ZIP de référence :**
   - Aucune différence visible (les shapes natifs reproduisent exactement ce qui était dans le PNG)
   - Pas de bordure parasite, pas de décalage > 2px, pas de couleur déformée

4. **Non-régression photos natives** : générer un carrousel mode "photo" avec photos fournies, vérifier que les photos restent au bon endroit (les shapes ne les recouvrent pas).

5. **Logs console** : pas d'erreur `[hybrid] addShape failed` lors d'un export normal. Les warnings de skip silencieux sont attendus si Opus annote un shape interdit.

6. **Taille fichier** : le PPTX généré reste < 1.5x la taille de la version pré-changement (pour éviter une explosion de shapes).

---

## Hors scope

- Pas de gestion des gradients (Phase 2 — nécessite shapes pptxgenjs avec `fill: { type: "gradient" }`)
- Pas de gestion des box-shadow (impossible nativement en pptxgenjs)
- Pas de bordures sur les shapes (Phase 2)
- Pas de mise à jour de `export-carousel-pptx.ts` (chemin schema-native, déjà natif)
- Pas de UI cliente pour montrer "ces shapes sont éditables" — la cliente le découvrira en ouvrant le PPTX

---

## Décision attendue

Confirme :
- ✅ Périmètre principal tel quel
- ✅/❌ Proposition #1 (anti card-contains-photo dans le prompt) — recommandé
- ✅/❌ Proposition #2 (console.debug sur skip) — recommandé
- ✅/❌ Proposition #3 (cap 20 shapes par slide) — recommandé
- ❌ Proposition #4 (alpha highlight) — recommandation : refuser, Phase 2
- ✅/❌ Proposition #5 (tests unitaires) — recommandé mais coût ~80 lignes
