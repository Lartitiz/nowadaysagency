## Diagnostic

L'edge function `creative-flow` **ne démarre plus du tout**. Les logs montrent :

```
worker boot error: Uncaught SyntaxError: Identifier 'photoContent' has already been declared
    at supabase/functions/creative-flow/index.ts:1262:13
```

Conséquence directe : **aucun appel à `creative-flow` n'aboutit** (ni les questions, ni la génération). Quand tu uploades 4 photos pour un post LinkedIn, le hook `use-content-generator` appelle `creative-flow` avec `step: "questions"` → la fonction ne boot pas → le frontend reçoit une erreur ou un timeout et l'écran questions reste vide.

### Cause racine

`supabase/functions/creative-flow/index.ts:1265-1266` :

```ts
const photoContent: any[] = [];
const photoContent: any[] = [];   // ← doublon introduit lors d'un précédent edit
```

Deux `const` avec le même nom dans le même scope → erreur de compilation Deno → boot impossible.

C'est un effet collatéral d'un edit antérieur (insertion du bloc "RÈGLES CRITIQUES" pour LinkedIn photo) qui a dupliqué la ligne au lieu de la conserver une seule fois.

### Pourquoi le flow lui-même est sain

Le reste de la chaîne photo→LinkedIn fonctionne logiquement :

- `CreerUnifie.tsx:652` rejoue bien `uploadedPhotos` si `photos` est vide.
- `use-content-generator.ts:541` force `photoModeCF = true` dès qu'il y a des photos ET que `format === "linkedin"`, donc le `photoMode` reset à `false` dans `handlePhotosNext` n'est PAS bloquant.
- `creative-flow:1217` détecte bien la branche vision-questions (`photo_mode && photos[0].base64`).

**Le seul vrai blocage est le `SyntaxError`.** Une fois corrigé, les questions doivent se régénérer normalement.

## Correction

### Étape 1 — Supprimer la ligne dupliquée

Dans `supabase/functions/creative-flow/index.ts`, lignes 1265-1266, remplacer :

```ts
const photoContent: any[] = [];
const photoContent: any[] = [];
```

par :

```ts
const photoContent: any[] = [];
```

C'est la seule modification fonctionnelle nécessaire.

### Étape 2 — Vérification post-fix

1. Attendre le redéploiement automatique de `creative-flow`.
2. Vérifier dans les logs qu'il n'y a plus de `BootFailure` et qu'on voit un `Listening on http://localhost:9999/`.
3. Re-tester : uploader 4 photos → choisir post LinkedIn → l'écran questions doit afficher 3-5 questions ancrées sur ce qui est visible sur les photos.

## Ce qu'on ne touche pas

- Pas de refonte du flow `photoMode` dans `CreerUnifie.tsx` / `CreerStepFormat.tsx` (le hook compense déjà via `format === "linkedin"`).
- Pas de modification de la branche vision (`creative-flow:1217-1254`) ni des prompts.
- Pas de changement de `contentType` (`"linkedin_post"` vs `"post_linkedin"` : `formatHint` couvre déjà le cas, non lié au bug actuel).

## Suites possibles (à valider après correction)

Si après le fix, certaines questions restent génériques ou descriptives, on pourra :
- ajouter un log explicite côté hook quand `photoModeCF` est `false` malgré des photos présentes,
- afficher un toast frontend si `creative-flow` renvoie une erreur (aujourd'hui silencieux dans certains chemins).

Mais ces points sont à traiter UNIQUEMENT si le simple fix du `SyntaxError` ne suffit pas.
