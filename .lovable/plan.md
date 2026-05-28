## Pourquoi ce vieux webinaire ressort

J'ai rouvert `supabase/functions/_shared/perplexity.ts` et regardé comment on appelle Sonar. Trois trucs concrets expliquent que des contenus "morts" (webinaires passés, événements terminés, pages institutionnelles) remontent :

1. **Le filtre de récence de Sonar est laxiste.** On envoie `search_recency_filter: "week"`, mais ce paramètre filtre sur la *date de crawl/indexation* de Perplexity, pas sur la date de publication réelle. Une page de webinaire qui se fait recrawler chaque semaine (parce qu'elle a un compteur d'inscriptions, un widget, un lien de replay) passe le filtre alors que l'événement est passé depuis des mois.
2. **On ne valide jamais la date côté serveur.** Le modèle nous renvoie `date_publication`, on l'affiche sans vérifier qu'elle est dans la fenêtre. Et même quand il pourrait la mettre, il l'invente parfois en se basant sur la date du crawl, pas du contenu.
3. **Le modèle utilisé est `sonar` (le plus light).** Sur des requêtes ouvertes type "actus qui font débat cette semaine", il a tendance à empiler des pages SEO mainstream ou des aggregateurs (eventbrite-like, pages métier, replays) sans hiérarchiser par fraîcheur réelle.

À ça s'ajoute que rien n'empêche la **même actu** de remonter à chaque "Relancer" (pas de mémoire de ce qui a déjà été montré).

## Ce que je propose de changer dans `_shared/perplexity.ts` + `newsjacking-ai/index.ts`

### 1. Mettre une vraie date plancher dans la requête Sonar

Au lieu de juste `search_recency_filter`, ajouter aussi :

```ts
search_after_date_filter: "MM/DD/YYYY" // = aujourd'hui - 10 jours
```

Sonar respecte mieux ce filtre que `recency` seul (les deux peuvent coexister). Marge de 10 j (pas 7) pour ne pas perdre une actu de fin de semaine précédente qui rebondit.

### 2. Verrouiller dans le prompt

Ajouter en tête de prompt :

> "Date d'aujourd'hui : `<date>`. Tu ne renvoies QUE des actus publiées entre le `<today-10>` et aujourd'hui. INTERDIT : webinaires/événements/conférences passés, pages 'replay', annonces d'événements à venir, communiqués institutionnels evergreen, marronniers (palmarès annuels, baromètres récurrents). Si tu n'es pas sûre de la date de publication, JETTE le sujet."

Et exiger `date_publication` (pas optionnel), au format ISO strict.

### 3. Filtrer côté code après réception

Après le parse, on droppe toute actu dont :

- la `date_publication` est absente, mal formée, ou > 14 jours
- le titre/résumé contient `webinaire`, `webinar`, `replay`, `inscription ouverte`, `save the date`, `s'inscrire`, `live le`, `conférence du`, ou un nom de mois passé (logique simple).

Si moins de 2 actus survivent → on log + on relance Sonar une fois avec `search_after_date_filter` à -5 j (plus serré) avant de renvoyer ce qu'on a.

### 4. Passer à `sonar-pro` pour cette requête

`sonar-pro` fait du multi-step search et discrimine mieux la fraîcheur. Coût marginal en plus, mais c'est *la* requête qui fonde toute la suite du newsjacking — ça vaut le coup. (On garde `sonar` partout ailleurs.)  il est placé partout ailleurs. Pourquoi ne pas passer à Sonar Pro dans les autres, justement, pour améliorer la qualité  ?

### 5. Dédupliquer entre deux "Relancer"

Garder en mémoire côté composant `NewsjackingPanel` les `source_url` (ou un hash titre normalisé) déjà retournés dans la session, et les passer en `excluded_urls` au backend pour les exclure de la prochaine requête. Côté serveur, ces URLs sont injectées dans le prompt Sonar avec un "ne propose pas ceci".

## Hors scope, à confirmer si tu veux que je l'ajoute

- **Liste noire de domaines** (`search_domain_filter` avec `-eventbrite.com`, `-bpifrance.fr`, `-`*.eventmaker.app`*, etc.). Risque : on coupe des sources légitimes. À calibrer après une vague de tests, pas en aveugle.
- **Cache anti-resurgence cross-session** (en DB, garder 30 jours de URLs déjà vues par user). Plus lourd, à faire seulement si la dédup intra-session ne suffit pas.

## Fichiers touchés

- `supabase/functions/_shared/perplexity.ts` — date plancher, prompt durci, modèle `sonar-pro`, validation date côté code, exclusion par mots-clés, support `excludedUrls`.
- `supabase/functions/newsjacking-ai/index.ts` — relais du paramètre `excluded_urls` depuis le body, passage à `fetchHotNews`.
- `src/components/creer/NewsjackingPanel.tsx` — mémorisation des URLs déjà vues dans la session, envoi à chaque Relancer.