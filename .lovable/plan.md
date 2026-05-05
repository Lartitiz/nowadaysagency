# Plan de correction du flux de création de contenu

## Ce qui pose problème
Le message "Format non supporté : auto" ne vient pas d’un seul bug visuel : il vient d’un format invalide qui circule dans le flux de création.

Le cas principal identifié :
- le mode "Surprise" du coach contenu envoie `format = "auto"`
- ce format est transmis jusqu’à `/creer`
- le hook `use-content-generator` ne sait générer que des formats canoniques (`post`, `carousel`, `reel`, `story`, `linkedin`, `newsletter`, etc.)
- il lève donc l’erreur `Format non supporté : auto`

J’ai aussi repéré un second risque : certaines réponses du coach contenu utilisent des routes ou formats "placeholder"/non canoniques, donc le problème peut réapparaître à plusieurs endroits si on ne normalise pas tout le chaînage.

## Ce que je vais corriger

### 1. Sécuriser l’entrée du coach contenu
- empêcher qu’un `format` non canonique comme `auto` soit envoyé tel quel vers `/creer`
- dans le mode "Surprise", utiliser la recommandation réellement renvoyée par le coach, ou forcer un fallback propre si la réponse est ambiguë
- ne jamais transmettre `auto` à `onSelect` ni à la navigation

### 2. Normaliser les formats côté front avant génération
- centraliser une liste de formats autorisés
- convertir les formats hérités ou approximatifs vers les formats canoniques
- rejeter proprement les valeurs inconnues avec fallback UI au lieu de laisser planter la génération

### 3. Protéger `/creer` contre les formats invalides
- durcir `handleCoachingSelect` dans `CreerUnifie.tsx`
- valider `data.format` avant d’appeler `generateQuestions`
- si le format est invalide, renvoyer l’utilisatrice vers l’étape format avec un message explicite au lieu d’essayer de générer

### 4. Fiabiliser le chaînage depuis le coach d’idées
- ne plus faire confiance aveuglément à `redirect_route`
- extraire et normaliser le format final avant navigation ou avant passage à `onSelect`
- garder la sous-sélection carousel (`text`, `photo`, `mix`) intacte

### 5. Ajouter une couche défensive dans le hook de génération
- valider le format dès l’entrée de `generate()` / `generateQuestions()`
- utiliser une validation de type enum pour éviter que d’autres flows futurs réintroduisent ce bug
- renvoyer une erreur plus utile côté UI si une valeur hors liste arrive malgré tout

## Résultat attendu
Après correction :
- le mode surprise ne cassera plus la création
- les suggestions issues du coach contenu mèneront toujours vers un format exploitable
- les autres zones où "auto" ou une valeur non canonique peut apparaître seront absorbées proprement
- l’utilisatrice verra soit une génération qui fonctionne, soit un fallback clair pour rechoisir le format

## Fichiers probablement concernés
- `src/components/dashboard/ContentCoachingDialog.tsx`
- `src/pages/CreerUnifie.tsx`
- `src/hooks/use-content-generator.ts`
- éventuellement un petit utilitaire partagé de normalisation de format si c’est plus propre

## Détail technique
Je vais appliquer une stratégie en 3 niveaux :

```text
Entrée coach contenu
  -> normalisation du format
  -> transmission vers /creer
  -> validation avant generateQuestions/generate
```

Formats autorisés visés :
- `post`
- `carousel`
- `reel`
- `story`
- `linkedin`
- `newsletter`
- `pinterest`
- `pinterest_visual`
- `pinterest_inspiration`
- `pinterest_photo`

Valeurs à remapper ou refuser proprement :
- `auto`
- `post_texte`
- `post_photo`
- `post_carrousel`
- `carrousel`
- `story_serie`

## Vérification après implémentation
Je vérifierai au minimum :
- le flow coach contenu → surprise → questions
- le flow coach contenu → idée sélectionnée → `/creer`
- un cas standard non surprise pour m’assurer qu’il n’y a pas de régression
- l’absence de toast `Format non supporté : auto` dans le parcours concerné