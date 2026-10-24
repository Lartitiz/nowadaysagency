# Audit de coût de l'API Anthropic (octobre 2026)

Audit en lecture seule, fait le 20/10/2026 sur `origin/main`. Aucun code, aucune fonction, aucune migration, aucun secret ni réglage n'a été modifié.

Contexte (corrigé le 20/10 avec les chiffres de la console Anthropic) :
- **API des outils** (clés `assistant-app` et `mission-flow`) : environ **830 $ sur l'année**, dont **144,56 $ en juillet**.
- Le pic d'environ 1 700 € de juillet (recharges automatiques les 2, 13, 15 et 30 juillet) était du **développement fait avec Claude Code**, pas de l'API de l'outil.
- 241 € d'abonnements encaissés sur la même période.
- Depuis le 9 octobre, l'API est plafonnée à 200 $ par mois.

La première version de ce rapport partait de 2 800 € d'API pour l'outil ; les ordres de grandeur ci-dessous sont recalés sur les vrais chiffres.

Conventions :
- Les chiffres incertains sont entre crochets.
- Les tarifs sont les tarifs publics Anthropic en dollars par million de tokens (Mtok). Pour un ordre de grandeur, 1 $ ≈ [0,9 €].
- 1 token ≈ [3,5 caractères] de français. Une photo envoyée au modèle ≈ [1 600 tokens].

## 0. En bref

1. **Le pic de juillet était du développement Claude Code, pas l'outil (confirmé par la console).** L'API des outils a coûté 144,56 $ en juillet et environ 830 $ sur l'année, soit [70 à 90 $ par mois] en moyenne. Le compteur interne (`ai_usage`, lu chaque lundi par `cron-health`) estimait le texte des clientes à environ 2 à 5 € par semaine en juillet et août : la plus grande part de ces ~830 $ n'est donc pas visible dans la base (point 2).
2. **Une partie du coût réel est invisible dans la base.**
   - Le compte de test Camille n'écrit rien dans `ai_usage` ni dans `content_quality_events`. Or la visite de 8 h y lance chaque jour de vraies générations : environ [40 à 65 $ par mois], soit [la moitié environ] de la facture API mensuelle des outils. Chiffre à confirmer dès que ces générations seront comptées.
   - Un carrousel fait 8 à 11 appels, dont 2 à 3 sur Opus, mais `ai_usage` n'en compte qu'une partie.
3. **L'app n'a aucune boucle dangereuse.** Aucune tâche programmée n'appelle l'IA, aucun traitement par lot sur les utilisatrices, aucun `useEffect` qui tourne en boucle. Il y a quelques appels automatiques, mais petits.
4. **Les postes les plus chers par action** sont le carrousel Qualité Max [1,5 à 2,5 $], les carrousels photo ou mixte [0,8 à 1,3 $], le carrousel texte [0,6 à 1 $], la boîte à idées (`content-coaching`, 7 appels Opus pour 1 crédit, [0,7 à 0,9 $]) et l'audit Instagram [0,3 à 0,7 $, jusqu'au double avec la relance automatique].
5. **Le cache de prompt coûte plus qu'il ne rapporte presque partout.** Le cache est posé sur tout le prompt système, qui contient les données de chaque utilisatrice : chaque appel paie l'écriture (+25 %) sans jamais relire le cache.
6. **Deux trous de quota** :
   - `deep-diagnostic` croit le champ `isOnboarding` envoyé par le navigateur : 1 appel Sonnet et jusqu'à 3 appels Opus, gratuits et sans trace, freinés seulement par la limite par minute (gardée en mémoire).
   - Les étapes gratuites de `creative-flow` (angles, accroches, questions, dictée) n'ont aucun quota. Elles ont un prompt système d'environ 51 000 caractères.

## 1. Inventaire des fonctions qui appellent l'API Anthropic

### 1.1 Ce qui vaut pour toutes les fonctions (`_shared/anthropic.ts`)

- **Cache** : `callAnthropic` et `callAnthropicWithMeta` posent toujours un seul `cache_control` éphémère sur tout le prompt système (`anthropic.ts:503` et `:654`). L'historique de conversation n'est jamais mis en cache.
- **Relances** :
  - 2 relances sur 429, 500, 529 et erreur réseau (3 s puis 6 s).
  - Pour Opus, une 4e tentative bascule sur Sonnet 4.6 (`anthropic.ts:565`).
  - Opus 5.5 est relancé s'il ne passe pas par l'outil attendu (`:543`).
- **Opus 5.5 réfléchit toujours.**
  - `max_tokens` est porté à au moins 16 000 (`maxTokensFor`, `:214`), avec l'effort `low` dans l'aide commune.
  - Ce plafond n'est pas facturé en soi : seuls les tokens réellement produits le sont, réflexion comprise.
- **Choix des modèles (`MODEL_MAP`, `:342`)** :
  - Opus 5.5 pour coaching, stratégie, audit branding et chat assistant.
  - Haiku 4.5 pour les questions.
  - Sonnet pour le reste. Le secret `AI_MODEL_SONNET` vaut `claude-sonnet-5` en production depuis mi-juillet (mémoire projet du 13/08), donc 2 $ / 10 $ au lieu de 3 $ / 15 $.
- **Ce qui échappe à `AI_MODEL_SONNET`** :
  - Les fonctions qui utilisent `getDefaultModel()` (secret `AI_MODEL_DEFAULT`, valeur en production [non vérifiée]).
  - Les littéraux `claude-sonnet-4-6` codés en dur : `audit-visual-templates:206`, `_shared/product-fidelity.ts:47` et le repli Opus vers Sonnet.
- **Le rédacteur du carrousel ne passe pas par cette aide.** `_shared/carousel-model.ts` appelle l'API directement, en Opus 5.5 (Fable 5.1 en Qualité Max), avec effort `medium`, sans relance 429/5xx.
- **Le quota est à 3 niveaux** :
  - `checkQuota` avant l'appel, `logUsage` après un succès : une ligne `ai_usage` = un crédit, `tokens_used` = entrée + sortie mélangées, sans détail du cache.
  - Les admins sont comptés.
  - Le compte de test Camille (`52e6c03c…`) n'est compté nulle part (`plan-limiter.ts:306`, `content-quality.ts:289`).

### 1.2 Tableau par fonction

Légende :
- Modèles : O = Opus 5.5, F = Fable 5.1, S = Sonnet (`SONNET_MODEL`), S4.6 = Sonnet 4.6 en dur, D = `getDefaultModel()`, H = Haiku 4.5.
- « Système » = taille du prompt système en caractères, hors données de l'utilisatrice sauf mention. « +marque » = fiche de marque injectée, [3 000 à 15 000 caractères] selon la fiche.
- Cache : « surcoût » = données de l'utilisatrice dans le système, donc écriture payée sans relecture. « utile » = système stable, relu entre appels ou entre utilisatrices. « aucun » = pas de système, ou système sous le seuil (Sonnet 1 024 tokens, Haiku 4 096, Opus 512).

#### Carrousel

