# Audit des co-occurrences — ajout de l'intention sur le Newsjacking

## Périmètre vérifié

| Co-occurrence | Statut | Détail |
|---|---|---|
| Autres appelants de `newsjacking-ai` | ✅ RAS | Un seul caller : `NewsjackingPanel.tsx`. Aucun edge function ne réinvoque cette fonction. |
| Autres consommateurs de `NewsjackingPanel` | ✅ RAS | Un seul : `CreerStepIdea.tsx` (ligne 211). Props (`onSelect`, `onClose`, `workspaceId`) inchangées. |
| Rétro-compat backend | ✅ OK | `body.intent` lu avec fallback `{}`. Anciens clients fonctionnent sans changement. |
| Double validation taille `custom` | ✅ OK | Frontend `slice(0, 200)` + backend `slice(0, 200)`. |
| `useCallback(fetchActus)` deps | ✅ OK | Ajout de `selectedVibes`/`customIntent` recrée la fonction à chaque toggle, mais elle n'est passée qu'à des `onClick` → pas de cascade de re-renders. |
| Format prompt Claude | ✅ OK | Saut de ligne supplémentaire entre `intentBlock` et `hotNewsBlock`, bénin pour le parsing. |
| Régression B1/B3/B4 (audit précédent) | ✅ OK | Pas d'auto-fetch, gate atomique sur `fetchAngles`, deps inchangées. |

## Bugs / dettes détectés

### 🟠 Bug UX 1 — "Relancer" verrouille l'intention

Après le premier search, le bloc chips + textarea n'est plus visible (gated par `!started && !loading` ligne 358). Si l'utilisatrice clique **Relancer** :
- la recherche repart avec **les mêmes vibes** qu'elle a choisis au départ ;
- elle ne peut **pas** changer son intention sans recharger la page ou fermer/rouvrir le panneau.

Silencieux et frustrant.

**Fix proposé** (au choix) :
- **A. Lecture + édition** : afficher au-dessus des résultats un petit récap "🎯 Intention : Scoop, Débat — modifier" qui rebascule l'UI éditable.
- **B. Reset complet** : le bouton "Relancer" remet `started=false` (retour à l'écran idle avec les vibes pré-cochées) au lieu de relancer directement.

Recommandation : **A**, plus fluide.

### 🟠 Bug UX 2 — Chip "Sur mon combat" mensongère

Le chip "🧭 Sur mon combat" est affiché **en dur**, même si l'utilisatrice n'a jamais rempli `brand_profile.combat_cause`. Backend, on tombe sur un fallback générique "engagement combat société" → l'IA cherche quelque chose, mais le label promettait "MON combat" et le résultat est hors-sol.

**Fix proposé** : soit
- **A.** Récupérer `combat_cause` côté frontend (rapide query supabase au montage) et masquer le chip si vide.
- **B.** Renommer le chip "🧭 Combat / cause de société" (libellé honnête, pas de masquage nécessaire).

Recommandation : **B** (zéro requête supplémentaire, label honnête).

### 🟡 Petit point — vibe "combat" seul

Si l'utilisatrice ne sélectionne **que** "combat" (axe mappé à `null`), `pickedAxes` repart sur du shuffle aléatoire (3 axes au hasard). Le combat n'oriente alors **que** la requête Perplexity + le bloc intention dans le prompt, pas la liste d'axes. C'est cohérent, mais à savoir pour le futur.

**Pas de fix nécessaire**, juste documenté ici.

### 🟡 Petit point — sélections >3 silencieusement bloquées

Côté frontend, les chips non sélectionnés deviennent `disabled` à partir de 3. Côté backend, on `slice(0, 3)` aussi. Cohérent, mais aucun feedback visuel "tu as atteint le max". Mineur.

**Pas de fix nécessaire.**

## Plan d'action proposé

Si tu valides, j'applique :
1. **Bug UX 1** → option A (récap éditable au-dessus des résultats).
2. **Bug UX 2** → option B (renommage du chip en "🧭 Combat / cause de société").

Reste 2 petits points en "documenté, pas de fix".

Tu veux que je code ces deux fixes, ou tu préfères trancher autrement ?
