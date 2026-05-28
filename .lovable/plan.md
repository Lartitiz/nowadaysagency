# Plan

## Objectif
Empêcher qu’un contenu périmé comme le webinaire du 7 mai remonte encore dans les suggestions d’actus.

## Ce que je vais corriger
1. Corriger l’appel Perplexity pour que le filtre de date fonctionne réellement.
   - Aujourd’hui, la requête envoie à la fois `search_recency_filter` et `search_after_date_filter`.
   - Les logs montrent que cette combinaison est refusée par Perplexity en 400.
   - Résultat : le sourcing “actu chaude” échoue silencieusement, donc on retombe surtout sur le fallback de recherche web, moins strict.

2. Durcir le rejet des événements/webinaires passés dans le pipeline serveur.
   - Ajouter des garde-fous sur les titres/résumés contenant des signaux d’événement, de replay ou d’inscription.
   - Renforcer le filtrage des dates ambiguës ou absentes avant qu’une actu ne soit proposée au frontend.

3. Verrouiller aussi le fallback Anthropic pour éviter qu’il réinjecte ce type de sujet.
   - Ajouter une consigne explicite interdisant tout événement daté déjà passé, même s’il “fait encore parler”.
   - Ajouter une post-validation côté serveur sur la réponse finale pour retirer les sujets qui contiennent ce type de pattern avant envoi au client.

4. Vérifier le flux complet de sortie.
   - Confirmer que si Perplexity ne renvoie rien de valide, on préfère moins de résultats plutôt que des résultats périmés.
   - S’assurer que le frontend n’affiche que les actus validées.

## Résultat attendu
- Plus de webinaires, conférences ou replays passés dans les cartes d’actus.
- Les suggestions peuvent être moins nombreuses, mais elles seront réellement fraîches.
- Le mode “globale” restera global, sans recycler des contenus vieux ou evergreen.

## Détails techniques
- Fichiers ciblés :
  - `supabase/functions/_shared/perplexity.ts`
  - `supabase/functions/newsjacking-ai/index.ts`
- Validation prévue :
  - contrôle des logs de la fonction pour confirmer la disparition de l’erreur 400 Perplexity
  - test du flux avec une recherche newsjacking pour vérifier que les événements périmés sont exclus