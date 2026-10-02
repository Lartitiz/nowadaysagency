# Montrer la scène comme « image de départ » au-dessus du champ

## Réponse courte
Non, la scène n'a pas besoin d'être ajoutée aux photos de référence. Quand elle est sélectionnée dans le panneau des images, le Studio la prend déjà comme image de départ pour ton prochain message. Il l'envoie automatiquement avec la demande. Le problème, c'est qu'on ne le voit nulle part au-dessus du champ, d'où la confusion.

## Ce qui change
- En haut de l'accordéon « Photos de référence », une ligne fixe s'affiche dès qu'une image créée est sélectionnée : petite vignette + « Image de départ : la scène sélectionnée (version N) ». Elle ne se retire pas. Pour changer d'image de départ, on clique sur une autre image à droite.
- L'accordéon s'affiche aussi quand il n'y a qu'une image de départ, sans photo de référence. Son titre devient « Photos de la demande (N) », où N compte l'image de départ et les photos de référence.
- Les rôles, le bouton « Retirer » et les règles d'envoi des références ne changent pas.

## Hors périmètre
- Rien ne change sur le serveur, ni pour les crédits ou la création des images.
- Le site public n'est pas publié sans ta demande.

## Détails techniques
- `src/pages/VisualStudioPage.tsx` (zone de l'accordéon, environ l.1531) : à partir de `selectedId` et `current.versions`, calculer la version sélectionnée prête (`status === "ready"`, `url`). Afficher une ligne `figure` en lecture seule avant `ReferenceCards`, et rendre l'accordéon si `attachedReferences.length > 0 || startVersion`.
- Ajouter un test dans `src/test/visual-studio.test.tsx` : une version sélectionnée affiche « Image de départ ». Lancer ensuite les tests du Studio et le typage.
