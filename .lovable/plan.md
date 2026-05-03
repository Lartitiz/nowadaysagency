# Audit — pourquoi un carrousel texte alors que tu avais mis des photos

## Diagnostic

Tu étais sur le **compte démo Auriana** (sujet « la découpe d'immeuble crée de la valeur » = `AURIANA_DEMO_SUBJECT`). Ce compte fonctionne en **mode démo verrouillé** : tout le flow est court-circuité pour servir instantanément un résultat pré-construit, défini dans `src/lib/demo-auriana-data.ts` :

```ts
selectedFormat: "carousel",
carouselSubMode: "text" as const,   // ← verrouillé
```

Conséquences observées dans `src/pages/CreerUnifie.tsx` :

1. **Le sous-mode est forcé à "text"** dès le chargement, peu importe ce que tu cliques (mix / photo).
2. **Les questions sont remplacées** par `AURIANA_DEMO_FLOW.questions` (ligne 629) → tes vraies réponses ne servent à rien.
3. **`doGenerate` court-circuite l'IA** (ligne 709) : il sert directement `AURIANA_DEMO_FLOW.result`, qui est un **carrousel texte pré-écrit** (les 7 slides "découpe d'immeuble" que tu as vues).
4. **Tes photos uploadées (`uploadedPhotos`) ne sont jamais lues** dans cette branche : pas d'appel à `carousel-ai` en mode `mix`/`photo`, pas de génération de visuels à partir de tes images.

Donc le bug n'est pas dans le pipeline carrousel mixte (qui fonctionne en dehors de la démo) : c'est le **bypass démo qui ignore ton choix** dès qu'on est sur le sujet Auriana pré-rempli.

Bonus repéré (à corriger en passant) : `CreerStepFormat` envoie bien `carouselSubMode = "mix"` au parent, mais `CreerUnifie` ligne 2315 contient un fallback douteux : `sub || (linkedinCar ? "text" : undefined)`. Ça ne pose pas problème ici (tu avais bien cliqué "mix"), mais c'est un piège pour LinkedIn carrousel sans sous-mode explicite.

## Correctif proposé

Objectif : **respecter le choix de l'utilisateur·rice** dès qu'il s'écarte du scénario pré-écrit, même en démo Auriana. La démo doit rester instantanée *uniquement* quand on suit exactement le script (carrousel texte, sans photos).

### Changements dans `src/pages/CreerUnifie.tsx`

1. **Sortir du bypass démo dès qu'il y a divergence**. Dans `handleFormatNext`, `doGenerate` et la branche questions, remplacer `if (aurianaDemoActive)` par :
   ```ts
   const isAurianaScript =
     aurianaDemoActive
     && ideaText === AURIANA_DEMO_SUBJECT
     && carouselSubMode === "text"
     && uploadedPhotos.length === 0;
   if (isAurianaScript) { /* bypass pré-construit */ }
   ```
   → si tu cliques "Carrousel mixte" ou si tu charges des photos, le flow normal reprend (vraie génération IA via `carousel-ai`, en mode `mix` ou `photo`).

2. **Idem pour les questions** (ligne 628) : ne préremplir `AURIANA_DEMO_FLOW.questions` que si `isAurianaScript`.

3. **Idem pour les visuels démo** (ligne 1878) : ne charger les slides pré-construits que dans le scénario script.

4. **Bonus — corriger le fallback LinkedIn** ligne 2315 :
   ```ts
   carouselSubMode: sub  // pas de fallback "text" silencieux
   ```
   Le guard ligne 249 de `CreerStepFormat` empêche déjà de continuer sans sous-mode, donc ce fallback est mort.

### Test de non-régression

- Compte Auriana, sujet par défaut, cliquer "Carrousel texte" → résultat pré-construit instantané (comportement actuel préservé).
- Compte Auriana, sujet par défaut, cliquer "Carrousel mixte" + uploader des photos → vraie génération IA `carousel-ai` en mode `mix`, avec analyse visuelle des photos.
- Compte Auriana, modifier le sujet → vraie génération IA (déjà OK, mais on confirme).

## Hors-scope

- On ne touche pas à `src/lib/demo-auriana-data.ts` : le contenu pré-construit reste dispo pour le pitch.
- On ne change pas la pipeline `carousel-ai` ni les prompts IA.
