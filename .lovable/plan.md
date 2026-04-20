

## Diagnostic

Quand on arrive sur l'écran questions via "Partir de photos", les questions sont **génériques** car le backend ne reçoit **ni les photos ni leur description** :

- `generateQuestions` (front) n'envoie pas `photos`, `photo_description`, ni `carousel_type` → impossible pour Claude de "voir" les photos
- Conséquence visible (élément sélectionné par l'user·ice) : question type *"Quelle opération de valorisation d'actifs récente pourriez-vous décortiquer…"* → **0 ancrage visuel**, alors que les photos sont déjà chargées

**Bonne nouvelle** : la logique vision existe **déjà côté `carousel-ai`** (lignes 399-454) pour `carousel_type === "photo"` — elle envoie les images à Claude et lui demande "Je vois [élément]…". Il suffit de :
1. **L'activer aussi pour `mix`** (carrousel mixte LinkedIn / Insta avec photos)
2. **L'ajouter à `creative-flow`** pour le post simple Insta avec photo + LinkedIn carrousel mixte si routé là
3. **Faire transiter les photos depuis le front** dans `generateQuestions`

## Fix proposé — 3 fichiers

### 1. `src/hooks/use-content-generator.ts` — transmettre les photos

Étendre `GenerateQuestionsParams` :
```ts
photos?: Array<{ base64: string; context?: string }>;
photoDescription?: string;
carouselSubMode?: "text" | "photo" | "mix";
photoMode?: boolean;
```

Dans `generateQuestions` :
- **Branche carousel** : si `photos.length > 0`, ajouter au body `carousel_type: carouselSubMode` (`"photo"` ou `"mix"`), `photos: photos.map(p => ({ base64, context }))`, `photo_description`. Augmenter le timeout à `90000` (vision = +lent).
- **Branche creative-flow** : si `photos.length > 0` (post simple Insta photo, ou newsletter avec image), ajouter au body `photo_mode: true`, `photos: [premier]` (limite Zod = max 1), `photo_description`.

### 2. `src/pages/CreerUnifie.tsx` — passer les photos à `generateQuestions`

Dans le seul appel ligne 590 (et ligne 433 pour le coaching), ajouter quand pertinent :
```ts
photos: uploadedPhotos.length > 0 ? uploadedPhotos.map(p => ({ base64: p.base64, context: p.context })) : undefined,
photoDescription: photoDescription || undefined,
carouselSubMode: carouselSubMode || undefined,
photoMode: photoMode || undefined,
```

### 3. `supabase/functions/carousel-ai/index.ts` — étendre la branche vision au mode `mix`

Ligne 401 : remplacer
```ts
if (body.carousel_type === "photo" && body.photos && body.photos.length > 0)
```
par
```ts
if ((body.carousel_type === "photo" || body.carousel_type === "mix") && body.photos && body.photos.length > 0)
```

Adapter le prompt pour mentionner que le carrousel sera **mixte** (photos + slides texte) quand `mix` → questions sur **quelles photos méritent d'être au cœur** + **quels passages textuels les accompagnent**.

### 4. `supabase/functions/creative-flow/index.ts` — branche vision pour `step === "questions"`

Avant le bloc `else if (step === "questions")` actuel (ligne 268), insérer une branche vision si `body.photos?.length > 0 && body.photos[0].base64` :
- Construire `messageContent` avec l'image + un prompt similaire à celui du carousel ("Je vois [élément]…", 3 questions ancrées dans la photo + le sujet)
- Adapter le ton selon le canal (Insta légende = émotion/hors-champ, LinkedIn = pro)
- Réutiliser le mécanisme `callAnthropic` déjà en place avec un modèle vision (Sonnet 4.5)
- Renvoyer le JSON `{ questions: [...] }` (même format que le path texte)

Sinon, fallback sur la logique actuelle (questions texte).

## Comportement préservé
- Questions texte standard quand pas de photo (carrousel texte, LinkedIn sans visuel, newsletter sans image)
- Format de retour identique (`{ questions: [{ question, placeholder }] }`) → aucun changement côté UI
- `recent_briefs_context`, `editorial_angle`, `objective` toujours injectés
- Quotas / logging inchangés

## Validation
1. `tsc --noEmit --skipLibCheck` → 0 erreur
2. **Flow Partir de photos → Insta Carrousel mixte** : les 3 questions doivent référencer ce qu'il y a sur les photos ("Je vois [X]…")
3. **Flow Partir de photos → Post simple Insta avec photo** : idem, questions ancrées dans le visuel
4. **Flow Partir de photos → LinkedIn Carrousel mixte** : questions visuelles + ton pro
5. **Flow texte sans photo** : aucune régression, questions classiques comme avant
6. Latence acceptable : ≤ 15s sur 3-5 photos (Sonnet vision)

## Hors scope
- Cache des analyses photo (chaque call refait la vision)
- Modification du prompt de génération finale (déjà OK : carousel-ai/creative-flow utilisent déjà les photos pour générer)
- Vision pour newsletter (rare cas, pas demandé)

