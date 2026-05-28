# Questions multi-photos pour LinkedIn (et autres formats vision)

## Problème

Dans `supabase/functions/creative-flow/index.ts` ligne 1216-1242, à l'étape `questions` en mode photo, on n'envoie que `body.photos[0]` à Claude — même quand l'utilisatrice a uploadé 2 à 10 photos (cas typique LinkedIn carrousel d'images natif).

Conséquences :
- Les 3 questions générées sont ancrées sur **une seule** image
- Aucune question ne porte sur la séquence, la transformation (avant/après), le fil rouge du reportage
- L'étape `generate` (ligne 1243+) gère bien le multi-photos (slice 0-10, modes "avant/après" / "série"), mais le brief des questions ne reflète pas cette richesse

## Correctif (1 fichier)

### `supabase/functions/creative-flow/index.ts` lignes 1216-1242

Étendre la logique vision-questions pour accepter 1 à N photos, en miroir de ce que fait déjà l'étape `generate` :

1. Filtrer `body.photos` valides + `slice(0, 10)` → `validPhotosQ`
2. Construire un `content[]` qui contient :
   - 1 bloc `image` par photo (jusqu'à 10)
   - Un petit label texte avant chaque image si `photo.context` est renseigné ("↑ Contexte photo N : …")
   - Le prompt texte final (`visionQuestionsPrompt`) en dernier
3. Passer au prompt builder le **nombre de photos** + l'info "mode série / avant-après / scène unique" pour qu'il adapte ses 3 questions (ex. 1 question sur le fil rouge, 1 sur un moment clé, 1 sur la prise de position pro)

### `supabase/functions/_shared/vision-prompts.ts` — `buildVisionQuestionsPrompt`

Ajouter 2 paramètres optionnels : `photo_count: number` et `series_mode: "single" | "before_after" | "series"`.

Adapter les RÈGLES du prompt :
- Si `photo_count === 1` → comportement actuel inchangé
- Si `photo_count === 2` → "Tu vois 2 photos qui forment un AVANT/APRÈS. Tes 3 questions doivent creuser la transformation : le déclic, le geste qui a fait basculer, le ressenti du résultat."
- Si `photo_count >= 3` → "Tu vois N photos d'une même séquence/reportage. Tes 3 questions doivent couvrir : (1) le fil rouge / pourquoi cette série, (2) un détail marquant visible sur UNE photo précise (mentionne laquelle), (3) la prise de position / l'apprentissage pro qui ressort de l'ensemble."
- Garder la règle "MENTIONNE ce que tu VOIS RÉELLEMENT" en l'étendant à toutes les images

## Hors scope

- Pas de changement frontend (`PhotoUploadZone`, `CreerStepQuestions`, `use-content-generator`) — le payload `photos[]` est déjà envoyé complet
- Pas de changement à l'étape `generate` (déjà multi-photos OK)
- Pas de migration DB, pas de modif Zod (limite `.max(10)` déjà alignée)
- Pas de changement des autres formats (Instagram caption, reel, story, newsletter) — même logique appliquée puisque le builder est partagé, mais l'effet est surtout visible sur LinkedIn (cas multi-photos le plus fréquent)

## Test après correction

1. Créer un contenu → Partir de photos → 4 photos → Post LinkedIn
2. Vérifier que les 3 questions :
   - mentionnent des détails de **plusieurs** photos différentes
   - portent au moins sur le fil rouge / la séquence (pas uniquement sur la 1ère image)
3. Tester aussi avec 2 photos → questions orientées avant/après
4. Tester avec 1 photo → comportement inchangé
