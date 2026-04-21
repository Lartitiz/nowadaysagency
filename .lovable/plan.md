

## Bug : photos mal cadrées / compressées dans le PNG exporté

### Diagnostic

Le **preview** rend chaque slide dans un `<iframe srcDoc>` à 1080×1350 réel (puis scaled down via CSS transform). Le navigateur gère parfaitement `background-size: cover` + base64 → cadrage correct.

L'**export PNG actuel** (`src/lib/export-carousel-png.ts`) injecte le HTML dans un `<div>` direct via `container.innerHTML = vs.html`, puis appelle `html2canvas`. Trois problèmes connus :

1. **`html2canvas` rate régulièrement `background-size: cover`** sur conteneur 1080×1350 : il clone le DOM dans un sandbox interne où les dimensions calculées des éléments parents diffèrent → le cover est calculé sur une mauvaise hauteur de référence et l'image est **déformée / re-cadrée**.
2. **Les images base64** (parfois 2-5 MB par photo) ne sont **pas garanties d'être décodées** quand html2canvas snapshote — un simple `setTimeout(400ms)` ne suffit pas. Résultat : photo partiellement rendue / mauvais ratio.
3. **Pas d'isolation** : les styles globaux du document (resets Tailwind, `box-sizing`, fonts) **interfèrent** avec le HTML brut généré, ce qui peut écraser les dimensions des éléments.

Le preview iframe ne souffre d'aucun des trois.

### Solution : capturer depuis le même iframe que le preview

Réécrire `exportCarouselPng` pour qu'il **capture depuis un iframe** identique à celui du preview, plutôt que d'un `<div>` brut. C'est la même technique que `export-carousel-visual-pptx.ts` utilise déjà (`captureSlideWithRetry`) — on l'adopte pour le PNG.

**Étapes par slide :**

1. Créer un `<iframe>` 1080×1350 hors-écran, `srcDoc={html}` → environnement isolé, mêmes conditions que le preview.
2. Attendre `iframe.onload` puis :
   - `await iframeDoc.fonts.ready`
   - **Attendre que toutes les `<img>` aient `complete && naturalWidth > 0`** (vraie attente de décodage, pas un timeout aveugle).
   - **Pour les `background-image` base64** : pré-charger via `new Image()` + `await img.decode()` pour chaque URL extraite du HTML. C'est l'étape qui manque aujourd'hui et qui cause la majorité des cas "image compressée".
3. Capturer avec `html2canvas` ciblé sur le `documentElement` de l'iframe avec `windowWidth: 1080, windowHeight: 1350, scale: 2` (scale 2 pour qualité retina, downscale optionnel à 1080×1350 si trop lourd).
4. Détruire l'iframe.

**Bonus qualité :** passer en `scale: 2` permet un PNG plus net qu'aujourd'hui (scale 1 actuellement → un peu mou sur Insta).

### Fallback / robustesse

- Si html2canvas échoue (taint sur certaines images) → retry une fois avec `useCORS: false, allowTaint: true`.
- Si une image ne décode jamais (timeout 8s) → on capture quand même, on `console.warn` la slide.
- Le ZIP / téléchargement single reste identique en sortie.

### Fichier touché

| Fichier | Changement |
|---|---|
| `src/lib/export-carousel-png.ts` | Réécriture de la boucle : iframe-based capture + attente décodage image + scale 2 |

Aucun autre fichier touché. Les surfaces qui appellent `exportCarouselPng` (calendrier + atelier carrousel + Pinterest visuel via util similaire) bénéficient automatiquement du fix — pas de changement d'API.

### Pourquoi pas une autre approche

- **Régler html2canvas avec des options** (`foreignObjectRendering: true`, etc.) : essayé, casse les fonts, peu fiable cross-browser.
- **Render côté serveur via Puppeteer / edge function** : overkill pour cette feature, coût et latence multipliés.
- **Utiliser l'image déjà rendue dans le preview iframe** : impossible, on ne peut pas screenshoter un iframe cross-document via Canvas API standard. L'astuce iframe ci-dessus contourne ça parce qu'on contrôle le document de l'iframe (même origine, srcDoc).

### Validation

1. Export PNG d'un carrousel photo (type photo_full ou photo_integrated) : la photo doit être **identique au preview**, pas re-cadrée ni écrasée.
2. Comparer slide par slide : ouvrir le preview à 100%, télécharger le PNG, superposer → match pixel à 99%+.
3. Pas de régression sur les carrousels texte pur (pas d'image → la capture fonctionne déjà).
4. Pas de régression sur le PNG depuis Storage URLs (`handleDownloadFromUrls` côté calendrier — ce chemin ne passe pas par html2canvas, intouché).
5. Performance : capture d'un carrousel 8 slides toujours < 15s sur connexion normale.

### Risques

Faibles. La technique iframe est éprouvée (déjà en place dans `export-carousel-visual-pptx.ts`). Le seul risque résiduel : sur Safari, certains base64 très lourds peuvent prendre > 8s à décoder → on log et on continue, l'utilisateur ne reste pas bloqué.

