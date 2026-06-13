## Contexte

`buildMixCarouselNewsReactionPrompt` (mix en réaction à une actu) est le dernier des 4 prompts carrousel qui n'a pas le chaînage narratif. Son bloc actuel (lignes 2355-2358) contient encore le "Test slide-seule" qui contredit explicitement le récit continu adopté par les 3 autres modes.

## Fichier impacté

`supabase/functions/carousel-ai/index.ts` — uniquement la fonction `buildMixCarouselNewsReactionPrompt`, lignes 2355-2358.

## Changement

Remplacer le bloc actuel :

```
${structureConstraint}═══ INTERDICTION CASCADE / ESCALIER ═══
- Pas d'ouvertures par "En vrai", "Et là", "Sauf que"...
- Pas de rampe émotionnelle artificielle...
- Test slide-seule : chaque text_only doit pouvoir être lue hors contexte...
```

par les **deux blocs** déjà validés dans `buildMixCarouselPrompt` (lignes 2095-2120), transposés tels quels :

1. `═══ CHAÎNAGE NARRATIF DES OVERLAYS — RÈGLE ABSOLUE ═══` — récit continu, connecteurs / reprise lexicale sur photo_full à partir de la slide 2, ouverture-développement-tension sur text_only, test de permutation.
2. `═══ INTERDICTION CASCADE / ESCALIER (CRITIQUE) ═══` — distinction cascade vs continuité, test de progression, connecteurs autorisés si contenu neuf, pas de répétition du mot-clé central, pas de rampe émotionnelle, anti-TU (JE).

`${structureConstraint}` reste placé juste avant ces deux blocs, dans le même ordre qu'aujourd'hui.

## Adaptation au registre "actualité"

Le bloc standard parle d'"expérience partagée" pour le JE. En contexte newsjacking le JE reste la voix principale mais peut porter une **analyse / lecture de l'actu**, pas seulement un vécu. Ajustement minimal : reformuler la ligne Anti-TU en "voix principale = JE (expérience ou analyse partagée)" — le reste des deux blocs est neutre vis-à-vis du registre et se transpose à l'identique.

## Ce qui ne bouge pas

- `buildMixCarouselPrompt`, `buildPhotoCarouselPrompt`, `buildPhotoCarouselNewsReactionPrompt` : aucune modification.
- Dans `buildMixCarouselNewsReactionPrompt` : tout le reste — `confirmedStructureBlock`, channel LinkedIn, bloc COMPOSITION (50% photos, slide 1 photo_full, alternance), `structureConstraint`, `SLIDE_TITLE_RULES`, assignation photos, bloc news_context, légende, schéma JSON de sortie, VÉRIFICATION FINALE actuelle.
- Routage, quota, workspace, correction pass, choix du modèle, frontend.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe.
- `rg "Test slide-seule" supabase/functions/carousel-ai/index.ts` ne retourne plus rien.
- `rg "CHAÎNAGE NARRATIF DES OVERLAYS" supabase/functions/carousel-ai/index.ts` retourne désormais 2 occurrences (mix standard + mix-news).
- Test manuel : carrousel mix en mode newsjacking → overlays se lisent à la suite, plus d'îlots autonomes.

## Propositions connexes (optionnel, à valider séparément — hors exec)

- (b) Ajouter dans la VÉRIFICATION FINALE du mix-news les 2 points de contrôle "récit continu" + "test de permutation" déjà présents dans la checklist du mix standard. Pertinent pour cohérence des 4 modes — mais hors scope tant que tu ne valides pas. ok

## Hors scope

- Harmonisation des fourchettes de longueur d'overlay (5-15 / 5-20 / 5-25 mots) à travers tous les prompts.