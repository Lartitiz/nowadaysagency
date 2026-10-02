# Débloquer le message « La préparation des références est incohérente »

## Ce qui se passe

Ce n'est pas un problème avec tes photos, et ça n'arrive pas par hasard : ta demande bloque de la même façon à chaque envoi. Les journaux montrent le même blocage trois fois de suite (18:37, 18:41 et 18:44). C'est pour ça que « renvoie ta demande » ne sert à rien.

Pourquoi ça bloque :
- Ta dernière image a été préparée avec **deux consignes « bague »** : une avec la photo produit « bag dino+S (2) », une autre avec la photo portée « dino1 (2) ».
- Quand tu demandes une nouvelle retouche, l'assistant reprend ces deux consignes.
- Le correctif d'avant (« la photo produit définit la bague exacte ») remplace alors la photo des deux consignes par « bag dino+S (2) ».
- On obtient deux fois la même bague avec la même photo. Le Studio y voit une incohérence et s'arrête avant de créer quoi que ce soit. Rien n'est décompté.

## Correctif

1. Quand la photo produit est choisie pour la bague, les consignes « bague » sont réunies en **une seule**. On garde l'emplacement et la consigne de la première.
2. Une sécurité générale en plus : si deux consignes visent exactement la même photo pour le même rôle, elles sont réunies au lieu de tout bloquer.
3. Rien d'autre ne change : il faut toujours confirmer la proposition, aucune image n'est lancée toute seule, et le texte, les photos et les choix déjà validés restent les mêmes.
4. Je mets en ligne uniquement la partie Studio du serveur. Le site public n'est pas mis à jour.

Après ça, renvoie ta demande telle quelle. Tu devrais recevoir une proposition à confirmer.

## Détails techniques

- Cause confirmée dans les journaux : `[visual-studio:targets] problems: ["duplicate_mapping"]` aux révisions 33, 34 et 35 de la session e046aabb. La version parente 86cef753 a deux targets `product` (ids 3181c082 et 61e7a95a). Le garde-fou `preferredProductReference` (`index.ts` ~1155) remappe chaque target produit vers `[3181c082]`, ce qui crée deux clés `3181c082:product` identiques.
- `supabase/functions/visual-studio/index.ts` : après le remappage, ne garder qu'un seul target `product` (le premier) avec `reference_ids: [preferred.id]`.
- `supabase/functions/visual-studio/scene-workflow.ts` (`repairTargets`) : fusionner les targets de même rôle dont les `reference_ids` sont identiques, avant validation.
- Tests Deno : deux targets produit remappés vers le même id donnent un seul target valide ; deux personnes distinctes ne sont jamais fusionnées. Vérification par `deno check` et `supabase--test_edge_functions` avec un filtre.
- Redéploiement de `visual-studio` uniquement.
