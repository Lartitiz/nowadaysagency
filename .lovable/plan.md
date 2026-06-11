# Newsjacking — analyse d'une URL d'actu fournie par l'utilisatrice

## Idée et pertinence

Très bonne idée et naturelle dans ce panneau. Aujourd'hui le flow part toujours d'une recherche Perplexity ("vibes" + intention libre) qui ramène des actus. Permettre de **coller un lien d'article** et générer directement les angles sur CETTE actu couvre un cas d'usage très concret : « j'ai vu cet article ce matin, qu'est-ce que j'en fais ? ».

Avantages :
- Zéro hallucination sur le sujet (on lit l'article, on ne le devine pas).
- Plus rapide qu'une recherche large (1 seul appel Anthropic, pas de Perplexity).
- Plus économe : 1 crédit pour 1 actu ciblée vs. recherche large.

## UX proposée

Ajouter dans le bloc d'intention un **3e champ** au-dessus (ou en dessous) des vibes :

```
🔗 Tu as déjà une actu en tête ?
[ Colle le lien ici (article, vidéo YouTube, post LinkedIn…) ]
[ Analyser ce lien ]   ← CTA séparé du "Lancer la recherche"
```

- Si l'utilisatrice colle une URL et clique sur "Analyser ce lien" → on bypasse Perplexity, on scrape l'URL, on construit UNE actu, on génère ses angles.
- Si elle laisse vide et clique sur "Lancer la recherche" → flow actuel inchangé.
- Les 2 modes cohabitent, pas de régression.

Résultat affiché : exactement comme aujourd'hui (carte actu + angles dépliables + bouton "Utiliser"). L'actu unique vient simplement avec un badge "📰 D'après ton lien" au lieu de venir de la recherche.

## Implémentation

### 1. Frontend — `src/components/creer/NewsjackingPanel.tsx`
- Nouveau state `urlInput: string` + validation URL simple (http/https).
- Nouveau bloc UI au-dessus des vibes (ou en bas, à valider) avec input + CTA.
- Nouveau handler `fetchFromUrl()` qui appelle une nouvelle Edge Function `newsjacking-from-url` avec `{ url, workspace_id }`, reçoit `{ actus: [oneActu] }` au même format, puis enchaîne le pré-calcul d'angles existant (`fetchPrimaryAngle`).

### 2. Backend — nouvelle Edge Function `supabase/functions/newsjacking-from-url/index.ts`
Pipeline :
1. Auth (`getUser`) + rate limit + workspace-guard (Vague 2 pattern) + `checkQuota("content")` (1 crédit, identique au flow recherche).
2. Validation Zod : `url: z.string().url()`.
3. **Scraping** via le helper existant `scrapeWebsite(url, signal)` de `_shared/scraping.ts` — pas besoin de Firecrawl, le helper est déjà utilisé partout (analyze-brand, deep-diagnostic).
4. Si scraping vide / échec → 422 `{ error: "Impossible de lire ce lien" }`.
5. Appel Anthropic Sonnet avec `getUserContext` (preset léger) + le texte scrapé, prompt qui extrait :
   - `titre` (titre réel de l'article)
   - `resume` (3-4 phrases neutres)
   - `source` (nom du média déduit du domaine)
   - `source_url` (URL fournie)
   - `axe` + `ton` + `force_pont` + `pertinence` (même format que les actus Perplexity)
6. `logUsage("content", 1)`.
7. Retour : `{ actus: [actuObject] }` — strictement le même format que `newsjacking-ai`, le frontend n'a rien d'autre à changer.

L'enrichissement angles continue d'utiliser `newsjacking-angles` existant (mode="primary" puis "variants"), aucun changement requis là.

### Choix techniques

- **Pas de Firecrawl** : le helper `scrapeWebsite` interne suffit, pas de nouveau secret/coût.
- **Pas de cache** : on suit le pattern actuel (chaque recherche = 1 crédit), équitable.
- **Pas de support multi-URLs** dans cette v1 (1 lien = 1 actu = 1 crédit).

## Hors scope (v2 possible)

- Support vidéos YouTube (transcription) — autre helper.
- Support posts LinkedIn (déjà `scrapeLinkedin`, mais auth requise).
- Détection auto de plusieurs angles concurrents dans un long-format (article 5000 mots).

## Questions à valider avant exec

1. **Placement** : input URL **au-dessus** des vibes (= chemin prioritaire) ou **en dessous** (= alternative discrète au cas où) ?
2. **Coût** : 1 crédit comme la recherche actuelle, OK ? (cohérent, on facture l'usage IA pas la recherche Perplexity en elle-même.)
3. **Format accepté** v1 : uniquement HTTP/HTTPS d'articles web ? On exclut explicitement YouTube/LinkedIn/Twitter pour ne pas promettre ce qu'on tient mal.
