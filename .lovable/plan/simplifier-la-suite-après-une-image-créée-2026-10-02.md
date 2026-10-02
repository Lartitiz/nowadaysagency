# Simplifier la suite après une image créée

## Résultat attendu
- Retirer tous les boutons affichés sous chaque image : « Image sélectionnée », « Joindre à ma demande », « Agrandir l’image » et « Ajouter à ma bibliothèque ».
- Lorsqu’une image est prête, afficher à sa place un nouveau message naturel du Studio dans la conversation.
- Adapter ce message à ce qui vient d’être réalisé, par exemple :
  - après une création de scène : « Voilà la scène. Qu’est-ce que tu veux faire maintenant ? Tu peux me demander de la modifier ou d’y intégrer tes luminaires. »
  - après une retouche : « Voilà la nouvelle version. Qu’est-ce que tu veux ajuster maintenant ? »
  - dans les autres cas : une question simple et ouverte sur la suite souhaitée.
- Ne proposer aucun choix sous forme de bouton : la personne répond directement dans le champ du chat.
- Supprimer également l’actuelle phrase générique « Avec cette image, tu peux… » pour éviter deux guidages concurrents.

## Comportement conservé
- La dernière image terminée reste automatiquement celle sur laquelle porte la conversation.
- Une réponse écrite dans le chat suit exactement le circuit actuel de modification ou de nouvelle demande.
- La génération, les crédits, les traitements d’image et les données enregistrées ne changent pas.

## Vérification
- Ajouter des tests pour les principaux contextes : scène à compléter, retouche et création générique.
- Vérifier qu’aucun ancien bouton d’action ni ancienne phrase générique ne reste visible après une image prête.
- Vérifier qu’une réponse envoyée après le nouveau message reprend bien le parcours existant.
- Lancer les tests ciblés du Studio, le typage et la compilation.
