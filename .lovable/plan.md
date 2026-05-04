# Surfer sur l'actu — passer à Perplexity + ré-autoriser l'actu chaude

## Diagnostic

Aujourd'hui le sourcing s'appuie sur `**web_search` natif d'Anthropic** dans `newsjacking-ai`. Trois biais qui produisent des sujets fades :

1. **Outil de recherche faible**. Le `web_search` Anthropic est un outil utilitaire, pas un moteur d'actu. Il rate les vraies polémiques, sorties et déclarations qui font le buzz. Perplexity est conçu pour ça (synthèse + sources datées + filtre de récence natif).
2. **Filtre trop défensif**. Le prompt blackliste politique partisane, lois, élections, faits divers, communiqués tech mainstream, "IA"/"ChatGPT". Résultat : on ne propose que des micro-phénomènes culturels mous (un mot qui revient, une obsession collective). On loupe les sujets vraiment chauds qui font débat.
3. **Requêtes sur-pilotées**. Les 6 axes "micro-phénomènes" sont des requêtes très étroites ("expression mot concept qui revient conversations 2026 France"). Perplexity, lui, retourne mieux quand on lui demande directement "quelles sont les actus qui font débat cette semaine en France".

L'utilisatrice a raison : la solution = brancher une vraie liaison de recherche.

## Choix de la liaison : Perplexity

**Pourquoi Perplexity vs alternatives** :

- Connecteur officiel (gateway Lovable). Pas de gestion manuelle de clé.
- Modèle `sonar` retourne réponses synthétisées + tableau `citations` (URLs sources).
- Filtre `search_recency_filter` natif (`day` / `week` / `month`) → on cible vraiment l'actu chaude.
- Filtre `search_domain_filter` → on peut prioriser presse FR (lemonde.fr, telerama.fr, slate.fr, lesinrocks.com…).
- Réponses structurées via `response_format: json_schema` → fini le parsing fragile actuel.

Coût : ~équivalent à un appel Claude classique. Latence : 5-15s par requête.

## Périmètre

