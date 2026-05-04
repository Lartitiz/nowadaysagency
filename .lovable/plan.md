## Problème

Dans le carrousel **mixte** (photos + texte), quand l'utilisatrice clique sur "Qu'est-ce que je veux partager ?", les 3 questions d'approfondissement tournent **uniquement autour de ce que l'IA voit dans les photos**. Ce qu'elle a écrit dans le sujet / la description (ex. "je veux parler de mon retour de congé maternité et de comment ça a transformé ma manière de bosser") est traité comme une simple métadonnée, pas comme un fil narratif à croiser avec les images.

Conséquence : les questions ressemblent à *"je vois une table en bois et un café, c'était dans quel contexte ?"* au lieu de *"sur la photo 2 on te voit avec ton ordi sur les genoux et ton bébé à côté — c'est exactement la scène de ton retour de congé dont tu veux parler ? Qu'est-ce qui a changé concrètement dans ta façon de bosser depuis ?"*.

## Cause technique

Le bloc `deepening_questions` pour `carousel_type === "mix"` (et `"photo"`) dans `supabase/functions/carousel-ai/index.ts` (lignes 403-465) :

- Le sujet (`body.subject`) et la description (`body.photo_description`) sont injectés en haut comme champs neutres ("Sujet : ..., Description complémentaire : ...").
- Les instructions au modèle insistent uniquement sur la lecture visuelle ("MENTIONNER ce que tu VOIS RÉELLEMENT dans les photos").
- Aucune consigne ne demande de **croiser** ce qu'elle a écrit avec ce que montrent les photos, ni d'interroger les **écarts ou résonances** entre les deux.
- Les exemples de bonnes questions ne référencent que le visuel — jamais le texte qu'elle a tapé.

## Plan

### Étape 1 — Réécrire le prompt deepening_questions pour le carrousel mixte

Modifier uniquement `supabase/functions/carousel-ai/index.ts`, bloc lignes 403-466 (mode `photo` + `mix` avec photos réelles).

**Changements ciblés** :

1. **Mettre le sujet écrit au même niveau de priorité que les photos** dans l'introduction du prompt. Le présenter comme "ce qu'elle a déjà en tête à raconter" — pas comme une métadonnée.

2. **Ajouter une consigne explicite de croisement** dans la liste des règles, entre les puces "MENTIONNER ce que tu VOIS" et "extraire le contexte invisible" :
   - "CROISER ce qu'elle a écrit dans son sujet/description avec ce que tu vois dans les photos : où est-ce que les deux se rencontrent ? Où est-ce qu'il y a un écart, une tension, un non-dit ?"
   - "Au moins 1 question sur 3 doit faire ce pont explicite entre son intention écrite et ce que les photos montrent réellement."

3. **Ajouter des exemples mixte-spécifiques** qui croisent texte + image (en plus des exemples actuels qui restent valides) :
   - *"Tu écris '[bout du sujet]' et sur la photo [N] on voit [élément] — c'est exactement la scène que tu veux montrer ou il y a autre chose derrière ?"*
   - *"Ton sujet parle de [thème écrit], mais les photos montrent surtout [observation visuelle]. Lequel des deux veux-tu mettre en avant — ou comment tu veux les faire dialoguer ?"*

4. **Renforcer l'INTERDIT** : ajouter "Questions qui ignorent complètement ce qu'elle a écrit dans le sujet/description et ne parlent que des photos."

5. **Cas dégradé (pas de sujet écrit, juste photos)** : si `body.subject` est vide ou réduit à "Carrousel basé sur les photos uploadées", garder le comportement actuel (vision-first), pour ne pas inventer un sujet qui n'existe pas.

### Étape 2 — Aligner le mode `photo` pur (optionnel)

Le mode `photo` (sans slides texte intercalées) bénéficie aussi du croisement, mais l'enjeu est moins critique. Appliquer la même logique avec une intensité moindre : 1 question minimum qui réfère au sujet écrit, les 2 autres restant libres sur l'analyse visuelle.

### Étape 3 — Vérification

- `tsc --noEmit` passe.
- Tester dans le preview : carrousel mixte avec photos + un sujet bien écrit → les 3 questions doivent contenir au moins une référence explicite au texte tapé par l'utilisatrice.
- Régression : carrousel mixte avec photos mais SANS sujet écrit → comportement actuel préservé (questions purement visuelles).

## Hors-scope

- Pas de changement côté front (`CreerUnifie.tsx`, `use-content-generator.ts`) : la donnée `subject` et `photoDescription` est déjà transmise au backend.
- Pas de changement de modèle IA ni de paramètres d'appel Claude.
- Pas de modification du flow d'upload photos ni des structures de slides.
