## Objectif

Les contenus Pinterest sauvegardés en idée étaient classés comme "post_instagram" (canal "instagram"). Les filtres LinkedIn, Newsletter et Pinterest étaient grisés "(V2)" dans l'Atelier alors que les idées correspondantes existent.

## Modifications

### 1. SaveToIdeasDialog.tsx

Extension STRICTEMENT ADDITIVE du type `contentType` et du mapping `handleSave`.

- Union du prop `contentType` : ajouter `"pinterest"` :
  ````text
  "story" | "reel" | "post_instagram" | "post_linkedin" | "newsletter" | "pinterest"
  ````
- Dans `handleSave` :
  - `contentEmoji` : `"📌"` pour `contentType === "pinterest"`
  - `formatLabel` : `"pinterest"` pour `contentType === "pinterest"` (ou conserver le prop `format` s'il est fourni, comme pour les posts)
  - `canalValue` : `"pinterest"` pour `contentType === "pinterest"`
- Les mappings existants (newsletter, story, reel, post_linkedin, post_instagram) restent identiques.
- Le shape d'insertion dans `saved_ideas` (user_id, workspace_id conditionnel, titre, angle, type, status, content_draft, content_data, source_module) est inchangé.
- Le pattern workspace (`workspaceId !== user.id ? workspaceId : undefined`) est inchangé.

### 2. CreerUnifie.tsx — mapFormatToContentType

- Ajouter avant le `return` final :
  ````text
  if (fmt === "pinterest" || fmt === "pinterest_visual" || fmt === "pinterest_photo") return "pinterest";
  ````
- Mettre à jour le type de retour de la fonction pour inclure `"pinterest"`.
- Les autres mappings (newsletter, story, reel, linkedin) restent identiques.
- `handleSave` de CreerUnifie (chemin carousel et ouverture du dialog) : inchangé.

### 3. IdeasPage.tsx — CANAL_OPTIONS

Remplacer la constante par :

````text
const CANAL_OPTIONS = [
  { id: "instagram", label: "📱 Instagram", enabled: true },
  { id: "linkedin",   label: "💼 LinkedIn",   enabled: true },
  { id: "newsletter", label: "✉️ Newsletter", enabled: true },
  { id: "pinterest",  label: "📌 Pinterest",  enabled: true },
];
````

La logique d'affichage des FilterChips ("(V2)" si `!enabled`) reste en place telle quelle — elle ne s'affichera simplement plus.

Les éléments suivants sont INTACTS :
- Logique de filtrage (`canalFilter`), tri, constantes `TYPE_OPTIONS`/`OBJECTIF_OPTIONS`
- Mapping des `content_briefs` (ligne ~128)
- Tout le reste de IdeasPage

## Améliorations connexes identifiées

Aucune. Le mapping des `content_briefs` (ligne ~128) souffre du même défaut pour Pinterest, mais il est explicitement hors scope / intouché dans ce plan.

## Validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur
- Générer une épingle Pinterest → "Sauvegarder en idée" → l'idée apparaît dans Mes idées avec 📌 et canal `pinterest`, filtrable via le chip Pinterest
- Les chips LinkedIn / Newsletter / Pinterest sont cliquables et filtrent correctement
- Sauvegarder une idée depuis une autre page (ex. générateur LinkedIn) → comportement strictement identique à avant
- Aucun consommateur de `SaveToIdeasDialog` parmi les 14 fichiers existants ne nécessite de modification (changement purement additif du type)