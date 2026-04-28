# Plan — Fix bug "pas assez d'actu" sur Surfer sur l'actu

## Contexte

L'Edge Function `newsjacking-ai` est trop contrainte : `max_tokens: 2048` insuffisant (les réponses avec web search interleaved sont coupées), `max_uses: 8` limite la couverture, et le prompt exige "exactement 6 actus" avec répartition stricte. Quand Claude ne peut pas remplir, il renvoie un message d'erreur ou un JSON vide → le frontend affiche "pas assez d'actu".

Le frontend (`NewsjackingPanel.tsx`) gère déjà `actus.length === 0` avec un message, et affiche correctement n'importe quel nombre d'actus > 0 (vu via `visibleActus`). Donc **aucun changement frontend nécessaire** — il suffit d'assouplir le backend.

## Périmètre — Edge Function uniquement

**Fichier : `supabase/functions/newsjacking-ai/index.ts`**

### Fix 1 : Augmenter `max_tokens` 2048 → 4096
Donne assez de room à Claude pour générer 6 actus détaillées avec le raisonnement web search interleaved.

### Fix 2 : Augmenter `max_uses` web_search 8 → 10
Permet à Claude de couvrir les 6 axes (3 globaux + 3 niche) avec un peu de marge pour reformuler une recherche infructueuse.

### Fix 3 : Assouplir le prompt — accepter 3 à 6 actus
- Ligne 169 (`RÉPARTITION STRICTE — exactement 6 actus`) → `RÉPARTITION SOUPLE — entre 3 et 6 actus, qualité avant quantité`.
- Ligne 192 (message user) : remplacer "renvoie 6 actus" par "renvoie entre 3 et 6 actus variées. Privilégie la qualité : mieux vaut 3 bonnes actus que 6 médiocres."
- Garder la règle "jamais 2 actus du même axe" et le mix de tons (mais conditionnel au nombre).

## Détails techniques

```ts
// L.190-192
max_tokens: 4096,
tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
messages: [{ role: "user", content: systemPrompt + `\n\nFais les recherches maintenant et renvoie entre 3 et 6 actus variées (axes + tons mélangés). Privilégie la qualité : mieux vaut 3 bonnes actus que 6 médiocres.` }],
```

Et dans le `systemPrompt`, remplacer la section "RÉPARTITION STRICTE" par une formulation souple qui demande "idéalement 3 globales + 3 niche, mais accepte 2+1 ou 3+2 si certains axes ne donnent rien".

## Hors périmètre (pas touché)

- Frontend `NewsjackingPanel.tsx` : déjà tolérant à `< 6 actus`, gère le cas vide avec message.
- Logique de parsing JSON : déjà robuste (3 stratégies).
- Quota / rate-limit / auth : intacts.

## Vérification

1. Déployer la fonction (auto via Lovable).
2. Re-tester `/creer` → bouton "Surfer sur l'actu" → doit retourner 4-6 actus la plupart du temps.
3. Vérifier les logs : `Raw text blocks count` et `Full text length` doivent indiquer une réponse non tronquée.