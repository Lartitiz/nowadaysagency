# Plan — Carrousel photo : prompt de rédaction qui réagit à l'actu

## État réel du code (différent du plan initial)

Vérification du fichier `supabase/functions/carousel-ai/index.ts` :

1. **Le call site existe déjà** (ligne 252-253) :
   ```
   const photoPrompt = hasNews
     ? buildPhotoCarouselNewsReactionPrompt(body, isLinkedIn)
     : buildPhotoCarouselPrompt(body, isLinkedIn);
   ```

2. **La fonction `buildPhotoCarouselNewsReactionPrompt` existe déjà** (ligne 1733-1930), bien calquée sur la version mix, avec tous les garde-fous attendus : voix JE, hook sur l'actu, ≥1 fait précis cité, anti-fabrication, chaînage des overlays, quality_check enrichi.

3. **Bug de syntaxe à la fin de la fonction** (lignes 1928-1930) :
   ```
   1928:   }`;
   1929: }`;     ← LIGNE EN TROP : `}` + backtick + `;` parasites
   1930: }
   ```
   Cette ligne 1929 termine prématurément un template string inexistant et casse le parsing. La fonction est donc présente mais le fichier ne compile pas en l'état.

## Fichiers impactés

- `supabase/functions/carousel-ai/index.ts` — supprimer la ligne 1929 uniquement.

## Comportement attendu après fix

- `npx tsc --noEmit --skipLibCheck` passe sans erreur.
- Mode photo AVEC actu (`newsContext` non vide) → `buildPhotoCarouselNewsReactionPrompt` est utilisé, le carrousel s'ouvre sur l'actu, cite au moins un fait, photos = support visuel.
- Mode photo SANS actu → `buildPhotoCarouselPrompt` (inchangé) → comportement strictement identique à avant.

## Ce qui NE DOIT PAS bouger

- `buildPhotoCarouselPrompt`, `buildMixCarouselPrompt`, `buildMixCarouselNewsReactionPrompt` : aucun changement.
- Le contenu de `buildPhotoCarouselNewsReactionPrompt` lui-même : aucun changement de prompt (il est déjà conforme au plan d'origine). On corrige seulement la syntaxe.
- L'envoi des photos, `max_tokens` 8192, le correction pass, `logUsage "carousel_photo"` : inchangés.

## Critères de validation

- `npx tsc --noEmit --skipLibCheck` passe.
- Test manuel : actu (avec faits) → carrousel photo → slide 1 part de l'actu, ≥1 slide cite un fait, photos servent le propos.
- Régression : carrousel photo sans actu → identique à avant.

## Hors scope

- Mode texte, mode mix, structure_proposal (couvert ailleurs).
- handlePhotosNext reset (séparé).
- Toute réécriture du prompt déjà en place (il correspond déjà à la spec).