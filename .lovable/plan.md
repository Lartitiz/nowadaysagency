## Diagnostic

### Trace réelle (logs réseau du 13:34)

1. `POST creative-flow { step:"questions", contentType:"linkedin_post" }` → questions textuelles MDB
2. `POST creative-flow { step:"generate", contentType:"post_linkedin" }` → post LinkedIn classique généré

→ Côté backend : c'est bien un **post LinkedIn classique** qui a été demandé, pas un carousel mix. Aucun champ `carouselType`, `photos`, `slides` n'a été envoyé.

→ Côté front : `selectedFormat === "linkedin"` (pas `"carousel"`), sinon le hook `generateQuestions` aurait routé vers `carousel-ai` (use-content-generator.ts ligne 468).

### Cause : bug d'état dans CreerStepFormat.tsx

Quand on clique sur **"Carrousel mixte" LinkedIn** (ligne 350), trois `setState` sont enchaînés :

```ts
setLinkedinSubMode("carousel");
setCarouselSubMode("mix");      // ← (A)
handleFormatSelect("carousel"); // ← appelle setCarouselSubMode(null) ligne 146
```

React batch ces updates. Le `setCarouselSubMode(null)` à l'intérieur de `handleFormatSelect` **écrase** le `setCarouselSubMode("mix")` de l'étape (A). Résultat :
- `selectedFormat = "carousel"` ✓
- `carouselSubMode = null` ❌ (au lieu de `"mix"`)
- `uploadedPhotos = []` (réinitialisé ligne 147)
- `photoDescription = ""` (réinitialisé ligne 148)

Le panneau "Quel type de carrousel ?" (lignes 540-585) réapparaît alors **sans présélection**, et la zone d'upload photos disparaît. L'utilisateur doit re-cliquer "Mixte" et re-uploader ses photos.

### Pourquoi ça finit en "Post texte LinkedIn"

Hypothèse forte : l'utilisateur, voyant le panneau se réinitialiser, a soit :
- cliqué sur **"Post texte"** (premier bouton, ligne 334) en pensant que c'est ce qu'il fallait, soit
- simplement utilisé le retour arrière et reselectionné un format différent.

Le bouton "Post texte" est le premier de la grille, juste à gauche de "Carrousel mixte" — la confusion visuelle est plausible quand la sélection précédente a "disparu".

### Bugs annexes identifiés

1. **`linkedinSubMode` jamais lu après initialisation** — l'état est défini mais aucun rendu ne s'en sert. Code mort qui complique la lecture.
2. **Pas de feedback visuel** que la sélection LinkedIn → Carrousel mixte a été partiellement perdue. L'utilisateur ne reçoit aucun toast ni rien.
3. **Validation muette ligne 242** : si `carouselSubMode === null` quand `selectedFormat === "carousel"`, le guard photo n'est pas déclenché et le bouton Suivant active le flow texte par défaut (fallback ligne 259). Pas d'erreur, pas d'avertissement.
4. **Photos perdues** dans `handleFormatSelect` quand on rentre via le tile LinkedIn : ligne 147 vide `uploadedPhotos` même si l'intention est "mixte" qui en a besoin.

## Solution

### 1. Corriger l'écrasement de `carouselSubMode` (bug principal)

Dans `src/components/creer/CreerStepFormat.tsx`, ajouter à `handleFormatSelect` un paramètre optionnel pour préserver le sous-mode souhaité :

```ts
const handleFormatSelect = (id: string, opts?: { keepCarouselSubMode?: "text" | "photo" | "mix" }) => {
  // ...
  } else {
    setCarouselSubMode(opts?.keepCarouselSubMode ?? null);
    setUploadedPhotos([]);
    setPhotoDescription("");
    // ...
  }
};
```

Puis, dans les boutons LinkedIn (lignes 342, 350) :
```ts
onClick={() => { setLinkedinSubMode("carousel"); handleFormatSelect("carousel", { keepCarouselSubMode: "text" }); }}
onClick={() => { setLinkedinSubMode("carousel"); handleFormatSelect("carousel", { keepCarouselSubMode: "mix" }); }}
```

(et supprimer les `setCarouselSubMode(...)` redondants avant `handleFormatSelect`).

### 2. Sécuriser la validation `handleNext`

Ajouter un guard explicite : si `selectedFormat === "carousel"` et `carouselSubMode === null`, **bloquer** avec un message clair plutôt que tomber silencieusement sur `"text"`.

```ts
if (selectedFormat === "carousel" && !carouselSubMode) {
  toast.error("Choisis le type de carrousel (Texte, Photo ou Mixte) avant de continuer.");
  return;
}
```

(Optionnel : forcer le scroll vers le panneau sub-mode.)

### 3. Nettoyer `linkedinSubMode` mort

Soit l'utiliser pour pré-sélectionner visuellement la bonne tuile au retour, soit le supprimer. Plus simple : le supprimer puisqu'il n'apporte rien.

### 4. Préserver l'intention "Mixte" au retour arrière

Si l'utilisateur a déjà uploadé des photos pour un carrousel mixte LinkedIn et revient à l'étape format, ne pas wiper `uploadedPhotos` quand il re-clique sur le tile carrousel mixte (déjà géré pour `initialPhotos` mais pas pour la session courante).

## Hors-scope

- Refonte du `CreerStepFormat` en wizard à 2 étapes (canal puis format).
- Tests automatisés du flow complet — à envisager après les corrections.

## Fichiers à modifier

- `src/components/creer/CreerStepFormat.tsx` — fix principal + cleanup `linkedinSubMode` + guard validation.
