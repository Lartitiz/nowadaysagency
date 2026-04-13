

## Plan : Bouton démo pré-générée pour Auriana (MDB)

### Concept
Ajouter un bouton "🎬 Lancer la démo" sur le dashboard, visible **uniquement** pour `auriana.demo@nowadaysagency.com`. Ce bouton pré-charge le flow de création avec un carrousel MDB déjà généré dans le `sessionStorage`, puis navigue vers `/creer`. L'utilisatrice peut ensuite parcourir toutes les étapes (Instagram → Carousel → questions → résultat) sans aucun appel IA — tout est déjà en mémoire.

### Fichiers

**1. `src/lib/demo-auriana-data.ts`** (nouveau)
- Exporte `AURIANA_DEMO_FLOW` contenant :
  - `subject` : "La pré-commercialisation en MDB : je vends avant d'acheter"
  - `format` : "carousel", `carouselSubMode` : "text"
  - `objective` : "visibilite"
  - `editorialAngle` : "decryptage"
  - `questions` + `answers` pré-remplis (3 questions type)
  - `result` : le carrousel 8 slides (hook MDB, développement, mécanisme, preuve, interprétation, méthode, CTA) copié depuis le contenu actuellement affiché
  - `chosenAngle` avec title + description
- Exporte `AURIANA_DEMO_EMAILS` (réutilise la liste existante de `onboarding-variants.ts`)

**2. `src/pages/Dashboard.tsx`** (~15 lignes)
- Importer `AURIANA_DEMO_FLOW`, `AURIANA_DEMO_EMAILS` et `saveFlowState`
- Détecter si `session.user.email` est dans `AURIANA_DEMO_EMAILS`
- Si oui, afficher un bouton "🎬 Lancer la démo carrousel" dans la section hero (sous les boutons existants Post/Carousel/Reel)
- `onClick` : appelle `saveFlowState(AURIANA_DEMO_FLOW)` puis `navigate("/creer")`

**3. `src/pages/CreerUnifie.tsx`** (~5 lignes)
- Dans `doGenerate`, ajouter une détection : si l'email est Auriana ET le sujet correspond au pré-fill → utiliser `AURIANA_DEMO_FLOW.result` directement (même pattern que le `isDemoMode` existant pour Léa, mais basé sur l'email au lieu du flag demo)
- Pareil dans `handleFormatNext` pour le cas où l'utilisatrice passe vite les étapes

### Comportement utilisateur
1. Auriana arrive sur le dashboard → voit le bouton "🎬 Lancer la démo"
2. Clic → redirigée vers `/creer` avec le sujet, format, questions déjà chargés
3. Elle peut naviguer étape par étape : voir le format Instagram/Carousel sélectionné, les questions pré-remplies, puis le résultat final
4. Aucun appel IA, tout est instantané
5. Les autres comptes ne voient rien de différent

### Ce qu'on ne touche pas
- Le mode démo statique (Léa)
- `use-flow-persistence.ts`
- Les edge functions

