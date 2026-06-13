## Problème
Le prompt `creative-flow` ne limite pas le nombre de hashtags pour les formats Instagram (carrousel, reel, stories). L'IA génère parfois 10+ hashtags, alors que la règle métier impose un maximum de 3 hashtags sur Instagram.

## Solution
Ajouter une instruction explicite dans la section **LONGUEURS OBLIGATOIRES** du prompt `creative-flow`.

## Fichier modifié
`supabase/functions/creative-flow/index.ts` uniquement.

## Changement exact
Dans la section `LONGUEURS OBLIGATOIRES` (~ligne 718), ajouter une ligne de contrainte hashtags pour Instagram :

```
- Instagram (Carrousel, Reel, Stories) : 3 hashtags maximum en fin de légende.
```

Placement : juste après la ligne LinkedIn (`0-2 hashtags en fin`) et avant la ligne Newsletter.

## Vérification
- Déploiement de l'Edge Function `creative-flow`.
- Test de génération d'un carrousel Instagram pour s'assurer que l'IA respecte la nouvelle contrainte.

## Hors scope
- Aucune modification de l'interface utilisateur (compteur, validation textarea).
- Aucun autre fichier que `creative-flow/index.ts`.