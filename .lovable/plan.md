# Carrousels mixtes : fixer le downgrade silencieux + le cas coaching

## Le vrai problème

Quand on entre dans la création par le **coaching**, le flow saute directement de "coaching" → "questions" (cf. `handleCoachingSelect` ligne 436 de `CreerUnifie.tsx` : commentaire `"Coaching dialog already handles sub-mode choice"`). Sauf que le dialog de coaching **ne propose jamais d'uploader de photos** — il ne fait que choisir un sujet, un format et un objectif.

Résultat : `uploadedPhotos = []` à la génération. Si l'IA renvoie quand même `carousel_type: "mix"` (parce que le sujet s'y prête), le frontend détecte `hasActualPhotos = false` et bascule **silencieusement** en `text` (ligne 1851). L'utilisatrice ne comprend pas pourquoi son carrousel mixte est devenu un carrousel texte.

## Ce qu'on va faire

### 1. Détecter et proposer un retour (cas coaching et tous les autres)

Dans `CreerUnifie.tsx`, au moment où le visuel est sur le point d'être généré :

- Si `rawCarouselType ∈ {"photo", "mix"}` **et** `hasActualPhotos === false`, **ne pas downgrader silencieusement**.
- Ouvrir un `AlertDialog` clair avec trois choix :
  1. **"Ajouter des photos"** → ramène à l'étape `format` (upload zone visible) avec le sujet/angle/réponses préservés
  2. **"Continuer en carrousel texte"** → bascule explicite vers `text`, avec toast confirmant le choix
  3. **"Annuler"** → ferme la modale, ne fait rien

### 2. Préserver le contexte au retour à l'étape format

Quand l'utilisatrice clique "Ajouter des photos", on doit **conserver** : `ideaText`, `objective`, `editorialAngle`, `answers`, `selectedFormat`, `carouselSubMode` (forcer à `mix`). Seul `step` change pour `format`. Comme ça elle reprend exactement où elle en est, juste pour uploader.

### 3. Rendre le downgrade traceable

- Ajouter un toast d'information **systématique** quand un downgrade se produit (même si l'utilisatrice a choisi "Continuer en texte") : `"Carrousel généré en mode texte (aucune photo disponible)"`.
- Ajouter dans le payload de génération un champ `downgrade_reason` (`"no_photos_at_generation"` / `"user_chose_text"`) pour distinguer les deux cas dans les logs edge.

### 4. (Bonus minimal) Snapshot photos persistant

Petit `useEffect` qui synchronise `uploadedPhotos` → `generatedWithPhotos` dès qu'il y a des photos. Évite la perte en cas de re-render entre l'upload et la génération. C'est défensif mais peu coûteux.

## Hors-scope (volontairement)

- **Pas d'ajout d'un step "photos" dans le dialog de coaching.** Tu as choisi "détecter et proposer un retour" → on garde le coaching focalisé sur le sujet/format/objectif et on délègue les photos à l'étape `format` existante, qui est déjà conçue pour ça.
- Pas de refonte de `CoachingFlow.tsx`.
- Pas de changement côté edge functions (`carousel-visual`, etc.).

## Détails techniques

**Fichier principal** : `src/pages/CreerUnifie.tsx`

- Nouveau state : `const [photoMissingDialog, setPhotoMissingDialog] = useState<{ open: boolean; rawType: string | null }>({ open: false, rawType: null })`
- Au début de `handleGenerate` (ou équivalent visuel), remplacer le calcul direct de `effectiveCarouselType` par :
  ```ts
  if ((rawCarouselType === "photo" || rawCarouselType === "mix") && !hasActualPhotos) {
    setPhotoMissingDialog({ open: true, rawType: rawCarouselType });
    return; // arrêter, attendre la décision utilisateur
  }
  ```
- Trois handlers : `onAddPhotos` (→ `setStep("format")`), `onContinueAsText` (→ relance la génération avec `effectiveCarouselType = "text"` + toast), `onCancel`.

**Composant UI** : un `AlertDialog` shadcn déjà disponible, pas de nouvelle dépendance.

**Logging** : ajouter `downgrade_reason` au log diagnostic (déjà présent ligne ~1860).

## Critères d'acceptation

- Entrer par le coaching, choisir un sujet "carrousel" → générer → si l'IA renvoie `mix` sans photos, **un dialog s'affiche** au lieu d'un carrousel texte muet.
- Cliquer "Ajouter des photos" → on retombe sur l'étape `format` avec le sujet/angle/réponses **intacts** et la zone d'upload visible.
- Cliquer "Continuer en texte" → carrousel texte généré + **toast explicite**.
- Aucun downgrade silencieux ne subsiste dans les logs (chaque cas a un `downgrade_reason`).
