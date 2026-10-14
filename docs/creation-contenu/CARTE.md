# Carte de la création de contenu

> **À lire AVANT toute modification d'un générateur de contenu.**
> Pour chaque format : où il vit (écran, fonction serveur, modules partagés,
> tables, tests) et ce qu'une modification risque de toucher par ricochet.
>
> Lot 1 du chantier « robustesse création de contenu » (13/10/2026).
> Les noms de fonctions servent de repères plutôt que les numéros de ligne,
> qui bougent à chaque modification.
>
> **Tenir à jour** : si tu ajoutes, déplaces ou supprimes un fichier listé ici,
> mets la carte à jour dans la même PR.
> La section « Rayon d'impact » se régénère avec `node scripts/carte-impact.mjs`.

Complément : `supabase/functions/_shared/socle.ts` (tableau `SOCLE_CHEMINS`)
dit quelle **règle d'écriture** s'applique sur quel chemin de génération.
Cette carte dit quels **fichiers** et quels **tests** sont concernés.
Les deux se complètent.

---

## 1. Vue d'ensemble : format → fonction serveur

Liste canonique des formats côté front : `SUPPORTED_FORMATS` dans
`src/lib/format-normalizer.ts`. Elle contient post, carousel, reel, story,
linkedin, newsletter, pinterest, pinterest_visual, pinterest_inspiration et
pinterest_photo. Les alias sont dans `ALIASES`. Un carrousel LinkedIn est
`carousel` + `isLinkedInCarousel`.

