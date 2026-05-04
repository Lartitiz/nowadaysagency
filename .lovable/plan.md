# Fix : carrousel mixte trop court (4 slides au lieu de 7+)

## Diagnostic

Dans `supabase/functions/carousel-ai/index.ts` (étape `structure_proposal`, mode mixte), la consigne envoyée à l'IA cale **mécaniquement** le nombre de slides sur le nombre de photos uploadées :

> "Pour N photos : vise entre N et N+2 slides au total (**pas plus**). Sweet spot : N slides photo + 1-2 slides texte clés."

Avec 3 photos → 3 à 5 slides maximum. L'IA choisit 4. Le `slide_count: 7` envoyé par le front est ignoré, et toute la mécanique de profondeur (DEPTH_LAYER : mécanisme + croyance + retournement) est étouffée.

C'est aussi en contradiction avec la règle juste au-dessus dans le même prompt :
> "Le nombre de slides doit être entre `slide_count` et `slide_count + 2`" (= 7 à 9 par défaut)

Les deux règles se contredisent et celle des photos gagne.

## Principe du fix

**Le nombre de slides suit la richesse du sujet, pas le nombre de photos.** Une même photo peut nourrir plusieurs slides (full puis integrated sous un autre angle), et les slides texte d'approfondissement (mécanisme expliqué, croyance nommée, retournement formulé) sont essentielles, pas accessoires.

## Changements

### 1. `supabase/functions/carousel-ai/index.ts` — bloc `photoInstruction` mode MIXTE (lignes ~315-335)

Réécrire la cible de répartition :

- **Supprimer** la cible "N à N+2 slides max" calée sur le nombre de photos.
- **Garder** comme cible le `slide_count` demandé par le front (7 à 9 par défaut), aligné sur la règle générale ligne 350.
- **Reformuler** l'équilibre photo/texte en proportion (≥50% photo) sans plafonner le total.
- **Autoriser explicitement** qu'une même photo serve 2 slides différentes (ex: photo_full en hook, puis photo_integrated plus loin avec un cadrage analytique différent) si le récit le justifie.
- **Revaloriser** les slides texte d'approfondissement : le mécanisme, la croyance retournée, la prise de position, la donnée chiffrée méritent chacun leur slide propre — ce ne sont pas "1-2 slides texte clés" maximum mais autant que la profondeur du sujet l'exige.
- **Ajouter** un garde-fou explicite : "Si le sujet porte une vraie profondeur (vécu, conviction, mécanisme à expliquer), ne te contente pas de 4 slides parce qu'il n'y a que 3 photos. Étire à 7-9 slides en intercalant des slides texte d'approfondissement."

### 2. Vérifier la cohérence avec l'étape de génération finale

Une fois la structure validée à 7-9 slides, l'étape `slides`/`express_full` doit honorer ce nombre. Vérifier `buildSlidesPrompt` et `buildExpressFullPrompt` pour s'assurer qu'ils ne re-cappent pas le compte sur `photos.length`. Ajuster si besoin (même principe : photo réutilisable, slides texte légitimes).

### 3. Pas de changement front

Le front envoie déjà `slide_count: 7` ligne 915 — il sera enfin respecté.

## Hors scope

- Pas de modif UI (pas de slider visible pour le user — `slide_count: 7` reste le défaut).
- Pas de touche au mode photo pur (où 1 photo = 1 slide est la bonne règle).
- Pas de touche au mode texte pur (déjà OK).

## Validation

Re-tester le cas de l'utilisatrice (carrousel mixte, sujet à forte profondeur, 3 photos) → attendu : 7-9 slides, dont au moins 50% photo (avec réutilisation possible) et 2-4 slides texte d'approfondissement (mécanisme / croyance / retournement / chiffre).