| Fonction | Modèle | max_tokens | Système (car.) | Contexte injecté | Quota | Cache | Flux | Boucles, relances | Déclencheur | Appels par action |
|---|---|---|---|---|---|---|---|---|---|---|
| carousel-ai `express_full` texte | O (F en Qualité Max) + S + H | 16 000 (rédaction), 16 000 (relecture), ≤8 192 (juge) | rédacteur 30 000 à 45 000 (24 227 fixes + marque + recherche + 10 derniers textes + briefs) ; relecture 11 157 ; juge 11 700 | marque, recherche web, textes récents ; la marque repart 2 à 3 fois (juge, réparation, relecture) | `carousel` (+ `quality_max`) | rédacteur : surcoût (relu seulement pendant les réparations) ; juge et relecture : utile | oui (SSE) | réparation de structure, réparation du fil + 2e juge, relance de format du juge, re-passe | clic | 5 à 16, en général 8 à 11, dont 2 à 5 en Opus |
| carousel-ai photo / mixte (récit continu) | O vision + S vision + H | 5 500 → 16 000 | 13 000 à 15 000 | ≤10 photos renvoyées à chaque appel vision | idem | idem | oui | réécritures « plus court » et anti-redite, 2 à 3 appels d'association des photos | clic | 5 à 14, dont 1 à 4 Opus vision |
| carousel-ai photo / mixte classique | O + H/S | 16 000 | 50 000 à 70 000 | idem + photos à chaque réparation | idem | surcoût | oui | `retryIfTooShort` (2e génération complète) | clic | 6 à 17 |
| carousel-ai `hooks` | O / F | 16 000 | 30 000 à 45 000 | marque | `content` | surcoût | non | | clic | 1 à 2 |
| carousel-ai `slide_redo` | O / F + S | 4 000 → 16 000 | 30 000 à 45 000 pour une slide | marque | `content` | surcoût | oui | | clic « Refaire cette slide » | 2 à 4 |
| carousel-ai `structure_proposal` (plan) | S (vision si photos) | 8 192 | [18 000 à 30 000] | marque, photos | vérifié, non débité | surcoût | non | **doublement** : 2e appel identique à 80 s, chacun avec ses 3 tentatives, soit ≤6 requêtes | clic « Proposer un plan » | 1 à 2 |
| carousel-ai questions | H (vision si photos) | 1 024 / 4 096 | **30 000 à 45 000** (système du rédacteur entier) | marque | vérifié, non débité | surcoût | non | | ouverture de l'étape | 1 |
| carousel-ai `suggest_topics` / `suggest_angles` | S | **16 000** | 30 000 à 45 000 | marque | `suggestion` | surcoût | non | | clic | 1 |
| carousel-ai `assign_templates` | H (S en Qualité Max) | 1 500 | 1 000 à 2 000 | slides | **aucun** | aucun | non | | « Mes slides » | 1 |
| carousel-visual | S ; O en Qualité Max pour le rendu par le modèle ; H couverture | 1 500 à 16 384 (O : jusqu'à 24 576) | passes design 1 900 à 2 500 ; rendu par le modèle [25 000 à 30 000] avec la charte | charte, slides, photos, images de référence | `content` / `quality_max`, `photo_retouch` (couverture) | rendu : surcoût, lots parallèles qui écrivent chacun le cache | oui | lots de 3 slides en `Promise.all` + rattrapage, passe de contraste | après la rédaction | 2 (cas courant) à ~8 |

#### Création (hors carrousel)

| Fonction | Modèle | max_tokens | Système (car.) | Contexte injecté | Quota | Cache | Flux | Boucles, relances | Déclencheur | Appels par action |
|---|---|---|---|---|---|---|---|---|---|---|
| creative-flow `generate` | S + H (corrections) + S web_search (recherche) | 8 192 (post 4 096) | **40 000 à 69 000** sur profil vide (post 53 k, reel 69 k, stories 56 k, LinkedIn 46 k, newsletter 46 k) + marque | 30 700 fixes, puis incarnation (à ~7 800), puis marque, voix, calendrier, actu, recherche | `content` (+ `deep_research`) | surcoût (marque au milieu) | oui | recherche « creuser le sujet » (non comptée), 1 à 2 passes H, passes H sources / témoignages / tu-vous | clic | post 2 à 7, reel 3 à 7, LinkedIn 2 à 6 |
| creative-flow étapes gratuites (angles, accroches, questions, dictée, suite) | S / H (questions photo : S vision ≤10 photos) | jusqu'à 8 192 | angles 51 000, ajustement 41 000, dictée 35 000, questions 7 000 | marque | **aucun** (limite de 20 par minute, en mémoire) | surcoût | | | clic | 1 chacune |
| creative-flow recyclage | H (plan) + S par format en parallèle + H | 2 048 / 8 192 | idem | idem | `content` (1 crédit) | surcoût | | `Promise.all` par format | clic | **11 à 20 pour 5 formats** |
| generate-content | S | 1 024 à 8 192 | 9 000 à 35 000 | marque au milieu | `content` / `audit` | surcoût | non | + passe LinkedIn H, tu/vous H | clic ; **automatique** pour `weekly-suggestions` | 1 à 3 |
| linkedin-ai | S (+ Gemini via Lovable pour le modèle de post) | 4 096 | [25 000 à 30 000] | marque, fichiers | `content` / `bio_profile` | surcoût | non | crosspost : 2 canaux en parallèle, ≤4 H | clic ; **automatique** pour la légende d'un carrousel LinkedIn | 1 à 5 |
| newsjacking-ai | S + web_search (max 5) ; univers de marque en **O** | 8 192 | aucun système (11 000 + marque en message) | marque, univers, Perplexity | `deep_research` (l'univers Opus n'est pas compté) | aucun ; les tours `pause_turn` renvoient tout | non | 1 à 3 tours + 1 H de secours + 1 O tous les 30 jours | clic | 1 à 5 |
| newsjacking-angles | S | 700 à 1 500 | 3 500 + marque | actu | `content` | surcoût | non | | clic | 1 |
| newsjacking-from-url | S | 1 600 | 1 500 | page | `deep_research` | aucun | non | | clic | 1 |
| pinterest-visual | **O ×2** | 16 000 / **24 576** | 3 100 + marque ; 7 200 + charte | marque, charte | `content` | surcoût | non | relances outil | clic | 2 à 3 Opus |
| pinterest-photo-brief | **O ×2** | 16 000 | 1 900 ; 2 900 + charte | marque | `content` | surcoût | non | mise en forme ≤2 essais | clic | 2 à 3 |
| pinterest-inspiration | **O** | 16 000 | 2 800 | capture | `content` | utile | non | | clic | 1 |
| pinterest-ai | S | 4 096 | [5 000 à 10 000] | marque | `content` | surcoût | non | | clic | 1 |
| inspire-ai | S | 4 096 | aucun (≈15 000 en message) | marque, images | `content` | aucun | non | | clic | 1 |
| visual-studio (tour) | S (H si simple conversation) | 6 000 | **32 600 fixes** + outil 5 500 | **historique (24 messages) envoyé 2 fois** ; images de référence à chaque tour | pas de crédit, plafond 15 / jour en gratuit | utile (système fixe) | non | réparation de schéma, reprise, revérification avec images | clic | 1 à 4 |
| visual-studio integration-direction | S | 3 000 | 3 900 | images | `photo_retouch` à la génération | aucun | non | | clic | 1 |
| studio-video prepare | H ×3 | 500 à 2 300 | 2 000 à 3 000 | images | **non compté** (seuls les envois le sont) | aucun | non | | clic | 2 à 3 |
| photo-describe | H | 300 à 1 500 | court | image | limite par minute | aucun | non | | téléversement, **ouverture de /photos (boucle ≤5 photos)** | 1 |
| photo-dump-plan | S | 1 800 | [2 000 à 3 000] + marque | photos | limite par minute | [à la limite] | non | | clic | 1 |
| ai-text-action | S | 1 024 | 400 + règles + marque | texte choisi | `adaptation` | aucun | non | relance si dérive | clic | 1 à 2 |
| generate-comment | S | 4 096 | aucun (2 400 en message) | capture | `dm_comment` | aucun | non | | clic | 1 |
| prospect-dm | S | 4 096 | aucun (2 900 en message) | profil | `dm_comment` | aucun | non | | clic | 1 |
| visual-direction-suggest | S | 1 500 | 800 + règles | marque | `coach` | aucun | non | | clic | 1 |
| recycle-candidates | aucun appel IA | | | | | | | | | 0 |

#### Coaching et chats

| Fonction | Modèle | max_tokens | Système (car.) | Historique et contexte | Quota | Cache | Flux | Boucles, relances | Déclencheur | Appels par action |
|---|---|---|---|---|---|---|---|---|---|---|
| chat-guide (seul chat branché) | **O** | 1 000 à 2 000 → 16 000 | ~11 000 | 10 derniers messages ; contexte avec **compteur de crédits du mois** | `coach` | **saute à chaque message** (le compteur change) | oui | | message | 1 |
| coach-chat (pré-génération, pages site) | **O** | 1 024 → 16 000 | [22 000 à 35 000] ; règle de base répétée 3 fois (~4 700 car. en double) | 20 derniers messages à 3 000 car. | `coach` | utile pendant la session | non | | message | 1 (3 à 5 tours) |
| branding-coaching | **O** | 8 000 → 16 000 (relance si coupé : 18 000) | [16 000 à 25 000] + `autofill_data` sans plafond | 1er message + 19 derniers à 1 500 car. | `coach` | **presque nul** (sujets restants au milieu du système) | non | relance si coupé, qui double le coût | message | 1 à 2 |
| branding-coaching `story_generate` | **O** | 2 000 → 16 000 | règles + 2 400 + conversation | conversation | `coach` | surcoût | non | | **automatique** en fin de section | 1 |
| branding-coaching `persona_fill` / `content_strategy_fill` | S | 2 000 | 1 500 à 3 700 + règles | | `coach` | | non | | fin de section ou bouton | 1 (+ persona-ai `pitch`) |
| content-coaching (boîte à idées, `_shared/ideas`) | **O ×7** + S web_search | 2 600 à 8 500 → 16 000 | **[25 000 à 35 000]** (contexte, personas, récits, historique) | historique et idées déjà proposées dans chaque appel | `suggestion`, **1 crédit pour 8 appels** | 4 appels parallèles qui écrivent chacun le cache | non | 1 préparation + 1 recherche + 4 en parallèle + ≤2 de réserve | clic | jusqu'à 8 |
| calendar-coaching | **O** | 4 096 → 16 000 | 5 300 + profil | | `coach` | surcoût | non | | clic | 1 |
| strategy-ai (`generate-recap` = résumé) | **O** | 16 000 | règles + 1 200 + données + ANTI_SLOP | | `content` | surcoût | non | | clic | 1 |
| diagnostic-enrichment | **O** | 8 192 → 16 000 | 9 300 | **site complet sans plafond** | **aucun, aucune trace** | | non | ≤2 relances | lancée par deep-diagnostic | 1 à 3 |
| deep-diagnostic | S | 4 000 | 6 800 fixes | textes récupérés ≤8 000 par source, captures | `audit` **sauf si le navigateur dit `isOnboarding`** | utile | non | | automatique (écran de diagnostic, relancé si on recharge) | 1 + 1 à 3 Opus |
| charter-coaching | S | 4 096 | règles + 1 300 + charte | | `coach` | surcoût | non | | étape | 1 |
| coaching-module | D | 2 000 / 4 000 | 1 200 à 2 700 + marque et audit | | `suggestion` / `content` | | possible | | clic | 1 |
| engagement-coaching | S | 2 048 | ~1 000 | commentaires | `coach` | aucun | non | | clic | 1 |
| linkedin-coaching, instagram-profile-coaching | S | 1 024 à 4 000 | ~1 300 + audit | | `suggestion` | | non | | clic | 1 par phase |
| offer-coaching | S | 2 000 | règles + identité + offre | | `content` | surcoût | non | | étape | 1 |
| branding-mirror | S | 4 096 | 6 200 fixes | | `audit` | utile | non | | clic (résultat gardé) | 1 |
| generate-branding-summary | S4.6 | 4 096 | 8 000 fixes, marque en message | | `content` (vérifié avant de lire le résumé gardé) | utile | non | | **automatique à l'ouverture si le branding a changé** | 0 à 1 |
| generate-voice-guide | S | 4 096 | règles + 1 100 | marque en message | `content` | utile | non | | clic | 1 |
| launch-plan-ai | S | 8 192 | 4 200 + contexte + ANTI_SLOP | | `content` | surcoût | non | | clic | 1 |
| niche-ai, persona-ai, proposition-ai, storytelling-ai | S | 4 096 | [9 000 à 11 000], données au milieu | | `content` | surcoût | non | | clic (persona-ai `pitch` automatique en fin de section) | 1 |
| assistant-chat, branding-structure-ai, voice-analysis | S / D | 2 000 à 4 096 | 1 000 à 4 600 | | oui | | | | **aucun appelant (code mort)** | 0 |

#### Audits et imports

| Fonction | Modèle | max_tokens | Système (car.) | Contexte injecté | Quota | Cache | Flux | Boucles, relances | Déclencheur | Appels par action |
|---|---|---|---|---|---|---|---|---|---|---|
| audit-instagram-ai | S (+ Gemini via Lovable en secours) | 8 192 ×4 | **[20 000 à 30 000]** + ≤4 images, **renvoyés aux 4 appels** | profil, posts, contexte | `audit` | nul (consigne différente en fin de système, appels parallèles) | non | 4 parties en parallèle, chacune avec 3 essais + 1 réessai JSON + Gemini ; **relance automatique côté client** (`InstagramAudit.tsx:354`, `:448`), échec non débité | clic | 4 (pire cas ≈24 + 8 Gemini) |
| audit-site-auto | S | 8 192 | **jusqu'à ~75 000** (5 pages du site dans le système) | site, marque | `audit` | **écrit, jamais relu** | non | | clic | 1 |
| optimize-sales-page | D | 8 192 | **[28 000 à 35 000]** (page dans le système) | page, marque | `content` | écrit, jamais relu | non | | clic | 1 |
| audit-branding | S | 6 000 | ~7 900 avec l'identité en tête | site, Instagram, LinkedIn, document | `audit` | nul | non | | clic | 1 |
| linkedin-audit-ai | D | **12 000** | [15 000 à 20 000] | **jusqu'à 20 captures** | `audit` | surcoût | non | | clic | 1 |
| analyze-brand | S en appel direct, **sans cache** | 8 192 | ~5 000 fixes | site, réseaux, documents (16 000), logo | `import` | aucun (devrait être utile) | non | 1 relance sur 429 | clic | 1 |
| audit-visual-templates | S4.6 | 4 096 | ~4 300 + charte | ≤5 images non redimensionnées | `audit` | surcoût | non | | clic | 1 |
| website-ai (14 actions) | S | 4 096 | [8 000 à 15 000] | contexte du site | `content` | relu seulement si même action dans les 5 min | non | | clic | 1 |
| analyze-branding-import | D | 4 096 | ~1 900 | pages ≤15 000 | `import` | aucun | non | | clic | 1 |
| analyze-excel-mapping | D | 4 096 | ~120 (consignes en message) | jusqu'à [1,4 M] car. théoriques | `import` | aucun | non | mapping gardé et réutilisé | clic | 0 à 1 |
| import-branding-data | D | 4 096 | [2 000 à 10 000] | texte collé **sans limite** | `import` | surcoût | non | | clic | 1 |
| extract-offer-from-url | S | 2 500 | ~700 | page ≤30 000 | `content` | aucun | non | | clic | 1 |
| palette-ai | S | 2 048 | ~1 000 | | `content` | aucun | non | | clic | 1 |
| analyze-documents | D | 2 048 | ~700 | 15 000 car. par document, nombre sans plafond | `import` | aucun | non | | **aucun appelant (code mort)** | 0 |

#### Tâches programmées et webhooks

Aucune n'appelle l'IA : `email-trigger` (5 tâches), `social-publish-scheduled` (toutes les 5 min), `stats-monthly-snapshot`, `studio-reconcile-images`, `purge-client-error-events`, `stripe-webhook`, `resend-webhook`, `social-oauth-callback`. `cron-health` et `activation-funnel` lisent la base. Aucun workflow GitHub programmé.

## 2. Hiérarchie des coûts

### 2.1 Tarifs utilisés (tarifs publics Anthropic, octobre 2026)

| Modèle | Entrée $/Mtok | Sortie $/Mtok | Écriture cache (5 min) | Lecture cache |
|---|---|---|---|---|
| Fable 5.1 | 10 | 50 | 12,50 | 0,25 |
| Opus 5.5 | 4 | 20 | 5 | 0,20 |
| Sonnet 4.6 | 3 | 15 | 3,75 | 0,30 |
| Sonnet 5 (prod) | 2 | 10 | 2,50 | 0,20 |
| Haiku 4.5 | 1 | 5 | 1,25 | 0,10 |

La recherche web coûte en plus 10 $ pour 1 000 recherches. Pour Opus, la réflexion est facturée comme de la sortie.

### 2.2 Coût d'une action typique, du plus cher au moins cher

Estimations faites avec Sonnet = Sonnet 5, une réflexion Opus en effort `low` de [1 000 à 3 000 tokens] et en effort `medium` de [3 000 à 6 000 tokens], et une fiche de marque moyenne.

| Rang | Action | Appels | Coût estimé par action | D'où vient le coût |
|---|---|---|---|---|
| 1 | Carrousel Qualité Max (texte) | 8 à 11 | [1,5 à 2,5 $] | rédaction et réparations en Fable 5.1 (50 $/Mtok en sortie), relecture Opus, rendu visuel Opus possible |
| 2 | Carrousel photo ou mixte | 6 à 17 | [0,8 à 1,3 $] | Opus vision avec ≤10 photos renvoyées à chaque appel, 2 à 3 appels d'association des photos, passes visuelles en vision |
| 3 | Boîte à idées (`content-coaching`) | jusqu'à 8 | [0,7 à 0,9 $] | 7 appels Opus avec 25 000 à 35 000 car. de système chacun, pour 1 crédit |
| 4 | Carrousel texte | 8 à 11 | [0,6 à 1 $] | rédaction Opus effort medium [0,2 à 0,25 $], relecture Opus [0,15 $], juge Sonnet [0,07 $], recherche [0,06 $], réparations conditionnelles, visuel [0,05 $] |
| 5 | Recyclage en 5 formats | 11 à 20 | [0,5 à 0,9 $] | un Sonnet de 40 000 à 69 000 car. par format, pour 1 crédit |
| 6 | Audit Instagram | 4 (jusqu'à 8 avec la relance client) | [0,3 à 0,5 $], jusqu'au double | même gros prompt et mêmes images envoyés 4 fois |
| 7 | Inscription : diagnostic + enrichissement | 2 à 4 | [0,2 à 0,55 $] | 1 à 3 Opus avec le site complet, non comptés |
| 8 | Section du coaching branding (10 à 15 messages) | 10 à 15 | [0,8 à 1,5 $] la section, [0,08 à 0,12 $] le message | Opus, historique de 20 messages renvoyé, cache cassé à chaque sujet |
| 9 | Épingle Pinterest visuelle | 2 à 3 | [0,25 à 0,4 $] | 2 à 3 Opus, mise en forme jusqu'à 24 576 tokens |
| 10 | Actu (newsjacking) | 1 à 5 | [0,15 à 0,3 $] | recherche web (5 max) et tours qui renvoient tout |
| 11 | Post / reel / stories (creative-flow) | 2 à 7 | [0,1 à 0,2 $] | système de 50 000 à 69 000 car. (≈15 000 à 20 000 tokens) payé en écriture de cache, recherche web |
| 12 | Audit de site | 1 | [0,1 à 0,15 $] | jusqu'à 75 000 car. dans le système |
| 13 | Page de vente optimisée | 1 | [0,08 à 0,12 $] | page entière dans le système |
| 14 | Tour du Studio visuel | 1 à 4 | [0,03 à 0,1 $] | images de référence à chaque tour |
| 15 | Message du chat guide (Opus) | 1 | [0,04 à 0,06 $] | Opus pour 1 000 tokens de réponse, cache cassé |
| 16 | Post LinkedIn, contenus `generate-content` | 1 à 3 | [0,05 à 0,08 $] | système de 25 000 à 35 000 car. |
| 17 | Étape gratuite de creative-flow (angles, accroches…) | 1 | [0,04 à 0,07 $] | 51 000 car. de système, **sans quota** |
| 18 | Petites actions (palette, commentaire, DM, texte choisi, questions Haiku) | 1 | [< 0,02 $] | |

**Ordre de grandeur pour le plafond.** 200 $ par mois correspondent à environ 200 à 300 carrousels texte, ou 100 carrousels Qualité Max, ou 2 000 posts. La facture réelle des outils tourne autour de [70 à 90 $ par mois] (144,56 $ au plus haut, en juillet) : le plafond laisse aujourd'hui une marge d'environ ×2, qui fond vite si quelques clientes utilisent beaucoup la Qualité Max. Un abonnement Premium (39 €) autorise 20 carrousels Qualité Max, soit [30 à 50 $] d'API si la cliente les utilise tous : **une cliente Premium très active peut coûter plus que son abonnement.**

### 2.3 Signalements demandés

**Opus là où Sonnet ou Haiku ferait le même travail** (tâches de résumé, de correction, d'extraction ou de mise en forme) :
- relecture éditoriale des carrousels et sa re-passe : `_shared/carousel-editorial-review.ts:7`, `_shared/correction-pass/passes.ts:132`. C'est de la correction par patchs, en effort `medium`, sur chaque carrousel, y compris en mode normal ;
- `strategy-ai` `generate-recap` : un résumé (`SynthesisRenderer.tsx:909`) ;
- `newsjacking-ai` `generateBrandUniverse` (`:99`) : 4 listes de 5 mots-clés ;
- `carousel-ai` `hooks` (`steps/generate.ts:70`) et `slide_redo` (`modes/slide-redo.ts:167`) : quelques accroches, ou une seule slide, avec tout le système du rédacteur ;
- `pinterest-visual` et `pinterest-photo-brief` : mise en forme en Opus ; `pinterest-inspiration` : lecture d'une capture ;
- `carousel-visual` en Qualité Max : rendu HTML et passe de contraste en Opus (`index.ts:2269`, `:848`). C'est de la mise en page ;
- `calendar-coaching` : un planning de semaine en JSON ;
- `diagnostic-enrichment` : du remplissage structuré ;
- `content-coaching` : l'étape de préparation (6 pistes compactes) ;
- `branding-coaching` `story_generate` : 300 à 500 mots.

Ces familles (coaching, stratégie, audit branding, chat, Qualité Max) sont celles pour lesquelles tu as refusé en juillet de quitter Opus. Elles sont donc rangées dans le paquet (c).

**Fonctions sans `checkQuota`** (un compte gratuit peut-il les appeler sans limite ?) :
- **`deep-diagnostic` + `diagnostic-enrichment` : oui.** Le serveur saute le quota si le navigateur envoie `isOnboarding: true` (`deep-diagnostic/index.ts:38`, `:88`). Chaque appel lance 1 Sonnet et 1 à 3 Opus, sans crédit et sans trace, avec pour seul frein la limite par minute de `checkRateLimit` (`:34`). C'est aussi un problème de sécurité.
- **creative-flow, étapes gratuites (angles, accroches, questions, dictée, suite) : oui**, freinées seulement par 20 appels par minute, une limite gardée en mémoire par instance (`creative-flow/index.ts:69-76`, `_shared/rate-limiter.ts:46`).
- **carousel-ai `assign_templates` : oui** (`index.ts:149`, Haiku, petit coût).
- Plan de carrousel et questions : quota vérifié mais rien débité. Le plan peut faire jusqu'à 6 requêtes Sonnet vision.
- studio-video `prepare`, photo-describe, photo-dump-plan : pas de crédit par choix, limite par minute.
- Le Studio visuel a son propre plafond (15 tours par jour en gratuit).

**Prompts système de plus de 4 000 caractères envoyés sans cache efficace.** Le cache est techniquement posé partout, mais il ne sert pas quand le système contient des données propres à l'utilisatrice ou à la requête. Ce cas touche :
- le rédacteur du carrousel (30 000 à 70 000) ;
- creative-flow (35 000 à 69 000) ;
- `generate-content` (≤35 000) ;
- `linkedin-ai` (25 000 à 30 000) ;
- `optimize-sales-page` (≈30 000) ;
- `audit-site-auto` (≤75 000) ;
- `audit-instagram-ai` (20 000 à 30 000, ×4) ;
- `content-coaching` (25 000 à 35 000, ×7) ;
- `branding-coaching` (16 000 à 25 000) ;
- `coach-chat` (22 000 à 35 000) ;
- `chat-guide` (~11 000) ;
- `linkedin-audit-ai` (15 000 à 20 000) ;
- `audit-branding` (7 900) ;
- niche, persona, proposition, storytelling (9 000 à 11 000) ;
- `calendar-coaching`, `launch-plan-ai`, `pinterest-visual` (mise en forme).

Sans aucun système mis en cache : `analyze-brand` (5 000 fixes en appel direct), `newsjacking-ai` (11 000 en message), `inspire-ai` (15 000 en message).

Cas particulier : le carrousel envoie son système complet (30 000 à 45 000) à des petits appels faits avec un autre modèle (plan envisagé Haiku 800 tokens, couverture Sonnet 400 tokens, questions Haiku, sujets et angles Sonnet). Chacun paie une écriture de cache qu'aucun appel ne relit.

**Historique ou documents entiers renvoyés à chaque appel** :
- `branding-coaching` : 20 messages à 1 500 car. ; `autofill_data` sans plafond ;
- `coach-chat` : 20 messages à 3 000 car. ;
- `chat-guide` : 10 messages ;
- Studio visuel : historique de 24 messages **envoyé deux fois par tour** (en `messages` et dans le JSON `historique`, `turn/interpret.ts:83` et `:136`), plus toutes les images de référence à chaque tour ;
- carrousels photo : ≤10 photos en base64 renvoyées à chaque appel vision (jusqu'à 4 fois en Opus, puis 2 à 3 associations, puis le visuel) ;
- fiche de marque du carrousel : envoyée 3 à 5 fois par génération (rédacteur, juge, réparation, relecture) ;
- boîte à idées : historique et idées déjà proposées dans les 7 appels ;
- `diagnostic-enrichment` : site complet sans plafond ;
- `audit-instagram-ai` : même prompt et mêmes images ×4 ;
- `newsjacking-ai` : chaque tour `pause_turn` renvoie les résultats de recherche.

## 3. Le pic de juillet

### 3.1 Réponse (console Anthropic, 20/10)

- L'API des outils (clés `assistant-app` et `mission-flow`) a coûté **144,56 $ en juillet** et environ **830 $ sur l'année**.
- Les ~1 700 € de recharges de juillet étaient du **développement fait avec Claude Code** (près de 400 commits écrits avec Claude Fable 5 et Opus 4.8 entre le 26/06 et le 26/07, 357 PR fusionnées en juillet), pas l'outil.
- L'hypothèse H1 de la première version est donc confirmée. Elle n'est pas du ressort du code de l'app : c'est un réglage de facturation du développement (usage supplémentaire de Claude Code, limite à part).

### 3.2 Ce qui reste à expliquer : l'écart entre la console et la base

| Source | Ce qu'elle montre |
|---|---|
| Console Anthropic | 144,56 $ en juillet, ~830 $ sur l'année, soit [70 à 90 $ par mois] en moyenne |
| Bilan hebdo `cron-health` (`ai_usage`) | 09/07 : ~2,20 €/semaine de texte Claude ; 03/08 : 4,83 € après correction de la grille Sonnet 5, soit [10 à 20 € par mois] |
| Volume clientes | Semaine du 21/07 : 9 carrousels générés, 0 gardés (commit `27172f00f`) |

La console voit environ **[4 à 8 fois]** ce que la base compte. Les hypothèses ci-dessous expliquent cet écart.

**H2 (forte, probablement la plus grosse part de l'écart) : des générations réelles du compte de test, invisibles dans la base.**
- La visite guidée de 8 h (routine `visite-guidee-quotidienne`, créée le 30/06) fait chaque jour de vraies générations sur Camille :
  - `perf-carousel` (1 carrousel texte + visuel) ;
  - `fonctionnel-t1` (post Instagram + post LinkedIn) ;
  - `stories-visuelles` ;
  - `plan-carrousel-sonde` (1 plan) ;
  - le lundi, 3 carrousels photo ou mixte (`carousel-photo-live`, `carousel-photo-fond-live`, `carousel-mix-live`) ;
  - plus `packshot-live` (images).
- Coût estimé : [1,3 à 2 $ par jour], soit **[40 à 65 $ par mois]**, sans aucune ligne en base : à lui seul [la moitié environ] de la facture mensuelle des outils.
- Les sessions de développement font en plus leurs « tests réels » sur Camille.
- En juillet, les lignes de Camille ont en plus été purgées (migration du 05-06/07), et son contournement est déterministe depuis le 10/07.

**H3 (certaine, effet multiplicateur) : `ai_usage` sous-compte chaque génération.**
- Pas comptés : relecture Opus (rangée à part dans `content_quality_events.content_preview.editorial_usage`), recherche web, passes Haiku, `diagnostic-enrichment`, univers Opus, plan du carrousel, étapes gratuites, appel abandonné du plan doublé.
- `tokens_used` mélange entrée et sortie et ignore le cache. Le tarif mixte 75/25 de `cron-health` est une approximation.
- Facteur de sous-comptage plausible pour un carrousel : [×2 à ×3].

**H4 (faible) : des rafales dans l'app.** Rien trouvé qui puisse produire de gros montants :
- aucun appel IA dans les tâches programmées ni les webhooks ;
- aucun traitement par lot sur toutes les utilisatrices ;
- aucune boucle de relance sans limite : toutes les relances sont bornées, à 3 tentatives plus le repli.

Appels automatiques trouvés, tous bornés :
- `SuggestedContents.tsx:199`, idées de la semaine à l'ouverture du tableau de bord, 1 crédit. Possible course avec la lecture de la version gardée, [à vérifier en réel].
- `use-linkedin-carousel-caption.ts:131` : légende LinkedIn automatique.
- `SynthesisFetchLogic.ts:140` : synthèse du branding si elle a changé.
- `BrandingCoachingFlow.tsx:759` : fin de section.
- `DiagnosticLoading.tsx:223` : diagnostic relancé si on recharge l'écran.
- `PhotosPage.tsx:136` et `:155` : classement et descriptions Haiku, ≤5 photos par ouverture.
- `InstagramAudit.tsx:354` et `:448` : relance automatique d'un audit complet en cas d'échec.

**H5 (explique que juillet soit le mois le plus cher côté outils, 144,56 $) : les prix de juillet étaient plus hauts.**
- Opus 4.8 (5 $ / 25 $) pour le coaching et la Qualité Max.
- Sonnet 4.6 (3 $ / 15 $) jusqu'à la bascule Sonnet 5 de mi-juillet.
- Mode Qualité Max lancé le 26/06.

### 3.3 Table de suivi et requêtes SQL

La table `ai_usage` existe : `user_id`, `workspace_id`, `action_type`, `category`, `tokens_used`, `model_used`, `created_at`. Elle ne garde pas le nom de la fonction ; `action_type` en est le meilleur indice.

Je n'ai pas d'accès direct à la base, d'où les requêtes ci-dessous. Lovable peut les lancer gratuitement en mode « Chat ». Relis le résultat brut : son commentaire s'est déjà trompé.

**Requête 1 : coût estimé par action et par mois.** Même tarif mixte que `cron-health/tarifs.ts`.

```sql
with tarif(model, eur_par_mtok) as (values
  ('claude-haiku-4-5', 2.0), ('claude-sonnet-5', 4.0), ('claude-sonnet-4-6', 6.0),
  ('claude-opus-5-5', 8.0), ('claude-opus-5', 10.0), ('claude-opus-4-8', 10.0),
  ('claude-opus-4-7', 10.0), ('claude-fable-5-1', 23.0), ('gpt-6-astra', 23.0),
  ('google/gemini-2.5-flash', 0.85), ('google/gemini-2.5-flash-lite', 0.18)
)
select
  to_char(date_trunc('month', u.created_at), 'YYYY-MM') as mois,
  u.action_type,
  coalesce(u.model_used, 'inconnu') as modele,
  count(*) as generations,
  count(distinct u.user_id) as utilisatrices,
  sum(coalesce(u.tokens_used, 0)) as tokens,
  round(sum(coalesce(u.tokens_used, 0)) * coalesce(t.eur_par_mtok, 0) / 1e6, 2) as cout_estime_eur
from public.ai_usage u
left join tarif t on t.model = u.model_used
where u.created_at >= '2026-01-01'
group by 1, 2, 3, t.eur_par_mtok
order by 1, cout_estime_eur desc;
```

**Requête 2 : total par mois, en séparant les comptes admin.**

```sql
with tarif(model, eur_par_mtok) as (values
  ('claude-haiku-4-5', 2.0), ('claude-sonnet-5', 4.0), ('claude-sonnet-4-6', 6.0),
  ('claude-opus-5-5', 8.0), ('claude-opus-5', 10.0), ('claude-opus-4-8', 10.0),
  ('claude-opus-4-7', 10.0), ('claude-fable-5-1', 23.0), ('gpt-6-astra', 23.0)
)
select
  to_char(date_trunc('month', u.created_at), 'YYYY-MM') as mois,
  exists (select 1 from public.user_roles r
          where r.user_id = u.user_id and r.role = 'admin') as compte_admin,
  count(*) as generations,
  sum(coalesce(u.tokens_used, 0)) as tokens,
  round(sum(coalesce(u.tokens_used, 0) * coalesce(t.eur_par_mtok, 0)) / 1e6, 2) as cout_texte_estime_eur
from public.ai_usage u
left join tarif t on t.model = u.model_used
where u.created_at >= '2026-01-01'
group by 1, 2
order by 1, 2;
```

**Requête 3 : juillet jour par jour,** à rapprocher des recharges et de la page Usage de la console.

```sql
select
  u.created_at::date as jour,
  count(*) as generations,
  sum(coalesce(u.tokens_used, 0)) as tokens,
  string_agg(distinct u.action_type, ', ') as actions
from public.ai_usage u
where u.created_at >= '2026-06-25' and u.created_at < '2026-08-01'
group by 1
order by 1;
```

**Requête 4 : relecture éditoriale des carrousels,** hors `ai_usage`, avec entrée et sortie séparées.

```sql
select
  to_char(date_trunc('month', created_at), 'YYYY-MM') as mois,
  content_preview->'editorial_usage'->>'model' as modele,
  count(*) as carrousels,
  sum((content_preview->'editorial_usage'->>'input_tokens')::numeric) as tokens_entree,
  sum((content_preview->'editorial_usage'->>'output_tokens')::numeric) as tokens_sortie
from public.content_quality_events
where created_at >= '2026-06-01'
  and content_preview ? 'editorial_usage'
group by 1, 2
order by 1, 2;
```

**Lecture attendue :**
- Comparer le total de juillet des requêtes 1 et 2 aux 144,56 $ de la console. L'écart mesure ce que la base ne voit pas (H2 et H3).
- Une fois le paquet (a) en ligne, les générations du compte de test et des fonctions de la passerelle Lovable apparaîtront dans `ai_usage` sans débiter de crédit, et l'écart devrait se resserrer nettement.

## 4. Plan de réduction

Le volume de référence est inconnu tant que les requêtes ne sont pas lancées. Les gains sont donc donnés **par action**, puis par mois pour un volume hypothétique de **[30 carrousels texte, 10 carrousels photo ou mixte, 5 Qualité Max, 150 textes, 300 messages de coaching, 10 audits Instagram et 15 inscriptions]** côté clientes, plus la visite quotidienne. Pour ce volume, le coût estimé de l'app serait de [110 à 170 $ par mois] : c'est plus que la facture réelle (~[70 à 90 $] en moyenne, 144,56 $ en juillet), donc le volume réel des clientes est plus faible que cette hypothèse. Les gains en $ par mois ci-dessous sont à lire comme des plafonds, à recaler avec les requêtes SQL.

Chaque ligne indique le fichier, le changement, le gain et le risque. Rien n'est fait dans cette passe.

### Paquet (a) : sans effet visible pour les clientes

| # | Fichier(s) | Ce qui change | Gain estimé par mois | Risque |
|---|---|---|---|---|
| a1 | routine `visite-guidee-quotidienne`, `playwright.visite.config.ts` (`SPECS_PAYANTES`) | Les 7 tests payants passent du quotidien au lundi seulement (un seul jour lourd), les tests sans crédit restent quotidiens | **[40 à 55 $]** | une régression de génération est vue en ≤7 jours au lieu de ≤1 jour ; les sondes sans crédit restent en place |
| a2 | console Anthropic (aucun code) | Une clé API dédiée aux fonctions Supabase, dans un espace de travail à part avec sa propre limite ; l'usage supplémentaire de Claude Code plafonné à part | évite un nouveau juillet [centaines d'€ possibles] ; aucun gain sur le trafic de l'app | aucun ; c'est ta décision (réglage de facturation) |
| a3 | `_shared/anthropic.ts` (`callAnthropic`, `callAnthropicWithMeta`) + `_shared/carousel-model.ts` | Le système passe en 2 blocs : règles fixes d'abord (cache), données de l'utilisatrice ensuite (sans cache). Pas de cache quand tout le système est propre à l'utilisatrice et que l'appel est unique | creative-flow : ~9 000 tokens fixes relus au lieu d'être écrits, soit [0,02 $ par texte] ; −25 % sur l'entrée des appels uniques. Total **[10 à 20 $]** | faible ; prompts identiques, seul l'ordre des blocs change. Les fichiers partagés sont en zone rouge : tests snapshot de tous les formats |
| a4 | `carousel-ai/outline.ts:24`, `steps/finalize.ts:414`, `steps/questions.ts:58`, `steps/generate.ts:71` | Système court dédié pour le plan envisagé (Haiku), la couverture (Sonnet, 400 tokens), les questions et les sujets / angles, au lieu du système du rédacteur (30 000 à 45 000 car.) | [0,03 à 0,05 $ par carrousel], **[2 à 4 $]** | faible ; vérifier que les titres d'attente et les questions restent pertinents (snapshots) |
| a5 | `audit-instagram-ai/index.ts:580` + `src/pages/InstagramAudit.tsx:354`, `:448` | Pas de relance automatique côté client (bouton « Réessayer ») ; consignes fixes en tête du système et parties propres à chaque appel dans le message, 1er appel puis 3 en parallèle pour relire le cache ; plafond sur les captures | [0,1 à 0,2 $ par audit, jusqu'à ×2 en cas d'échec], **[2 à 4 $]** | faible ; le temps d'attente s'allonge un peu si les appels ne partent plus tous ensemble |
| a6 | `deep-diagnostic/index.ts:38`, `:88` + `diagnostic-enrichment` | Le serveur décide seul de « l'inscription » (diagnostic jamais fait) au lieu de croire le navigateur ; `logUsage` (sans crédit) pour l'enrichissement afin de le voir | protège le plafond (abus freiné seulement par la limite par minute) + visibilité | aucun pour une vraie inscription |
| a7 | `visual-studio/turn/interpret.ts:83`, `:136` | Historique envoyé une seule fois ; images de référence seulement quand elles changent | [0,01 à 0,03 $ par tour], **[1 à 3 $]** | faible ; tests de contrat du Studio |
| a8 | `chat-guide/index.ts:208` | Le compteur de crédits du mois sort du système (vers le message), pour que le cache tienne pendant la conversation | [0,01 $ par message], **[1 à 3 $]** | aucun |
| a9 | `audit-site-auto/index.ts:604`, `optimize-sales-page/index.ts:389` | Contenu des pages dans le message plutôt que dans le système mis en cache | [0,01 à 0,02 $ par audit], < 1 $ | aucun |
| a10 | `analyze-brand/index.ts:340` | Passage par l'aide commune (cache du système fixe, relances bornées, contrôle de troncature, workspace dans `logUsage`) | < 1 $ | faible |
| a11 | `carousel-ai/structure-hedge.ts` | Le 2e appel du plan à 80 s annule vraiment le premier (`signal`), et pas de doublement en cas d'erreur 4xx | [0,02 à 0,05 $ par plan lent] | faible |
| a12 | mesure : `_shared/plan-limiter.ts` (`logUsage`), `_shared/anthropic.ts` (`extractUsage`), `cron-health/couts.ts` | Garder entrée, sortie, écriture et lecture du cache séparées ; compter sans crédit la recherche web, les passes Haiku, l'enrichissement, l'univers, le plan ; marquer les appels de Camille au lieu de les taire | 0 $ direct, mais rend le pilotage possible (le bilan du lundi verrait le vrai coût) | faible ; une migration (colonnes) et une table de suivi à part pour ne pas débiter de crédit |
| a13 | `assistant-chat`, `analyze-documents`, `voice-analysis`, `branding-structure-ai` | Retrait du code mort (aucun appelant) | 0 $ ; surface d'abus en moins (fonctions déployées et appelables) | aucun si vraiment sans appelant (le revérifier dans `src/` et l'admin) |
| a14 | `supabase/functions/score-content/`, `supabase/functions/suggest-format/` (+ leurs lignes dans `supabase/config.toml`), action `suggest-template` de `linkedin-ai/index.ts` (bloc ~340-380), commentaire de `cron-health/tarifs.ts:61`, knip | Retrait du code mort de la passerelle IA Lovable (Gemini) : aucun appelant dans `src/`. Ajouté le 20/10 depuis l'audit des crédits Lovable (`docs/audit-conso-lovable-2026-10.md`, PR #1781), validé par Laetitia | crédits Lovable en moins (aucun sur la facture Anthropic) ; surface d'abus en moins | aucun si vraiment sans appelant (le revérifier dans `src/` et l'admin) |
| a15 | `mini-audit-instagram/index.ts:72`, `stock-photo-keywords/index.ts:103`, `engagement-insight/index.ts:48` | Compter dans `ai_usage`, sans débiter de crédit (même principe que a12), les 3 fonctions de la passerelle Lovable qui n'écrivent rien aujourd'hui. Modèle `google/gemini-2.5-flash`, déjà tarifé dans `cron-health/tarifs.ts`. `mini-audit-instagram` est publique (pas de compte, donc pas d'`user_id`) : prévoir une autre façon de la compter. Même origine que a14 | 0 $ direct ; le bilan du lundi les voit | faible. Ne pas passer les 5 autres fonctions Gemini sur Haiku (pas prioritaire selon Laetitia) |

### Paquet (b) : effet léger

| # | Fichier(s) | Ce qui change | Gain estimé par mois | Risque |
|---|---|---|---|---|
| b1 | `_shared/carousel-editorial-review.ts:7` | Relecture éditoriale du carrousel en Sonnet 5 au lieu d'Opus 5.5 (la relecture n'est pas dans la liste des usages Opus que tu as voulu garder) | [0,08 à 0,12 $ par carrousel], **[3 à 5 $]** | moyen ; à valider avec `scripts/eval-carousel-*` et quelques carrousels relus avant et après |
| b2 | `_shared/carousel-model.ts` | Effort de réflexion du rédacteur Opus de `medium` à `low` (déjà la règle des autres appels Opus) | [0,04 à 0,08 $ par carrousel], **[2 à 4 $]** | moyen ; qualité du fil à vérifier, réparations possiblement plus fréquentes |
| b3 | `branding-coaching/index.ts:766-780`, `coach-chat/index.ts:192` | Historique ramené aux 8 à 10 derniers échanges + un court résumé de ce qui est déjà acquis ; liste des sujets restants sortie du système | [0,02 à 0,04 $ par message], **[6 à 12 $]** | faible à moyen ; la coach peut oublier un détail ancien de la conversation |
| b4 | `branding-coaching/index.ts:807` | Plus de 2e appel à 18 000 tokens après une réponse coupée (le 1er avait déjà 16 000) : relance seulement si le JSON est vraiment illisible | [0,1 $ par relance évitée], [1 à 2 $] | faible |
| b5 | `_shared/ideas/pipeline.ts:21` | Préparation des pistes en Sonnet, puis 1 appel Opus d'abord et 3 ensuite pour relire le cache ; réserve seulement si nécessaire | [0,2 à 0,3 $ par lot d'idées], **[2 à 6 $]** | faible à moyen ; idées un peu moins variées si la préparation est moins fine |
| b6 | `coaching-module`, `linkedin-coaching`, `instagram-profile-coaching` (phases questions), `analyze-excel-mapping`, `extract-offer-from-url`, `import-branding-data` | Haiku (action `questions` déjà prévue) au lieu de Sonnet ou du modèle par défaut | < 2 $ | faible |
| b7 | `src/components/dashboard/SuggestedContents.tsx:199` | Idées de la semaine seulement après la lecture de la version gardée, ou au clic | [0,07 $ par génération évitée] | faible ; elles n'apparaissent plus toutes seules si on passe au clic |
| b8 | `carousel-ai/modes/photo.ts:101`, `modes/mix.ts:127`, `continuous-narrative.ts` | Photos réduites (≤1 024 px) et envoyées seulement aux appels qui en ont besoin (pas à la réparation de texte) | [0,05 à 0,15 $ par carrousel photo], **[1 à 2 $]** | faible à moyen ; vérifier le choix des photos |

### Paquet (c) : à trancher avec toi

| # | Sujet | Ce qui changerait | Gain estimé | Risque ou contrepartie |
|---|---|---|---|---|
| c1 | Origine du pic (H1, confirmée) | Pic de juillet = développement Claude Code : régler sa propre limite (usage supplémentaire) côté abonnement, sans toucher à l'outil | l'essentiel des ~1 700 € de juillet | aucun pour les clientes |
| c2 | Étapes gratuites de creative-flow | Plafond quotidien comme le Studio (ex. 30 par jour en gratuit), ou compter 1 crédit toutes les N étapes | protège le plafond ; quelques $ en usage normal | une cliente qui explore beaucoup peut être freinée |
| c3 | Plan gratuit : 3 carrousels par mois | 1 à 2 carrousels en gratuit, ou carrousel gratuit sans recherche web ni relecture | [0,6 à 2 $ par utilisatrice gratuite active] | moins d'« effet waouh » à l'essai |
| c4 | Qualité Max (20 par mois en Premium) | 5 à 10 Qualité Max par mois dans les 20 carrousels, ou Fable seulement pour la rédaction et Opus / Sonnet pour le reste (rendu visuel, contraste) | jusqu'à [20 à 30 $ par cliente très active] | promesse commerciale « 20 carrousels Qualité Max compris » à revoir |
| c5 | Opus dans les coachings et le chat (`chat-guide`, `branding-coaching`, `coach-chat`, `calendar-coaching`, `strategy-ai` résumé, `story_generate`) | Sonnet 5 pour le chat guide, le résumé de stratégie, le planning et l'histoire ; Opus gardé pour le cœur du coaching branding | **[10 à 25 $]** au volume de référence ; c'est le plus gros levier sur les clientes | ton choix de juillet (garder Opus) ; voix et finesse à comparer sur quelques conversations |
| c6 | Pinterest en Opus (`pinterest-visual`, `pinterest-photo-brief`, `pinterest-inspiration`) | Rédaction en Sonnet, mise en forme en Sonnet | [0,15 à 0,25 $ par épingle] | qualité visuelle à vérifier ; faible volume aujourd'hui |
| c7 | Boîte à idées (`content-coaching`, 7 Opus pour 1 crédit) | Compter 2 crédits, ou réduire à 3 idées par lot | [0,3 à 0,5 $ par lot] | moins d'idées par clic |
| c8 | Recyclage en 5 formats pour 1 crédit | 1 crédit par format, ou 3 formats par défaut | [0,2 à 0,5 $ par recyclage] | fonction moins généreuse |
| c9 | Univers de marque de l'actu (`newsjacking-ai:99`) | Haiku ou Sonnet au lieu d'Opus | < 1 $ | presque aucun (4 listes de mots-clés) |

### Décisions de Laetitia (20/10)

- **Paquet (a) validé**, une seule PR, dans cet ordre :
  1. fermer le trou de quota de `deep-diagnostic` (état d'inscription vérifié côté serveur, jamais depuis le navigateur) ;
  2. visite de 8 h : générations payantes le lundi seulement, et comptées dans `ai_usage` ;
  3. données de la cliente et compteur de crédits sortis de la partie mise en cache des prompts ;
  4. quota sur les étapes gratuites de création ;
  5. code mort de la passerelle Lovable retiré (a14) et 3 fonctions comptées dans `ai_usage` (a15).
- **Sondes acceptées** : bilan du lundi (console contre estimation de l'app, alerte au-delà de 3 fois) ; visite du matin (nombre et coût des tests payants).
- **Paquets (b) et (c) en attente** : décision à part, avec les vrais volumes.

### Vérifié le 20/10 : `AI_MODEL_DEFAULT` n'existe pas en production

- Réponse de l'agent Lovable (mode Chat, lecture seule) : le secret `AI_MODEL_SONNET` existe, `AI_MODEL_DEFAULT` **n'existe pas**.
- Donc `getDefaultModel()` rend la valeur du code, `claude-sonnet-4-6` (3 $ / 15 $), alors que le reste du tier Sonnet tourne sur `claude-sonnet-5` (2 $ / 10 $). La base le confirme sur 120 jours : `coaching_questions` et `branding_import` en `claude-sonnet-4-6`, `creative_flow` en `claude-sonnet-5` (193 générations).
- Fonctions concernées : `analyze-branding-import`, `analyze-documents`, `analyze-excel-mapping`, `import-branding-data`, `linkedin-audit-ai`, `optimize-sales-page` (action « generation »), `coaching-module`, `assistant-chat` ; plus les littéraux `claude-sonnet-4-6` de `audit-visual-templates` et `_shared/product-fidelity.ts`.
- Proposition (à ranger dans le paquet b, effet léger) : faire suivre `AI_MODEL_SONNET` à `getDefaultModel()`, soit −33 % sur ces appels, avec le même risque de qualité que la bascule Sonnet 5 déjà faite en juillet sur le reste.

### Ordre conseillé

1. ~~c1 (console)~~ : fait le 20/10, H1 confirmée.
2. **Les requêtes SQL 1 à 4**, pour remplacer le volume hypothétique par le vrai.
3. **Paquet (a)** en une seule PR (validé), a14 et a15 compris ; a2 se règle dans la console. Déploiement (règle de Laetitia du 20/10) : toutes les fonctions et migrations de la passe en UNE seule demande à l'agent Lovable, puis dire à Laetitia combien de demandes Lovable la session a coûté.
4. **Paquet (b)** en une PR, avec un avant / après sur quelques générations réelles (en attente).
5. **Paquet (c)** selon tes décisions (en attente).
