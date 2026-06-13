# Plan — Carrousel photo : intégrer le contexte actu dans la proposition de structure

## Contexte métier

Quand on génère un carrousel PHOTO en partant d'une actu (newsjacking), l'étape `structure_proposal` définit le squelette narratif des slides AVANT toute rédaction. Le code actuel injecte déjà le bloc `newsContextBlock` complet dans `structureSystemPrompt`, mais ce bloc contient des consignes de rédaction finale (ANTI_FABRICATED_STORYTELLING, interdictions de fabrication de chiffres, etc.) qui n'ont pas leur place dans une étape d'architecture. Le résultat est un prompt surchargé et des structures qui peinent à ancrer réellement la slide 1 sur l'actu.

Objectif : que la structure proposée soit pensée "article + photos", pas "photos seules", avec un bloc actu propre et condensé pour l'étape structure.

## Fichiers impactés

- `supabase/functions/carousel-ai/index.ts` — uniquement le bloc `type === "structure_proposal"`

## Comportement attendu

1. **Créer un bloc actu condensé pour structure_proposal**

   Quand `newsContext` est présent et non vide, construire `structureNewsContextBlockCondensed` contenant uniquement :
   - L'en-tête `CONTEXTE ACTUALITÉ (NEWSJACKING)`
   - Le texte brut de l'actu (`newsContext.trim()`)
   - Une consigne structure courte (3-4 lignes) : la slide 1 (hook) DOIT partir de l'actu ; au moins une slide de corps exploite un fait précis ; les photos illustrent le propos.

   Ne PAS réutiliser le `newsContextBlock` global (lourd, orienté rédaction finale).

2. **Injection dans `structureSystemPrompt`**

   - Insérer `structureNewsContextBlockCondensed` dans `structureSystemPrompt`, juste après le bloc `CONTEXTE BRANDING` et avant la consigne JSON.
   - Si `newsContext` est absent, ce bloc est une chaîne vide — le prompt reste strictement identique à aujourd'hui.

3. **Rappel dans `structureUserPrompt`**

   Conserver (ou ajuster si absent) la ligne rappelant l'actu de référence dans `structureUserPrompt`, pour que le modèle garde l'actualité en tête au milieu de l'analyse photo.

## Ce qui NE DOIT PAS bouger

- Le comportement `structure_proposal` SANS `newsContext` : strictement identique (l'injection est conditionnée).
- `photoInstruction`, `slideTarget`, `SLIDE_TITLE_RULES`, la structure JSON de sortie (`narrative_thread`, `story_beat`, `visual_anchor`, `photo_index`…) : aucun changement.
- L'analyse des photos (`pushPhotoWithContext`, ordre des photos) : inchangée.
- Les autres branches (`mix`, `photo express_full`, `hooks`, `slides`, `suggest_topics`, etc.) : ne pas toucher.
- `max_tokens` de `structure_proposal` (3000) : garder.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe sans erreur.
- Test manuel : actu + carrousel photo → la structure proposée (écran `structure_review`) montre une slide 1 ancrée sur l'actu et au moins une slide de corps liée à l'article, pas seulement une description des photos.
- Régression : carrousel photo SANS actu → structure identique à avant.

## Proposition d'amélioration (optionnel, à valider séparément)

- Réduire le `max_tokens` de 3000 à 2500 pour structure_proposal si le prompt allégé libère de la marge sans risque de troncation. Non appliqué par défaut.

## Hors scope (plans séparés)

- Le prompt de rédaction finale du mode photo (`buildPhotoCarouselNewsReactionPrompt`) — plan C.
- Mode mix (a déjà son prompt news).