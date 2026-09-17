# Carrousels : éviter les coupures (504) sur les générations les plus longues

## Constat vérifié

Le service de génération de carrousels enchaîne plusieurs appels IA, chacun avec sa propre limite, mais **aucune limite globale** n'existe pour l'ensemble de la demande :

| Étape | Limite actuelle |
|---|---|
| Recherche « creuser le sujet » (optionnelle) | 25 s |
| Écriture du carrousel | 120 s |
| Nouvelle tentative si carrousel trop court | 120 s |
| Passe de correction | 60 s |
| Relecture rédactionnelle (2e passe éventuelle) | 60 s |

Dans le pire cas, le cumul dépasse la durée maximale autorisée par la plateforme : la demande est coupée, l'utilisatrice attend plusieurs minutes puis ne reçoit rien. C'est cohérent avec les deux coupures observées le 16/09 à 18:03 et 18:05 UTC.

## Ce qui est proposé

Ajouter un **budget temps global** à la génération, mesuré dès le début de la demande, et rendre les étapes optionnelles conditionnelles au temps restant :

1. Poser une échéance globale (environ 5 minutes de marge sous la limite plateforme).
2. Sauter la recherche « creuser le sujet » si elle ne tient pas dans le budget restant.
3. Ne relancer une écriture trop courte que s'il reste assez de temps ; sinon garder le résultat obtenu.
4. Sauter les passes de correction et de relecture quand le temps restant est insuffisant, en journalisant le saut — le carrousel est livré tel quel plutôt que perdu.
5. Réduire dynamiquement la limite de chaque appel au minimum entre sa valeur actuelle et le temps restant.

Principe : **toujours livrer un carrousel**, quitte à sauter les passes de finition, plutôt que de laisser la demande être coupée sans rien rendre.

## Détails techniques

- Fichier concerné : `supabase/functions/carousel-ai/index.ts` uniquement (les trois chemins express / mix / photo).
- Un petit utilitaire local `remainingMs()` basé sur un `startedAt = Date.now()` en tête de `handleRequest`, passé aux `abortTimeoutMs` existants.
- Aucune modification du modèle, des prompts, des quotas, des secrets ni de la base.
- Journalisation d'un événement par saut (`carousel_budget_skip`) pour mesurer la fréquence réelle.
- Vérification : `tsc` app + tests Deno ciblés carrousels, sans génération réelle.
- Le déploiement serveur reste à ta main : aucune fonction ne sera déployée sans ton accord.
