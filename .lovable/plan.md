## Audit des prompts Perplexity

### Constats

**1. Confusion system / user.** Sonar utilise le `user message` comme base de la requête de recherche. Aujourd'hui notre user prompt fait ~45 lignes (mode scoop) : titres emoji, listes INTERDIT/AUTORISÉ, exemples, format JSON, date du jour, profil… Tout ça pollue le signal de recherche. Sonar fait sa recherche web sur du bruit au lieu d'une question claire.

**2. Le system message est sous-exploité.** Il fait 1 phrase. Or c'est là qu'on devrait mettre les règles stables (éthique, format, garde-fous) que Sonar applique à toutes les requêtes sans les ré-encoder côté recherche.

**3. JSON demandé en prose.** "Réponds UNIQUEMENT avec ce JSON, sans markdown" → fragile. Sonar supporte `response_format: { type: "json_schema", ... }` qui force la structure et fiabilise le parsing. On en bénéficierait gratuitement (suppression de la moitié du try/catch dans `callSonar`).

**4. Redondances dans le user prompt scoop :**
   - Les 6 catégories (a-f) sont utiles → on garde.
   - Le bloc INTERDIT répète des choses déjà dans le bloc AUTORISÉ ("PAS du fait divers" déjà dit dans AUTORISÉ).
   - Le bloc FRAÎCHEUR redit ce que fait déjà `search_after_date_filter`.
   - Les consignes de format des champs (titre <90 caractères, etc.) sont mieux dans le json_schema.

**5. Mode default : prompt trop défensif.** "Si tu n'es pas SÛRE → JETTE" combiné à `search_after_date_filter` strict produit souvent 0 actus. Notre filtre code refait déjà ce travail (`isFreshEnough`, `looksEvergreen`). Doubler la défense côté prompt = perte sèche.

**6. `web_search_options` non utilisé.** Sonar-pro accepte `web_search_options: { search_context_size: "high" }` qui élargit la fenêtre de contexte de recherche. Utile en mode scoop où on veut de la diversité.

---

## Plan

Un seul fichier : `supabase/functions/_shared/perplexity.ts`. Pas de changement DB, pas de changement UI, pas de changement contractuel pour `newsjacking-ai/index.ts`.

### 1. Réécrire les system prompts (stables, riches)

Deux systems courts mais denses, contenant TOUTES les règles éthiques et de format. Ils ne changent jamais entre les requêtes → cachables côté Perplexity.

**System scoop** (~10 lignes) :
- Rôle : assistante de veille newsjacking, audience francophone, focus France.
- Mission : sujets CHOC grand public de la semaine.
- Règles éthiques permanentes : autorise accusations publiques nommées (MeToo, mises en cause médiatisées), interdit faits divers locaux anonymes + propagande partisane + webinaires/marketing.
- Règle de format : titre <90 car., résumé 2 phrases, source nommée, URL obligatoire, date estimée OK si floue.
- Règle de diversité : jamais 3 sujets du même registre.

**System default** (~8 lignes) : équivalent pour le mode niche, sans la partie diversité.

### 2. Réécrire les user prompts (courts, ciblés)

**User scoop** (~12 lignes au lieu de 45) :
```
Date du jour : {today}. Actus actives depuis le {afterDate}.

Trouve 6 actus CHOC de la semaine en France qui font débat grand public.
Couvre AU MOINS 4 des 6 catégories suivantes (1 par catégorie idéalement) :
  (a) Scandale / accusation visant une personnalité publique connue
  (b) Événement culturel en cours (festival, cérémonie, sortie marquante)
  (c) Polémique société / débat viral
  (d) Chiffre / rapport / enquête qui choque
  (e) Déclaration publique virale (interview, post, plateau)
  (f) Affaire judiciaire / économique / institutionnelle

{universLine si présente}
{excludedLine si présente}
```

**User default** (~8 lignes) : version équivalente compacte, sans les catégories.

Les listes INTERDIT/AUTORISÉ disparaissent du user prompt (elles sont dans le system). Le format JSON disparaît aussi (il est dans `response_format`).

### 3. Activer `response_format: json_schema`

Définir un schéma strict :
```ts
{
  type: "json_schema",
  json_schema: {
    name: "actus_chaudes",
    schema: {
      type: "object",
      properties: {
        actus: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titre: { type: "string", maxLength: 90 },
              resume: { type: "string" },
              source: { type: "string" },
              source_url: { type: "string" },
              date_publication: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
            },
            required: ["titre", "resume", "source", "source_url"]
          }
        }
      },
      required: ["actus"]
    }
  }
}
```

Conséquence : le bloc try/catch fallback (recherche manuelle de `{` / `}`) peut rester en filet de sécurité mais ne servira plus en pratique.

### 4. Activer `web_search_options` en mode scoop

```ts
web_search_options: { search_context_size: "high" }
```

Donne à Sonar plus de contexte pour ramener une vraie diversité de sources. Coût marginal (~10% tokens), gain net pour le scoop.

### 5. Garder `sonar-pro`

Aucun changement de modèle. Documenter en commentaire pourquoi (déjà le bon choix pour notre cas : multi-step search + diversité de citations + tokens raisonnables).

### 6. Réduire `max_tokens`

Avec un schéma JSON strict et des prompts épurés, on peut redescendre :
- scoop : 2800 → 2000
- default : 1500 → 1000

Économie directe sur la facture, latence légèrement réduite.

---

## Ce qu'on ne touche PAS

- `newsjacking-ai/index.ts` : aucune modif. Le contrat de `fetchHotNews` reste identique.
- Les filtres code (`isFreshEnough`, `looksEvergreen`, retry) restent — ce sont eux qui assurent la qualité finale.
- Le bloc Claude (`scoopBlock`, `hotNewsBlock`) reste tel qu'on l'a refondé au tour précédent.

## Fichiers touchés

- `supabase/functions/_shared/perplexity.ts` (callSonar : prompts + response_format + web_search_options + max_tokens)

## Vérification

Après déploiement :
1. Tester "Actu choc à rebondir" → vérifier dans les logs qu'on a toujours 4-6 actus.
2. Vérifier dans les logs qu'on n'a plus de `[perplexity] JSON parse failed` (le schema force la structure).
3. Vérifier la diversité catégorielle dans la liste affichée.