| Format | Fonction serveur (génération) | Rendu du résultat (front) | Autres fonctions |
|---|---|---|---|
| Carrousel (texte / photo / mixte / « Mes slides » / photos brutes) | `carousel-ai` | `formatRenderers/CarouselResult.tsx`, `CarouselPhotoResult.tsx`, `CarouselEditor.tsx` | `carousel-visual` (mise en forme), `carousel-slide-image` (image d'une slide), `carousel-media-backfill` (admin) |
| Carrousel LinkedIn | `carousel-ai` (`isLinkedIn`) | idem, plus l'export PDF `src/lib/carousel-pdf.ts` | `linkedin-ai` action `caption-for-carousel` |
| Reel | `creative-flow` (`step: "hooks"` puis `"generate"`) | `ReelResult.tsx`, `ReelMontage.tsx` | `reel-render` (montage vidéo, sans IA) |
| Stories | `creative-flow` | `StoryResult.tsx`, `StoryPhotoSuggestions.tsx` | — |
| Post Instagram (légende) | `creative-flow` (SSE `streamDefaultPostSSE`) | `PostResult.tsx`, `PostPhotoEditor.tsx` | — |
| Post LinkedIn | `creative-flow` (SSE `runLinkedInTwoStep`) | `LinkedInResult.tsx` | `linkedin-ai` (`improve-post`, page `LinkedInPostGenerator.tsx`) |
| Newsletter | `creative-flow` (`runNewsletterTwoStep`) | `NewsletterResult.tsx` | — |
| Pinterest texte | `creative-flow` (`pinterestBrief`) | `PostResult.tsx` (défaut) | `pinterest-ai` (pages Pinterest hors /creer) |
| Pinterest visuel | `pinterest-visual` | `PinterestVisualResult.tsx` | — |
| Pinterest photo | `pinterest-photo-brief` | `PinterestPhotoBriefResult.tsx` | — |
| Pinterest inspiration | `pinterest-inspiration` | `PinterestInspirationStep.tsx` | — |
| Bio Instagram | `generate-content` (`bio-audit`, `bio-generator`) | `src/pages/InstagramBio.tsx` | `instagram-profile-coaching`, `audit-instagram-ai` (partie bio de l'audit) |
| Recyclage (un contenu → plusieurs formats) | `creative-flow` (`step: "recycle"`, `handleRecycleStep`) | `src/components/ContentRecycling.tsx` | — |
| Crosspost (→ LinkedIn, Instagram, reel, stories) | `linkedin-ai` action `crosspost` | `src/components/CrosspostFlow.tsx` | `src/lib/crosspost-*.ts` |
| Newsjacking (actu → angles) | `newsjacking-ai`, `newsjacking-angles`, `newsjacking-from-url` | `src/components/creer/NewsjackingPanel.tsx` | — |
| Menu IA sur sélection de texte | `ai-text-action` | `src/components/SelectionMenu.tsx`, `SelectionMenuProvider.tsx` | — |
| Brouillon rapide depuis le calendrier | `generate-content` (`calendar-quick`, `express-draft`) | `CalendarPostDialog.tsx`, `dashboard/SuggestedContents.tsx` | — |

---

## 2. Parcours /creer (front)

### Fichiers

| Fichier | Rôle |
|---|---|
| `src/pages/CreerUnifie.tsx` (~3 500 lignes) | Orchestre tout le parcours : environ 85 `useState`, une cinquantaine de comparaisons `format === …` sans `switch`, plus `carouselSubMode` et `isLinkedInCarousel`. **C'est le fichier le plus couplé du front.** |
| `src/components/creer/CreerStepIdea.tsx` → `CreerStepFormat.tsx` → `CreerStepQuestions.tsx` → `HookSelectionStep.tsx` (reel) / `StructureReviewStep.tsx` (carrousel photo et mixte) / `UserSlidesStep.tsx` / `PinterestInspirationStep.tsx` → `CreerStepResult.tsx` → `CreerStepEdit.tsx` | Les étapes. Le type `Step` est en tête de `CreerUnifie.tsx`. Le stepper visible (`CreerStepper.tsx`) n'affiche que 4 étapes. |
| `src/components/creer/CreerStepResult.tsx` | Le `switch (format)` qui choisit le bon `formatRenderers/*`. **C'est le point d'aiguillage naturel par format.** |
| `src/hooks/use-format-next.ts` | Passage de l'étape format à l'étape suivante (et Pinterest inspiration). |
| `src/hooks/use-do-generate.ts` | Lance la génération selon le format : SSE texte, carrousel, Pinterest visuel ou photo. |
| `src/hooks/use-content-generator.ts` | Appels réels aux fonctions serveur. `switch` par format, questions, streaming (`streamInvoke`, table `contentTypeMap`). |
| `src/hooks/use-generate-visuals.ts` | Mise en forme des carrousels (`carousel-visual`). |
| `src/hooks/use-user-slides-generate.ts` | Carrousel « Mes slides ». |
| `src/features/creer/pinterest-generation.ts` | Pinterest visuel et photo. |
| `src/lib/content-structures.ts` | Angles et structures par format (`CONTENT_STRUCTURES`, `CONTENT_TYPE_SPECS`, `getAnglesForType`), plus la correspondance format → fonction serveur. |
| `src/lib/idea-brief-request.ts` | Mise en forme du brief envoyé au serveur. |
| `src/hooks/use-flow-persistence.ts` | Brouillon local du parcours (sessionStorage + sauvegarde localStorage par utilisatrice), conflit dans `DraftConflictDialog.tsx`. |
| `src/lib/first-content-url.ts`, `first-content-destination.ts` | Premier contenu de l'onboarding (toujours un carrousel, `auto=1`). |

### Sauvegarde

| Où | Quoi | Code |
|---|---|---|
| `saved_ideas` | Autosave carrousel, « Enregistrer dans mes idées », édition d'aperçu | `use-carousel-autosave.ts`, `SaveToIdeasDialog`, `src/lib/content-preview-save.ts` (`savePreviewEdit`) |
| `generated_carousels` | Historique des carrousels | `persistCarousel` dans `CreerUnifie.tsx` |
| `content_briefs` | Brief de la création | `CreerUnifie.tsx` |
| `calendar_posts` | Envoi vers le calendrier ou retour vers le post d'origine | `src/hooks/use-calendar-save.ts` |
| Storage `calendar-visuals`, `calendar-media` | Images et vidéos | `src/features/creer/upload-helpers.ts`, `src/lib/carousel-media.ts` |

### Ne jamais perdre une modification (lot 6, 14/10/2026)

- **« Régénérer » et « Changer d'angle »** gardent la version d'avant, retouches
  comprises (`src/hooks/use-regeneration-backup.ts`). Si la nouvelle génération
  échoue, elle revient toute seule. Si elle réussit, un toast propose « Revenir à
  ma version précédente ». Pendant la régénération, la copie de secours du
  navigateur garde l'ancienne version au lieu d'un résultat vide.
- **Étape « Modifier »** (`CreerStepEdit`) : la frappe part dans la copie de
  secours au fil de l'eau (`onDraftChange`, 400 ms) ; « Retour » avec des
  modifications non appliquées demande d'abord (appliquer, continuer, ou revenir
  sans les appliquer). `editBaseline` mémorise la dernière version appliquée.
- Tests : `src/test/regeneration-backup.test.tsx`, `src/test/creer-step-edit.test.tsx`.
- Tout nouveau bouton qui relance la génération d'un résultat existant appelle
  `regenerationBackup.begin(regenerationSnapshot())` avant `doGenerate`.

### Pas d'écrasement entre onglets ni de texte démesuré (lot 10, 14/10/2026)

- **« Enregistrer dans Mes idées » sur une idée déjà ouverte** (`SaveToIdeasDialog`,
  `editingIdeaId`) : version `updated_at` lue à l'ouverture, écriture seulement si
  elle n'a pas bougé. Sinon rien n'est écrasé : « Enregistrer une copie de mon
  contenu » ou « Recharger la dernière version ». Test :
  `src/test/save-to-ideas-version.test.tsx`.
- **Publication immédiate** (`recordImmediatePublication`, `use-calendar-save.ts`) :
  la fiche du calendrier ouverte n'est réécrite que si elle est encore dans sa
  version d'ouverture. Sinon on garde la version faite ailleurs et on y ajoute
  seulement le suivi (publié, lien du post, programmation coupée), avec un
  message. Tests : `src/test/use-calendar-save.test.tsx`.
- **Longueurs maximales côté serveur** (400 en français, sans appel IA ni débit) :
  `ai-text-action` 8 000 caractères sélectionnés et 1 000 de consigne ;
  `creative-flow` étape `adjust`, champ `content` 15 000 caractères (cas
  `adjust — contenu trop long` du contrat). Le menu IA (`SelectionMenu.tsx`)
  affiche ce message du serveur au lieu de « Oups, quelque chose a coincé », et
  sa demande libre est plafonnée à 1 000 caractères
  (`src/test/selection-menu-error.test.tsx`).

### Une seule version du texte modifié (lot 7, 14/10/2026)

- **Carrousel et stories** : le texte de l'étape « Modifier » est remis à sa
  place dans les slides / stories, repère par repère (« --- SLIDE n --- »,
  « --- CAPTION --- », « --- STORY n --- »), par `applyEditedText`
  (`src/features/creer/edited-text.ts`). Plus de copie à plat `edited_text` pour
  ces formats : l'écran de résultat, le calendrier et la publication lisent la
  même structure. Un repère supprimé : refus clair, l'écran reste ouvert.
  Le visuel du carrousel suit (`replaceSlideText`, sinon « visuels à mettre à jour »).
- **Autres formats** (post, LinkedIn, newsletter, Pinterest, reel) : `edited_text`
  comme avant. Une retouche directe des slides, des stories ou du script du reel
  efface l'ancienne copie à plat (`withoutEditedText`).
- **« Ajuster »** : le bon type de contenu par format (reel, stories, carrousel,
  Pinterest) ; consigne de garder les repères (`adjustMarkersBlock` dans
  `creative-flow`) ; une réponse sans texte renvoie 502 sans débit, et le front
  n'affiche plus « Contenu ajusté ! » à tort.
- Tests : `src/test/edited-text.test.ts`, `src/test/creer-step-edit.test.tsx`,
  cas `adjust — carrousel` et `adjust — réponse sans contenu` du contrat
  `creative-flow`.

### Aller-retour avec le calendrier (navigate state)

- **Départ** : `src/pages/Calendar.tsx` (state `fromCalendar`, `postId`,
  `calendarPostId`, `theme`, `objectif`, `angle`, `format`, `notes`,
  `postDate`, `existingContent`, `canal` + paramètres d'URL), plus
  `CalendarPostDialog.tsx` (`resumeIdea`, `existingAccroche`, `launchId`,
  `contentType`…) et `CalendarCoachingDialog.tsx`.
- **Lecture** : `locState` dans `CreerUnifie.tsx` (`fromCalendar = !!calendarPostId`).
- **Retour** : `handleAddToCalendar` → `handleSaveBackToCalendar`
  (`use-calendar-save.ts`), qui renvoie vers `/calendrier?date=…&post=…`.

> ⚠️ Renommer une clé du state casse le lien calendrier → générateur en
> silence (ni TypeScript ni le build ne le voient). Il faut toucher les deux
> côtés ensemble et lancer `src/test/idea-to-calendar*`,
> `r3-calendar-persistence*` et `use-calendar-save*`.

### Quota dans le parcours

- `LowCreditsBanner` (défini dans `CreerUnifie.tsx`) et la pastille
  « N crédits restants ».
- `QuotaWallModal` n'est **pas** monté dans /creer : il est global, dans
  `AppHeader.tsx`, déclenché par `handleQuotaError`
  (`src/lib/quota-error-handler.ts`) depuis `use-do-generate`,
  `use-content-generator` et `use-generate-visuals`.
- `AiCreditsCounter` : `AppHeader.tsx` et `AppSidebar.tsx`.

### Mode démo dans le parcours

- `useDemoContext` dans `CreerUnifie.tsx` (scénario Auriana via
  `locState.demoScenario`, carrousel pré-rempli depuis
  `demoData.carousel_photo_demo`).
- Sauvegarde, calendrier et exports remplacés par `demoToast`.
- Branches démo dans `use-do-generate.ts`, `use-format-next.ts` et
  `use-generate-visuals.ts`.
- Aucun composant `src/components/creer/*` ne lit le contexte démo :
  tout passe par la page et les hooks.

---

## 3. Fonctions serveur

### `creative-flow` : reel, stories, post Instagram, LinkedIn, newsletter, Pinterest texte, recyclage

**Organisation des fichiers** (découpage du lot 3, 13/10/2026 : code déplacé
à l'identique, comportement inchangé)

| Fichier | Contenu | Modifier ce fichier touche… |
|---|---|---|
| `index.ts` (~1 650 l.) | Handler : aiguillage des `step`, construction des prompts, post-traitement final, télémétrie | tous les formats |
| `shared.ts` | Délais IA, `gateNumbers`, `_deps`, `addrOpts`, `POST_ADDRESS_FIELDS`, `QUESTIONS_TOOL`, `extractImagePayload`, `photoVoiceRule` | tous les formats |
| `formats/linkedin.ts` | `runLinkedInTwoStep`, `applyLinkedInCorrectionPass`, `streamLinkedInPhotoVision`, brief fictif | LinkedIn |
| `formats/newsletter.ts` | `runNewsletterTwoStep`, `applyNewsletterCorrectionPass` | la newsletter |
| `formats/stories.ts` | `applyStoriesCorrectionPass`, `finalizeRecycledStories` | les stories, y compris recyclées |
| `formats/reel.ts` | `applyReelQualityPass`, `normalizeHooksResponse`, `enforceReelAudienceAddress` | le reel |
| `formats/post.ts` | `streamDefaultPostSSE`, `correctPostStreamContent`, `POST_TOOL` | le post Instagram / la légende |
| `formats/photo.ts` | `runVisionQuestions`, `runVisionGenerate` | le mode photo, tous formats |
| `formats/recycle.ts` | `buildRecycleSystemPrompt`, `handleRecycleStep` | le recyclage |
| `formats/carousel.ts` | contrôle tu / vous d'un carrousel, réponse 410 du streaming retiré | le recyclage en carrousel, l'ajustement carrousel |

`index.ts` réexporte tout ce qui était exporté avant : les tests et les
appelants n'ont pas changé d'import.


**Aiguillage**
- Par `step` : `angles`, `questions`, `follow-up`, `hooks`, `generate`,
  `adjust`, `recycle`, `dictation`. Une chaîne de `if / else if` dans le
  handler principal. Tout autre `step` renvoie 400.
- Le format vient de `resolveFormatHint(contentType, angle)`, puis des
  drapeaux `isCarousel`, `isReel`, `isStories`, `isLinkedIn`,
  `isPinterest`, `isNewsletter`, `isCaption` et `isPhotoMode`, détectés
  **par sous-chaîne**. Le front envoie des noms différents pour un même
  format (`linkedin_post` / `post_linkedin`, `instagram_post` /
  `post_instagram`).

**Construction des prompts**
- `buildAnglesPrompt`, `buildQuestionsPrompt`, `buildFollowUpPrompt`,
  `buildHooksPrompt`, `buildGeneratePrompt`, `buildAdjustPrompt`,
  `buildDictationPrompt`, `buildRecycleSystemPrompt`.
- Les briefs par format sont dans `_shared/format-briefs.ts` :
  `carouselBrief`, `reelBrief`, `storiesBrief`, `linkedinBrief`,
  `pinterestBrief`, `newsletterBrief`, `captionBrief`, `photoCaptionBrief`.

**Passes spécifiques à un format** (fichiers `formats/*`, voir ci-dessus)

| Format | Fonctions |
|---|---|
| Reel | `applyReelQualityPass` |
| Stories | `applyStoriesCorrectionPass`, `finalizeStoriesLayout`, `finalizeRecycledStories` |
| LinkedIn | `runLinkedInTwoStep`, `applyLinkedInCorrectionPass`, `streamLinkedInPhotoVision`, `buildFictionalLinkedInQuestions` |
| Newsletter | `runNewsletterTwoStep`, `applyNewsletterCorrectionPass` |
| Post Instagram | `streamDefaultPostSSE`, `correctPostStreamContent` |
| Photo | `runVisionQuestions`, `runVisionGenerate` |
| Carrousel | Le streaming est retiré : `retiredCarouselStreamResponse` renvoie 410 |

**⚠️ Code partagé qui fait des `if` sur le format** : c'est ici que modifier
un format en casse un autre.
- `buildGeneratePrompt` : `positionFormat`, l'exclusion par format de
  `FORMAT_STRUCTURES`, `WRITING_RESOURCES` et `VISUAL_ANALOGIES`, et le
  contexte de lancement pour les stories et les reels.
- `buildQuestionsPrompt` : sa propre détection de format (`ctypeQ`).
- `buildRecycleSystemPrompt` (`formats/recycle.ts`) : un bloc par format recyclé.
- Le handler principal :
  - recherche approfondie (légende, LinkedIn, reel, stories) ;
  - accroches précédentes (stories) ;
  - routage SSE par format ;
  - `maxTokens` et température pour LinkedIn ;
  - la chaîne de post-traitement par format, en fin de handler ;
  - la télémétrie qualité.

**Quota**
- `BILLED_STEPS = generate, adjust, recycle`. `runPipeline` →
  `checkQuota("content")` dans `_shared/request-pipeline.ts`.
- `logUsage("content", "creative_flow")` est appelé à la fin du chemin non
  streamé et dans chaque chemin streamé (LinkedIn, newsletter, post,
  photo, recyclage).
- La recherche approfondie a son propre
  `checkQuota` / `logUsage("deep_research")`.

**Tables**
- Lues directement : `stories_sequences`, `user_photos`.
- Via les modules partagés :
  - `profiles`, `workspace_members`, `brand_profile`, `voice_profile`
    (`user-context`) ;
  - `content_briefs` (`recent-briefs`) ;
  - `series`, `calendar_posts` (`series-context`) ;
  - `content_quality_events` (`previous-hooks`, `content-quality`).

**Appelants front**
- `use-content-generator.ts` : `generate` pour reel, stories,
  instagram_post et post_linkedin, `questions`, et le streaming.
- `CreerUnifie.tsx` : `hooks`.
- `CreerStepEdit.tsx` : `adjust`.
- `ContentRecycling.tsx` : `recycle`.
- Aucun appelant front trouvé pour `angles`, `follow-up` et `dictation`.
  À vérifier avant toute suppression : un autre appelant que le front
  peut exister.

### `carousel-ai` (~2 800 lignes + 10 modules locaux) : carrousels

**Aiguillage**
- `switch (type)` : `hooks`, `slides`, `express_full`,
  `structure_proposal`, `suggest_topics`, `suggest_angles`,
  `deepening_questions`.
- `assign_templates` (slides fournies par l'utilisatrice) sort **avant** le
  `switch`, sans quota et sans réécriture éditoriale.
- Sous-aiguillage par `carousel_type` : `handleMixCarouselRequest` et
  `handlePhotoCarouselRequest`.

**Modules locaux**
`confirmed-structure`, `continuous-narrative`, `final-photo-match`,
`photo-narrative`, `stock-ambient`, `structure-hedge`,
`thread-local-repair`, `variant-writing`, `writer`, `writing-contract`.

**Quota**
- Catégorie `carousel` pour `slides` et `express_full`, y compris photo et
  mixte. C'est un plafond **dur**.
- Catégorie `content` pour `hooks` ; catégorie `suggestion` pour
  `suggest_*`, `deepening_questions` et `structure_proposal`.
- Contrôle d'accès `quality_max` en plus.

**Documentation existante** : `docs/carousel-editorial-review.md`,
`docs/carousel-subject-first.md`, `docs/carrousels-photo-recit.md`.

### `carousel-visual` (~2 800 lignes) : mise en forme visuelle des carrousels

- Branche sur `carousel_type` (photo / mixte / texte). Rendu par lots, mode
  `single`, rattrapage des slides manquantes, passe de contraste.
- Quota : `content`, ou `quality_max` si demandé.
  - Illustration de couverture : `photo_retouch`.
- Snapshot des prompts : `carousel-visual/prompts_snapshot_test.ts`.

### `carousel-slide-image` : image d'une slide

- Higgsfield ou OpenAI. Bloqué en plan gratuit.
- Quota `photo_retouch` (plafond dur). `logUsage` seulement après une image
  réussie.

### Autres générateurs

| Fonction | Aiguillage | Quota | Tests |
|---|---|---|---|
| `generate-content` (~650 l.) | `type` : `bio-audit`, `bio-generator`, `caption`, `calendar-quick`, `express-draft`, `weekly-suggestions`, `playground`, `edito-*`, `instagram-nom`, `launch-ideas`, `rhythm-adapt`… | `audit` (bio-audit) sinon `content` | `contract_test.ts` |
| `linkedin-ai` (~600 l. + `socle-linkedin.ts`) | `action` : `crosspost`, `caption-for-carousel`, `improve-post`, `adapt-instagram`, actions profil (`title`, `summary`…) | `categoryMap` : `content` / `adaptation` / `bio_profile` | `socle-linkedin_test.ts` + tests front `crosspost-*`, `linkedin-*` |
| `pinterest-ai` (~150 l.) | `name`, `bio`, `board-description`, `pin`, `keywords` | `content` | `contract_test.ts` |
| `pinterest-visual` | `pin_type` (infographie, checklist, mini_tuto, avant_apres, schema_visuel) | `content` | `index_test.ts` |
| `pinterest-photo-brief` | `pin_type` (photo_product, photo_lifestyle, photo_flat_lay) | `content` | `index_test.ts` |
| `pinterest-inspiration` | mode unique | `content` | via mock front |
| `ai-text-action` (menu sur sélection) | action de réécriture | `adaptation` | `index_test.ts` |
| `newsjacking-ai` / `-angles` / `-from-url` | recherche web / angles | `deep_research` / `content` | `newsjacking-ai/index_test.ts` seulement |
| `storytelling-ai` | `improve`, `generate-story`, `generate-pitch`, `generate-recap` | `content` | `contract_test.ts` |
| `inspire-ai` | capture d'écran → format conseillé | `content` | `contract_test.ts` |
| `reel-render` | `archive`, `submit`, `status` (json2video, pas d'IA) | sans quota | `recipe_test`, `archive-url_test`, `reel_reference_test` |

---

## 4. Rayon d'impact des modules partagés

Ce tableau répond à la question : *si je touche ce fichier de
`supabase/functions/_shared/`, quels générateurs peuvent changer ?* Il compte
les imports **transitifs** : un module importé par un module partagé compte
aussi pour ses importeurs.

Régénérer : `node scripts/carte-impact.mjs` (tous les modules), ou
`node scripts/carte-impact.mjs redac-gate format-briefs` (quelques modules).

### 🔴 Zone rouge : touche presque tout

Ne pas modifier pour corriger un seul format. Ajouter plutôt un paramètre ou
une fonction dédiée, ou faire la correction dans le module du format.

| Module | Nombre de fonctions | Contenu |
|---|---|---|
| `cors` | 112 | En-têtes HTTP |
| `plan-limiter` | 74 | **Quota** (`checkQuota`, `logUsage`, `PLAN_LIMITS`) ; miroir front `src/lib/plan-limits.ts` |
| `rate-limiter` | 72 | Limite de débit |
| `anthropic` | 62 | Appels Claude, choix du modèle, timeouts |
| `workspace-guard` | 57 | Isolation par espace |
| `socle` | 37 | Les 7 règles d'écriture communes |
| `angle-families` | 37 | Familles d'angles |
| `input-validators` | 36 | Validation des entrées |
| `user-context` | 35 | Branding, voix, profil injectés dans les prompts |
| `audience-address` | 35 | Tu / vous |
| `parse-ai-json` | 31 | Lecture du JSON renvoyé par l'IA |
| `copywriting-prompts` | 22 | Consignes de rédaction (aussi audits, coaching, site…) |
| `base-prompts` | 19 | Consignes de base (aussi coaching, branding, site…) |

### 🟠 Zone orange : la chaîne de relecture des textes

Ces modules relisent et corrigent les textes générés. Ils sont importés
ensemble : modifier l'un change tous les formats texte, **y compris des
fonctions qui ne s'appellent pas « carousel »**.

| Module | Fonctions touchées |
|---|---|
| `carousel-editorial-review` | ai-text-action, carousel-ai, carousel-visual, creative-flow, engagement-insight, generate-content, linkedin-ai, pinterest-ai, pinterest-photo-brief, pinterest-visual |
| `redac-gate`, `correction-pass`, `carousel-model`, `text-structure-guard` | ai-text-action, carousel-ai, creative-flow, engagement-insight, generate-content, linkedin-ai, pinterest-ai, pinterest-photo-brief, pinterest-visual |
| `content-clarity` | les mêmes + inspire-ai |
| `audience-address-pass` | carousel-ai, creative-flow, generate-content, linkedin-ai, pinterest-* |

> ⚠️ **Piège principal** : `redac-gate.ts` et `correction-pass.ts` importent
> `carousel-editorial-review.ts` et `carousel-model.ts`. Une retouche
> « pour les carrousels » dans ces fichiers change donc aussi :
> - les posts LinkedIn,
> - les épingles Pinterest,
> - le menu IA sur sélection de texte (`ai-text-action`),
> - `engagement-insight`.
>
> De même, `reel-postprocess.ts` importe `redac-gate.ts`.

### 🟢 Zone verte : propre à un format (ou presque)

| Module | Fonctions touchées |
|---|---|
| `format-briefs` (briefs reel, stories, LinkedIn, newsletter, Pinterest, légende) | creative-flow |
| `story-formatting`, `linkedin-hook`, `multi-subject`, `vision-prompts`, `strip-markdown` | creative-flow |
| `carousel-length`, `carousel-plan-format`, `content-quality`, `previous-hooks`, `recent-briefs`, `depth-research` | carousel-ai, creative-flow (⚠️ deux fonctions : le carrousel ET les autres formats) |
| `carousel-cover`, `carousel-thread`, `carousel-progression`, `carousel-draft-stream`, `recent-passages`, `schema-limit`, `photo-slide-structure`, `photo-template-assign` | carousel-ai |
| `carousel-design-plan`, `format-render`, `mix-*`, `photo-overlay-templates`, `photo-editorial`, `schema-formatting`, `image-utils` | carousel-ai, carousel-visual |
| `photo-art-direction`, `photo-formatting`, `photo-visual-guards`, `verbatim-guard`, `invented-text-guard`, `carousel-sense-design`, `schema-telemetry` | carousel-visual |
| `pinterest-pin-guards`, `pinterest-two-step` | pinterest-visual, pinterest-photo-brief |
| `contrast-guard`, `font-size-guard` | carousel-visual, pinterest-visual, pinterest-photo-brief (+ carousel-ai pour contrast-guard) |

---

## 5. Tests par format

Commandes : `npm test` (front, Vitest) ; `npm run test:edges` (serveur,
Deno) ; `npm run visite` (Playwright sur l'app réelle, `e2e-visite/`).

### Ce qui fige le texte des prompts (snapshots)

Un snapshot garde une copie exacte du prompt envoyé à Claude. Si une
modification change ce texte, le test échoue et montre la différence.
**Dérive voulue** : régénère avec `-- --update` (commande en tête de chaque
fichier), puis relis le diff du `.snap` comme une relecture de prompt.
**Le diff touche un format que tu ne voulais pas modifier** : c'est une
régression, corrige le code et pas le snapshot.

| Fichier | Ce qu'il fige |
|---|---|
| `creative-flow/prompts_snapshot_test.ts` | angles ; questions (Instagram, LinkedIn, newsletter) ; follow-up ; hooks ; dictation (LinkedIn) ; adjust (carrousel) ; generate : carrousel, newsletter, LinkedIn, reel, stories avec vente |
| `creative-flow/handler_contract_test.ts` (lot 3) | le câblage du handler pour 17 parcours (questions, hooks, generate par format, adjust, recyclage, photo, streaming SSE, carrousel retiré) : tous les appels à Claude, la réponse au front, les crédits. Références générées sur le code d'avant le découpage. |
| `creative-flow/prompts_snapshot_formats_test.ts` (lot 2) | generate : post Instagram, Pinterest texte, légende photo, stories sans vente, newsletter avec angle ; questions : Pinterest, reel, stories, post Instagram ; recyclage (5 formats) ; mode photo : questions et brief + outil pour 6 formats, série avant / après |
| `carousel-ai/prompts_snapshot_test.ts` (lot 2) | rédaction des carrousels : système (Instagram, LinkedIn, cas personnel, ressenti sur une actu) ; consignes texte / photo / mixte × Instagram / LinkedIn ; accroche et angle choisis ; actualité avec et sans ressenti ; guides de structure par type |
| `carousel-visual/prompts_snapshot_test.ts` | mise en forme visuelle des carrousels |
| `generate-content/contract_test.ts` (lot 2) | 14 `type` appelés par le front (bio-audit, bio-generator, caption, calendar-quick, express-draft, weekly-suggestions…) |
| `pinterest-ai/contract_test.ts` (lot 2) | les 5 actions (name, bio, board-description, pin, keywords) |
| `storytelling-ai/contract_test.ts` (lot 2) | les 4 types (improve, generate-story, generate-pitch, generate-recap) |
| `inspire-ai/contract_test.ts` (lot 2) | texte collé et capture d'écran |
| `_shared/carousel-editorial-snapshot_test.ts`, `socle_test.ts` | la relecture des carrousels et les règles communes |

Les fichiers `contract_test.ts` font passer une vraie requête dans le
handler déployé (Supabase et Claude simulés, voir
`_shared/test-edge-harness.ts`). Ils vérifient aussi :
- la forme de la réponse renvoyée au front ;
- le quota : un seul `logUsage` dans la bonne catégorie, et **aucun** si
  l'appel IA échoue.

Les fonctions qui importent le `serve()` de std/http (generate-content,
pinterest-ai, storytelling-ai) passent par `captureStdServeHandler`, qui
intercepte ce démarrage sans modifier le code de production.

### Tests par format

| Format | Serveur (Deno) | Front (`src/test/`) | Bout en bout |
|---|---|---|---|
| Carrousel | `carousel-ai/*_test.ts` (dont `index_test.ts`, ~2 000 l., et `prompts_snapshot_test.ts`), `_shared/carousel-*_test.ts`, `redac-gate-carousel-vecu_test.ts`, `carousel-visual/index_test.ts`, `carousel-slide-image/prompt_test.ts` | ~45 `carousel-*.test.ts(x)`, `use-carousel-*`, `use-generate-visuals`, `use-user-slides-generate`, `export-carousel-pptx-*`, `pptx-*`, `pure-photo-*` | `e2e/pptx-mixed-text.spec.ts`, `e2e/pptx-hybrid-photo-occultee.spec.ts`, `e2e-visite/carousel-*-live.spec.ts` |
| Reel | `creative-flow/index_test.ts` (`applyReelQualityPass`), `_shared/reel-*_test.ts`, `reel-render/*_test.ts` | `reel-*.test.ts(x)` | `e2e-visite/reel-angles-live` |
| Stories | `creative-flow/index_test.ts`, `stories_secondary_test.ts`, `_shared/story-*_test.ts` | `story-*`, `multi-subject-stories` | `e2e-visite/stories-visuelles` |
| Post Instagram | `creative-flow/index_test.ts` (`correctPostStreamContent`), `prompts_snapshot_formats_test.ts` | `r1-*`, `publish-guards` | — |
| LinkedIn | `creative-flow/index_test.ts` (`runLinkedInTwoStep`), `linkedin-ai/socle-linkedin_test.ts` | `linkedin-*`, `use-linkedin-carousel-caption` | — |
| Newsletter | `creative-flow/index_test.ts` | `newsletter-word-count` | `e2e-visite/newsletter-live` |
| Pinterest | `pinterest-ai/contract_test.ts`, `pinterest-visual/index_test.ts`, `pinterest-photo-brief/index_test.ts`, `_shared/pinterest-*_test.ts`, `prompts_snapshot_formats_test.ts` (texte) | `pinterest-persistence`, `export-pinterest-editable-pptx` | `e2e-visite/pinterest-visual-feedback` |
| Recyclage | `stories_secondary_test.ts`, `prompts_snapshot_formats_test.ts` | — | `e2e-visite/recycle-live`, `verif-recycler-decoche` |
| Bio Instagram, brouillons rapides | `generate-content/contract_test.ts` | — | — |
| Storytelling, inspiration | `storytelling-ai/contract_test.ts`, `inspire-ai/contract_test.ts` | — | — |
| Crosspost | — | `crosspost-{flow,preview,services,continuity}` | — |
| Parcours /creer | — | `creation-*`, `creer-*`, `use-do-generate`, `use-format-next`, `generation-lifecycle`, `hook-selection-step`, `content-preview-*`, `draft-conflict-save` | `e2e/premier-contenu-reprise.authed.spec.ts`, `e2e-visite/fonctionnel-t1`, `quota-etape4`, `creer-429`, `contenus-figes*` |
| Calendrier ↔ générateur | — | `calendar-creer-contract` (clés du navigate state), `idea-to-calendar`, `r3-calendar-persistence`, `use-calendar-save`, `build-calendar-content`, `calendar-caption` | `e2e-visite/calendrier-*` |

### Trous restants

Comblés au lot 2 :
- les formats `creative-flow` non figés ;
- le recyclage et le mode photo ;
- les prompts de rédaction des carrousels ;
- generate-content, pinterest-ai, storytelling-ai et inspire-ai ;
- le contrat calendrier → /creer (`src/test/calendar-creer-contract.test.ts`).

Restent sans snapshot :
1. **Les prompts des passes de correction** par format
   (`_shared/correction-pass.ts`). Leur comportement est testé, pas leur
   texte.
2. **`linkedin-ai`** (crosspost, caption-for-carousel, improve-post), en
   dehors de `socle-linkedin_test.ts`.
3. **`carousel-ai` de bout en bout** : la forme et le câblage sont testés
   par `index_test.ts`, mais pas l'assemblage final du prompt dans le
   handler (blocs identité, clarté et structure confirmée). Seuls les
   morceaux sont figés.

---

## 6. Garde-fous automatiques (lots 4 et 5)

| Garde-fou | Où | Bloque la CI ? | Ce qu'il empêche |
|---|---|---|---|
| Frontières entre formats | `supabase/functions/creative-flow/boundaries_test.ts` | oui (`npm run test:edges`) | un format qui importe le fichier d'un autre format ; une dépendance circulaire vers `index.ts` ; un fichier de `formats/` absent de cette carte |
| Snapshots et contrats par format | voir section 5 | oui | qu'un prompt, un appel à Claude ou une réponse change sans qu'on le voie |
| Contrat calendrier → /creer | `src/test/calendar-creer-contract.test.ts` | oui (`npm test`) | une clé du navigate state renommée d'un seul côté |
| Rapport d'impact | `scripts/impact-creation.mjs`, étape « Impact sur la création de contenu » de la CI | non (informatif) | qu'une retouche « pour un format » en touche d'autres sans qu'on le sache : il liste les formats concernés, les fichiers partagés modifiés (avec leur zone) et les prompts figés qui changent |
| Règles pour les IA qui codent | `CLAUDE.md`, section « Création de contenu » | — | les modifications fourre-tout dans les fichiers communs |
| Vérification après Lovable | `scripts/verif-post-lovable.sh`, section 7 | — (à lancer à la main) | un chantier Lovable qui casse un format sans passer par une PR |
| Échecs par format en production | `src/lib/generation-telemetry.ts` → Sentry | — | une panne d'un seul format noyée dans des erreurs anonymes |

Le rapport d'impact se lit dans l'onglet *Actions* de GitHub : ouvrir le
lancement « CI », puis son résumé. En local :
`node scripts/impact-creation.mjs --base origin/main`.

Une exception aux frontières (un format qui DOIT en importer un autre) se
déclare dans `IMPORTS_AUTORISES` de `boundaries_test.ts`, avec sa raison.
Aujourd'hui : le recyclage importe les stories et le carrousel.

### Contrat des étiquettes HTML du carrousel (lot E1, 14/10/2026)

Le HTML d'une slide est écrit par le serveur (`carousel-visual`, `carousel-ai`
et leurs modules `_shared`), retouché par l'éditeur visuel
(`src/lib/carousel-editor.ts`, `CarouselEditor.tsx`) puis relu par les exports
PNG / PPTX. Ils se parlent par des attributs `data-*` (`data-slide-text`,
`data-pptx-editable`, `data-pptx-photo`…). La liste officielle, avec le rôle de
chacun et qui l'écrit / qui le lit, est dans
`supabase/functions/_shared/carousel-dom-contract.ts`.

- `src/test/carousel-dom-contract.test.ts` relit le code : attribut non déclaré,
  attribut partagé qui n'est plus écrit par le serveur ou plus lu par le front,
  attribut réservé à un côté qui passe de l'autre, valeur de `data-slide-text`
  inconnue → la CI bloque.
- `src/test/carousel-dom-contract-roundtrip.test.tsx` fait passer du vrai HTML
  serveur (texte éditorial, photo, photo « verre », mixte, slide texte de l'IA
  ancrée) dans l'éditeur : texte retrouvé, retouche écrite dans le HTML et les
  données, étiquettes d'export conservées, aller-retour sauvegarde → réouverture.

### Le circuit d'une modification (lot 5)

**Lovable directement sur `main`** convient pour l'interface : textes, styles,
un écran. Dès que la modification touche un générateur, passer par une
branche et une PR (Claude Code) :
- un fichier de `supabase/functions/` listé en section 3 ;
- un module `_shared` en zone rouge ou orange ;
- `creative-flow/index.ts` ou `shared.ts`.

La CI tourne alors **avant** la mise en production, et le rapport d'impact
est sous les yeux avant de fusionner.

**Après chaque chantier Lovable** : `bash scripts/verif-post-lovable.sh`.
Pour comparer à un commit précis : `DEPUIS=<commit> bash scripts/verif-post-lovable.sh`.
Sa section 7 « Création de contenu » :
- lance les tests des générateurs (snapshots, contrats, frontières entre formats) ;
- affiche le rapport d'impact depuis le commit d'avant le chantier.

**Après la mise en production d'un changement de générateur** : générer une
fois, dans l'app, chaque format listé par le rapport d'impact. Des tests sur
l'app réelle existent pour plusieurs formats (compte test « Camille »,
`e2e-visite/README.md`). Exemple :
`npm run visite -- newsletter-live reel-angles-live stories-visuelles recycle-live carousel-photo-live carousel-mix-live`.

**En production, Sentry** reçoit chaque génération ratée, groupée par
fonction, format et type d'erreur (`src/lib/generation-telemetry.ts`). Les
filtres utiles dans Sentry :
- `generation_format` : `linkedin`, `post`, `stories`, `reel`,
  `newsletter`, `carousel:mix`, `post+photo`… ;
- `generation_function` : la fonction serveur ;
- `generation_step` : `generate`, `questions`, `hooks`… ;
- `generation_error` : `SERVER_ERROR`, `TIMEOUT`, `NETWORK`, `GENERATION_ERROR`…

Une hausse sur un seul format juste après un déploiement désigne le coupable.

Ce qui n'est pas remonté :
- le texte de l'utilisatrice, jamais ;
- le quota atteint, la session expirée et l'accès refusé, qui ne sont pas
  des pannes.

---

## 7. Points d'attention relevés pendant la cartographie

Ce sont des constats, pas des corrections : rien n'a été modifié dans ce lot.

- **Noms de format incohérents entre front et serveur** :
  `linkedin_post` / `post_linkedin`, `instagram_post` / `post_instagram`.
  `creative-flow` compense en détectant par sous-chaîne. Ajouter un nouveau
  format dont le nom contient « post » ou « story » peut donc déclencher la
  mauvaise branche.
- **Plusieurs listes de formats** cohabitent :
  - `SUPPORTED_FORMATS` (`format-normalizer.ts`) ;
  - `FORMAT_OPTIONS` (`launch-templates.ts`) ;
  - `CONTENT_TYPE_SPECS` (`content-structures.ts`) ;
  - `CHANNELS` (`CreerStepFormat.tsx`).
- **Types sans appelant trouvé dans `src/`** (à confirmer avant toute
  suppression) :
  - `generate-content` : `suggest`, `ideas`, `bio`, `launch-plan`,
    `redaction-*`, `instagram-pinned`, `instagram-edito`, `raw` ;
  - `creative-flow` : `angles`, `follow-up`, `dictation` ;
  - la fonction `score-content` entière.
- **Quota à vérifier** :
  - l'appel « univers » de `newsjacking-ai` passe après `checkQuota`, mais
    ses tokens ne sont pas journalisés ;
  - `storytelling-ai` et `generate-comment` journalisent sans
    `workspace_id`.
- **`carousel-ai-candidate`** est retirée (répond 410) mais le dossier
  existe encore.
- **Corrigé le 14/10/2026** (relevé aux lots 2 et 3) :
  - /creer lit maintenant le paramètre d'URL `calendar_id` quand le state
    `calendarPostId` manque (lien rouvert, state perdu) ;
  - « Approfondir » (`handleNavigateToDeepen`) envoie `postDate` : le retour
    au calendrier tombe sur le bon jour ;
  - `step: "questions"` sans `angle` ne plante plus en 500 : le prompt dit
    qu'aucun angle n'est choisi (cas « questions — sans angle » du contrat).
