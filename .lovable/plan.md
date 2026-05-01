
# Audit & refonte douce du parcours "Créer un contenu"

## Diagnostic

### Étape 1 — "Idée" (`CreerStepIdea`)
Aujourd'hui on présente, dans cet ordre vertical :
- un titre + sous-titre,
- un gros textarea,
- 4 boutons ghost à hiérarchie identique (`Aide-moi à trouver une idée`, `Surfer sur l'actu`, `Partir de photos`, `Transformer un contenu`),
- un bouton "Suivant" plein largeur.

Problèmes :
- Les 4 boutons sont des **points d'entrée alternatifs** (pas des aides au textarea), mais visuellement ils ressemblent à des liens secondaires. → On ne sait pas qu'ils ouvrent un parcours différent.
- L'utilisatrice qui *a déjà une idée* doit quand même les scanner pour s'assurer qu'elle ne rate rien.
- Aucune indication de *ce qui va se passer après* (pas de fil rouge "Idée → Format → Brief → Génération").

### Étape 2 — "Format" (`CreerStepFormat`)
La cascade actuelle est : **Canal → (sous-mode si LinkedIn/Pinterest) → Format → (sous-mode carrousel) → Toggle photo → Angle → Récap structure**.

Problèmes :
- Trop d'écrans intermédiaires conditionnels (jusqu'à 4-5 paliers) avant d'arriver au bouton "Suivant".
- Les "sous-modes" (LinkedIn texte/carrousel/mixte ; Pinterest texte/visuel/inspiration ; Carrousel texte/photo/mix) ressemblent visuellement aux choix de canal → on a l'impression de faire **3 fois le même choix**.
- Le bloc "Structure : X (5 étapes)" en bas est utile mais visuellement noyé.
- Le bouton "Suivant" est petit (`size="sm"`) et en bas, sans rappel de ce qu'on a choisi.
- Pas de récap visuel persistant ("Tu fais : Carrousel Instagram, angle storytelling").

### Transitions globales
- La barre de progression (4 segments) n'a pas de label → on ne sait pas où on est.
- Pas d'indication "il reste X étapes / ~Y minutes".

---

## Principes directeurs

1. **Un seul écran = une seule décision principale.** Tout le reste devient secondaire visuellement.
2. **Toujours montrer le fil rouge** (Idée → Format → Brief → Génération) en haut, avec l'étape courante nommée.
3. **Raccourcis pour les rapides, guidance pour les nouvelles**, *sans* mode adaptatif : on offre **la valeur par défaut la plus simple en gros**, et les options avancées en plus petit / repliées.
4. **Aucun changement de logique métier** : on garde tous les handlers (`handleIdeaNext`, `handleFormatNext`, sous-modes, photos, newsjacking, transform). On change uniquement la présentation et l'ordre d'apparition des contrôles.

---

## Changements proposés

### A. Header de parcours unifié (nouveau composant `CreerStepper`)
À afficher **dès l'étape 1** (pas seulement à partir de l'étape 2 comme aujourd'hui), au-dessus du contenu :

```text
[●]──[○]──[○]──[○]
Idée  Format Brief Résultat
```

- Étape courante en `primary`, étapes futures en `muted`, étapes passées en `primary/40` cliquables (retour).
- Sous le stepper : une ligne courte "Étape 1 sur 4 — Dis-moi ton idée".
- Reste sticky en haut du `max-w-2xl` (sans header global).

### B. Étape 1 — clarifier les points d'entrée (`CreerStepIdea`)

Refonte visuelle, **mêmes handlers**, même logique :

1. **Garder en évidence** : titre, textarea, bouton Suivant (CTA principal grand format avec icône).
2. **Regrouper les 3 alternatives** sous un bloc séparé visuellement (séparateur "ou pars d'autre chose"), en *cartes* compactes avec icône + libellé + 1 ligne de description, plutôt qu'en boutons ghost alignés :
   - `Camera` — "Partir de photos" — *J'ai des photos, on construit autour*
   - `Newspaper` — "Surfer sur l'actu" — *Réagir à une news fraîche*
   - `Repeat` — "Transformer un contenu" — *Recycler un post existant*
3. **Déplacer "Aide-moi à trouver une idée"** : devenir un petit lien d'aide *à l'intérieur* du textarea (placeholder + petit "💬 Pas d'idée ? Laisse-toi guider" sous le textarea, à droite). Ce n'est pas une voie alternative, c'est une assistance.
4. **Afficher le compteur de générations** (déjà là) en plus discret, à côté du stepper plutôt qu'au-dessus du titre.

Résultat attendu : on voit en 2 secondes "tape ton idée et clique Suivant", et les 3 voies alternatives sont *clairement* identifiées comme des entrées différentes.

### C. Étape 2 — réduire la cascade (`CreerStepFormat`)

Sans changer la data model, on regroupe l'écran en **2 zones visibles à la fois** :

