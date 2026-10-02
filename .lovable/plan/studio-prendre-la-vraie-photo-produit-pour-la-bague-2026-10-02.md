# Studio : prendre la vraie photo produit pour la bague

## Constat vérifié
- La proposition demandait bien la bague exacte.
- L’image a reçu la scène, le mannequin et « dino1 (2) », une photo de la bague portée.
- Elle n’a pas reçu « bag dino+S (2) », la photo produit seule pourtant présente dans les photos de référence.
- Le créateur d’images a donc reconstruit la bague depuis la photo portée et en a inventé des détails.

## Correctif
1. Lors d’une intégration de produit, donner la priorité à la photo classée comme **produit seul** pour définir sa forme, ses matières, ses couleurs et ses détails exacts.
2. Ne plus laisser une ancienne sélection de scène écarter silencieusement cette photo produit lorsqu’elle est encore présente dans les photos de référence de la demande.
3. Une photo portée pourra guider la position ou le contact avec la main, mais elle ne remplacera pas la photo produit seule comme référence d’exactitude.
4. Si plusieurs photos de produits seuls différents rendent le choix réellement ambigu, le Studio demandera laquelle utiliser avant de proposer l’image. Rien ne sera généré ni décompté avant ce choix.
5. La proposition affichera la bonne photo produit dans ses références et la consigne envoyée associera explicitement la cible « bague » à cette photo.

## Vérifications
- Rejouer le cas scène + mannequin + « bag dino+S (2) » + « dino1 (2) » et vérifier que la proposition contient la photo produit seule comme source de la bague.
- Vérifier qu’une demande avec une seule photo portée continue de fonctionner.
- Vérifier qu’un cadrage ou une correction de lumière ne déclenche pas ce changement.
- Tester le garde-fou avec deux produits seuls distincts.
- Redéployer uniquement la fonction du Studio ; ne pas publier le site.

## Détails techniques
- Corriger la constitution des références dans `visual-studio/index.ts` : sur une branche de scène en phase d’intégration, réintroduire la référence courante `kind: "produit"` avant la réparation et la validation des cibles, au lieu de rester limité aux références historiques de la scène.
- La priorité `produit` sur `produit_porte` s’applique à la cible produit ; conserver la photo portée seulement comme information de placement lorsqu’elle est pertinente.
- Ajouter des tests Deno ciblés couvrant la priorité produit seul, le secours photo portée et l’ambiguïté entre produits distincts.
- Ne pas modifier les prompts confirmés, le mannequin, la scène, les quotas ni les autres parcours du Studio.
