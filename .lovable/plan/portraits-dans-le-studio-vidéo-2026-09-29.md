# Portraits dans le Studio vidéo

## Objectif
Rendre les portraits et les photos de produits portés sélectionnables comme références vidéo, au même titre que les autres images.

## Changements
- Retirer l’état « indisponible » dans la bibliothèque d’images du Studio vidéo.
- Autoriser ces images lors de la préparation et du devis côté serveur.
- Remplacer la confirmation « aucune personne identifiable » par une confirmation claire que l’utilisatrice a le droit d’utiliser et transmettre les images sélectionnées.
- Conserver la limite de 4 images, les rôles, le devis préalable et toutes les protections de coût existantes.

## Vérification
- Adapter les tests de sélection et les contrôles serveur concernés.
- Vérifier le typage, les tests ciblés et l’affichage, sans demander de devis ni lancer de génération.

## Technique
Les contrôles cohérents seront ajustés dans le sélecteur, le formulaire vidéo et la fonction `studio-video`; aucun média réel ne sera consulté et aucun déploiement ne sera effectué sans demande séparée.