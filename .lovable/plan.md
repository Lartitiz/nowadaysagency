

## Fix : une seule zone de texte « Légende complète » pour le carrousel Instagram

### Le vrai problème

Aujourd'hui sur le carrousel photo/mix Instagram :

- l'IA **est censée** retourner un objet `caption = { hook, body, cta, hashtags }` complet
- en pratique, elle ne retourne souvent **que le hook** (ou rien)
- le fallback front met juste l'overlay de la slide 1 dans `hook` et laisse `body / cta / hashtags` vides
- résultat : tu vois 4 cases dont 3 sont vides, et tu ne peux pas écrire ta légende d'un trait

### Ce qu'on change

#### 1. UI : 1 seul textarea `Légende` au lieu de 4 cases

Fichier : `src/components/creer/formatRenderers/CarouselPhotoResult.tsx`

Dans la branche Instagram (lignes 513-566), remplacer le bloc Hook / Body / CTA / Hashtags par **un seul Textarea** :

- libellé : `📝 Légende du carrousel`
- placeholder : `Écris ou colle ta légende complète (hook, corps, CTA, hashtags)...`
- valeur initiale = concaténation propre de ce que l'IA a renvoyé :
  - `hook` + ligne vide + `body` + ligne vide + `cta` + ligne vide + `hashtags` (préfixés `#`, séparés par espaces)
  - on saute proprement les blocs vides
- `min-h-[240px]`, mono-bloc éditable
- au `onChange` on stocke dans un nouveau champ `caption.fullText`

LinkedIn reste inchangé (il garde son `LinkedInCaptionEditor` séparé et son flow dédié, qui marche bien).

#### 2. Stockage et propagation

Toujours dans `CarouselPhotoResult.tsx` :

- nouveau state `fullCaption: string` (en plus du `caption` actuel pour rétro-compat LinkedIn)
- pour Instagram, on envoie `notify(slides, { ...caption, fullText: fullCaption })` à chaque édition
- on garde aussi un re-split best-effort côté front pour ne pas casser ce qui consomme `caption.hook / body / cta / hashtags` ailleurs (logique simple : 1ère ligne = hook, dernière ligne `#…` = hashtags, le reste = body)

#### 3. Initialisation depuis le résultat IA

Adapter `buildCaptionWithFallback` (lignes 178-189) :

- s'il y a un `body` non vide, construire `fullText = hook\n\nbody\n\ncta\n\n#hashtag1 #hashtag2…`
- s'il n'y a que le `hook`, mettre `fullText = hook`
- s'il n'y a rien du tout, fallback sur `firstSlide.overlay_text` ou chaîne vide
- toujours retourner aussi les 4 sous-champs (pour LinkedIn et la rétro-compat)

#### 4. Alerte « légende incomplète »

Lignes 463-498 actuellement : alerte si `body` < 50 caractères.

Pour Instagram on bascule la condition sur `fullText.length < 80` (sinon l'alerte sera toujours là). On garde le bouton « Relancer la génération » (`onRetry`) déjà présent pour rejouer l'appel `carousel-ai` en cas de légende vraiment vide.

#### 5. Côté backend : pas obligatoire mais utile

Fichier : `supabase/functions/carousel-ai/index.ts` (autour des lignes 1568-1576)

- garder la consigne actuelle « caption obligatoire avec 4 champs »
- ajouter en repli : si l'IA ne retourne pas tous les champs, on accepte aussi un champ unique `caption.fullText` (string Markdown). Le front sait afficher l'un ou l'autre.

Ça évite de re-déployer le prompt en urgence si le modèle continue à shipper du JSON cassé : le front est tolérant.

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` | Branche Instagram : un seul Textarea `Légende complète`, init depuis hook/body/cta/hashtags, re-split best-effort pour rétro-compat |
| `supabase/functions/carousel-ai/index.ts` | (optionnel) accepter aussi `caption.fullText` en repli |

### Validation

1. Générer un carrousel mix Instagram avec photos → un seul bloc `Légende du carrousel` apparaît, pré-rempli avec ce que l'IA a renvoyé (au moins le hook).
2. Modifier la légende → le contenu est bien sauvegardé (la programmation, les exports, l'enregistrement final).
3. Si l'IA n'a renvoyé que le hook → tu vois le hook dans le textarea et tu peux compléter à la main, sans 3 cases vides qui te demandent de deviner ce qui va où.
4. Le carrousel LinkedIn n'est pas touché : il garde ses 4 champs séparés et son bouton « Régénérer la légende ».
5. Le bouton « Relancer la génération » reste visible si la légende est vraiment vide (< 80 caractères).

### Risque

Faible. On change uniquement le rendu Instagram du bloc légende et on garde la rétro-compat avec les autres composants qui lisent encore `caption.hook / body / cta / hashtags`. Pas de migration DB. LinkedIn intact.

