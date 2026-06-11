## Problème

En mode "Carrousel full photo", avec 2 photos (typique avant/après) :
1. L'IA force 7-8 slides peu importe le nombre de photos.
2. Les photos sont réparties de façon arbitraire ("photo 1 / photo 2 / photo 1 / photo 2…").
3. Les `overlay_text` de chaque slide ne s'enchaînent pas — chaque phrase vit pour elle-même, sans continuité narrative.

L'utilisateur accepte qu'une même photo serve plusieurs slides, à condition que **le texte raconte une histoire continue de slide à slide**.

## Changements (1 fichier : `supabase/functions/carousel-ai/index.ts`)

### 1. Structure step — adapter la cible de slides au nombre de photos (lignes 317-321)

Réécrire `photoInstruction` pour le mode PHOTO :
- 1 photo → cible **4-6 slides**, même photo sur toutes les slides, justifier la répétition par le récit.
- 2 photos → cible **5-7 slides**. Privilégier une logique narrative type **avant → bascule → après** (la photo "avant" peut occuper plusieurs slides successives, idem pour "après", avec une slide pivot au milieu). **Interdire** l'alternance mécanique 1/2/1/2 sans justification narrative.
- 3-4 photos → cible **6-8 slides**, chaque photo peut se répéter si le rôle narratif change.
- 5+ photos → comportement actuel (1 photo ≈ 1 slide).

Le `slide_count` envoyé par le front (7) devient une **suggestion plafond**, pas un plancher. Supprimer la phrase "Ne descends JAMAIS sous N slides".

### 2. `buildPhotoCarouselPrompt` — règle de continuité narrative (ligne 1529+)

Ajouter un bloc **CHAÎNAGE DES TEXTES — OBLIGATOIRE** :
- Les `overlay_text` doivent se lire à la suite comme un mini-récit continu : chaque slide reprend, prolonge ou fait basculer ce que la précédente a posé.
- Test interne : si on permute deux slides au hasard et que le carrousel "marche encore", c'est raté.
- Mots de liaison narratifs autorisés en début de slide : "Puis", "Et puis", "Sauf que", "Trois mois plus tard", "Ce jour-là", "Au début", "Maintenant", "Résultat" — pour matérialiser la progression temporelle/logique.
- Une photo qui se répète sur 2-3 slides consécutives DOIT porter une progression de texte (zoom narratif, avancée temporelle, retournement) — pas 3 variantes de la même idée.

Adapter aussi la section "PROGRESSION NARRATIVE" :
- Cas **2 photos (avant/après)** explicite : slides 1-N₁ posent l'avant (mêmes ou variations de la photo "avant"), 1 slide pivot raconte la bascule, slides N₁+2 → fin montrent l'après. Le texte fait le pont de bout en bout.
- Cas **1 photo unique** : la photo reste, les textes racontent l'histoire en plusieurs temps (contexte → tension → bascule → résolution → ouverture).

### 3. `quality_check` enrichi (ligne 1593-1600)

Ajouter :
- `text_chain_continuity: true` — chaque overlay s'enchaîne avec le précédent
- `slide_count_matches_photo_richness: true` — le nombre de slides est proportionné aux photos
- `no_mechanical_photo_alternation: true` — pas d'alternance 1/2/1/2 sans raison narrative

### 4. Pas de changement frontend, pas de changement DB

Le front continue d'envoyer `slide_count: 7` ; le prompt l'interprète maintenant comme un plafond souple modulé par `photos.length`.

## Hors scope

- Mode MIX (`carousel_type === "mix"`) inchangé — le problème décrit concerne le mode PHOTO pur.
- Mode `pure_photo` inchangé.
- Pas de modification du flux LinkedIn carousel.
- Pas de UI ajoutée pour choisir le nombre de slides (l'IA s'adapte automatiquement).
