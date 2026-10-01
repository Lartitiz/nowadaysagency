# Studio : « Réessayer cette image seulement » échoue

## Ce qui a été constaté (lecture seule, journaux du Studio)
- 12:20:44 UTC : le fournisseur d'images a refusé la demande. Code `429`, motif `credit_balance_exhausted`.
- Juste après, la tâche image s'arrête à l'étape `generate` (pas de doute sur l'issue, aucune référence manquante).
- C'est exactement le même refus qu'hier soir à 22:43 UTC, et que celui de la recette Max sur les carrousels (OpenAI, `insufficient_quota`).

## Cause
Ce n'est pas un bug de l'app. Le compte fournisseur qui génère les images (OpenAI) n'a plus de crédit. Toute nouvelle tentative échouera de la même façon tant que le solde n'est pas rechargé. Aucun crédit de l'Assistant Com' n'est décompté pour ces échecs.

## Ce qu'il faut faire
1. Toi : recharger le solde du compte OpenAI qui sert aux images (platform.openai.com, Billing), ou activer la recharge automatique.
2. Moi, après ta recharge : relire les journaux pendant que tu cliques à nouveau sur « Réessayer cette image seulement », pour confirmer que l'image sort.

## Option (seulement si tu la demandes)
Afficher dans le Studio un message clair du type « Le service d'images est temporairement indisponible, réessaie plus tard » au lieu d'un échec générique. Cette correction passerait par GitHub, comme d'habitude.

## Aucun changement prévu
Pas de code, secret, migration, quota ni déploiement modifiés dans ce diagnostic.
