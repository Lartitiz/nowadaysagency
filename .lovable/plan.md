## Résumé
Modifier deux blocs de prompt textuel dans `supabase/functions/carousel-visual/index.ts` pour corriger l'équilibre vertical des slides à schéma et uniformiser la hauteur des cartes sœurs.

## Fichier concerné
- `supabase/functions/carousel-visual/index.ts` (uniquement du texte de prompt, zéro logique TS)

## Changements

### 1. Bloc "IMPORTANT pour les schémas" (ligne ~158-164)

Remplacer la ligne :
```
- Les schémas doivent être CENTRÉS verticalement dans la slide
```

Par ces trois règles :
```
- COMPOSITION VERTICALE : la slide est une colonne flex pleine hauteur (display:flex;flex-direction:column;height:1350px). Le bloc titre+intro est en haut, le schéma occupe l'espace restant, centré dedans (wrapper avec flex:1;display:flex;flex-direction:column;justify-content:center). Résultat attendu : l'espace au-dessus du schéma ≈ l'espace en dessous, et JAMAIS plus de ~200px de vide sous le dernier élément de la slide.
- Si le contenu est court (intro brève + petit schéma), AUGMENTE les tailles : padding des cartes, font-size du schéma, gaps — plutôt que de laisser du vide.
- CARTES SŒURS = MÊME HAUTEUR : dans un schéma à cartes multiples (timeline, story_arc, process_visible, comparison…), toutes les cartes d'une même rangée ont la MÊME hauteur (le conteneur flex utilise align-items:stretch, jamais center ou flex-start) et le MÊME alignement vertical de leur contenu interne.
```

Les autres lignes du bloc (couleurs charte, titre au-dessus, respiration, priorité du schéma, interdiction des cercles) restent inchangées.

### 2. Bloc "AUTO-CHECK AVANT DE RETOURNER" (ligne ~926-934)

Ajouter deux points numérotés après le point 5 existant :
```
6. Aucune slide n'a plus de ~200px de vide sous son dernier élément (équilibre vertical).
7. Les cartes sœurs d'un même schéma ont toutes la même hauteur.
```

Le texte suivant ("Si un défaut est détecté...") reste inchangé.

## Hors scope (NE PAS TOUCHER)
- Les 15 templates HTML des schémas (structures, annotations data-pptx-editable, data-pptx-shape)
- Les blocs ANNOTATIONS, SHAPES STRUCTURELS, FORMAT DE RÉPONSE
- Les trois modes de prompt (standard / photo / mixte)
- Toute la logique TypeScript (post-processing photos, Google Fonts, appels API, quota, rate limiting)

## Validation
- `npx tsc --noEmit --skipLibCheck` doit passer (attention aux backticks et ${} échappés dans les template literals)
- Test manuel : générer un carrousel avec ≥2 slides à schéma (timeline, checklist ou process_visible) et vérifier que le tiers inférieur n'est plus vide, que les cartes sœurs ont la même hauteur, et que les slides photo/texte sans schéma sont inchangées.