1. **Zone "Où publier ?"** (toujours visible, en haut)
   - 4 vignettes canal (déjà là).
   - Une fois choisi → l'icône + label restent affichés en *chip* avec "✏ Changer", au lieu de disparaître/réapparaître.

2. **Zone "Quel format ?"** (apparaît sous la zone canal)
   - Affiche directement les formats du canal sélectionné (avec sous-modes traités comme des formats normaux dans la même grille). Aujourd'hui on a un écran intermédiaire pour LinkedIn et Pinterest → on le **fusionne** : pour LinkedIn, on montre directement [Post texte] [Carrousel texte] [Carrousel mixte] dans la grille format.
   - Pour Instagram-carrousel, garder les 3 sous-modes (texte / photo / mix) **dans la même grille**, avec un séparateur visuel "Carrousel — choisir le rendu".

3. **Zone "Détails"** (zone optionnelle apparaissant selon le format)
   - Toggle photo, upload, lien Pinterest, board → tous ici, repliés dans un panneau "Détails" si non requis, dépliés sinon.

4. **Zone "Angle éditorial"** : garder le bouton "L'outil choisit pour moi" très en évidence (déjà bien) ; le rendre **CTA primaire alternatif** au "Suivant" pour les pressées.

5. **Récap + CTA fixes en bas** :
   - Petit récap inline : "📸 Carrousel Instagram · Storytelling" (mis à jour live).
   - Bouton "Suivant" passe en `size="default"` plein largeur (cohérent avec étape 1).

### D. Micro-copy & feedback
- Titres d'étape uniformes : "Étape X — verbe à l'infinitif" (`Dis-moi ton idée`, `Choisis le format`, `Affine le brief`).
- Sous chaque CTA Suivant, indiquer ce qui se passe : *"Suivant — l'IA te posera 3 questions rapides"* / *"Générer maintenant"*.
- Bouton "Retour" toujours en haut à gauche du contenu (pas en bas), comme dans l'onboarding.

### E. Pas touché (volontairement, pour ne rien casser)
- `CreerStepQuestions`, `StructureReviewStep`, `CreerStepResult`, `CreerStepEdit` : intacts (utilisateur n'a pas signalé de friction là).
- Tous les handlers, hooks, persistance flow, URL params, demo mode : intacts.
- Logique conditionnelle (`carouselSubMode`, `photoMode`, `pinterestSubMode`…) : intacte, on ne change que l'arborescence visuelle d'apparition.

---

## Détails techniques

### Fichiers modifiés
- **`src/components/creer/CreerStepIdea.tsx`** : refonte du layout (cards alternatives, helper "Aide-moi" intégré au textarea).
- **`src/components/creer/CreerStepFormat.tsx`** : fusion des écrans intermédiaires LinkedIn/Pinterest dans la grille format ; persistant chip "canal sélectionné" ; récap live ; CTA Suivant agrandi.
- **`src/pages/CreerUnifie.tsx`** : remontée du stepper à l'étape "idea" + label d'étape ; déplacement du compteur de générations.
- **Nouveau** : `src/components/creer/CreerStepper.tsx` (composant présentation pure, props `currentStep`, `stepOrder`).

### Fichiers non touchés
- `CreerStepQuestions.tsx`, `CreerStepResult.tsx`, `CreerStepEdit.tsx`, `StructureReviewStep.tsx`, `PinterestInspirationStep.tsx`, `NewsjackingPanel.tsx`, `PhotoUploadZone.tsx`, `CreerTransformTab.tsx`, `ContentCoachingDialog.tsx`.
- Aucune modif des handlers ni du `stepOrder` dans `CreerUnifie.tsx`.
- Aucune modif côté backend / edge functions / DB.

### Risques de régression
- Faibles : on bouge de la présentation, pas de la logique. À vérifier visuellement après implémentation :
  - Démarrage avec params URL (`?format=carousel&sujet=...`) → sauter directement à l'étape 2 avec le bon canal pré-sélectionné.
  - Démarrage depuis le calendrier (`fromCalendar`).
  - Démo Auriana (force step + format + sub-mode).
  - Newsjacking → applique format suggéré.
  - Photo flow → préchargement de photos depuis l'étape 1 vers l'étape 2.

### Ordre d'exécution proposé
1. Créer `CreerStepper` + intégrer dans `CreerUnifie.tsx` à toutes les étapes (≈30 min, zéro risque).
2. Refondre `CreerStepIdea` (≈1 h).
3. Refondre `CreerStepFormat` — phase 1 : fusion des sous-modes LinkedIn/Pinterest dans la grille format + chip canal persistant (≈1,5 h).
4. Phase 2 : récap live + CTA agrandi + micro-copy "Suivant — …" (≈45 min).
5. QA manuel sur les 5 scénarios listés ci-dessus.

## Hors scope (à proposer plus tard si besoin)
- Refonte profonde du `StructureReviewStep` ou du parcours questions.
- Refonte de `CreerStepResult` (édition, exports).
- Mode adaptatif "débutante / experte" — explicitement exclu par toi.
