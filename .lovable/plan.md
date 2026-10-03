# Classer l'alerte « Product on model : crédit OpenAI épuisé »

## Constat
- Les photos produit portées passent par Higgsfield dès que la bascule Higgsfield est activée, ce qui est le cas aujourd'hui (les réglages nécessaires sont en place).
- Une génération a réussi par Higgsfield aujourd'hui à 13h36. Les journaux récents ne montrent aucun échec.
- L'alerte date d'avant la bascule, quand OpenAI était encore utilisé.

## Action
- Marquer l'alerte comme résolue dans le suivi du projet, avec cette explication.
- Aucun changement de code, de réglage ni de déploiement.

## Point d'attention
- Si on désactive un jour Higgsfield, OpenAI reprend la main et cette erreur reviendra tant que son crédit n'aura pas été rechargé.
