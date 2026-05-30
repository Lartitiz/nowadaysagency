# Ajouter un champ "sujet" au flow photo

## Pourquoi

Actuellement, quand on entre par "Partir de photos", on ne demande que :
1. les photos
2. une description optionnelle ("décris tes photos en quelques mots")

Aucun **sujet** n'est explicitement capté. Résultat : les questions IA (`buildVisionQuestionsPrompt`) se rabattent sur la description ou sur un placeholder (`"Carrousel basé sur les photos uploadées"`), et le post final manque d'angle clair.

## Ce qu'on ajoute

**Un champ "De quoi veux-tu parler ?"** placé AU-DESSUS du dropzone dans le mode photo de `CreerStepIdea`. C'est le sujet du post, distinct de la description visuelle des photos.

UX :
- Label : "De quoi veux-tu parler ?"
- Sous-texte : "Le message ou l'angle du post. Les questions et la rédaction s'appuieront dessus."
- Placeholder dynamique (réutilise `getPlaceholder(activite)` existant)
- Textarea 3 lignes
- **Requis** pour activer le bouton Suivant (en plus d'avoir ≥1 photo) — on accepte aussi le fallback "vide" si l'utilisateur insiste, mais on affiche d'abord le champ comme attendu

La description photo existante reste en dessous, inchangée, toujours optionnelle.

## Plomberie

### 1. `src/components/creer/CreerStepIdea.tsx`
- Ajouter un state `photoSubject` dans le mode photo
- Afficher un Textarea "De quoi veux-tu parler ?" au-dessus de `PhotoUploadZone`
- Élargir la signature `onPhotosNext` → `(photos, description, subject)`
- Bouton "Suivant" : disabled si `photos.length === 0 || !photoSubject.trim()`

### 2. `src/pages/CreerUnifie.tsx`
- `handlePhotosNext(photos, description, subject)` :
  - `setUploadedPhotos(photos)`
  - `setPhotoDescription(description)`
  - **`setIdeaText(subject)`** ← clé : le sujet alimente `enrichedSubject` plus loin
- Le reste du pipeline (`generateQuestions`, `safeSubject`) fonctionne déjà : il prend `ideaText` en priorité, puis `photoDescription` en fallback. Aucun changement nécessaire côté edge functions.

### 3. Vérifications de co-occurrence (aucun changement requis, juste à valider)
- `buildVisionQuestionsPrompt` (vision-prompts.ts) : reçoit `context` (= sujet) et `photo_description` séparément → bénéficie directement du nouveau sujet
- `creative-flow/index.ts` : reçoit `subject` côté `step=generate` → idem
- `carousel-ai/index.ts` : reçoit `subject` → idem
- `CreerStepFormat` (`initialPhotoDescription`) : prop inchangée
- Mode "Partir de texte" classique : non touché (le textarea principal reste le sujet par défaut)
- Demo Auriana / pré-fill : `ideaText` reste bien renseigné, pas de régression

## Mémoire / contrats préservés

- "vous" LinkedIn, longueur, anti "Photo 1/2/3" : aucun impact, on ne change que la collecte d'input
- Pas de migration DB, pas de redéploiement edge function nécessaire
