

## Plan — Point d'entrée "Partir de photos"

### Périmètre — 3 fichiers
`CreerStepIdea.tsx`, `CreerUnifie.tsx`, `CreerStepFormat.tsx`.

---

### (a) Ce que tu m'as demandé

**1. `src/components/creer/CreerStepIdea.tsx`**
- Ajouter état `showPhotosMode: boolean`
- Ajouter prop `onPhotosNext?: (photos: PhotoItem[], description: string) => void`
- Ajouter 3ème bouton "📸 Partir de photos" (icône `Camera` lucide, même style ghost/sm/muted-foreground que les 2 autres) à droite de "Surfer sur l'actu"
- Quand `showPhotosMode === true` : masquer textarea + objectifs + Suivant ; afficher :
  - lien `← Revenir au mode texte` (en haut, `text-xs text-muted-foreground hover:text-primary`)
  - `<PhotoUploadZone>` avec callbacks locaux qui remplissent un state `localPhotos` + `localDescription`
  - bouton Suivant (`w-full`, `ArrowRight`) désactivé si `localPhotos.length === 0`, qui appelle `onPhotosNext(localPhotos, localDescription)`
- Retour arrière : reset `localPhotos` et `localDescription` (perte volontaire V1)

**2. `src/pages/CreerUnifie.tsx`**
- Ajouter handler `handlePhotosNext(photos, description)` :
  ```ts
  setUploadedPhotos(photos);
  setPhotoDescription(description);
  setNewsjackingContext(null);
  setNewsjackingSuggestedFormat(null);
  setSelectedFormat(null);
  setEditorialAngle(null);
  setCarouselSubMode(null); // user choisit dans CreerStepFormat
  setPhotoMode(false);
  setPinterestData(null);
  setStep("format");
  ```
- Modifier `handleIdeaNext` (ligne 449) : remplacer `setUploadedPhotos([])` + `setPhotoDescription("")` par une logique qui PRÉSERVE photos si `uploadedPhotos.length > 0` (au cas où user revient sur l'écran idée et tape du texte). → en pratique, on les garde simplement (suppression des 2 lignes de reset).
- Passer `onPhotosNext={handlePhotosNext}` à `<CreerStepIdea>`

**3. `src/components/creer/CreerStepFormat.tsx`**
- Ajouter props optionnelles : `initialPhotos?: PhotoItem[]`, `initialPhotoDescription?: string`
- Initialiser `uploadedPhotos` et `photoDescription` avec ces valeurs (`useState(initialPhotos ?? [])`, etc.)
- Dans `handleFormatSelect` (ligne 94) : si `id === "carousel"` ET `initialPhotos?.length > 0` ET channel = instagram → pré-sélectionner `setCarouselSubMode("mix")` au lieu de `null`. Idem pour post photo : si format est "post" et initialPhotos présent, activer `setPhotoMode(true)` automatiquement.
- ATTENTION : la ligne 99 reset `setUploadedPhotos([])` au changement de format → modifier pour ne reset QUE si pas de `initialPhotos` ou si user a explicitement changé de format après le mount initial. Cleanest : supprimer le reset sur le 1er render quand `initialPhotos` est fourni (utiliser un ref `hasUserChangedFormat`).
- Comportement strictement identique si `initialPhotos` est `undefined`/vide.
- Passer `initialPhotos={uploadedPhotos}` et `initialPhotoDescription={photoDescription}` depuis `CreerUnifie` à `<CreerStepFormat>`.

---

### (b) Mes propositions d'amélioration — à valider individuellement

**Proposition 1 — Bandeau visuel "X photos déjà chargées" en haut de `CreerStepFormat`**
Quand `initialPhotos.length > 0`, afficher un petit bandeau en haut du composant : `📸 3 photos prêtes à être utilisées` avec un bouton discret "Modifier". Évite à l'utilisatrice de se demander si ses photos sont bien là quand elle est sur l'écran de choix de canal (avant même d'avoir cliqué sur carrousel/post photo). **Mon avis : OUI, gros gain UX pour ~20 lignes**.

**Proposition 2 — Persistance sessionStorage des photos uploadées en mode "Partir de photos"**
Le composant utilise déjà `useFormPersist` (ligne 170) pour `step/ideaText/objective/...`. Si l'utilisatrice quitte la page après avoir uploadé 5 photos, elles sont perdues au retour. Proposition : persister `uploadedPhotos` en sessionStorage (base64 ok jusqu'à ~5MB). **Mon avis : NON pour V1**, ça alourdit le storage et c'est hors périmètre clair (point hors scope "Persistance des photos"). À noter pour plus tard.

**Proposition 3 — Garde-fou au changement de format quand photos présentes**
Si user a uploadé via "Partir de photos" puis choisit un format incompatible (reel face cam, story, newsletter), aujourd'hui les photos sont silencieusement ignorées (et le reset ligne 99 les vide). Proposition : afficher un toast `"Tes 3 photos ne seront pas utilisées avec ce format"` au moment du changement. **Mon avis : NON pour V1**, c'est explicitement dans tes hors scope ("Messages d'avertissement si format choisi n'utilise pas les photos"). Je le mentionne pour mémoire.

**Proposition 4 — Pré-sélection du canal Instagram quand on arrive avec photos**
Quand `initialPhotos.length > 0` et qu'on arrive sur `CreerStepFormat`, pré-sélectionner `setSelectedChannel("instagram")` car c'est le canal qui gère le mieux les photos. **Mon avis : NON**, c'est dans tes hors scope ("Pré-sélection automatique d'un canal selon les photos") et l'utilisatrice peut vouloir LinkedIn carrousel mix. Laisser le choix.

**Proposition 5 — Préserver les photos dans `handleIdeaNext` (déjà inclus dans (a))**
À noter que cette modif a un effet de bord : si l'utilisatrice tape une idée texte SANS passer par "Partir de photos" mais qu'elle avait des photos d'une session précédente en state (cas rare), elles persistent. Mitigation : ne préserver que si on vient de l'étape photos (flag local). **Mon avis : pas nécessaire**, le state est reset à chaque mount complet de la page. Risque ~zéro.

---

### Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. Scénario 1 (flow texte classique) : strictement identique
3. Scénario 2 (Partir de photos → carrousel mix) : photos transmises bout en bout
4. Scénario 3 (retour arrière) : mode texte propre, photos vidées
5. Vérif : si user choisit reel/story après avoir uploadé via "Partir de photos", pas de crash (les photos sont juste ignorées en silence pour V1)

### Hors scope confirmé
- Photo-to-idea (analyse IA des photos)
- Persistance Storage / bibliothèque média
- Toast d'avertissement format incompatible
- Pré-sélection canal automatique
- Reels / stories / newsletter / LinkedIn hors carousel mix

### Question avant exec
**Proposition 1 (bandeau "X photos déjà chargées" dans CreerStepFormat)** — tu valides ? Les autres propositions sont écartées par défaut sauf si tu insistes.

