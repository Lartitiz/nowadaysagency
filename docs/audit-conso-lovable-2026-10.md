# Audit de consommation Lovable, projet « L'ASSISTANT » (octobre 2026)

Période regardée : 21 septembre au 20 octobre 2026 (955 crédits annoncés, forfait 200).
Passe en lecture seule, faite sur `origin/main` au commit `6fbe1bdc2` (#1780). Aucun code, aucune fonction, aucune configuration modifiés.

## En bref

Le code de l'app n'explique pas 955 crédits. Ce qui tourne tout seul est léger et ne passe pas par l'IA de Lovable. Les appels à la passerelle IA de Lovable existent (8 fonctions), mais ils sont tous déclenchés par une action d'une utilisatrice, sur un petit modèle (Gemini Flash), avec quelques centaines de mots par appel.

En revanche, l'historique git montre **577 commits de l'agent Lovable** (`gpt-engineer-app[bot]`) sur la période, dont **199 tours de l'agent qui ont modifié du code** (commits titrés), et 161 de ces 199 entre le 28 septembre et le 4 octobre. Ce sont des messages envoyés à l'agent Lovable, donc des crédits, même si une partie a été envoyée par Claude (via Chrome) et non tapée à la main. C'est de loin la cause la plus probable.

Deux réserves :
- Je ne vois pas dans le repo les messages envoyés à l'agent qui n'ont rien modifié (lectures de logs, requêtes SQL, redéploiements sans changement de fichier). Ils s'ajoutent aux 199.
- Le coût exact de Lovable Cloud (base, stockage, fonctions) et de l'IA Lovable ne se lit que dans le tableau de bord Lovable (Paramètres, Usage / Cloud & AI). À ma connaissance, Lovable facture Cloud et IA sur un solde à part, en dollars, et non sur les crédits de messages ; à vérifier sur ce tableau de bord, car c'est ce qui départage les causes 1 et 2 ci-dessous.

---

## 1. Passerelle IA Lovable (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`)

Huit fonctions appellent la passerelle de Lovable au lieu d'Anthropic ou OpenAI directement. Toutes demandent un modèle Google Gemini. Aucun cron ne les appelle.

| Fonction | Fichier, ligne | Modèle | Qui la déclenche | Fréquence estimée | Notée dans `ai_usage` |
|---|---|---|---|---|---|
| `mini-audit-instagram` | `supabase/functions/mini-audit-instagram/index.ts:72` | `google/gemini-2.5-flash` | Visiteuse NON connectée, page d'accueil publique (`src/components/landing/MiniDiagnostic.tsx:128`, monté dans `PublicLanding.tsx:557`) | 1 appel par audit ; limité à 3 par heure et par IP (table `mini_audit_attempts`) | Non |
| `analyze-branding-impact` | `supabase/functions/analyze-branding-impact/index.ts:105` | `google/gemini-2.5-flash` | À chaque champ de branding enregistré (`src/pages/BrandingSectionPage.tsx:369` → `src/hooks/use-branding-suggestions.ts:97`) | 1 appel par champ modifié dans une fiche de branding | Oui |
| `stock-photo-keywords` | `supabase/functions/stock-photo-keywords/index.ts:103` | `google/gemini-2.5-flash` (600 jetons max en sortie) | Ouverture de la banque d'images avec un sujet (`StockPhotoPickerDialog.tsx:135`), « L'IA choisit les photos » (`src/lib/stock-photos.ts:151`), recherche de vidéos du montage reel (`use-reel-stock-search.ts:40`) | 1 appel par ouverture du sélecteur ou par sélection automatique | Non |
| `engagement-insight` | `supabase/functions/engagement-insight/index.ts:48` | `google/gemini-2.5-flash` | Page Stats Instagram (`src/pages/InstagramStats.tsx:636` et `:693`) | 1 appel par analyse demandée | Non |
| `audit-instagram-ai` | `supabase/functions/audit-instagram-ai/index.ts:464` | `google/gemini-2.5-flash` | Seulement en secours, si Claude échoue pendant l'audit Instagram (`src/pages/InstagramAudit.tsx:315`) | Rare | Non (secours) |
| `linkedin-ai`, action `suggest-template` | `supabase/functions/linkedin-ai/index.ts:359` | `google/gemini-2.5-flash-lite` (200 jetons) | Aucun appel trouvé dans `src/` | Nulle (code mort) | Non |
| `score-content` | `supabase/functions/score-content/index.ts:98` | `google/gemini-2.5-flash` | Aucun appel trouvé dans `src/` | Nulle (code mort) | Oui |
| `suggest-format` | `supabase/functions/suggest-format/index.ts:102` | `google/gemini-2.5-flash` | Aucun appel trouvé dans `src/` | Nulle (code mort) | Oui |

Ce qui compte :
- Tout le reste de l'IA (carrousels, posts, juges, plans, Fable, Opus, Sonnet, Astra) appelle Anthropic ou OpenAI directement, avec vos propres clés : ces appels ne passent pas par Lovable.
- Ordre de grandeur : un appel Gemini Flash de ce type coûte une fraction de centime au tarif public Google. Même à plusieurs centaines d'appels par mois, on reste à quelques dollars au plus, très loin de 955 crédits.
- Trois fonctions (`mini-audit-instagram`, `stock-photo-keywords`, `engagement-insight`) n'écrivent rien dans `ai_usage` : le bilan du lundi (`cron-health`) ne les voit pas. Leur volume réel n'est lisible que dans les journaux des fonctions ou le tableau de bord Lovable.
- Seule porte ouverte au public : `mini-audit-instagram`. La limite par IP empêche une seule machine d'abuser, pas un robot qui change d'IP. Rien n'indique que ça arrive, mais c'est le seul appel IA Lovable qu'une personne non inscrite peut déclencher.

## 2. Lovable Cloud ou Supabase à vous ?

C'est **Lovable Cloud** (Supabase géré par Lovable), pour ces raisons :
- `supabase/config.toml` : `project_id = "fhdyflgojppwgrscmtdp"`, projet créé et piloté depuis Lovable.
- `src/integrations/supabase/client.ts` et `src/integrations/lovable/index.ts` sont « générés automatiquement par Lovable » ; la connexion Google passe par `@lovable.dev/cloud-auth-js`.
- `LOVABLE_API_KEY` est disponible dans les fonctions sans que vous l'ayez ajoutée : c'est une clé injectée par Lovable Cloud.
- Aucun accès direct : pas de CLI Supabase, pas de workflow GitHub de déploiement. Les fonctions sont déployées et les migrations appliquées en demandant à l'agent Lovable.

Conséquence : base, authentification, stockage, fonctions et bande passante sont facturés par Lovable à l'usage. Et surtout, **chaque déploiement de fonction et chaque migration passent par un message à l'agent Lovable** (voir cause n°1).

## 3. Ce qui tourne tout seul

### Tâches programmées (pg_cron, dans la base)

| Tâche | Défini dans | Fréquence | Ce que ça coûte |
|---|---|---|---|
| `publish-due-instagram` | `supabase/migrations/20260626164756_1d187dbf-….sql:47` | toutes les 5 min (288 par jour, environ 8 600 par mois) | 1 appel à la fonction `social-publish-scheduled` (sans IA) + petite lecture en base |
| `email-process-queue` | `supabase/migrations/20260628201216_98b5b5b0-….sql:34` | toutes les 15 min (96 par jour, environ 2 900 par mois) | 1 appel à la fonction `email-trigger` (sans IA) |
| `studio-reconcile-images` | `supabase/migrations/20260928205000_studio_durable_image_recovery.sql:40` | toutes les 5 min | Requête SQL seule, pas de fonction |
| `email-check-inactive`, `email-check-credits`, `email-weekly-digest`, `email-check-forgotten-drafts` | `20260628201216_…sql:35-36`, `20260630193444_…sql:14`, `20260814180000_…sql:51` | 1 fois par jour chacune | 1 appel à `email-trigger` par jour |
| `purge-client-error-events` | `20260911121000_client_error_monitoring.sql:38` | 1 fois par jour | SQL seul |
| `stats-monthly-snapshot` | `20260712120000_stats_monthly_snapshot_cron.sql:32` | 1 fois par mois | SQL / fonction légère |

Au total, environ 11 500 lancements de fonctions par mois, aucun avec de l'IA. Sur un Supabase classique, c'est très en dessous des quotas gratuits (500 000 appels par mois). Avec la facturation à l'heure de Lovable Cloud depuis le 14 octobre, les deux tâches « toutes les 5 min » empêchent la base de rester au repos, mais leur poids reste faible.

Aucun workflow GitHub programmé n'appelle l'app. Le bilan du lundi et la visite du matin sont des routines Claude, hors Lovable (sauf quand elles demandent quelque chose à l'agent Lovable).

### Webhooks

Stripe, e-mails, Meta : ils ne s'exécutent qu'à la réception d'un évènement (paiement, publication). Aucun ne déclenche d'IA Lovable.

### Realtime (abonnements ouverts)

- `src/components/NotificationBell.tsx:82` : cloche de notifications, 1 abonnement par onglet connecté.
- `src/hooks/use-user-photos.ts:103` : bibliothèque de photos.
- `src/pages/CommunautePage.tsx:82` : page Communauté, 3 tables écoutées.

Fermés au démontage. Coût : une connexion ouverte par onglet, négligeable à votre volume.

### Polling côté site

Réglage général de React Query (`src/App.tsx:129`) : données gardées 5 min, pas de relecture au retour sur l'onglet. Bon réglage.

Relectures périodiques, toutes bornées :
- `src/hooks/use-version-check.ts:53` : relit `/index.html` toutes les 5 min. Ça touche l'hébergement du site, pas la base.
- `src/pages/SharedCalendarPage.tsx:272` : calendrier partagé, relu toutes les 60 s tant que la page est ouverte. Seule relecture sans fin ; ne concerne que les invitées d'un calendrier partagé (le partage est coupé depuis le 15/10, #1639).
- `src/pages/WelcomePage.tsx:547` : toutes les 4 s, arrêt à 5 cartes ou après 60 s.
- `use-pending-brand-review.ts:53` (5 s, jusqu'à réponse), `BrandLearnedSection.tsx:124` (5 s, nombre limité), `use-user-photos.ts:90` (4 s seulement si une photo est en traitement), Studio vidéo et Studio visuel (5 s seulement pendant un rendu).

Les autres `setInterval` sont des minuteurs d'affichage (chargement, secondes écoulées) sans requête.

### Requêtes au chargement des pages

Le calendrier et `/idees` font une seule lecture légère (`src/lib/saved-idea-summaries.ts`, chantier du 04/10). Rien de lourd n'est relu à chaque page.

## 4. Stockage et bande passante

- Seaux principaux : `calendar-media` (15 usages dans le code), `calendar-visuals`, `brand-assets`, `visual-studio`, `moodboards`, `user-photos`, `onboarding-uploads`, `crosspost-*`, `canva-import`. La plupart sont publics : chaque affichage d'image compte en bande passante.
- Les photos des carrousels ne sont plus en base64 dans la base depuis le 04/10 (rangées dans `calendar-visuals`, espace de Laetitia passé de 79 Mo à 2,6 Mo).
- Génération d'images et de vidéos (Studio visuel, Studio vidéo, Higgsfield, Photoroom) : facturée par ces services, puis le résultat est rangé dans le stockage Lovable Cloud. Les vidéos sont les fichiers les plus lourds.
- Exports (PNG, PPTX, PDF) : faits dans le navigateur, sans stockage serveur.
- Fonctions qui téléchargent des images : `audit-instagram-ai` (3 images max, 3 Mo max chacune), fonctions du Studio.

Avec quelques clientes actives, rien ici ne peut peser des centaines de crédits. Le volume réel se lit dans Lovable Cloud (stockage, sortie réseau).

---

## Causes probables des 955 crédits, de la plus à la moins probable

### 1. Les messages envoyés à l'agent Lovable (très probable)

Ce qu'on voit : 199 tours de l'agent avec modification de code en 30 jours (378 commits « Changes » en plus). Répartition : 23 le 28/09, 51 le 29/09, 17 le 30/09, 10 le 01/10, 42 le 02/10, 8 le 03/10, 10 le 04/10, puis 1 à 6 par jour. Les journées du 28/09 au 02/10 correspondent à la refonte du Studio visuel faite dans Lovable (« Refondu le Studio en blanc », « Corrigé limite mémoire VST », « Corrigé blocage double bague »…), avec 31 « Update plan » (mode Plan). Depuis le 03/10, il s'agit surtout de 44 demandes de déploiement ou de migration (« Redéployé carousel-ai », « Applied migration »…), envoyées par Claude via Chrome, plus des lectures de journaux et de SQL qui ne laissent pas de commit.

Un message à l'agent coûte de moins d'un crédit à plusieurs crédits selon sa taille. 199 tours de code, dont beaucoup de gros chantiers sur le Studio, plus les lectures et redéploiements sans commit, suffisent à expliquer l'essentiel des 955 crédits.

Corrections possibles :
- Regarder dans Lovable l'historique des messages du 28/09 au 04/10 pour confirmer le pic.
- Côté Claude : regrouper les redéploiements (une seule demande pour toutes les fonctions d'un lot, comme le 12/10 pour 20 fonctions), passer le chat en mode « Chat » pour toute lecture (journaux, SQL), ne jamais demander à l'agent de corriger du code.
- À plus long terme : déployer les fonctions et appliquer les migrations sans l'agent (CLI Supabase avec un jeton d'accès), si Lovable Cloud le permet. À vérifier, car le projet n'est pas à vous côté Supabase.

Effet sur les clientes : aucun. Ça change seulement la façon de publier.

### 2. Lovable Cloud facturé à l'heure depuis le 14/10 (possible, à lire dans le tableau de bord)

Ce qu'on voit : base toujours active à cause des tâches toutes les 5 min, stockage d'images et de vidéos, connexions Realtime. Si Lovable compte Cloud dans les mêmes crédits que les messages, la facturation à l'heure peut ajouter une part fixe chaque jour depuis le 14/10. Sinon, elle est sur un solde à part et n'entre pas dans les 955.

Corrections possibles, seulement si le tableau de bord montre un coût Cloud significatif :
- Passer `publish-due-instagram` de 5 min à 15 min, ou ne lancer la fonction que s'il existe un post à publier dans l'heure (vérification SQL avant l'appel HTTP).
- Passer `studio-reconcile-images` à 15 min.
- Effet sur les clientes : une publication Instagram programmée partirait jusqu'à 15 min plus tard au lieu de 5 ; une image du Studio interrompue serait rattrapée en 15 min au lieu de 5.

### 3. La passerelle IA Lovable (peu probable comme cause principale)

Ce qu'on voit : 5 fonctions vivantes sur Gemini Flash, toutes déclenchées à la main, petits appels. Même plusieurs centaines par mois coûtent quelques dollars.

Corrections possibles :
- Passer ces 5 fonctions sur Claude Haiku avec votre clé Anthropic : l'IA Lovable tomberait à zéro et tout le coût IA serait visible dans le bilan du lundi.
- Supprimer le code mort (`score-content`, `suggest-format`, action `suggest-template` de `linkedin-ai`).
- Ajouter `logUsage` à `mini-audit-instagram`, `stock-photo-keywords` et `engagement-insight` pour les compter.
- Effet sur les clientes : aucun visible (réponses de même nature ; Haiku est un peu plus cher par appel que Gemini Flash, mais sur votre facture Anthropic).

### 4. Abus de l'audit public de la page d'accueil (peu probable)

Ce qu'on voit : seul appel IA possible sans compte, limité par IP. Pas de signe d'abus dans le code, et aucun comptage pour le vérifier.

Correction possible : compter les lignes de `mini_audit_attempts` sur 30 jours (requête en lecture seule ci-dessous). Si le volume est anormal, ajouter une vérification anti-robot ou une limite globale par jour.
Effet sur les clientes : aucun ; les visiteuses gardent leurs 3 essais.

### 5. Stockage et bande passante (très peu probable)

Volumes faibles depuis le nettoyage du 04/10. Rien à corriger sans chiffres du tableau de bord.

---

## À lire dans le tableau de bord Lovable (le repo ne peut pas le dire)

1. Paramètres, Usage : crédits par jour et par type (messages de l'agent, Plan, Cloud, IA). Si le pic est entre le 28/09 et le 04/10, la cause n°1 est confirmée.
2. Cloud & AI : coût de la base, du stockage, des fonctions et de l'IA, et s'il est déduit des crédits ou d'un solde à part.
3. Historique des messages de l'agent sur le projet : qui les a envoyés et combien n'ont pas laissé de commit.

Requêtes en lecture seule utiles (à lancer en mode « Chat », gratuit) :

```sql
-- Appels IA Lovable notés dans ai_usage sur 30 jours
select model_used, action_type, count(*)
from ai_usage
where created_at >= now() - interval '30 days' and model_used like 'google/%'
group by 1, 2 order by 3 desc;

-- Audits publics de la page d'accueil sur 30 jours
select date_trunc('day', created_at) as jour, count(*), count(distinct ip) as ips
from mini_audit_attempts
where created_at >= now() - interval '30 days'
group by 1 order by 1;
```

## Ce qui ne peut pas être vérifié ici

- Le tarif exact d'un message de l'agent Lovable et la façon dont Lovable Cloud est décompté : uniquement dans le tableau de bord.
- Les messages à l'agent qui n'ont rien modifié (lectures, redéploiements sans changement).
- Le nombre réel d'appels à `mini-audit-instagram`, `stock-photo-keywords` et `engagement-insight` (non notés dans `ai_usage`).
