# Checklist QA end-to-end — Nowadays Assistant

> **But de ce document.** Lister chaque parcours utilisateur avec son **résultat attendu** (critères d'acceptation),
> de façon assez explicite pour qu'une passe de tests soit **reproductible** et **comparable dans le temps**.
> On teste contre cette liste, pas contre « teste tout ». Si un parcours n'est pas ici, il n'est pas couvert : ajoute-le.

## Comment s'en servir

1. **Une passe = une colonne de la frise de runs** (voir le bas du doc). Date + auteur + verdict global.
2. Pour chaque parcours, on coche **chaque critère d'acceptation** (`☐` → `✅` PASS / `❌` FAIL / `⏭️` non testé / `🚫` bloqué).
3. **Un parcours ne PASSE que si TOUS ses critères PASSENT.** Un seul ❌ = parcours en échec → ouvrir un ticket/PR référencé dans la colonne « notes ».
4. On déroule le **scénario complet en live**, puis on confirme dans le code si un doute subsiste. « mergé » ≠ « déployé » : on teste sur le **site publié**, pas l'aperçu Lovable.

## Environnement de test

| Élément | Valeur |
|---|---|
| URL à tester | **https://nowadays-assistant.fr** (PAS l'aperçu Lovable) |
| Compte de référence | `laetitiatest@nowadaysagency.com` (« Camille », plan gratuit) — reset onboarding via admin |
| Tests automatisés Playwright | `e2e/` (`baseURL` localhost:8080) — `npx playwright test` ; complète le live, ne le remplace pas |
| Pré-requis comptes externes | IG Business connecté, LinkedIn connecté, (Pinterest derrière flag) pour les parcours publication/stats |
| Rappel exports | Les téléchargements échouent dans l'aperçu Lovable mais marchent sur le site publié — ce n'est pas un bug |

**Légende priorité** : 🔴 cœur de valeur / bloquant · 🟡 important · 🟢 robustesse / edge case.
**Ordre recommandé** : P0 (cœur) → P1 branding → P2 Instagram → P3 calendrier/publi → P4 → P5 → P6 (en continu).

---

## P0 — Parcours cœur

### T1 🔴 Création post texte (Instagram + LinkedIn)
**Parcours** : `/creer` → idée → format *Post Instagram* → questions → génération → aperçu `PostResult` → édition → copier → « Ajouter au calendrier ». Refaire en *Post LinkedIn*.

Critères d'acceptation :
- ☐ Le streaming SSE s'affiche en continu (texte qui se construit), **aucun écran muet** pendant la génération.
- ☐ Le contenu généré respecte le sujet ET la voix de marque (pas de texte générique).
- ☐ **Un seul débit de crédit** par génération (pas de double débit) ; compteur `AiCreditsCounter` cohérent.
- ☐ « Ajouter au calendrier » crée **un seul** `calendar_post` ; ré-enregistrer à la même date = **UPDATE**, pas un doublon.
- ☐ Variante LinkedIn : ton adapté, **pas de hashtags parasites**, bouton « Créer le carrousel » présent.

### T2 🔴 Carrousel photo + Structure Review (parcours le plus fragile)
**Parcours** : `/creer` → carrousel → mode *photo* → upload **5 photos distinctes** → questions (vision) → génération **structure** → réordonner slides + réassigner *photo 1 → slide 3* → générer texte → générer visuels → export PNG.

Critères d'acceptation :
- ☐ L'étape `StructureReviewStep` est **obligatoire** et s'affiche avant la génération de texte.
- ☐ Après réassignation, **les bonnes photos sont au bon endroit** dans l'export (le `photo_index` est respecté).
- ☐ **Reload (F5) en cours de flow** → les photos sont réhydratées (IndexedDB `creer_photos`), rien n'est perdu en silence.
- ☐ **Aucune fuite `@import`** de police visible sur les visuels (régression PR #100).
- ☐ L'export PNG/ZIP contient bien toutes les slides générées.

### T3 🔴 Carrousel texte → visuels → exports → Canva
**Parcours** : carrousel texte (**8 slides**) → générer visuels → comparer toggle « Qualité Max » OFF (Sonnet) vs ON (Opus) → export PPTX éditable → « Ouvrir dans Canva ».

Critères d'acceptation :
- ☐ 8 slides générées, cohérentes, sans badge/numéro de slide parasite (garde `killStamps`, PR #119).
- ☐ Toggle « Qualité Max » : visible amélioration du rendu en ON ; **sur compte gratuit le toggle est verrouillé** (badge PREMIUM + upsell `/abonnement`, PR #225), pas de JSON brut en cas d'erreur.
- ☐ Export PPTX : le texte est **éditable** dans PowerPoint/Canva (pas une image aplatie).
- ☐ « Ouvrir dans Canva » : l'export aboutit (≈12 s, **même onglet en arrière-plan**, garde `requestAnimationFrame` PR #222) et le design s'ouvre dans Canva.
- ☐ Dans Canva : rendu fidèle + typo plancher respectée (≥15 pt, PR #179).

### T4 🔴 Newsjacking bout-en-bout
**Parcours** : `/creer?mode=transform` → intention + vibes → « Rechercher les actus » → sélectionner une actu → angle *primary* → « plus d'angles » (variants) → créer post avec `newsContext`.

Critères d'acceptation :
- ☐ La recherche d'actus affiche des **labels de progression honnêtes** (30–90 s), pas d'écran figé.
- ☐ L'actu sélectionnée est **intégrée fidèlement** dans le post final.
- ☐ **Aucune source/balise `<cite>` ne fuit** dans le texte rendu (régression PR #63).
- ☐ Le **rate-limit (10/h)** déclenche un message clair une fois dépassé.

### T5 🔴 Onboarding complet (compte neuf ou reset)
**Parcours** : `/parametres` → « Refaire le parcours initial » (`reset-onboarding`) → 12 étapes → diagnostic (`deep-diagnostic`) → `/welcome` → `/dashboard`.

Critères d'acceptation :
- ☐ **Validation par étape** (Zod) : impossible de passer une étape invalide.
- ☐ Le diagnostic affiche des **messages live** et produit un résultat exploitable.
- ☐ **Reload en cours d'onboarding** → reprise correcte (toast « on reprend ») via `lac_onboarding_*`.
- ☐ Chemin d'échec : si `deep-diagnostic` échoue, **dégradation propre** (pas d'écran cassé sur `diagnosticData` null).
- ☐ `/welcome` : polling branding visible, cartes éditables, puis CTA « ✨ Générer mon premier contenu » → `/creer?...&auto=1` (PR #201) qui saute idée+format et atterrit sur les questions, **0 crédit débité tant qu'on ne génère pas**.

---

## P1 — Branding & analyse

### T6 🟡 Import de marque + Review
**Parcours** : `/branding` (marque partielle) → import site + IG + doc PDF → `analyze-brand` → `BrandingReview` (corriger/rejeter) → save.

Critères d'acceptation :
- ☐ Les sources sont analysées et pré-remplissent la review ; on peut **corriger/rejeter avant save**.
- ☐ Une **source en échec** (site 404 / IG privé) affiche `sourceFailed`, sans bloquer les autres.
- ☐ La **complétude** (`calculateBrandingCompletion`, 7 sections) est recalculée après save.

### T7 🟡 Coaching branding (story, persona, ton, stratégie)
**Parcours** : `/branding/coaching?section=story` → questions progressives → rempli → confetti → redirection. Idem persona, ton, stratégie.

Critères d'acceptation :
- ☐ Barre de progression cohérente ; `is_complete` déclenche la fin (confetti + redirection).
- ☐ Le résultat **alimente bien la section** (`storytelling`, `persona`, `brand_profile.tone_*`, `brand_strategy`).
- ☐ La **voix de marque est conservée** d'une section à l'autre.

### T8 🟡 Proposition / Voice guide / Charte / Offres
Critères d'acceptation :
- ☐ Proposition : **6 versions** générées (bio, pitch naturel, networking, site, engagée, one-liner) ; **garde si persona vide** (pas de versions vides silencieuses).
- ☐ Voice guide : `do_say` / `dont_say` non vides, export OK.
- ☐ Charte : extraction de la **palette depuis le logo** fonctionne.
- ☐ Offres : workshop 7 étapes avec **autosave** + pourcentage de complétion qui progresse.
- ☐ Le positionnement final (`brand_proposition.version_final`) est **propagé** à la génération et au Coach (PR #207/#209/#215/#220).

### T9 🟡 Audit branding + Partage public
**Parcours** : `/branding/audit` → multi-source → score 8 piliers → « Coacher » un point faible. Puis générer `/share/branding/:token` → ouvrir **sans login**.

Critères d'acceptation :
- ☐ Score sur **8 piliers** affiché ; bouton « Coacher » mène au flow de coaching du point faible.
- ☐ Le lien public s'ouvre **sans authentification**, en **lecture seule**.
- ☐ La page partagée montre **bien LA marque concernée** (pas un autre profil — scoping `workspace_id` correct).

### T10 🟡 Vérif connexions
**Parcours** : `/parametres/connexions` → « Lancer la vérification ».

Critères d'acceptation :
- ☐ Les sections branding remplies remontent à **100 %**, **pas de faux « absent »** (régression PR #96/#98).
- ☐ Une plateforme réellement connectée n'apparaît jamais « déconnectée » à tort (régression PR #102).

---

## P2 — Instagram

### T11 🔴 Audit IG nourri par stats réelles
**Parcours** : `/instagram/audit` → « Récupérer mes stats » (`instagram-insights-fetch`) → champs pré-remplis + followers réels → upload screenshots → lancer audit (`audit-instagram-ai`, vision) → adopter bio.

Critères d'acceptation :
- ☐ « Récupérer mes stats » remonte les **6 métriques + audience** réelles via Meta Graph (fenêtre `since`/`until` correcte, cf piège insights).
- ☐ L'audit produit un **score + un bloc « STATS RÉELLES »**.
- ☐ « Adopter » la bio écrit dans `audit_validations` ; la barre « X/N optimisés » progresse, et le badge « Fait » **persiste au reload** (PR #210).
- ☐ **Reload pendant l'audit** → reprise (resume), pas de perte.
- ☐ Cas scope manquant : **409 « Reconnecte »** affiché proprement (pas un crash).

### T12 🟡 Bio / Édito / Stats / Engagement / Lancement
Critères d'acceptation :
- ☐ Bio : audit → 3 versions → mixer → valider (`bio_versions`).
- ☐ Édito : objectif + piliers + fréquence → estimation de temps affichée.
- ☐ Stats : onboarding 3 étapes → saisie mensuelle → `engagement-insight` (2 phrases).
- ☐ Engagement : checklist quotidienne → **streak** se met à jour à 60 % d'items.
- ☐ Lancement : template → date → `launch-plan-ai` → timeline générée.

---

## P3 — Calendrier / Publication / Photos

### T13 🔴 Publication directe + programmée
**Parcours** : Calendrier → post → onglet *Preview* → « Publier maintenant » (IG image + carrousel, et LinkedIn texte). Puis programmer (`auto_publish` + date future).

Critères d'acceptation :
- ☐ Publication immédiate IG (image **et** carrousel) aboutit (container + poll) ; carrousel photo en **JPEG via URL signée** (PR #193/#198).
- ☐ Publication immédiate LinkedIn (texte) aboutit.
- ☐ Programmation : `publish_status = scheduled`, puis **`published` après le cron (≤ 5 min)**.
- ☐ Aucune publication en double ; statut affiché à jour.

### T14 🟡 Partage calendrier + commentaires invité
**Parcours** : `CalendarShareDialog` → permissions → ouvrir `/calendrier/partage/:token` sans login.

Critères d'acceptation :
- ☐ L'invité voit le calendrier sans login ; **commente** (`calendar_comments`) et **édite le statut** si la permission le permet.
- ☐ Un **token expiré** affiche une erreur propre (pas de crash ; base64url PR #28).

### T15 🟡 Photos / Idées
Critères d'acceptation :
- ☐ `/photos` : upload → prompt ambiance → `photo-background-replace` → statut `ready` en **Realtime** ; un échec → `failed` avec réessai possible.
- ☐ Suppression d'une photo retire **original + retouchée** (pas d'orphelin visible).
- ☐ `/idees` : filtres (statut/objectif/canal/type) ; « Rédiger » → `/creer` ; « Planifier » → drag vers une date crée le `calendar_post`.

---

## P4 — LinkedIn / Pinterest / SEO / Site

### T16 🟡 LinkedIn modules
Critères d'acceptation :
- ☐ `/linkedin/post` (`improve-post`) : score coloré + accroches alternatives + AddToCalendar (date Mar–Jeu).
- ☐ Résumé : variantes storytelling/pro dans le sweet spot 1300–1900 c.
- ☐ Crosspost : source IG → cibles LinkedIn + Reel + Stories ; format stories **lisible**.
- ☐ Carrousel LinkedIn (import) fonctionne (PR #152/#159). ⚠️ Publication LinkedIn API perso = verrouillée (attendu).

### T17 🟢 Pinterest (si flag actif)
Critères d'acceptation :
- ☐ Compte (name/bio), mots-clés (4 listes), épingles (variantes → save) OK.
- ☐ Tableaux : delete-then-insert **sans perte** si une étape échoue.
- ☐ Publication `social-pinterest-publish` aboutit.

### T18 🟡 SEO embed + Site
Critères d'acceptation :
- ☐ `/seo/audit` : l'iframe charge **< 8 s**, sinon bannière + « ouvrir dans un onglet ».
- ☐ `/site/audit` : URL réelle → 6 piliers ; URL localhost → erreur `site_inaccessible` propre.
- ☐ `/site/optimiser` : score + sections éditables.
- ☐ `/site/capture` : générer → reload → **persiste** (localStorage) ; clear storage → vide (pas de DB, attendu).
- ☐ `/site/accueil` : 10 étapes + recap cohérent.

---

## P5 — Compte / Stripe / Binôme (zone sensible)

### T19 🔴 Crédits / Quota / Upgrade
**Parcours** : épuiser les crédits (plan free) → générer → `QuotaWallModal` → CTA « Passer à Premium » → `create-checkout`.

Critères d'acceptation :
- ☐ Crédits épuisés → `QuotaWallModal` à la génération (pas de message d'erreur brut).
- ☐ CTA « Passer à Premium » ouvre bien `create-checkout` Stripe.
- ☐ Achat d'un pack crédits → `ai_usage.total.limit` augmente (compteur global).
- ☐ `UpgradeGate` bloque une feature premium sur un compte free.

### T20 🔴 Parcours binôme — **diagnostic uniquement** (refonte plus tard, ne pas rustiner)
> ⚠️ **NE PAS payer pour de vrai.** Vérifier en **code + dashboard Stripe**, pas en paiement live.

Critères d'acceptation (CONFIRMER l'état, pas patcher) :
- ☐ Confirmer si `CheckoutBinomePage` utilise un lien `buy.stripe.com` **hardcodé sans `metadata.user_id`** (bypass tracking).
- ☐ Confirmer si `stripe-webhook` crée bien `subscription` **ET** `coaching_program` + 7 sessions au paiement binôme.
- ☐ Confirmer si `cancel_at = +6 mois` est posé.
- ☐ Confirmer si le Calendly hardcodé est synchronisé en DB ou non.
- ☐ Tout écart est **consigné pour la refonte globale**, pas corrigé à la rustine.

### T21 🟡 Compte / Profil / Légal / Admin
Critères d'acceptation :
- ☐ `reset-onboarding` nettoie localStorage **et** branding DB.
- ☐ `delete-account` supprime le compte proprement.
- ☐ Changement de mot de passe fonctionne.
- ☐ Pages légales (`/cgu-cgv`, `/confidentialite`, `/mentions-legales`, `/legal-ia`, `/services`) chargent (pas de 404).
- ☐ Admin : `/admin/coaching` liste les programmes ; `/admin/audit` montre users/stats avec **coût API réel** (PR #184).

---

## P6 — Transverse / Robustesse (à vérifier en continu)

### T22 🟢 Multi-workspace / Isolation
Critères d'acceptation :
- ☐ Aucune donnée ne fuit entre workspaces (`calendar_posts`, `saved_ideas`, `user_photos`, branding).
- ☐ Les posts anciens avec `workspace_id` NULL s'affichent sans erreur.

### T23 🟢 Mode démo
Critères d'acceptation :
- ☐ Les données démo sont fictives ; les edges **refusent `isDemoUser`** (audit/coaching/newsjacking → 403).
- ☐ Aucune vraie génération ni vrai débit de crédit en démo.

### T24 🟢 Réseau dégradé / reload
Critères d'acceptation :
- ☐ Génération lente → labels d'attente honnêtes, **pas de double submit**.
- ☐ Reload mid-flow (`/creer`, onboarding, audit IG) → reprise correcte.
- ☐ Exports OK sur le site publié (KO en aperçu Lovable = normal).

---

## Frise des runs

> Une ligne par parcours, une colonne par passe de test. Remplir `✅ / ❌ / ⏭️ / 🚫`.
> En cas de ❌, mettre le n° de PR/ticket dans « Dernière note ».

| Parcours | Prio | Run 2026-06-30 | Run … | Dernière note |
|---|---|---|---|---|
| T1 Post texte IG/LinkedIn | 🔴 | 🟡 PASS partiel | | Variante IG OK ; LinkedIn + débit crédit à confirmer (voir journal) |
| T2 Carrousel photo + Structure Review | 🔴 | | | |
| T3 Carrousel texte → Canva | 🔴 | | | |
| T4 Newsjacking | 🔴 | | | |
| T5 Onboarding complet | 🔴 | | | |
| T6 Import marque + Review | 🟡 | | | |
| T7 Coaching branding | 🟡 | | | |
| T8 Proposition/Voice/Charte/Offres | 🟡 | | | |
| T9 Audit branding + partage | 🟡 | | | |
| T10 Vérif connexions | 🟡 | | | |
| T11 Audit IG + stats réelles | 🔴 | | | |
| T12 Bio/Édito/Stats/Engagement/Lancement | 🟡 | | | |
| T13 Publication directe + programmée | 🔴 | | | |
| T14 Partage calendrier | 🟡 | | | |
| T15 Photos / Idées | 🟡 | | | |
| T16 LinkedIn modules | 🟡 | | | |
| T17 Pinterest | 🟢 | | | |
| T18 SEO + Site | 🟡 | | | |
| T19 Crédits / Quota / Upgrade | 🔴 | | | |
| T20 Binôme (diagnostic) | 🔴 | | | |
| T21 Compte / Légal / Admin | 🟡 | | | |
| T22 Multi-workspace | 🟢 | | | |
| T23 Mode démo | 🟢 | | | |
| T24 Réseau dégradé / reload | 🟢 | | | |

**Verdict global de la passe** : _____ PASS / _____ FAIL / _____ non testés — sur 24 parcours.

---

## Journal des runs

### Run 2026-06-30 (Claude, live, compte Camille)

**T1 — Post texte Instagram — 🟡 PASS partiel** (sujet : « 3 erreurs que je vois souvent chez les créatrices qui débutent »)
- ✅ Flux `/creer` complet : idée → canal IG → format Post → 3 questions contextuelles (indexation Q1/2/3 correcte, réponses sauvegardées ✓ bleu) → génération.
- ✅ Génération streaming avec loader honnête (skeleton + barre + tip), **aucun écran muet**.
- ✅ Qualité + voix de marque : caption fidèle aux réponses, **positionnement « artisanat lent / trace de la main » intégré** (la question 3 elle-même citait le positionnement → propagation branding confirmée live), CTA d'engagement final, **aucun hashtag parasite**.
- ✅ « Ajouter au calendrier » → **1 seul post** au 15 juil. (footer « 1 contenu »), **pas de doublon** ; ouvre l'éditeur 2 colonnes (auto-save, statut « En rédaction », « Publier ▾»).
- ⏭️ Variante **LinkedIn non testée** (à faire).
- ⚠️ **Débit crédit non concluant** : compteur « 11 restantes » identique avant/après (cache `useUserPlan` 60 s probable) → re-vérifier après expiration cache pour confirmer 1 seul débit.
- 🐛 **Note (mineure, non bloquante)** : champ « Thème / sujet » dans l'éditeur calendrier = concaténation sans espace de la nouvelle idée avec une idée de test précédente restée en session (`...communicationTest gating qualité max`). Contenu généré propre. À investiguer côté hygiène `creer_flow_state`.

**T2–T5 — non lancés** (voir note de cadrage : consommation de crédits du compte test + T5 nécessite un reset onboarding destructif sur Camille).

---

*Maintenance : ce document est la source de vérité des parcours couverts. Tout nouveau parcours = nouvelle ligne ici AVANT d'être considéré « testé ».
Carte d'architecture détaillée (route → page → hooks → edge → tables) : voir la cartographie des parcours.*
