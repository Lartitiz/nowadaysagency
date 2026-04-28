# Sortir "Partir de zéro / Transformer" de toutes les étapes du flow

## Le problème

Aujourd'hui, les deux gros onglets "✨ Partir de zéro" et "🔄 Transformer un contenu existant" sont rendus **en permanence** en haut de la page de création (`CreerUnifie.tsx`, lignes 2225-2237), peu importe l'étape : sujet, format, questions, validation de structure, résultat, édition…

C'est inutile et risqué : une utilisatrice engagée dans un flow ne va pas changer de mode au milieu, et un clic accidentel ferait disparaître son brouillon. C'est aussi du bruit visuel constant sur toutes les étapes.

## Ce qu'on va faire

**Supprimer le système d'onglets et faire de "Transformer" une entrée parmi les autres**, uniquement visible sur l'écran de départ (étape `idea`), au même niveau que "Aide-moi à trouver une idée", "Surfer sur l'actu" et "Partir de photos".

### 1. Ajouter "Transformer un contenu" dans la rangée d'entrées de `CreerStepIdea`

Dans `src/components/creer/CreerStepIdea.tsx`, ajouter un 4e bouton ghost à côté des trois existants :

```
[Aide-moi à trouver une idée] [Surfer sur l'actu] [Partir de photos] [Transformer un contenu]
```

Au clic, il ouvre un **Sheet** (panneau latéral shadcn) qui rend `<CreerTransformTab />` tel quel — le composant est déjà autonome (52 lignes, gère lui-même son state interne avec recycle/crosspost/inspire).

### 2. Supprimer les onglets de `CreerUnifie.tsx`

- Supprimer le `<Tabs>` / `<TabsList>` / `<TabsTrigger>` lignes 2225-2237.
- Supprimer le `<TabsContent value="transform">` ligne 2510 (le rendu Transform passera par le Sheet).
- Garder le contenu de `<TabsContent value="create">` mais le sortir du wrapper Tabs — c'est désormais le seul rendu de la page.
- Supprimer le state `mode` / `setMode` (ligne 120) et le type `Mode` (ligne 82) — devenus inutiles.
- Garder `BrandingStatusBanner` à sa place actuelle (juste avant le contenu).

### 3. Préserver les liens legacy `?mode=transform`

3 routes redirigent encore vers `/creer?mode=transform` (`src/App.tsx` lignes 308, 317, 325 : `/instagram/inspirer`, `/transformer`, `/instagram/inspiration`).

Pour ne pas les casser : dans `CreerStepIdea`, lire `searchParams.get("mode")` au mount (via une nouvelle prop `autoOpenTransform?: boolean` passée par `CreerUnifie`), et ouvrir automatiquement le Sheet Transform si `mode === "transform"`. Nettoyer le param de l'URL après ouverture pour éviter qu'il se ré-ouvre au refresh.

## Hors-scope

- Pas de refonte de `CreerTransformTab` ni de ses sous-flows (recycle/crosspost/inspire) — on les réutilise tels quels.
- Pas de changement sur les autres entrées (coaching, newsjacking, photos).
- Pas de changement sur les étapes au-delà de `idea`.

## Détails techniques

**Fichiers modifiés** :

1. **`src/components/creer/CreerStepIdea.tsx`**
   - Ajouter prop `autoOpenTransform?: boolean`
   - Ajouter state `showTransform: boolean` (init avec `autoOpenTransform`)
   - Ajouter 4e bouton ghost "Transformer un contenu" avec icône `Sparkles` ou `Repeat` (lucide)
   - Wrapper `<Sheet>` shadcn contenant `<CreerTransformTab />`
   - Au mount : si `autoOpenTransform`, nettoyer `?mode=` de l'URL avec `window.history.replaceState`

2. **`src/pages/CreerUnifie.tsx`**
   - Supprimer import `Tabs/TabsContent/TabsList/TabsTrigger` s'ils ne sont plus utilisés ailleurs (vérifier ligne 2467 : `Tabs defaultValue="0"` pour le launch mode → on garde l'import si oui)
   - Supprimer state `mode`/`setMode`, type `Mode`, lecture `paramMode`
   - Remplacer le bloc Tabs (2225-2237 + 2241/2510) par le contenu direct de l'ancien `TabsContent value="create"`
   - Passer `autoOpenTransform={paramMode === "transform"}` à `<CreerStepIdea />`
   - Supprimer l'usage de `CreerTransformTab` directement dans la page

## Critères d'acceptation

- Sur l'étape `idea`, on voit 4 boutons ghost dont "Transformer un contenu". Clic → panneau latéral avec recycle/crosspost/inspire.
- Sur toutes les autres étapes (`format`, `questions`, `structure_review`, `result`, `edit`), aucun onglet en haut. Plus de bouton "Transformer" visible.
- Aller sur `/transformer` → atterrit sur l'étape `idea` avec le panneau Transform **déjà ouvert**.
- Aucun flow en cours n'est interrompu par un onglet parasite.
