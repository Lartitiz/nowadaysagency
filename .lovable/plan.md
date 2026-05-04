## Problème observé

Sur `/creer` → "Surfer sur l'actu", le panneau Newsjacking renvoie des actus trop centrées sur le métier littéral. Pour une marque de lingerie, il propose surtout des actus mode/lingerie, alors qu'on attend aussi : plaisir, sensualité, féminité, intimité, self-love, body positive, rituels, fêtes des amoureux, etc.

## Diagnostic technique

Dans `supabase/functions/newsjacking-ai/index.ts` :

- Les requêtes web envoyées à Claude sont construites à partir de **3 champs bruts** : `profile.activite`, `profile.cible`, `brand_profile.combat_cause`. Donc une marque "lingerie" tape "lingerie actualité…", "lingerie tendance…" → résultats hyper littéraux.
- Le prompt n'élargit jamais explicitement vers l'**univers émotionnel** vendu (la transformation, pas le produit).
- Le contexte de marque complet est bien chargé (`CONTEXT_PRESETS.content`) mais sert uniquement de "pont explicite" en post-filtrage, pas à formuler les requêtes.

Conclusion : le moteur de génération de queries est trop pauvre. Il faut **précomputer un univers sémantique** à partir du branding avant la recherche web.

## Objectif

Faire en sorte que pour une marque "lingerie", l'IA cherche aussi des actus sur le plaisir, la sensualité, la confiance en soi, les rituels féminins, etc., et que les résultats soient un **mix** entre actus métier et actus d'univers.

## Plan

### 1. Ajouter une étape "extraction d'univers de marque" en amont - ici peut-être ne pas le faire à chaque fois juste la première fois et comme ça l'otuil garde en mémorie ?

Fichier : `supabase/functions/newsjacking-ai/index.ts`

Avant l'appel Claude+web_search, faire un **petit appel IA rapide** (Sonnet, ~600 tokens, sans web_search) qui prend le branding complet en entrée et renvoie un JSON :

```json
{
  "univers_emotionnel": ["plaisir", "féminité", "sensualité", "self-love", "intimité"],
  "moments_de_vie_cible": ["Saint-Valentin", "post-rupture", "premier date", "retour de couches"],
  "valeurs_combat": ["body positive", "déconstruction des injonctions"],
  "themes_lifestyle": ["rituels du soir", "cocooning", "self-care"]
}
```

But : transformer "lingerie" en 10-15 termes connexes ancrés dans le profil (persona, offres, story, combat, piliers, voix). C'est cette extraction qui débloque l'élargissement — pas le prompt principal qui n'a pas la "place mentale" de le faire au milieu de 6 recherches web.

Coût : ~3-5s ajoutées, 1 appel Claude Sonnet. Acceptable pour une feature déjà en `deep_research` quota.

### 2. Construire les requêtes web à partir de cet univers (pas seulement de l'activité)

Toujours dans `newsjacking-ai/index.ts` :

- Garder 3 axes "micro-phénomènes culturels" comme aujourd'hui (mot_qui_revient, obsession_collective, etc.).
- Pour les 3 requêtes "niche", les enrichir :
  - 1 requête métier littéral (`activite + actualité + mois`)
  - 1 requête **univers émotionnel** (ex. `plaisir féminité sensualité débat 2026`) — tirée des `univers_emotionnel`
  - 1 requête **moments de vie / cible** (ex. `Saint-Valentin estime de soi rituel 2026`) — tirée des `moments_de_vie_cible`

### 3. Mettre à jour le prompt principal pour exploiter l'univers

- Injecter le bloc "UNIVERS DE MARQUE ÉLARGI" dans le system prompt, avec les 4 listes ci-dessus.
- Ajouter une règle : "au moins 1 sujet doit venir de l'univers émotionnel et 1 des moments de vie cible (pas du métier littéral). Le pont explicite reste obligatoire et doit citer un terme précis de cet univers."
- Enrichir les exemples de bons ponts avec un exemple "lingerie → plaisir".
- Garder les garde-fous existants (1/3 décalant, jamais 2 sujets du même axe).

### 4. Petit affinage UI (optionnel mais utile)

Fichier : `src/components/creer/NewsjackingPanel.tsx`

- Le message de chargement passe de "L'IA explore l'actu de ta niche…" à "L'IA explore l'univers de ta marque puis l'actu…" pour expliquer les ~5s ajoutées.
- Ajouter un nouveau filtre : `Univers` en plus de `Globale` / `Niche`. Backend : tagger chaque actu avec un nouveau champ optionnel `origin: "metier" | "univers" | "moments_vie" | "culture"` (déduit du prompt). Si on ne veut pas toucher l'UI tout de suite, ce champ peut rester invisible côté front et n'être ajouté que dans une 2e itération.

→ Décision proposée : **livrer 1+2+3 d'abord** (le vrai gain est là). Le filtre UI peut attendre une 2e passe une fois qu'on a vu la qualité des résultats en vrai.

## Détails techniques

### Nouveau bloc dans `newsjacking-ai/index.ts`

```text
1. extract brand-context (déjà fait via getUserContext)
2. NEW: callBrandUniverse(ctx) → JSON {univers_emotionnel, moments_de_vie_cible, valeurs_combat, themes_lifestyle}
   - Sonnet, 600 max_tokens, temperature 0.7, pas de web_search
   - System prompt court, demande d'élargir au-delà du métier littéral en s'ancrant dans persona+offres+combat+story
   - Try/catch : si l'appel échoue → fallback {} et on continue avec l'ancienne logique
3. Construire nicheQueries en mixant activite + univers_emotionnel + moments_de_vie_cible
4. Injecter le bloc "UNIVERS ÉLARGI" dans le systemPrompt principal
5. Reste inchangé (web_search Anthropic + parsing + quota)
```

### Garde-fous

- Si l'extraction d'univers retourne 0 terme (ex. branding vide) → on retombe proprement sur l'ancien comportement, pas d'erreur visible côté user.
- Timeout de l'appel d'extraction : 15s (le total reste sous le timeout front de 90s).
- Pas de modification du quota : ça reste 1 `deep_research` par clic.

## Hors scope

- Pas de connecteur externe (Perplexity/Firecrawl). Le `web_search` natif d'Anthropic suffit si on lui donne de meilleures requêtes.
- Pas de refonte UI au-delà du message de chargement.
- Pas de changement de schéma DB.

## Critères de validation

1. Sur un compte test "marque de lingerie", `/creer` → "Surfer sur l'actu" renvoie au moins 1 actu qui ne parle pas de lingerie mais de plaisir/féminité/self-love/etc., avec un pont explicite vers le profil.
2. Pour un coach sportif, on voit des actus sur la confiance en soi, le rapport au corps, la discipline — pas que "fitness" et "musculation".
3. Pas de régression : pour un compte sans branding rempli, ça retourne le même type d'actus qu'avant.
4. Temps total < 90s.