Modification **uniquement** de `supabase/functions/newsjacking-ai/index.ts` (sourcing).
**Pas touche** à `newsjacking-angles` (génération d'angles) — l'utilisatrice a confirmé.
**Pas touche** au composant UI `NewsjackingPanel.tsx` — la shape de réponse reste identique.

## Architecture cible

```text
Utilisateur clique "Surfer sur l'actu"
        │
        ▼
newsjacking-ai (edge function) ─── inchangé : auth, quota, brand_universe
        │
        ▼
3 appels Perplexity en parallèle (Promise.allSettled) :
  1. Actu chaude globale qui fait débat (recency: week, domain: presse FR)
  2. Sujet de l'univers de marque niveau 1 (valeurs/combats)
  3. Sujet de l'univers de marque niveau 2 (univers émotionnel) OU phénomène culturel
        │
        ▼
Compilation : ~6-10 sujets bruts avec sources datées et citations
        │
        ▼
Passe Claude (haiku/sonnet) — JOB UNIQUE : filtrer + tagger + écrire le pont
  - Reçoit les sujets bruts + citations + le brand_universe
  - Garde 3-6 sujets connectables, écrit le champ "pertinence" pour chacun
  - Auto-évalue force_pont + tag axe + ton (logique actuelle conservée)
        │
        ▼
Réponse JSON identique au contrat actuel : { actus: [...] }
```

Cette double passe (Perplexity = matière fraîche / Claude = pont éditorial) sépare proprement les deux jobs aujourd'hui mélangés en un seul appel Claude+web_search.

## Changements éditoriaux dans le prompt

### Axes de recherche refondus

Les 6 axes actuels sont remplacés par 3 buckets envoyés à Perplexity : ok mais j'ai pas envie de tout casser ce qu'on a fait ? 


| Bucket                         | Recency | Domaines prioritaires                       | Question type                                                                                                                                     |
| ------------------------------ | ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Actu chaude qui fait débat** | `week`  | Presse FR généraliste + Twitter trending    | "Quelles 2-3 actus de cette semaine en France font le plus débat sur les réseaux ? Inclure polémiques, sorties marquantes, déclarations virales." |
| **Sujet ancré niveau 1**       | `month` | Mix presse + médias spé                     | "Quelles actus récentes touchent à : `{valeurs_combat[0..2]}`, `{moments_de_vie[0..2]}` ?"                                                        |
| **Sujet niveau 2 / culturel**  | `month` | Médias culturels (telerama, slate, inrocks) | "Quelle sortie culturelle ou phénomène culturel récent connecte avec : `{univers_emotionnel[0..2]}` ?"                                            |


Ré-autoriser explicitement dans le prompt Perplexity : polémiques, déclarations virales, sorties produit/film/livre/série discutées, débats société. **Toujours blacklisté** : faits divers tragiques, propagande partisane explicite (qui décrédibiliserait la cliente).

### Filtre Claude (passe 2)

Reprend les garde-fous existants qui marchent bien (force_pont fort/moyen/fragile, ⌈N/3⌉ décalants, pont explicite citant un élément du profil), mais s'applique à des sujets déjà sourcés et chauds — donc ne génère plus dans le vide.

## Garde-fous & qualité

- **Cache 90 minutes** sur la réponse Perplexity (même userId + workspaceId) pour éviter de re-payer si la cliente clique 2× en peu de temps. Stockage : table existante `ai_cache` si elle existe, sinon Map en mémoire de l'edge function.
- **Fallback** : si Perplexity tombe (timeout, 5xx, 402 credits) → on retombe sur le pipeline Claude+web_search actuel pour ne pas casser l'expérience. Code actuel = code de secours.
- **Citations préservées** : on remonte `source` (média) ET `source_url` (lien direct) jusqu'au front. Petite addition à la shape de l'objet `Actu` dans le panel (champ optionnel `source_url`).
- **Quota** : reste sur `deep_research` (1 appel = 3 Perplexity + 1 Claude ≈ 1 deep research).
- **Timeout** : 60s (Perplexity en parallèle ~15s + Claude ~10s + marge).

## Setup utilisateur — étape unique

L'utilisatrice doit cliquer **Connecter Perplexity** (action en sortie de plan). Le connecteur Perplexity passe par le gateway Lovable, donc :

- Pas de clé API à coller manuellement
- Compte Perplexity Pro requis (≈20€/mois) pour un quota suffisant — à confirmer avec l'utilisatrice si elle en a déjà un
- Une fois connecté, `PERPLEXITY_API_KEY` est injectée auto dans les edge functions

## Fichiers modifiés

- `supabase/functions/newsjacking-ai/index.ts` — refonte du cœur de la fonction (sourcing Perplexity + 2e passe Claude de filtre/pont)
- `src/components/creer/NewsjackingPanel.tsx` — ajout du champ optionnel `source_url` sur l'interface `Actu` + mini lien "voir la source" sous chaque sujet
- (aucun changement DB, aucune nouvelle table)

## Critères de validation

1. La cliente reconnaît au moins 1 sujet "ah oui j'en ai entendu parler cette semaine" sur les 3-6 retournés.
2. Au moins 1 sujet a un `source_url` cliquable qui mène à un article daté de moins de 7 jours.
3. Tous les sujets ont un `pertinence` qui cite un élément concret du profil (cible / activité / combat / pilier ou terme univers niveau 1).
4. Si Perplexity tombe → la fonction retourne quand même des résultats (fallback Claude actuel).
5. La latence end-to-end reste < 30s (90% des appels).

## Ce qui n'est PAS dans ce plan

- Refonte de `newsjacking-angles` (l'utilisatrice a explicitement dit non)
- Changement du flow UI (panel reste tel quel sauf le mini lien source)
- Cache long terme / table dédiée (on commence avec 90min en mémoire)

## Action utilisateur attendue après ce plan

1. Approuver le plan
2. Cliquer le bouton "Connecter Perplexity" (apparaîtra après approbation)
3. Tester sur un cas réel et me dire si la profondeur est au rendez-vous