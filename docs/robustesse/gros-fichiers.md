# Gros fichiers : où sont les risques de régression

> Lot G0 du chantier « robustesse » (14/10/2026). **Aucun code modifié** : ce
> document dit quels fichiers découper en premier, comment, et quels tests
> poser avant. Le lot G1 (cliquet anti-dette en CI) empêche ces fichiers de
> grossir en attendant (`scripts/cliquet-dette.mjs`, voir la fin du document).
>
> Méthode de découpage : la même que pour la création de contenu
> (`docs/creation-contenu/CARTE.md`, lot 3 de `creative-flow`) : un fichier par
> mission, code déplacé **à l'identique**, le fichier d'origine réexporte ce
> qu'il exportait, et les tests de contrat sont posés **avant** de déplacer.
>
> Les numéros de lignes datent du 14/10/2026 (commit `fe04db93`) et bougent à
> chaque modification : le **nom de fonction** (ou de composant, d'état) est le
> repère fiable.

## En bref, pour Laetitia

- Les régressions se concentrent dans une dizaine de fichiers très longs que
  presque chaque modification touche. En tête, de loin : la page /creer
  (`CreerUnifie.tsx`), puis la fonction serveur des carrousels (`carousel-ai`)
  et celle des autres formats (`creative-flow`).
- Un fichier très long mais qu'on ne touche presque jamais (l'export PowerPoint
  `export-carousel-pptx.ts`, 4 commits en 90 jours) est peu risqué : il est
  29ᵉ du classement.
- Pour chaque fichier du top 10, une fiche ci-dessous dit : ce qu'il mélange,
  comment le couper en morceaux, quels tests ajouter **d'abord**, et dans quel
  ordre avancer (une PR par morceau).
- Fiches 11 à 18 (15/10/2026) : les huit fichiers suivants du classement recalculé, section 2 bis.
- Fiches 19 à 23 (16/10/2026) : stories, page Calendrier, statistiques Instagram, carrousel photo, onboarding, section 2 ter. Chacune liste aussi les défauts repérés, à corriger dans des PR à part.
- Ordre conseillé entre les fichiers : voir la section « Par où commencer ».

## 1. Le classement

**Périmètre** : fichiers de `src/` et `supabase/functions/`, hors tests
(`*.test.ts(x)`, `*_test.ts`, `src/test/`), snapshots et
`src/integrations/supabase/types.ts` (généré).

**Trois mesures**, sur 90 jours (depuis le 16/07/2026, historique complet après
`git fetch --unshallow origin main`) :
- **Lignes** : la taille actuelle (`wc -l`).
- **Commits** : combien de fois le fichier a été modifié.
- **Corrections** : parmi ces commits, ceux dont le message contient *fix*,
  *corrige*, *corrigé*, *régression* ou *revert*.

**Score** = (lignes ÷ 100) × (1 + commits ÷ 10) × (1 + corrections ÷ 10).
La taille seule ne suffit pas : un gros fichier stable est peu dangereux. Ce
qui crée des régressions, c'est un gros fichier **qu'on modifie sans arrêt et
qu'on doit souvent réparer**. Les deux facteurs multiplient la taille.

**Limite à connaître** : les 439 commits Lovable de la période qui touchent
ces dossiers s'appellent tous « Changes ». Ils comptent dans « Commits », mais
jamais dans « Corrections » (le message ne dit pas si c'était une correction).
Les corrections sont donc sous-estimées pour les fichiers surtout modifiés par
Lovable.

**Recalculer** : `node scripts/gros-fichiers.mjs` (options `--depuis AAAA-MM-JJ`
et `--top N`). Les chiffres d'un autre jour différeront un peu : la fenêtre de
90 jours glisse.

### Les 30 premiers (au 14/10/2026)

| # | Fichier | Lignes | Commits | Corrections | Score |
|---|---|---:|---:|---:|---:|
| 1 | `src/pages/CreerUnifie.tsx` | 3587 | 106 | 20 | 1248 |
| 2 | `supabase/functions/carousel-ai/index.ts` | 2823 | 105 | 12 | 714 |
| 3 | `supabase/functions/creative-flow/index.ts` | 1686 | 75 | 26 | 516 |
| 4 | `src/pages/VisualStudioPage.tsx` | 2059 | 97 | 6 | 353 |
| 5 | `supabase/functions/visual-studio/index.ts` | 2001 | 70 | 9 | 304 |
| 6 | `supabase/functions/carousel-visual/index.ts` | 2792 | 45 | 6 | 246 |
| 7 | `supabase/functions/_shared/redac-gate.ts` | 2093 | 39 | 10 | 205 |
| 8 | `src/components/creer/CarouselEditor.tsx` | 3816 | 34 | 0 | 168 |
| 9 | `supabase/functions/_shared/correction-pass.ts` | 1234 | 42 | 12 | 141 |
| 10 | `supabase/functions/_shared/format-briefs.ts` | 1273 | 32 | 6 | 86 |
| 11 | `src/components/creer/CreerStepResult.tsx` | 1096 | 33 | 8 | 85 |
| 12 | `src/lib/carousel-editor.ts` | 1808 | 26 | 1 | 72 |
| 13 | `supabase/functions/deep-diagnostic/index.ts` | 1084 | 20 | 12 | 72 |
| 14 | `src/components/calendar/CalendarPostDialog.tsx` | 1062 | 22 | 9 | 65 |
| 15 | `src/components/branding/BrandingReview.tsx` | 1411 | 15 | 7 | 60 |
| 16 | `src/lib/export-carousel-hybrid-pptx.ts` | 1767 | 15 | 3 | 57 |
| 17 | `src/components/creer/ReelMontage.tsx` | 917 | 28 | 6 | 56 |
| 18 | `src/hooks/use-content-generator.ts` | 1185 | 20 | 5 | 53 |
| 19 | `src/pages/IdeasPage.tsx` | 763 | 28 | 8 | 52 |
| 20 | `src/pages/Calendar.tsx` | 1156 | 14 | 8 | 50 |
| 21 | `src/components/creer/formatRenderers/StoryResult.tsx` | 1089 | 23 | 4 | 50 |
| 22 | `supabase/functions/cron-health/index.ts` | 992 | 25 | 4 | 49 |
| 23 | `src/pages/InstagramStats.tsx` | 1412 | 11 | 6 | 47 |
| 24 | `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` | 1517 | 13 | 2 | 42 |
| 25 | `src/hooks/use-onboarding.ts` | 923 | 16 | 7 | 41 |
| 26 | `supabase/functions/_shared/copywriting-prompts.ts` | 1491 | 12 | 2 | 39 |
| 27 | `supabase/functions/diagnostic-enrichment/index.ts` | 882 | 15 | 7 | 37 |
| 28 | `src/pages/PhotosPage.tsx` | 588 | 27 | 5 | 33 |
| 29 | `src/lib/export-carousel-pptx.ts` | 2296 | 4 | 0 | 32 |
| 30 | `src/components/creer/CreerStepFormat.tsx` | 1120 | 11 | 2 | 28 |

Aucune surprise en tête, mais trois enseignements :
- **`CreerUnifie.tsx` est loin devant** (score 1 248, presque le double du 2ᵉ) :
  106 commits en 90 jours, plus d'un par jour.
- **La chaîne de relecture** (`redac-gate.ts`, `correction-pass.ts`) est dans le
  top 10 alors qu'on ne la voit pas à l'écran : elle relit tous les formats
  texte, d'où ses nombreuses corrections.
- **Gros mais calmes** : `export-carousel-pptx.ts` (2 296 lignes, 29ᵉ) et
  `carousel-editor.ts` (1 808 lignes, 12ᵉ) sont peu touchés. Les découper n'est
  pas urgent ; le cliquet suffit à les empêcher de grossir.

---

## 2. Les fiches du top 10

Chaque fiche donne : les missions mélangées (avec leurs lignes), le découpage
proposé, les tests qui protègent le fichier aujourd'hui, ceux à ajouter
**avant** de découper, le risque et l'ordre conseillé.

### Pièges communs à plusieurs fiches

1. **Le rapport d'impact classerait les nouveaux fichiers en zone verte.** `scripts/carte-impact.mjs` nomme un sous-module d'après son chemin relatif (`redac-gate/numbers`). Or `scripts/impact-creation.mjs` (ligne 73) ne met en zone orange que les noms exacts (`"redac-gate"`, `"correction-pass"`…). Le rapport de CI dirait donc « zone verte » pour un fichier qui touche 9 fonctions. Avant le premier découpage, il faut :
   - faire calculer la zone sur le premier segment du nom (`mod.split("/")[0]`) ;
   - ajouter un cas dans `src/test/impact-creation.test.ts` ;
   - mettre à jour CARTE.md, section 4.

   Précédent de sous-dossier dans `_shared` : `_shared/ideas/`, utilisé par `content-coaching`.
2. **Un code déplacé ne bouge pas, mais ses chemins si.** Tout import relatif (`./carousel-editorial-review.ts`, l'`import("./reel-postprocess.ts")` dynamique) devient `../…` dans un sous-dossier. C'est la seule retouche permise dans le corps du code.

3. **Des tests lisent le texte même du code.** Plusieurs tests cherchent une
   ligne exacte dans un fichier (CreerUnifie : 7 tests ; carousel-ai : 4 ;
   creative-flow : 3). Ils cassent quand on déplace le code, même sans
   régression. Les faire pointer vers le nouveau fichier **dans la même PR**,
   jamais les supprimer.
4. **Les tests Playwright ne tournent pas en CI** (`e2e/`, `e2e-visite/`) : seul
   `npm test` (et `npm run test:edges`) protège un découpage.

---

### 1. `src/pages/CreerUnifie.tsx` — 3587 lignes

**En une phrase :** c'est la page /creer tout entière : elle garde en mémoire tout le parcours de création (88 `useState`, 33 `useEffect`, 30 `useRef`), le restaure après un rechargement, lit ce qu'envoient le calendrier, la boîte à idées et le coach, lance les générations, gère les photos, enregistre, publie sur Instagram et LinkedIn, exporte (PPTX, PNG, PDF, Canva), puis affiche l'écran de l'étape en cours.

> Lignes vérifiées sur le fichier au 14/10/2026 (dernier commit sur le fichier : `9fde8c2b`, lot 7). Les numéros bougent à chaque modification : le **repère** (nom de fonction, d'état ou de commentaire) est la référence fiable.
> Ce qui a déjà été sorti du fichier (lots précédents) : `src/hooks/use-do-generate.ts`, `use-format-next.ts`, `use-calendar-save.ts`, `use-generate-visuals.ts`, `use-user-slides-generate.ts`, `use-select-inspiration-proposal.ts`, `use-linkedin-carousel-caption.ts`, `use-regeneration-backup.ts`, `use-creation-entry-key.ts`, `use-carousel-autosave.ts`, ainsi que `src/features/creer/*` (`edited-text`, `format-mappers`, `publish-guards`, `photo-source`, `prepare-idea-photos`, `upload-helpers`, `build-calendar-content`, `pinterest-generation`, `post-generation-reset`). Le fichier reste pourtant à 3587 lignes : c'est le **câblage** entre ces hooks, plus tout ce qui n'a pas encore été déplacé.

**Missions mélangées**

| Mission | Lignes | Ce que ça fait |
|---|---|---|
| 1. Bandeau « derniers crédits » + porte d'entrée | 123-157, 160, 163-174 | `LowCreditsBanner` (plan free, 1 à 4 crédits, événements PostHog `low_credits_banner_shown` / `_cta_clicked`) ; `type Step` ; `CreerUnifie()` qui attend le workspace et remonte `CreerWorkspace` avec la clé `user:workspace:entryKey` (isolement A → B → A). |
| 2. Reprise du brouillon et conflit avec une nouvelle demande | 199-305, 324-388 | Lecture des paramètres d'URL (`paramFormat`, `paramSujet`, `paramAuto`…), `loadFlowState`, `draftConflict` (« il y a déjà un contenu en cours », 236-284), `shouldRestore` / `persistedState` (`ps`), garde `isCurrentCreation` + enveloppes `saveFlowState` / `savePhotos` (297-305), `autoFlow`, `forcedChannel` / `canalConflict` (333-338), et `safeStep` (340-386) qui choisit l'étape à rouvrir. |
| 3. Déclaration de tout l'état du parcours | 387-547, 594-631 | Les ~85 états : étape, sujet (`ideaHistory`), format, angle, réponses, hooks reel, édition (`editBaseline`), lien calendrier (`calendarPostId`, `const fromCalendar` l. 415), photos, photo dump, Pinterest/inspiration, brief, Qualité Max + illustration de couverture (verrou fail-closed 490-511), régime « texte d'abord » (`isTextFirstMix`, `textFirstCatalog` 516-546), séquence de lancement, sauvegarde, visuels carrousel. |
| 4. Sauvegarde locale au fil de l'eau | 549-580, 633-660, 730-783, 822-877 | Nettoyage sur entrée « à blanc » et `?new=1` ; `CREER_RESULT_KEY` (visuels + séquence de lancement en sessionStorage) ; réhydratation des questions et du résultat, dont la **récupération d'un texte coupé en plein streaming** (`pendingStream`, 754-781) ; effet « Auto-persist state on changes » (822-855, ~35 clés) ; filet streaming toutes les 1,5 s (857-877). |
| 5. Arrivée depuis ailleurs (navigate state + URL) | 878-1055 | Effet `initDone` : sujet/objectif, `existingContent` du calendrier, contexte newsjacking (`locState.context`), `FORMAT_MAP` / `SUPPORTED_FORMATS`, reprise d'une idée sauvegardée (`resumeIdea`), « Créer à partir de ce brief » (`fromBrief`), choix multi-sujets stories/reel, saut d'étapes, puis retrait des paramètres à usage unique (`ONE_SHOT_PARAMS`, l. 1047). C'est ici que se branche le **lien calendrier → /creer**. |
| 6. Photos (photothèque, réhydratation, casting auto) | 1057-1179, 1181-1263, 1270-1287, 1605-1622, 2038-2054, 2092-2158 | Chargement des photos de la photothèque (`libraryPhotoIdsRef`, `firstProductRef`, 1er contenu « produits » avec dédoublonnage) ; réhydratation après reload (IndexedDB + refetch serveur, `photosRehydratedRef`) ; « Snapshot défensif » `generatedWithPhotos` ; nettoyage « Photos brutes » (`purePhotoRawOrNull`) ; `handleAddCarouselPhoto` ; casting automatique bibliothèque (`autoCastRef`, `library_photo_index` → `photo_index`). |
| 7. Passage d'une étape à l'autre + brief | 582-592, 1291-1382, 1452-1519 | `handleCoachingSelect`, `handleNewsjackingSelect`, `handleIdeaNext`, `handlePhotosNext`, `handleQuestionsNext` (écrit/actualise `content_briefs`, 1458-1494), `handleSkipQuestions`, compteur `briefsCount`. |
| 8. Angles d'attaque du reel | 395-407, 1387-1450 | États `reelHooks`, `hooksLoading`… ; `fetchReelHooks` (appel gratuit `creative-flow` step `hooks`, messages d'erreur), `handleHookSelect`, `handleHookSkip`. |
| 9. Génération et régénération | 662-699, 785-820, 1521-1552, 1624-1700, 1702-1792, 1951-1972, 2160-2168, 2666-2744 | `useContentGenerator`, `useRegenerationBackup` ; avertissement « légende oubliée » ; préremplissage démo ; `handleRegenerate`, `handleChangeAngle` (+ `pendingAngleRegen`) ; `handleConfirmStructure` (appel direct `generate` carrousel photo/mixte/texte d'abord) ; câblage `useDoGenerate` (~75 paramètres) ; lancement auto du 1er carrousel ; `handleTransformToLinkedInCarousel` ; `refreshPlan` après résultat ; `handleLaunchSequence` (5 chapitres) ; câblage `useFormatNext`. |
| 10. Modifier le texte + repartir de zéro | 1794-1876, 1878-1947, 3360-3406 | `handleCopy` ; `handleEdit` (mise à plat du résultat par format : reel, LinkedIn, Pinterest visuel/photo, newsletter, repli calendrier) ; `requestReset` / `handleReset` (remet ~45 états à zéro) ; `onSave` de `CreerStepEdit` (`applyEditedText` + `replaceSlideText`). |
| 11. Enregistrer (idées, historique, calendrier, Studio) | 701-728, 1976-2032, 2199-2229, 2763-2772, 3550-3584 | `openCarouselStudio`, `useCarouselAutosave`, `useCarouselQuality` ; `persistCarousel` (`generated_carousels`), `handleSave`, `handleAddToCalendar` ; câblage `useCalendarSave` ; `ideaVersionSignature` / `ideaSaveNotice` ; `CarouselStudioDialog`, `SaveToIdeasDialog`. |
| 12. Publier ou programmer | 2170-2197, 2231-2492, 3409-3457 | Reel monté (`reelSource`, `reelScope`, `reelMp4Url`) ; ajout d'image (`handlePublishImageSelected`, bucket `calendar-media`) ; raisons de blocage ; `handlePublishInstagram`, `handlePublishLinkedIn` ; `publishChannel` ; `handleConnectFromDialog` + réouverture `reopenPublish=1` ; `handleScheduleFromDialog` (gardes + jeton qui expire) ; `PublishOrScheduleDialog` et son `<input type="file">`. |
| 13. Exports | 2494-2664, 2753-2761 | `handleExportPptx`, `handleExportVisualPng`, `handleExportVisualPdf`, `handleExportHybridPptx`, `handleOpenInCanva`, `handleExportPinterestPng`, `handleExportPhotoBriefPng`, `handleExportPinterestEditablePptx` ; en démo, remplacés par `demoToast`. |
| 14. Affichage | 2773-2800, 2802-3407, 3459-3549 | Portail fiche de marque (`brandReviewChecking` / `BrandReviewGate`, `flowShownRef`) ; panneau Transformer ; `DraftConflictDialog` ; `CreerStepper` + crédits ; une branche JSX par étape (idée 2896, format 2930, questions 2972, hooks 3006, Mes slides 3020, structure 3038, inspiration 3052, photo dump 3078, résultat `CreerStepResult` 3141-3276 avec ~60 props, alertes relecture 3278-3292, invite Premium 3294, séquence de lancement 3315-3358) ; fenêtres « photos manquantes » (3459-3508) et « Repartir de zéro ? » (3509-3549). |

**Découpage proposé**

Le fichier d'origine garde : `CreerUnifie` / `CreerWorkspace`, l'appel des hooks dans le même ordre, et le JSX qui choisit l'étape. Chaque ligne du tableau = code déplacé à l'identique (mêmes noms, mêmes commentaires), puis importé.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/components/creer/LowCreditsBanner.tsx` | `LowCreditsBanner` (123-157). | Garder les noms d'événements PostHog et `memoriseRetour()`. Aucun autre fichier ne l'utilise (vérifié). Risque quasi nul. |
| `src/features/creer/creer-step.ts` | `type Step` (160), le calcul `safeStep` (340-386) transformé en fonction pure `resolveSafeStep(ps, { canalConflict, hasIdea, photoCount })`, et les constantes `FORMAT_MAP`, `SUPPORTED_FORMATS`, `ONE_SHOT_PARAMS` (aujourd'hui dans l'effet d'init). | `safeStep` appelle `loadPhotos()` : à passer en paramètre pour garder une fonction pure. `Step` est importé implicitement par les composants via les chaînes : ne renommer aucune valeur. |
| `src/features/creer/draft-conflict.ts` | Le corps de l'initialiseur `draftConflict` (236-284) en fonction pure `computeDraftConflict({ existingFlowState, photosCount, paramSujet, locState, ... })`. | Lit `loadPhotos()` quatre fois et `deriveCanalFromState` : passer le nombre de photos en argument. L'exception « retour Studio vérifié » (`carouselStudioResume`) doit rester. |
| `src/features/creer/pending-stream.ts` | Reconstruction du résultat depuis `ps.pendingStream.text` (754-772 : JSON tronqué → `content`). | Fonction pure. Le `toast` et `saveFlowState({ pendingStream: null })` restent dans la page. |
| `src/features/creer/edit-text-from-result.ts` | Mise à plat du résultat dans `handleEdit` (1823-1870) : `flattenResultForEdit(format, raw, existingCalendarContent)`. | La partie structurée (`structuredEditText`, ancien `edited_text`, 1803-1820) reste dans la page ou suit à l'identique ; `edited-text.ts` (lot 7) existe déjà, ne pas le fusionner avec celui-ci. |
| `src/hooks/use-creer-exports.ts` | Les 8 exports (2494-2664) + `useOpenInCanva`. | Dépend de `result`, `visualSlides`, `uploadedPhotos`, `generatedWithPhotos`, `charterData`, `ideaText`, `carouselSubMode`, `carouselVisualsStale`, `pinterestPinHtml`, `photoBriefOverlayHtml`, `isCarouselPublish`. Les `import()` dynamiques doivent rester dynamiques (poids du bundle). Les enveloppes démo (`effectiveHandle…`) restent dans la page. |
| `src/hooks/use-reel-artifact.ts` | Bloc `const reelSource =` … `instagramInFlight` (2180-2197). | **Piège test** : `src/test/reel-editor-scope.test.tsx` découpe le texte de CreerUnifie entre `  const reelSource =` et `  // ── Sauvegarde dans le calendrier` et l'exécute. À réécrire pour tester le nouveau hook (dans la même PR). `setReelMp4Url` sert aussi à `handleReset`, `reelMp4Url` à `useCalendarSave`. |
| `src/hooks/use-creer-publish.ts` | Ajout d'image (2231-2263), raisons de blocage (2265-2282, 2355-2360, 2400-2403), `handlePublishInstagram`, `handlePublishLinkedIn`, `handlePublishNowFromDialog`, `handleConnectFromDialog`, effet `reopenPublish`, `handleScheduleFromDialog`. | **Piège test** : `src/test/reel-publication.test.ts` extrait `handlePublishInstagram` du texte de CreerUnifie (AST) et injecte ses variables **par leur nom** (`instagramInFlight`, `reelScope`, `activeReelScope`, `toast`…). Toute variable renommée ou passée autrement casse le test : réécrire le test sur le hook. Dépend de `useCalendarSave` (`recordImmediatePublication`, `handleConfirmCalendar`) et de `carouselSave.flush` → le hook doit être appelé **après** eux. |
| `src/hooks/use-reel-hooks.ts` | États 402-407 + `fetchReelHooks`, `handleHookSelect`, `handleHookSkip` (1387-1450). | `handleHookSelect` appelle `doGenerate`, déclaré plus bas (1703) : passer `doGenerate` en paramètre et appeler ce hook après `useDoGenerate`, ou passer une ref. `selectedReelHook` est lu par `useDoGenerate` et remis à `null` par `handleChangeAngle` : l'état doit rester accessible à la page. |
| `src/hooks/use-launch-sequence.ts` + `src/components/creer/LaunchSequenceResults.tsx` | `launchResults`/`launchIndex`/`launchGenerating` (594-596), `handleLaunchSequence` (2668-2699) ; JSX 3315-3358. | `launchResults` est aussi sauvegardé dans `CREER_RESULT_KEY` (633-660) et remis à zéro par `handleReset` / `handleCoachingSelect`. `useFormatNext` reçoit `handleLaunchSequence`. |
| `src/features/creer/content-brief.ts` | Écriture `content_briefs` de `handleQuestionsNext` (1458-1494) et compteur `briefsCount` (582-592). | Le filtre workspace est fait à la main (`workspaceId !== session.user.id`), pas via `useWorkspaceFilter` : à déplacer **tel quel** (le corriger serait une autre PR). |
| `src/hooks/use-creer-photos.ts` | Chargement photothèque (1057-1179), réhydratation (1181-1263), « Snapshot défensif » (1270-1287), casting automatique (2092-2158), `handleAddCarouselPhoto`. | Zone fragile : refs partagées avec la génération (`firstProductRef` lu par `useDoGenerate` et l'auto-lancement 1778-1792, `autoGeneratePendingRef`, `initialCreationId` remis à jour par `onStartNew` du conflit), annulation `cancelled` + remise à `false` des refs pour StrictMode, `savePhotos` enveloppé par `isCurrentCreation`. Doit recevoir les **enveloppes** `saveFlowState`/`savePhotos`, jamais `persistFlowState` brut. |
| `src/hooks/use-creer-flow-persistence.ts` | Effets 549-580, 633-660, 730-783, 822-877. | `CREER_RESULT_KEY` est utilisé avant sa déclaration (l. 552) et par `handleReset`. L'effet d'auto-persistance a ~35 dépendances : une clé oubliée = perte silencieuse au reload. `src/test/regeneration-backup.test.tsx` cherche le texte exact `result: result \|\| regenerationBackup.pending?.result \|\| undefined` et `editBaseline,` dans CreerUnifie. |
| `src/hooks/use-creer-entry-init.ts` | Effet d'init 878-1055. | **Le plus risqué.** Appelle `handleFormatNext` (déclaré 2702), `setQuestions`, ~20 setters. `src/test/calendar-creer-contract.test.ts` vérifie par regex que CreerUnifie lit `locState?.fromCalendar`, `calendarPostId`, `existingContent`, `format`, `objectif`, `angle`, `postDate`, `resumeIdea` et `searchParams.get("sujet"|"objectif"|"from")` : le test doit lire les deux fichiers. Garde `justStrippedRef` partagée avec `onChannelChange` de l'étape format (2936-2942). |
| `src/components/creer/PhotoMissingDialog.tsx`, `src/components/creer/ConfirmResetDialog.tsx` | JSX 3459-3508 et 3509-3549. | Purs affichages ; passer `onContinueText` / `onAddPhotos` / `onConfirm`. Libellés de boutons inchangés (vocabulaire UI). |

À ne **pas** sortir pour l'instant : le bloc `<CreerStepResult …>` (3141-3276). `src/test/edited-text.test.ts` et `src/test/mix-layout-memo.test.ts` y cherchent des lignes exactes (`const nextRaw = { ...withoutEditedText(prev.raw), slides };`, `raw: mergeEditorRaw(prev.raw, raw)`, `onMixLayoutMemos: (memos, receipt, formattingMemo) => setResult(`…), et c'est l'aiguillage de tous les formats.

Pour chaque nouveau fichier : l'ajouter dans la table de `scripts/impact-creation.mjs` (l. 61, aujourd'hui seul `CreerUnifie.tsx` est reconnu comme « Parcours /creer (tous formats) »), sinon le rapport d'impact de la CI ne le signalera plus. Mettre à jour `docs/creation-contenu/CARTE.md` section 2.

**Tests qui le protègent aujourd'hui**

Rendu réel de la page :
- `src/test/creation-initial-draft.test.tsx` (470 lignes, ~37 cas) : le seul test qui rend `CreerUnifie` en vrai (StrictMode, routes de prod). Couvre le 1er carrousel auto (texte, produits avec 0/1/plusieurs photos), Mes slides après reload, brouillon A → B → A, conflit de brouillon, canal demandé, annuler/rétablir le sujet, photos sans fiche de flux, reprise d'une idée sauvegardée sans la régénérer, newsletter ouverte dans Modifier, Transformer, Studio.
- `e2e/premier-contenu-reprise.authed.spec.ts` (Playwright, compte réel) : paramètres `?auto=1` consommés et récap qui tient au reload. **Pas lancé par la CI** (`ci.yml` ne lance que `npm test`).
- `e2e-visite/*.spec.ts` (une vingtaine passe par `/creer` : `etats`, `creer-429`, `quota-etape4`, `mes-slides`, `reel-angles-live`, `publish-gate-live`, `carousel-*-live`…) : visites sur le **site en ligne**, à la main, pas dans la CI.

Tests qui lisent le **texte** de CreerUnifie (ils casseront si le code bouge, même sans régression) :
- `src/test/calendar-creer-contract.test.ts` : clés du navigate state et paramètres d'URL lus par /creer vs envoyés par `Calendar.tsx` / `CalendarPostDialog.tsx` ; `const fromCalendar = !!calendarPostId` ; repli `calendar_id`.
- `src/test/reel-editor-scope.test.tsx` : exécute le bloc `reelSource` … `Sauvegarde dans le calendrier` (vidéo du reel liée au bon script).
- `src/test/reel-publication.test.ts` : exécute `handlePublishInstagram` extrait du fichier (reel sans MP4 durable refusé, etc.).
- `src/test/regeneration-backup.test.tsx` (partie « branchement dans /creer ») : `regenerationBackup.begin` avant `doGenerate` dans `handleRegenerate` / `handleChangeAngle`, copie de secours, `onDraftChange={setEditContent}`.
- `src/test/edited-text.test.ts` (partie « branchement dans /creer ») : retouches directes slides/stories/script effacent `edited_text`.
- `src/test/mix-layout-memo.test.ts` : la mémoire de disposition du mixte est écrite dans le résultat.
- `src/test/impact-creation.test.ts` : le chemin `src/pages/CreerUnifie.tsx` est reconnu par le rapport d'impact.

Tests des morceaux déjà sortis (protègent la logique, pas le câblage) :
- `src/test/use-do-generate.test.tsx`, `use-format-next.test.tsx`, `use-generate-visuals.test.tsx`, `use-calendar-save.test.tsx`, `use-user-slides-generate.test.tsx`, `use-select-inspiration-proposal.test.tsx`, `use-linkedin-carousel-caption.test.tsx`, `use-carousel-autosave.test.tsx`, `generation-lifecycle.test.tsx` (use-content-generator), `regeneration-backup.test.tsx`, `creation-entry-key.test.tsx`, `creation-text-undo.test.tsx`, `creer-step-edit.test.tsx`, `flow-reliability.test.tsx` (use-flow-persistence), `publish-guards.test.ts`, `format-mappers.test.ts`, `build-calendar-content.test.ts`, `edited-text.test.ts`, `pure-photo-slides.test.ts` (la fonction `purePhotoRawOrNull`, née d'une boucle infinie dans la page).

**Tests à ajouter AVANT de découper**

1. **Contrat calendrier → /creer, en rendu réel** (dans l'esprit de `creation-initial-draft`) : pour chaque forme de state envoyée par `Calendar.tsx › handleQuickGenerate` et `CalendarPostDialog` (`handleNavigateToGenerator`, `handleNavigateToDeepen`, `handleOpenAtelier`), vérifier l'étape d'arrivée, le sujet enrichi de `[Contenu existant à approfondir]`, la date et `calendarPostId` gardés, aucun appel de génération pour `resumeIdea`. Aujourd'hui le contrat n'est que textuel.
2. **Table de `safeStep`** : `structure_review` et `hook_selection` → `format` ; `questions` avec questions persistées → `questions` ; `result` sans résultat mais `pendingStream` > 40 caractères → `result` ; canal forcé différent du brouillon → `format` ou `idea`.
3. **Récupération d'un texte coupé** : JSON tronqué → seul `content` est affiché ; toast « J'ai récupéré le texte » ; `pendingStream` purgé. Aucun test aujourd'hui (`grep pendingStream src/test` vide).
4. **« Créer à partir de ce brief »** : questions et réponses préremplies, même `incomingBriefId` mis à jour (pas de doublon `content_briefs`), URL nettoyée, refresh immédiat sans nouvelle génération de questions.
5. **Mise à plat pour « Modifier »** : un snapshot par format (reel en sections, LinkedIn + hashtags, Pinterest visuel, Pinterest photo avec brief, newsletter, repli sur le contenu du calendrier).
6. **`handleReset`** : après « Repartir de zéro », brouillon, `CREER_RESULT_KEY`, suivi de publication et vidéo du reel vidés ; la création suivante ne reçoit pas « déjà enregistré ».
7. **Publication LinkedIn et programmation** : `handlePublishLinkedIn` (non connecté → bouton « Connecter »), `handleScheduleFromDialog` (connexions pas encore connues, compte non connecté, jeton qui expire avant la date → avertissement), réouverture automatique `reopenPublish=1` seulement quand le résultat est là. Aucun test aujourd'hui.
8. **Exports** : en démo → `demoToast` ; visuels périmés → avertissement sans export ; Mes slides → pas de `resolvePhotoIndexes` ; PNG partiel → message « x/y slides exportées ».
9. **Angles du reel** : questions → `hook_selection` hors démo et hors 1er contenu ; message d'erreur différent au 1er appel et au rafraîchissement ; `"empty"` jamais affiché ; `exclude_hooks` limité à 12.
10. **Photos** : casting auto (`library_photo_index` → `photo_index` + `cast_source: "library_auto"`) ; dédoublonnage du 1er contenu produits (max 6) ; toast quand des photos n'ont pas pu être rechargées.
11. **`LowCreditsBanner`** : visible seulement en free entre 1 et 4 crédits, événements PostHog envoyés.
12. Dans la PR qui déplace un bloc : **réécrire le test « texte » concerné** pour qu'il vise le nouveau fichier (ou mieux, teste le comportement), dans la même PR, jamais en le supprimant.

**Risque et ordre conseillé**

**Risque : élevé.** C'est le fichier le plus couplé du front (CARTE.md le dit déjà) : les états sont lus et écrits partout, plusieurs fonctions s'appellent avant d'être déclarées (`handleFormatNext`, `doGenerate`, `CREER_RESULT_KEY`, `resetPublishedTracking`), les protections A → B → A reposent sur des refs (`isCurrentCreation`, `initialCreationId`), et 7 tests lisent le texte exact du fichier. La plupart des bugs passés (reload qui rejoue l'init, photos perdues, boucle infinie Photos brutes, faux « déjà enregistré ») viennent de ce câblage, pas de la logique des hooks.

Ordre (un lot = une PR, `npm test` + `npx tsc --noEmit --skipLibCheck` verts, rapport d'impact relu) :
1. **Lot A — tests seulement** : ajouter les tests 1 à 11 sans toucher la page.
2. **Lot B — sans risque** : `LowCreditsBanner.tsx`, `PhotoMissingDialog.tsx`, `ConfirmResetDialog.tsx` (affichage pur).
3. **Lot C — fonctions pures** : `creer-step.ts` (`resolveSafeStep`, constantes), `draft-conflict.ts`, `pending-stream.ts`, `edit-text-from-result.ts`, `content-brief.ts`.
4. **Lot D — exports** : `use-creer-exports.ts`.
5. **Lot E — séquence de lancement** : `use-launch-sequence.ts` + `LaunchSequenceResults.tsx`.
6. **Lot F — angles du reel** : `use-reel-hooks.ts`.
7. **Lot G — publication** : `use-reel-artifact.ts` puis `use-creer-publish.ts` (avec réécriture de `reel-editor-scope` et `reel-publication`).
8. **Lot H — photos** : `use-creer-photos.ts`.
9. **Lot I — sauvegarde locale** : `use-creer-flow-persistence.ts`.
10. **Lot J — arrivée depuis ailleurs** : `use-creer-entry-init.ts` (en dernier, avec `calendar-creer-contract` adapté pour lire les deux fichiers).

Pendant tout le chantier : pas de session Lovable ouverte sur /creer (règle Lovable ↔ GitHub), et chaque PR ne touche qu'un lot.

---

### 2. `supabase/functions/carousel-ai/index.ts` — 2 823 lignes

**En une phrase :** c'est la fonction serveur qui rédige les carrousels (texte, photo, mixte), et elle fait aussi les accroches, les idées de sujets et d'angles, les questions d'approfondissement, la proposition de plan, la relecture du « fil », la couverture et le contrôle tu / vous. Tout ça dans un seul fichier, alors que 10 modules locaux existent déjà à côté (`confirmed-structure`, `continuous-narrative`, `final-photo-match`, `photo-narrative`, `stock-ambient`, `structure-hedge`, `thread-local-repair`, `variant-writing`, `writer`, `writing-contract`).

Relevé au commit `fe04db93` (14/10/2026). Les numéros de lignes vont bouger : le nom de fonction sert de repère stable.

**Missions mélangées**

| Mission | Lignes (repère) | Ce que ça fait |
|---|---|---|
| 1. Branchements et point d'entrée des tests | 1-68 (`_deps`) | 47 imports. `_deps` est l'objet que les tests remplacent pour simuler Claude, le quota, le juge du fil, l'association des photos, la recherche, etc. |
| 2. Formats de sortie imposés à l'IA et rappel « ne refuse pas mes photos » | 75-110 (`QUESTIONS_TOOL`, `OUTLINE_TOOL`), 194-201 (`PHOTO_QUESTIONS_TOOL`), 329-532 (`PHOTO_MISMATCH_FIELD`, `PHOTO_MISMATCH_SYSTEM_REMINDER`, `FIL_FIELD`, `MIX_CAROUSEL_TOOL`, `PHOTO_CAROUSEL_TOOL`, `EDITORIAL_INTENT_FIELD`, `STRUCTURE_PROPOSAL_TOOL`) | Les schémas JSON que Claude doit remplir pour chaque parcours, plus le texte qui l'empêche de refuser des photos choisies par la personne. |
| 3. Attente à l'écran (plan envisagé, brouillon, chronos) | 112-192 (`plannedTitles`, `emitPlannedTitles`, `startPhotoOutline`, `addOutlineUsage`, `stageTimer`, `firstDraftStream`) | Pendant que le rédacteur réfléchit, un appel court affiche les titres prévus. Les slides en brouillon s'affichent au fil de l'écriture. Les durées de chaque étape sont mesurées. |
| 4. Outils photo, régime « texte d'abord », choix des modèles | 203-309 (`pickCarouselModel`, `pickCorrectionModel`, `buildPhotoContextRecap`, `pushPhotoWithContext`, `buildTextFirstBlock`, `enforceTextFirstDirectives`) | Prépare les photos et leur contexte pour Claude, ajoute les consignes du mixte rédigé sans photos, puis nettoie sa sortie (`photo_index` remis à null, consigne d'image ajoutée si elle manque). |
| 5. Budgets de temps et filets de sécurité | 534-691 (`CORRECTION_ABORT_MS`, `REPAIR_START_LIMIT_MS`, `REVIEW_START_LIMIT_MS`, `MIX_SCHEMAS_ENABLED`, `schemasAllowed`, `writerTimeoutMs`, `reviewAllowed`, `carouselSlideFloor`, `retryIfTooShort`, `carouselMismatchResponse`, `normalizeSlideType`, `normalizeGeneratedPlanFields`) | Fixe le moment où chaque étape facultative n'est plus lancée (150 s, 270 s, 330 s, rédaction 240 s). Relance une fois un carrousel trop court. Transforme un refus photo en message clair, sans débiter de crédit. Répare les plans mal typés (« text » devient « text_only »). |
| 6. Handler principal : lecture, validation, quota, construction du prompt système, aiguillage | 693-1111 (`handleRequest`) | Lit le corps avant de lancer le flux SSE. Vérifie l'entrée avec Zod (746-803). Sort `assign_templates` sans quota (814-816). Vérifie le quota : `quality_max`, puis `carousel`, `content` ou `suggestion` (823-832). Assemble le prompt système (834-1027) : marque, cas personnel, briefs récents, recherche « creuser le sujet », anti-redite, série, lancement, actu, chute de légende tirée au sort, contrat éditorial, contenus récents. Aiguille ensuite avec `switch (type)` (1059-1078) et transforme les erreurs en 400, en statut Anthropic ou en 500. |
| 7. Contexte partagé et mode « Mes slides » | 1119-1177 (`CarouselRequestContext`, `echoContext`, `handleAssignTemplatesRequest`) | Le « sac » de 28 champs passé à tous les parcours. La passe « gabarits seuls » pour les slides que la personne a écrites elle-même. |
| 8. Finition commune à tous les carrousels (zone rouge) | 1179-1577 (`repairCarouselStructure`, `finalizeCarousel`, `enforceCarouselAudienceAddress`) | Réparation de structure. Juge du fil puis réparation locale ou globale, gardée seulement si elle fait mieux : mêmes chiffres, citations, photos et ordre. Reçu de génération, couverture, contrôle tu / vous. Utilisé par les parcours texte, photo, mixte et récit continu. |
| 9. Parcours texte (et runner générique) | 1579-1744 (`runGenerationAndRespond`, `handleHooksRequest`, `handleSlidesRequest`, `handleSuggestTopicsRequest`, `handleSuggestAnglesRequest`) + 2224-2231 (`handleExpressFullRequest`) | Un seul enchaînement pour `hooks`, `slides`, `express_full` texte, `suggest_*` et les questions texte : rédaction, structure, relecture, schémas plafonnés, redac-gate, fil, schémas, `logUsage`. `handleExpressFullRequest` envoie vers le mixte, le photo ou le texte. |
| 10. Récit continu photo / mixte | 1746-1796 (`continuousCarouselResponse`) | Le parcours actuel des carrousels photo et mixte : récit en prose (`continuous-narrative.ts`), mesure, juge du fil, association des photos, photos d'ambiance libres de droit (photo seulement), crédit, mesure de qualité. |
| 11. Parcours mixte et photo « avec plan validé ou sans récit continu » | 1798-1997 (`handleMixCarouselRequest`), 1999-2222 (`emptySlidesText`, `handlePhotoCarouselRequest`) | Ces deux parcours tentent d'abord le récit continu. Sinon, chacun refait sa propre chaîne : vision ou texte, relance si trop court, refus photo, structure, relecture, fusion du plan, indexes photo, redac-gate, gabarits (photo), fil, schémas (mixte), « photos brutes » (photo). |
| 12. Plan, questions et textes des prompts | 2233-2526 (`StructureTelemetry`, `handleStructureProposalRequest`, `recordStructureProposal`, `proposeStructure`), 2528-2618 (`handleDeepeningQuestionsVisionRequest`, `handleDeepeningQuestionsRequest`), 2620-2823 (`buildSystemPrompt`, `buildHooksPrompt`, `buildSlidesPrompt`, `buildSuggestTopicsPrompt`, `buildSuggestAnglesPrompt`, `buildDeepeningQuestionsPrompt`, `buildExpressFullPrompt`, `buildPhotoCarouselPrompt`, `buildMixCarouselPrompt` et leurs variantes « actu ») | La proposition de plan (gratuite) : prompt en ligne de ~80 lignes, double appel de secours (`hedgedStructureCall`), bonne longueur, refus photo, compte rendu en base. Les questions d'approfondissement (gratuites). Les textes des prompts. |

Répétitions repérées. On ne les corrige pas pendant le découpage, on les note pour plus tard :
- le bloc « relecture contextuelle » est écrit 3 fois (dans `runGenerationAndRespond`, `handleMixCarouselRequest` et `handlePhotoCarouselRequest`) ;
- les options de `runRedacGate` sont écrites 3 fois ;
- la paire `doGenerate` / `doRepair` est écrite 4 fois ;
- le message « Ta photo ne semble pas correspondre… » est écrit 2 fois (`carouselMismatchResponse` et `proposeStructure`) ;
- le chronomètre de `runGenerationAndRespond` refait `stageTimer` à la main ;
- l'import `EDITORIAL_ANGLES_REFERENCE` n'est jamais utilisé.

**Découpage proposé** (code déplacé à l'identique, une PR par lot)

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `carousel-ai/shared.ts` | `_deps` ; budgets (`CORRECTION_ABORT_MS`, `REPAIR_START_LIMIT_MS`, `REVIEW_START_LIMIT_MS`, `SCHEMA_START_LIMIT_MS`, `WRITE_*`, `schemasAllowed`, `writerTimeoutMs`, `reviewAllowed`) ; `pickCarouselModel`, `pickCorrectionModel` ; `buildPhotoContextRecap`, `pushPhotoWithContext` ; `stageTimer`, `firstDraftStream` ; `carouselSlideFloor`, `retryIfTooShort`, `carouselMismatchResponse` ; `normalizeSlideType`, `PLAN_REQUIRED_FIELDS`, `normalizeGeneratedPlanFields` ; l'interface `CarouselRequestContext` et `echoContext` | **Piège n°1** : tous les parcours appellent `_deps.xxx`. Si `_deps` reste dans `index.ts`, chaque fichier déplacé devrait importer `index.ts`, ce qui crée une boucle d'imports. Il doit donc partir en premier dans `shared.ts`, comme dans creative-flow. `index.ts` le réexporte : c'est le même objet, donc `index_test.ts` peut toujours remplacer `_deps.callAnthropic`. `shared.ts` n'importe aucun mode ni étape. |
| `carousel-ai/tools.ts` | `QUESTIONS_TOOL`, `PHOTO_QUESTIONS_TOOL`, `OUTLINE_TOOL`, `OUTLINE_INSTRUCTION`, `PHOTO_MISMATCH_FIELD`, `PHOTO_MISMATCH_SYSTEM_REMINDER`, `FIL_FIELD`, `MIX_CAROUSEL_TOOL`, `PHOTO_CAROUSEL_TOOL`, `EDITORIAL_INTENT_FIELD`, `STRUCTURE_PROPOSAL_TOOL` | Uniquement des constantes, donc risque minimal. **Piège** : `_shared/photo-template-assign_test.ts` (ligne 199) et `_shared/mix-layout-formatting_test.ts` (ligne 46) lisent le TEXTE de `index.ts` pour y chercher `const PHOTO_CAROUSEL_TOOL` et `const MIX_CAROUSEL_TOOL`. Voir le lot 0b. |
| `carousel-ai/prompts.ts` | `buildSystemPrompt`, `buildHooksPrompt`, `buildSlidesPrompt`, `buildSuggestTopicsPrompt`, `buildSuggestAnglesPrompt`, `buildDeepeningQuestionsPrompt`, `buildExpressFullPrompt`, `buildPhotoCarouselPrompt`, `buildPhotoCarouselNewsReactionPrompt`, `buildMixCarouselPrompt`, `buildMixCarouselNewsReactionPrompt`, `buildTextFirstBlock` | Ces fonctions dépendent de `variant-writing`, `writing-contract` et `confirmed-structure`, pas des modes. **Piège** : `linkedin-ai/socle-linkedin_test.ts` (ligne 79) cherche dans `index.ts` à la fois `function buildHooksPrompt(body: any, isLinkedIn = false)` et l'appel `buildHooksPrompt(reqCtx.body, reqCtx.isLinkedIn)` (de même pour `buildSuggestTopicsPrompt` et `buildSuggestAnglesPrompt`). La définition et l'appel vont se retrouver dans deux fichiers différents. |
| `carousel-ai/outline.ts` | `plannedTitles`, `emitPlannedTitles`, `startPhotoOutline`, `addOutlineUsage` | Importe `prompts.ts` (`startPhotoOutline` construit le prompt photo ou mixte) et `shared.ts` (`_deps`, `buildPhotoContextRecap`). `plannedTitles` est exporté aujourd'hui : on le réexporte, même si aucun test ne l'importe. |
| `carousel-ai/steps/finalize.ts` | `repairCarouselStructure`, `finalizeCarousel`, `enforceCarouselAudienceAddress` | **Zone rouge** : utilisé par le texte, le photo, le mixte et le récit continu. `enforceCarouselAudienceAddress` est importé par `audience-address_test.ts` depuis `./index.ts`, donc on le réexporte. Sa valeur par défaut `_deps.audienceAddressPass` est lue au moment de l'appel : elle doit venir de `shared.ts`. Déplacer seul, dans une PR à part. |
| `carousel-ai/steps/generate.ts` | `runGenerationAndRespond` | C'est un runner commun (hooks, slides, express_full texte, suggest_*, questions texte), pas seulement le carrousel texte. Il doit donc rester hors de `modes/`, sinon `steps/questions.ts` importerait un mode. **Piège** : `_shared/schema-formatting_test.ts` (ligne 77) cherche `addSchemasToContent(content, { isMix: false` dans `index.ts`. |
| `carousel-ai/modes/text.ts` | `handleHooksRequest`, `handleSlidesRequest`, `handleSuggestTopicsRequest`, `handleSuggestAnglesRequest` (4 fonctions de 3 lignes) | On peut aussi les laisser dans `index.ts`. Elles contiennent les appels `buildXxxPrompt(reqCtx.body, reqCtx.isLinkedIn)` que lit `socle-linkedin_test.ts`. |
| `carousel-ai/steps/continuous.ts` | `continuousCarouselResponse` | Appelé par le mixte ET le photo, donc à placer dans `steps/` et non dans un mode : sinon `modes/mix.ts` importerait `modes/photo.ts`, ce qui casserait la règle « un format n'importe pas un autre ». Dépend de `_deps.prepareNarrative`, `matchPhotos`, `stockAmbient` et de `finalize.ts`. |
| `carousel-ai/modes/mix.ts` | `handleMixCarouselRequest`, `enforceTextFirstDirectives` (utilisé seulement ici, ligne 1944) | **Pièges** : `mix-layout-formatting_test.ts` découpe le texte de `async function handleMixCarouselRequest … \n}\n` et y cherche `then(stripMixWriterLayoutFields)` et `keepDraftLayoutFields(draft, out)`. `schema-formatting_test.ts` cherche `isMix: true` et `export const MIX_SCHEMAS_ENABLED = true;` : la constante se déplace avec le mixte, ou reste dans `index.ts` (à décider dans le lot 0b). |
| `carousel-ai/modes/photo.ts` | `handlePhotoCarouselRequest`, `emptySlidesText` (exporté : on le réexporte) | **Piège** : `photo-template-assign_test.ts` vérifie que `stripWriterLayoutFields(threadPhoto.content)` apparaît AVANT `assignPhotoTemplates(content` dans le texte lu. |
| `carousel-ai/steps/structure.ts` | `StructureTelemetry`, `handleStructureProposalRequest`, `recordStructureProposal`, `proposeStructure` | Bloc autonome et gratuit (pas de `logUsage`). Dépend de `tools.ts` (`STRUCTURE_PROPOSAL_TOOL`, `PHOTO_MISMATCH_SYSTEM_REMINDER`), de `structure-hedge.ts` et de `_deps.logPlan`. Son prompt système, écrit en ligne, n'est figé par AUCUN snapshot aujourd'hui. |
| `carousel-ai/steps/questions.ts` | `handleDeepeningQuestionsVisionRequest`, `handleDeepeningQuestionsRequest` | Importe `steps/generate.ts` (variante texte) et `tools.ts` (`PHOTO_QUESTIONS_TOOL`). |
| `index.ts` (~450 l. visées) | Il garde : `handleRequest` (lecture, Zod, quota, assemblage du prompt système, `reqCtx`, `switch`, erreurs, SSE), `handleExpressFullRequest` (aiguillage texte / photo / mixte), `handleAssignTemplatesRequest`, `serve` sous `import.meta.main` | **À réexporter** (ce qui est exporté aujourd'hui) : `handleRequest`, `_deps`, `normalizeSlideType`, `writerTimeoutMs`, `enforceCarouselAudienceAddress`, `emptySlidesText`, `plannedTitles`, `MIX_SCHEMAS_ENABLED`. Les tests importent seulement `handleRequest`, `_deps`, `normalizeSlideType`, `writerTimeoutMs` (`index_test.ts`, ligne 18) et `enforceCarouselAudienceAddress` (`audience-address_test.ts`). L'assemblage du prompt système (834-1027, ~200 lignes) pourrait aller plus tard dans `context.ts`, mais pas dans ce chantier : c'est l'endroit qu'aucun snapshot ne fige aujourd'hui. |

Autres points à mettre à jour, sans effet sur la CI :
- `_shared/socle.ts`, ligne 276 : il cite `carousel-ai/index.ts` comme origine de la règle tu / vous. Le fichier existe toujours, donc `socle_test.ts` (`statSync`) reste vert, mais il faudra citer `steps/finalize.ts`.
- La section 3 de CARTE.md doit recevoir le tableau des fichiers, comme pour creative-flow.

**Tests qui le protègent aujourd'hui**

| Fichier | Ce qu'il couvre |
|---|---|
| `carousel-ai/index_test.ts` (1 957 l., 60 `Deno.test` dont beaucoup en boucle) | Passe par le vrai `handleRequest` avec `_deps` simulé. Couvre : quota avant l'IA, `logUsage` seulement après succès, Qualité Max refusée, refus photo sans débit (mixte, photo, récit continu), relecture branchée sur texte / photo / mixte × actu × Max, juge du fil (9 issues × 3 variantes), réparation locale ou globale et ses budgets, plafond du juge à 12 et 20 slides, plan (positions hors liste, champs à null, « text », plan vide, double appel, mauvaise longueur, compte rendu en base, relance réservée au compte QA), questions photo / mixte, cas personnel et actu, brouillons et plan envisagé, contenus récents, photos d'ambiance, `writer_bench` QA. **Ce fichier vérifie le comportement mais ne fige pas le texte exact envoyé à Claude.** |
| `carousel-ai/prompts_snapshot_test.ts` + `__snapshots__/prompts_snapshot_test.ts.snap` (12 tests) | Fige les morceaux de prompt venant de `writing-contract.ts` et `variant-writing.ts` : système Instagram / LinkedIn / cas personnel / actu, consignes texte / photo / mixte, guides de structure. **Ne couvre rien de ce qui est écrit dans `index.ts`** : accroches, sujets, angles, questions, plan, outils, rappel anti-refus, bloc « texte d'abord », assemblage du prompt système. |
| `carousel-ai/audience-address_test.ts` | `enforceCarouselAudienceAddress` (importé depuis `./index.ts`) et la règle de couverture. |
| `confirmed-structure_test`, `plan-relations_test`, `continuous-narrative_test`, `final-photo-match_test`, `stock-ambient_test`, `structure-hedge_test`, `thread-local-repair_test`, `writer_test`, `writing-contract_test`, `lived-case-prompt_test` | Les 10 modules locaux, chacun de son côté. Le découpage ne les touche pas. |
| Tests qui lisent le TEXTE de `carousel-ai/index.ts` (cassent dès qu'on déplace le code) | `_shared/schema-formatting_test.ts` l. 77 (`isMix: false` / `isMix: true` / `MIX_SCHEMAS_ENABLED`) ; `_shared/photo-template-assign_test.ts` l. 199 (ordre strip → gabarits, champs de `PHOTO_CAROUSEL_TOOL`) ; `_shared/mix-layout-formatting_test.ts` l. 46 (`MIX_CAROUSEL_TOOL`, corps de `handleMixCarouselRequest`) ; `linkedin-ai/socle-linkedin_test.ts` l. 79 (signature et appels de `buildHooksPrompt`, `buildSuggestTopicsPrompt`, `buildSuggestAnglesPrompt`). |
| `_shared/socle_test.ts` | Vérifie que les fichiers listés dans `SOCLE_CHEMINS` existent (`carousel-ai/index.ts` y figure). |
| Front (Vitest) | `src/test/carousel-length.test.ts` (importe `variant-writing`) ; `carousel-dom-contract.test.ts` (scanne tout le dossier `carousel-ai/` pour les attributs `data-*`, donc les nouveaux fichiers sont couverts d'office) ; `use-do-generate`, `use-user-slides-generate`, `generation-lifecycle`, `invoke-with-*`, `generation-telemetry`, `direct-idea-brief`, `impact-creation` (contrat d'appel côté front, mocké). |
| Bout en bout | `e2e/pptx-mixed-text.spec.ts`, `e2e/pptx-hybrid-photo-occultee.spec.ts`, `e2e-visite/carousel-*-live.spec.ts` (sur l'app réelle, hors CI). |

**Tests à ajouter AVANT de découper**

1. **`carousel-ai/handler_contract_test.ts`**, sur le modèle de `creative-flow/handler_contract_test.ts`, avec références générées sur le code actuel d'un seul tenant :
   - appeler `handleRequest` directement : `serve` est protégé par `import.meta.main`, donc pas besoin de `captureStdServeHandler` ;
   - simuler `_deps` pour le quota, la recherche, le juge, les photos et le plan ;
   - utiliser `installFetchMock` (`_shared/test-edge-harness.ts`) pour ce qui passe par Supabase hors `_deps` : `getUserContext`, `fetchPreviousHooks`, `getRecentBriefsContext`, `buildSeriesContext`, `logContentQuality` ;
   - figer, pour chaque parcours :
     - chaque appel à `_deps.callAnthropic` et `_deps.callCarouselWriter` : modèle, `system`, `messages` (images remplacées par un repère), nom de l'outil, `max_tokens`, `temperature` ;
     - les catégories de `checkQuota` et les arguments de `logUsage` ;
     - la suite des évènements SSE (`writing`, `outline`, `draft`, `checking`, `correcting`) ;
     - la réponse JSON.
   - Pour que le résultat soit stable :
     - retirer `timings`, `duration_ms` et `abortTimeoutMs`, qui dépendent de `Date.now`, ou figer l'horloge ;
     - figer `Math.random` pour le parcours où `CAROUSEL_SEMANTIC_REVIEW=false` (tirage de la chute de légende) ;
     - faire répondre Claude toujours la même chose selon l'outil demandé.

   Parcours à figer (~24) :
   1. `hooks` Instagram ;
   2. `hooks` LinkedIn ;
   3. `suggest_topics` ;
   4. `suggest_angles` ;
   5. `deepening_questions` texte (avec angle + structure) ;
   6. `deepening_questions` photo avec pixels ;
   7. `deepening_questions` mixte sans pixels ;
   8. `deepening_questions` photos seules sans sujet (réponse vide, aucun appel) ;
   9. `structure_proposal` sans photos ;
   10. `structure_proposal` photo avec photos ;
   11. `structure_proposal` photo avec `prefer_distinct_photos` ;
   12. `structure_proposal` mixte avec actu ;
   13. `slides` avec `confirmed_structure` ;
   14. `express_full` texte simple ;
   15. `express_full` texte avec actu + ressenti, série et `launch_context` ;
   16. `express_full` texte avec `CAROUSEL_SEMANTIC_REVIEW=false` ;
   17. `express_full` photo en récit continu (vision) ;
   18. `express_full` photo avec plan validé (chemin `handlePhotoCarouselRequest`) ;
   19. `express_full` photo avec `photos_only` ;
   20. `express_full` mixte en récit continu ;
   21. `express_full` mixte avec plan validé ;
   22. `express_full` mixte `text_first` + `photo_catalog` ;
   23. refus `photo_mismatch` photo et mixte (0 crédit) ;
   24. cas limites :
       - `assign_templates` (aucun quota) ;
       - Qualité Max refusée ;
       - `type` invalide ou Zod en 400 ;
       - `AnthropicError` remontée avec son statut.
2. **Étendre `prompts_snapshot_test.ts`** aux textes qui vivent dans `index.ts` : `buildHooksPrompt`, `buildSuggestTopicsPrompt`, `buildSuggestAnglesPrompt`, `buildDeepeningQuestionsPrompt`, `buildTextFirstBlock` (avec et sans catalogue), `PHOTO_MISMATCH_SYSTEM_REMINDER` et le prompt système de `proposeStructure`. Ces fonctions ne sont pas exportées : soit on les exporte temporairement depuis `index.ts` (petit changement sans effet sur le comportement, dans la même PR), soit on se contente du contrat du handler, qui les capture déjà dans `system` et `messages`.
3. **Lot 0b, rendre les 4 tests « lecture du texte » indépendants de l'emplacement** : ils doivent lire la concaténation de tous les `carousel-ai/*.ts` (hors `_test.ts`), ou bien le fichier de destination. Cette PR ne modifie que des tests et passe au vert avant ET après le découpage.
4. **`carousel-ai/boundaries_test.ts`**, sur le modèle de creative-flow, posé dès le lot 1. Il vérifie que :
   - un fichier de `modes/` n'importe pas un autre mode ;
   - aucun fichier n'importe `index.ts` ;
   - `shared.ts` et `tools.ts` n'importent ni mode ni étape ;
   - chaque fichier de `modes/` et de `steps/` est décrit dans CARTE.md.

**Risque et ordre conseillé**

**Niveau : élevé.** C'est le fichier le plus modifié du générateur : 105 commits en 90 jours, dont 12 corrections. La finition commune (`finalizeCarousel`) touche les 4 parcours carrousel. Les budgets de temps s'enchaînent d'une étape à l'autre : un `Date.now` déplacé, ou un `await` ajouté, change ce qui est lancé ou sauté. Quatre tests d'autres dossiers lisent le texte du fichier. Enfin, l'assemblage final du prompt n'est figé nulle part (trou n°3 de CARTE.md, section 5).

Ordre des lots (une PR chacun, sans session Lovable ouverte pendant la fusion, puis `npm run test:edges` : aucun `.snap` ne doit changer à partir du lot 1) :

0. **Filet** : `handler_contract_test.ts` + snapshots des prompts de `index.ts`. Aucun changement de code.
0b. **Tests « lecture du texte »** rendus indépendants de l'emplacement. Ne touche que des tests.
1. **`shared.ts` + `tools.ts` + `boundaries_test.ts`** : constantes et `_deps`. C'est le lot qui débloque tous les suivants (fin de la boucle d'imports).
2. **`prompts.ts` + `outline.ts`** : textes purs ; les snapshots du lot 0 doivent rester identiques.
3. **`steps/structure.ts` + `steps/questions.ts`** : parcours gratuits et autonomes.
4. **`steps/finalize.ts`** : zone rouge, seul dans sa PR, relire le contrat du handler sur les 4 variantes.
5. **`steps/generate.ts` + `modes/text.ts` + `steps/continuous.ts`**.
6. **`modes/mix.ts` puis `modes/photo.ts`** : deux PR si possible ; vérifier les gardes de `mix-layout-formatting_test` et `photo-template-assign_test`.
7. **CARTE.md** (section 3 : tableau des fichiers) et `_shared/socle.ts` (origine tu / vous), puis `bash scripts/verif-post-lovable.sh`.

Plus tard, et seulement si un besoin réel apparaît : regrouper les 3 relectures et les 4 paires `doGenerate` / `doRepair` en un seul endroit. Ce n'est plus un déplacement à l'identique : il faut une PR à part, avec le contrat du handler comme juge.

**Avancement (14/10/2026)** : lot 0 fait. `carousel-ai/handler_contract_test.ts` figeait déjà 18 parcours (lots 8 et 8b, 1 à 14, 17, 18, 20, 21, 22 et le premier cas limite de la liste ci-dessus) ; 6 cas ajoutés : accroches LinkedIn, texte avec actu + ressenti + lancement, structure mixte avec actu, structure photo « une photo par slide », questions photo sans sujet, type inconnu (400). Le prompt système assemblé par `handleRequest` est donc figé avec ses blocs actu et lancement. Restent couverts par `index_test.ts` seulement (comportement, pas texte) : le refus photo, la Qualité Max refusée, `CAROUSEL_SEMANTIC_REVIEW=false` et l'erreur Anthropic. Aucune ligne d'`index.ts` touchée. Lot 0b fait : `_shared/test-carousel-ai-source.ts` (outil de test) met bout à bout tout le code de `carousel-ai/`, sous-dossiers compris, hors tests et hors `layout.ts` ; `schema-formatting_test`, `photo-template-assign_test`, `mix-layout-formatting_test` et `linkedin-ai/socle-linkedin_test` le lisent au lieu d'`index.ts` seul. Lot 1 fait : `shared.ts` (`_deps`, budgets, modèles, photos, chronos, relance, refus photo, plan normalisé, `CarouselRequestContext`, `echoContext`) et `tools.ts` (11 constantes d'outils) déplacés à l'identique, réexport par le nom dans `index.ts` ; les imports morts `usesContinuousNarrative` et `EDITORIAL_ANGLES_REFERENCE` gardés au lot 1, puis retirés au lot 2 par le recalcul des imports (aucun effet : `copywriting-prompts` ne compte plus `carousel-ai` dans son rayon, 22 → 21) ; `carousel-ai/boundaries_test.ts` posé, fichiers cités dans CARTE.md. `index.ts` : 2 792 → 2 233 lignes, aucun snapshot modifié. Lot 2 fait : `prompts.ts` (11 `build…Prompt` et `buildTextFirstBlock`) et `outline.ts` (plan envisagé) ; `index.ts` → 1 946 lignes, aucun snapshot modifié (les références du contrat du handler et de `prompts_snapshot_test.ts` sont identiques). Lot 3 fait pour `steps/structure.ts` seulement (`index.ts` → 1 651 lignes, aucun snapshot modifié) : `steps/questions.ts` appelle `runGenerationAndRespond` (variante texte), qui est encore dans `index.ts` ; il part donc au lot 5, avec `steps/generate.ts`. Lot 4 fait : `steps/finalize.ts` (zone rouge, seul dans sa PR) ; `enforceCarouselAudienceAddress` réexporté par `index.ts` ; contrat du handler identique sur les parcours texte, photo, mixte et récit continu ; `index.ts` → 1 247 lignes. Lot 5 fait : `steps/generate.ts`, `steps/continuous.ts`, `steps/questions.ts` (reporté du lot 3) et `modes/text.ts` ; `index.ts` → 941 lignes, aucun snapshot modifié. Lot 6a fait : `modes/mix.ts` (`handleMixCarouselRequest`, `enforceTextFirstDirectives`) ; gardes de `mix-layout-formatting_test` vertes ; `index.ts` → 711 lignes, sous le seuil de 800 du cliquet. Lot 6b fait : `modes/photo.ts` (`handlePhotoCarouselRequest`, `emptySlidesText` réexporté) ; garde de `photo-template-assign_test` (retrait avant gabarits) verte ; `index.ts` → 483 lignes. Lot 7 fait : `_shared/socle.ts` cite `carousel-ai/steps/finalize.ts` comme origine de la règle tu / vous et `carousel-ai/prompts.ts` pour la rédaction des carrousels texte et LinkedIn (chaînes de chemin seulement) ; `_shared/carousel-design-boundaries_test.ts` parcourt aussi `steps/` et `modes/` (sans quoi un fichier rangé dans un sous-dossier échappait au contrôle « seul `layout.ts` importe le design ») et vérifie `normalizeOverlayStyles` dans chaque fichier ; CARTE.md à jour ; `bash scripts/verif-post-lovable.sh` sans blocage. **Fiche 2 terminée.**

---

### 3. `supabase/functions/creative-flow/index.ts` — 1686 lignes

**En une phrase :** c'est la porte d'entrée de 7 formats (reel, stories, post Instagram, LinkedIn, newsletter, Pinterest texte, recyclage, plus le mode photo). Elle contient encore, dans le même fichier, les 8 textes de consignes envoyés à Claude, l'assemblage du profil de marque, deux recherches web, la télémétrie et une chaîne de `if` par format en fin de traitement. Une retouche « pour LinkedIn » passe donc dans le même fichier que les stories.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Imports et réexports | 1-53 | Branche ~40 modules partagés et les 8 fichiers `formats/*`. Réexporte tout ce que les tests importent encore depuis `index.ts` (lot 3). |
| Outils structurés de Claude | 57-109 (`HOOKS_TOOL`, `FOLLOW_UP_TOOL`) | Forme JSON imposée à Claude pour les 3 accroches de reel et les questions de suivi. `QUESTIONS_TOOL` est déjà dans `shared.ts`. |
| Consignes des étapes d'assistance | 111-153 (`buildFollowUpPrompt`), 155-226 (`adjustMarkersBlock`, `buildAdjustPrompt`), 228-264 (`buildDictationPrompt`), 266-322 (`buildAnglesPrompt`), 403-516 (`buildQuestionsPrompt`) | Texte des étapes angles / questions / suivi / ajuster / dictée. `buildQuestionsPrompt` refait sa propre détection de canal (`ctypeQ`, l. 420-424). |
| Accroches de reel | 324-388 (`buildHooksPrompt`) | Consigne des 3 hooks de reel (format unique : reel). |
| Choix du format | 390-401 (`resolveFormatHint`) et 1276-1285 (drapeaux `isCarousel`… `isPhotoMode`) | Devine le format **par sous-chaîne** (`"story"`, `"post_linkedin"`…). Source n°1 des « je touche un format, j'en casse un autre ». |
| Consigne de rédaction finale | 518-833 (`buildGeneratePrompt`) | Le gros prompt `generate` : choix du brief par format (`carouselBrief`…`captionBrief`), `positionFormat`, exclusions de `FORMAT_STRUCTURES` / `WRITING_RESOURCES` / `VISUAL_ANALOGIES` par format, JSON de sortie (newsletter à part), contexte de lancement. **Fait aussi 2 lectures en base** pour les stories : garde-fou « 3 séquences vente en 7 jours » (`stories_sequences`, l. 596-609) et catalogue photos (`user_photos`, l. 618-661). |
| Télémétrie qualité | 835-913 (`logGenerationQualityTelemetry`) | Note le texte final (stories / reel / LinkedIn) dans `content_quality_events`, sans appel IA. |
| Recherches « creuser le sujet » et web | 915-946 (`skipDepthResearch`, `creativeDepthBlock`), 948-1050 (`runDeepResearchWebSearch`) | Deux recherches qui ajoutent des faits au prompt. La recherche web fait un `fetch` brut à Anthropic et son propre `logUsage("deep_research")`. |
| Entrée, quota, validation | 1052-1118 (début de `serve`) | Lit le corps, décide si l'étape est facturée (`BILLED_STEPS`), `runPipeline` (auth + `checkQuota`), tronque les champs IA, schéma zod. |
| Assemblage du contexte de marque | 1120-1271 | `newsContextBlock`, `brandingContext`, `brandVocabBlock`, `voiceBlock`, `preGenBlock`, `incarnationBlock`, **`COMMON_PREFIX`** (préfixe de TOUS les prompts), `QUESTIONS_PREFIX`, `calendarBlock`, `objectiveBlock`. |
| Aiguillage par étape | 1287-1361 | `formatLabels`, chaîne `if / else if` sur `step` (angles, questions, follow-up, hooks, generate, adjust, recycle, dictation, sinon 400). |
| Enrichissements avant l'appel | 1363-1446 | Contexte de série (`buildSeriesContext`), recherche web (avec son `checkQuota`), recherche « creuser le sujet », accroches déjà écrites (`fetchPreviousHooks`, à faire AVANT le streaming : commentaire « deadlock »). |
| Aiguillage streaming (SSE) | 1448-1474 | LinkedIn photo, LinkedIn, newsletter, carrousel retiré (410), post par défaut. |
| Appel non streamé | 1476-1539 | Recyclage, vision, puis réglages par étape : `maxTokens`, température, modèle (Haiku pour questions), délai, outil ; 1 relance pour `adjust`. |
| Lecture de la réponse | 1541-1566 | Réponse illisible → 502 sans débit ; ajustement vide → 502 ; alignement LinkedIn fictif. |
| Chaîne de finition par format | 1568-1646 | Hooks normalisés, tu/vous, passe LinkedIn, passe newsletter + retrait markdown, passe reel, tu/vous carrousel/post/Pinterest/photo, stories (adopter → retirer → corriger → tu/vous → mise en forme). |
| Fin : télémétrie, crédit, erreurs | 1648-1685 | Télémétrie, `logUsage("content")` si étape facturée, réponse ; traduction des erreurs (400 zod, 429, `AnthropicError`, 500). |

Constats relevés (non corrigés, à garder en tête) :
- `maxTokens` prévoit `step === "recycle" ? 12288` (l. 1495) alors que le recyclage est déjà sorti l. 1481-1483 : branche morte.
- La température LinkedIn (l. 1496) teste `contentType?.includes("linkedin")`, pas `isLinkedIn` : deux détections différentes du même format dans le même handler.
- `carouselBrief` n'est atteint que par `step: "generate"` + carrousel **non streamé** ; d'après CARTE.md, aucun écran n'appelle ce chemin (les carrousels passent par `carousel-ai`). À confirmer avant toute suppression.

**Découpage proposé** (code déplacé à l'identique ; `index.ts` continue de tout réexporter pour que les tests n'aient pas à changer d'import)

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `creative-flow/prompts/assist.ts` | `buildFollowUpPrompt`, `adjustMarkersBlock` + `ADJUST_MARKER_RE`, `buildAdjustPrompt`, `buildDictationPrompt`, `buildAnglesPrompt`, `buildQuestionsPrompt`, `resolveFormatHint` | Importe seulement `_shared/copywriting-prompts.ts` et `_shared/content-clarity.ts`. `ADJUST_MARKER_RE` doit rester aligné avec `src/features/creer/edited-text.ts` (lot 7) : le dire en commentaire. |
| `creative-flow/formats/reel.ts` (fichier existant) | `HOOKS_TOOL`, `buildHooksPrompt` | Reel uniquement. **Piège :** `_shared/angle-families_test.ts` lit le texte de `index.ts` entre `"const HOOKS_TOOL"` et `"const FOLLOW_UP_TOOL"` : le test doit lire `formats/reel.ts`, sinon il échoue (« aucune entrée lue »). `FOLLOW_UP_TOOL` part dans `shared.ts` à côté de `QUESTIONS_TOOL`. |
| `creative-flow/prompts/generate.ts` | `buildGeneratePrompt` en entier (une seule PR, rien réécrit) | Importe `isFactualFictionalLinkedInBrief` depuis `formats/linkedin.ts` et les briefs. **Règle à ajouter :** `formats/*` n'importe jamais `prompts/*` (sinon on recrée un cycle). Lot suivant, séparé : sortir les 2 lectures en base (garde-fou vente, catalogue photos) dans `formats/stories.ts` (`loadStoriesSalesGuard`, `loadStoriesPhotoCatalog`), pour que ce constructeur ne touche plus la base. |
| `creative-flow/context.ts` | Lignes 1120-1271 regroupées dans `buildRequestContext(body, ctx, step, profile)` qui renvoie `{ newsContextBlock, brandingContext, brandVocabBlock, preGenBlock, fullContext, COMMON_PREFIX, QUESTIONS_PREFIX, calendarBlock, objectiveBlock, effectiveObjective, brandGuardText, audienceAddress, activity }` | **Zone la plus sensible** : `COMMON_PREFIX` entre dans tous les prompts. Garder l'ordre exact des concaténations. `getUserContext` (lecture en base) reste dans le handler ; `context.ts` ne reçoit que `ctx`. Le commentaire « Do NOT re-fetch with userId » (voix de la cliente en mode Binôme) part avec le code. |
| `creative-flow/research.ts` | `skipDepthResearch`, `creativeDepthBlock`, `runDeepResearchWebSearch` | Passe par `_deps` (`shared.ts`), que les tests remplacent : garder l'accès `_deps.fetchDepthMaterial` (ne pas le déstructurer). Le `checkQuota("deep_research")` reste dans le handler (l. 1388), juste avant l'appel, ordre checkQuota → appel → logUsage inchangé. |
| `creative-flow/telemetry.ts` | `logGenerationQualityTelemetry` | Importe `StoriesGateResult` de `formats/stories.ts` en `import type` seulement. |
| `creative-flow/call-options.ts` | Réglages l. 1490-1517 dans une fonction pure `callOptionsForStep({ step, isLinkedIn, contentType, factualFictional })` → `{ model, maxTokens, temperature, abortMs, tool }` | Pure, testable sans réseau. Recopier la branche morte `recycle` telle quelle (la supprimer dans une PR à part). |
| `creative-flow/postprocess.ts` | Chaîne l. 1562-1646 dans `finishGenerated(parsed, {...})` qui renvoie `{ earlyExit?, storiesGate, textEchoesBefore }` | **Piège :** `stories_secondary_test.ts` (test « en mode photo, les stories adoptent… ») et `_shared/story-formatting_test.ts` (« strip → correction → finalize ») lisent le texte de `index.ts` et cherchent `if (isStories && step === "generate") {`. Les faire pointer sur `postprocess.ts` dans la même PR. Le retour anticipé des hooks (`normalizeHooksResponse`) doit rester un retour du handler. |
| `creative-flow/index.ts` (ce qui reste) | `serve` : lecture, `BILLED_STEPS`, `runPipeline`, zod, `getUserContext`, aiguillage par étape, enrichissements, aiguillage SSE, appel, `logUsage`, traduction des erreurs, réexports | Cible ~400 lignes. `logUsage("content")` reste ici, après succès (règle quota). |

Frontières (`boundaries_test.ts`) : aujourd'hui, le test ne regarde que `formats/*` et `shared.ts`. À étendre :
1. `prompts/*`, `context.ts`, `research.ts`, `telemetry.ts`, `call-options.ts`, `postprocess.ts` n'importent jamais `index.ts` ;
2. `formats/*` et `shared.ts` n'importent aucun de ces nouveaux fichiers (le commun ne dépend pas de l'orchestration) ;
3. chaque nouveau fichier est cité dans CARTE.md (même mécanique que pour `formats/`).
Mettre aussi à jour `CREATIVE_FLOW_FILES` dans `scripts/impact-creation.mjs` (sinon tout nouveau fichier est classé « tous les formats », ce qui est vrai pour `context.ts` et `postprocess.ts`, mais pas pour `formats/reel.ts` qui y figure déjà), et `SOCLE_CHEMINS` dans `_shared/socle.ts` (`fichiers: ["creative-flow/index.ts", …]`) : `socle_test.ts` vérifie seulement que les fichiers existent, il ne dira rien si la liste devient fausse.

**Tests qui le protègent aujourd'hui**

- `creative-flow/handler_contract_test.ts` + `__snapshots__/handler_contract_test.ts.snap` (20 cas) : pour une vraie requête, tous les appels à Claude, la réponse au front et les crédits. Couvre questions (Instagram, LinkedIn, sans angle), hooks, generate (reel face cam oui, stories confiance, post, LinkedIn, newsletter, Pinterest), adjust (LinkedIn, carrousel avec repères, réponse vide → 502), recyclage, mode photo, streaming (post, LinkedIn, newsletter, carrousel 410). **Limite :** la base simulée ne contient ni profil de marque ni profil de voix : `voiceBlock`, `brandVocabBlock` et le `preGenBlock` tiré du branding sont vides dans toutes les références.
- `creative-flow/prompts_snapshot_test.ts` (20 snapshots) : angles, questions, suivi, hooks, adjust, dictée, generate (carrousel, newsletter, LinkedIn, reel variation + lancement, stories vente + catalogue). Utilise un faux `COMMON_PREFIX` : ne protège pas l'assemblage du préfixe.
- `creative-flow/prompts_snapshot_formats_test.ts` (27 snapshots) : generate post, Pinterest, légende photo, stories sans vente, newsletter avec angle ; questions par format ; recyclage 5 formats ; vision.
- `creative-flow/index_test.ts` (~60 tests) : recherche web (crédit seulement si succès), `creativeDepthBlock`, `skipDepthResearch`, passes LinkedIn / post / stories / reel / newsletter, tu/vous.
- `creative-flow/stories_secondary_test.ts` : stories en mode photo et recyclées, dont 1 test qui lit le **texte** de `index.ts`.
- `creative-flow/boundaries_test.ts` : frontières entre `formats/*`.
- Hors dossier : `_shared/story-formatting_test.ts` (lit le texte de `index.ts`), `_shared/angle-families_test.ts` (lit le texte de `index.ts` pour `HOOKS_TOOL`).

**Tests à ajouter AVANT de découper**

1. Contrat handler avec une marque remplie : seed `profiles`, `brand_profile` (ton, offre, `key_expressions`), `voice_profile` (expressions signature et interdites), `offers` dans la base simulée ; cas `questions` et `generate` post. Fige `COMMON_PREFIX`, `QUESTIONS_PREFIX`, `brandVocabBlock` et `voiceBlock` (lot `context.ts`).
2. Contrat handler pour les blocs encore jamais vus : `calendarContext` complet avec `launchId`, `objective` pour chacune des 4 clés + une valeur libre, `pre_gen_answers` fournis, `news_context`, `variation` + `previousContent`, `series_id` (tables `series` / `calendar_posts` simulées).
3. Contrat handler pour les chemins sans référence : étapes `angles`, `follow-up`, `dictation`, étape inconnue (400), corps invalide (400 zod), Claude qui répond 529 (`AnthropicError`), JSON illisible sur `generate` (502 et aucun crédit), `deepResearch: true` (ordre checkQuota → recherche → `logUsage("deep_research")` → `logUsage("content")`), stories en mode photo, reel `face_cam: "non"` + objectif `visibilite`, post LinkedIn « exemple fictif » (température 0.2, 1200 tokens).
4. Test unitaire de la détection de format : tableau `contentType` → drapeaux attendus (`instagram_post`, `post_instagram`, `linkedin_post`, `post_linkedin`, `story`, `stories`, `reel`, `script`, `email`, `post_newsletter`, `post_pinterest`, `carrousel`, `carousel`, vide + `angle.format_livraison`). À écrire sur une fonction `detectFormatFlags` extraite à l'identique dans le même lot, ou via le contrat handler.
5. Après chaque lot : `npm run test:edges` sans aucun snapshot modifié (le découpage ne doit rien changer à ce que voit Claude).

**Risque et ordre conseillé**

Niveau : **élevé** pour `context.ts` et `postprocess.ts`, **faible** pour le reste. Pourquoi : `COMMON_PREFIX` et la chaîne de finition touchent tous les formats, et ce sont justement les parties les moins figées (pas de marque dans le contrat, deux tests qui lisent le texte de `index.ts`). Les constructeurs de prompts, eux, sont déjà figés par 47 snapshots.

Une PR par lot, dans cet ordre :
1. **Lot T (tests seuls)** : tests 1 à 4 ci-dessus. Aucune ligne de `index.ts` touchée.
2. **Lot A** : `prompts/assist.ts` + `HOOKS_TOOL` / `buildHooksPrompt` vers `formats/reel.ts` + `FOLLOW_UP_TOOL` vers `shared.ts` ; mettre à jour `angle-families_test.ts` ; étendre `boundaries_test.ts`.
3. **Lot B** : `research.ts`, `telemetry.ts`, `call-options.ts` (fonctions déjà isolées, faible risque).
4. **Lot C** : `prompts/generate.ts` (`buildGeneratePrompt` tel quel).
5. **Lot D** : `context.ts` (après le lot T, jamais avant).
6. **Lot E** : `postprocess.ts` + mise à jour des 2 tests qui lisent le texte de `index.ts`.
7. **Lot F (comportement, à part)** : lectures en base des stories vers `formats/stories.ts`, suppression de la branche morte `recycle`, une seule détection de format. Ce sont des changements de code, pas des déplacements : ils sortent du découpage.
À chaque lot : CARTE.md (tableau « Organisation des fichiers ») et `scripts/impact-creation.mjs` mis à jour dans la même PR, pas de session Lovable ouverte pendant la fusion.

**Avancement (14/10/2026)** : lot T fait (`creative-flow/handler_contract_more_test.ts`, 23 cas + 14 valeurs de `contentType` ; un 24e cas, hooks sans accroche récupérable, ajouté au lot E). Points 1 à 3 couverts tels quels ; point 4 (détection du format) couvert par le contrat du handler, sans extraire `detectFormatFlags`, pour ne toucher aucune ligne de `index.ts` dans ce lot. Lot A fait : `prompts/assist.ts` (angles, questions, suivi, ajustement, dictée, `resolveFormatHint`), `HOOKS_TOOL` et `buildHooksPrompt` dans `formats/reel.ts`, `FOLLOW_UP_TOOL` dans `shared.ts` ; `angle-families_test.ts` lit `formats/reel.ts` ; `boundaries_test.ts` couvre les fichiers sortis d'`index.ts`. `index.ts` : 1 687 → 1 231 lignes, aucun snapshot modifié. Lot B fait : `research.ts`, `telemetry.ts`, `call-options.ts` (`callOptionsForStep`, pure, avec `call-options_test.ts`) ; `index.ts` → 985 lignes, aucun snapshot modifié. Lot C fait : `prompts/generate.ts` (`buildGeneratePrompt` tel quel) ; `index.ts` → 667 lignes, aucun snapshot modifié. Lot D fait : `context.ts` (`buildRequestContext({ body, ctx, step })`, ordre des concaténations inchangé ; `getUserContext` et l'historique des briefs restent dans le handler) ; `index.ts` → 528 lignes, les deux contrats du handler (dont la marque remplie) inchangés. Lot E fait : `postprocess.ts` (`finishGenerated`, retour anticipé des hooks remonté au handler) ; `stories_secondary_test.ts` et `_shared/story-formatting_test.ts` lisent `postprocess.ts` ; `index.ts` → 440 lignes (cible ~400 atteinte). Lot F en cours : branche morte `recycle ? 12288` retirée de `call-options.ts` (F1) ; lectures en base des stories sorties de `buildGeneratePrompt` vers `formats/stories.ts` (`loadStoriesGenerateData`, appelée par le handler), consigne sans accès à la base (F2) ; une seule détection du format, `format-flags.ts` (`detectFormatFlags`, `personaChannel`), utilisée par le handler, les questions, la température et la passe LinkedIn (F3, change le comportement dans des cas rares listés dans la PR).

---

### 4. `src/pages/VisualStudioPage.tsx` — 2059 lignes

**En une phrase :** c'est l'écran entier du Studio photo (`/photos/studio`). Un seul composant `Studio` y fait tout : la conversation avec l'IA, la carte « demande à confirmer », la zone de saisie avec les photos jointes, la galerie des images créées, le tiroir d'outils, la liste des sessions, les fenêtres annexes (mockup, avant/après, préparation, composition) et la largeur réglable de la colonne. Il porte aussi la logique d'envoi au serveur et de reprise après une réponse perdue.

Repères de structure :
- `VisualStudioPage` (l. 92-138) n'est qu'un garde d'entrée.
- `Studio` court de la l. 139 à la fin, soit environ 1 920 lignes dans une seule fonction.
- Deux « sous-écrans » y sont écrits comme des fonctions internes qui renvoient du JSX, et non comme de vrais composants : `confirmation()` (l. 1015-1199) et `chat()` (l. 1200-1655). Ces fonctions lisent directement une quarantaine de variables d'état du parent. C'est le premier obstacle au découpage.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Garde d'entrée | 92-138 (`VisualStudioPage`) | Affiche un message si l'espace charge, si aucun espace n'est choisi ou si le mode démo est actif. Sinon, monte `Studio` avec une `key` qui le réinitialise à chaque changement d'utilisateur, d'espace ou de session. |
| 2. Navigation et retours | 139-184 (`studioPath`, `contentPath`, `returnToReel`, `chooseTab`) ; bandeaux 1709-1715 (retour carrousel) et 1716-1738 (onglet vidéo, `VideoStudioSessions`) | Construit l'URL du Studio en gardant `carousel_return` et `reel_passage`, gère le retour vers /creer et vers le Reel, et bascule entre les onglets Photo et Vidéo. |
| 3. Largeur réglable de la conversation | 70-73 (constantes `CHAT_WIDTH_*`) ; 188-250 (`chatWidth`, `wide`, `persistChatWidth`, `startChatResize`, `resetChatWidth`) ; 1779-1803 (poignée `studio-resizer`, flèches du clavier) | Glisser, double-cliquer ou utiliser les flèches pour régler la largeur, mémorisée dans `localStorage`. |
| 4. Chargement de la session et états dérivés | 252-371 (`useState`, `useQuery` « read » avec rafraîchissement toutes les 5 s pendant une génération, `sessions`, `premiumBlocked`, `insufficientSeries`) ; 372-425 (effets : sélection auto de la dernière image prête, défilement, nettoyage du brouillon) | La source de vérité côté écran : session, versions, proposition, quota, droit d'écriture. |
| 5. Brouillon et photos jointes (stockage local) | 76-91 (`referenceRoleForPhoto`, `readAttachedIds`, `writeAttachedIds`) ; 290-294, 355-366 (`setAttachments`) ; 426-440 (`editDraft`, `autoSend`) | Garde le texte en cours et les photos jointes dans le navigateur, par espace et par session. |
| 6. Appels serveur et anti-doublon | 441-482 (`openPhoto`) ; 483-536 (`mutate`, verrou `actionLock`, erreurs `refresh_request` et `branch_reference_choice`) ; 720-822 (`send` : création de session puis message, `request_id` stable si la réponse se perd) ; 1004-1014 (`runProposalGenerate`) | Le cœur fragile : un seul appel à la fois, reprise d'une réponse perdue sans double envoi. |
| 7. Références (photos jointes côté serveur) | 537-568 (`syncAttachments`, `sceneAttachments`, `updateSelection`) ; 569-653 (`addReferencePhotos`, avec la récupération en cas d'échec partiel) ; 654-674 (`addLocalFiles`) ; 675-719 (`attachVersionAsReference`, `autoAttachedScenes`, jonction automatique d'une scène prête) | Garde la sélection du serveur alignée sur ce que l'écran montre (maximum 8 références). |
| 8. Enregistrement et archivage | 823-869 (`save`, `saveVersion`) ; 870-896 (`setSessionArchived`) ; 1698-1708 (bandeau « session archivée ») | `save()` et `saveVersion()` ne sont **appelées nulle part** dans ce fichier (code mort, vérifié par grep). L'action serveur `save` reste utilisée par `useCarouselStudioReturn.ts`. |
| 9. Textes calculés (étiquettes, relances) | 897-936 (`source`, `comparisonSource`, `identitySheet`, `readyFollowUp`, `label`) ; 975-1003 (`videoSource`, `proposalGenerateDisabled`, `proposalGenerateLabel`) | Les phrases « Voilà la scène… » et l'étiquette du bouton « Générer la série · N images ». |
| 10. Carte « demande à confirmer » | 1015-1199 (`confirmation()`) | Résumé, coût, presets Soul, détails (références, format, outil, contexte de marque), pilote de série, avertissements. |
| 11. Fil de conversation et tiroir d'outils | 1200-1306 (messages, boutons mémoire, « Corriger les textes », outils existants, relance mannequin) ; 1307-1351 (états : en cours, échec avec « Réessayer », incertain) ; 1352-1495 (`Sheet` « Outils et créations » : photos proposées, charte, compositions enregistrées avec pagination) | Tout ce qui s'affiche dans la colonne de gauche au-dessus de la saisie. |
| 12. Zone de saisie | 1499-1650 (glisser-déposer, barre d'outils, menu Options, choix de branche, accordéon `ReferenceCards`, `Textarea` avec Entrée pour envoyer, import, bibliothèque, bouton Envoyer ou Générer) | La saisie et les pièces jointes. |
| 13. Galerie et fenêtres annexes | 1656-1697 (en-tête) ; 1806-1878 (galerie `studio-image-stream`, `StudioMemoryPanel`, images apportées) ; 1883-1990 (`StudioCompositionEditor`, `OfferMockupDialog`, `PhotoPreparationDialog`, `AvantApresDialog`, `PhotoLibraryPickerDialog`) ; 1991-2057 (fenêtre « Mes sessions Studio ») | La colonne de droite et les fenêtres modales. |

**Découpage proposé**

Ce qui existe déjà : le dossier `src/features/visual-studio/` contient `api.ts`, `ReferenceCards.tsx`, `StudioMemoryPanel.tsx`, `StudioCompositionEditor.tsx`, `StudioBrandContext.tsx`, `summary.ts`, `reference-labels.ts` et `studio.css`. Le modèle de hook est `src/features/carousel-studio/useCarouselStudioReturn.ts`. Il n'y a pas de dossier `src/components/studio/`, donc tout va dans `src/features/visual-studio/`.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/visual-studio/attachments.ts` | `referenceRoleForPhoto`, `readAttachedIds`, `writeAttachedIds` (l. 76-91) | Fonctions pures, aucun risque. Garder les `try/catch` autour de `localStorage`. |
| `src/features/visual-studio/useChatWidth.ts` | constantes 70-73, l. 188-250 et le gestionnaire clavier de la poignée (1789-1802) ; renvoie `{ gridRef, chatWidth, wide, startChatResize, resetChatWidth, onResizerKey }` | `gridRef` sert aussi au `<div className="studio-grid">` : le hook doit le fournir. Clé de stockage `visual-studio-chat-width` inchangée. |
| `src/features/visual-studio/StudioSessionsDialog.tsx` | l. 1991-2057 | Props : `open`, `sessions` (résultat du `useQuery`), `roleWritable`, `sessionAction`, `onArchive`, `onOpen`, `onNew`, `workspaceName`. `setSessionArchived` **reste dans la page**, car le bandeau « archivée » (l. 1702) l'utilise aussi. |
| `src/features/visual-studio/StudioProposalCard.tsx` | `confirmation()` (1015-1199) devient un composant | Il lit `proposal`, `current`, `references`, `selectedId`, `busy`, `generating`, `writable`, `draft`, `error`, `premiumBlocked`, `insufficientSeries`, et appelle `editDraft`, `setError`, `mutate("pilot")` et `state.refetch`. Garder la classe `studio-chat-confirmation` autour : l'effet de défilement (l. 405) la cherche par `querySelector`. |
| `src/features/visual-studio/proposal-labels.ts` | `proposalGenerateLabel` (997-1003), `readyFollowUp` et `identitySheet` (913-928) en fonctions pures `(proposal, version, references) => string` | Textes figés par les tests (« Générer la série · N images », « Voilà la scène… »). |
| `src/features/visual-studio/StudioMessageList.tsx` | l. 1213-1306 (messages et relance mannequin) et 1307-1351 (états de création) | Le `ref={desktopMessages}` reste sur le conteneur `studio-messages` (l. 1204), qui doit rester dans la page ou être transmis en `forwardRef`. `openCastingRef` et `setAutoSend` sont partagés avec `StudioMemoryPanel`. |
| `src/features/visual-studio/StudioToolsSheet.tsx` | l. 1352-1495 | Contient un appel direct à `studioRequest("composition_read")` (l. 1413) et la pagination `listOlderStudioCompositions` : déplacer avec, en gardant les imports `@/features/visual-studio/api` (le test les simule par ce chemin). |
| `src/features/visual-studio/StudioComposer.tsx` | l. 1499-1650 | Il faut lui passer `send`, `runProposalGenerate`, `addLocalFiles`, `updateSelection`, `mutate`, `fileInput`, `dragDepth`, `branchChoice`. Garder les `id` `studio-draft` / `studio-draft-mobile` : un bouton les cherche avec `document.getElementById` (l. 1297). |
| `src/features/visual-studio/StudioImageStream.tsx` | l. 1833-1878 (galerie et images apportées) | Le clic sur une scène appelle `syncAttachments(sceneAttachments(item))` : à passer en prop `onSelectVersion`. |
| `src/features/visual-studio/StudioToolDialogs.tsx` | l. 1883-1990 | Les `onSaved` appellent tous `mutate("reference", …)` avec des rôles différents (`composition`, `preparation.role`) : à recopier exactement. |
| `src/features/visual-studio/useStudioSession.ts` (dernier lot) | l. 252-822 et 870-896 : état, `useQuery`, `mutate`, `send`, `openPhoto`, gestion des références | C'est le plus risqué : nombreuses références partagées (`alive`, `actionLock`, `creation`, `sent`, `draftRef`, `seenReady`, `autoAttachedScenes`) et un `useEffect` qui appelle `send` avec un `eslint-disable` (l. 434-440). Ne pas « corriger » les dépendances des effets pendant le déplacement. |
| Suppression séparée (PR à part, pas pendant le déplacement) | `save` et `saveVersion` (823-869), code mort | Vérifier d'abord par grep qu'aucun appel n'est réapparu. La retirer dans la même PR qu'un déplacement mélangerait deux changements. |

**Tests qui le protègent aujourd'hui**

- `src/test/visual-studio.test.tsx` (1137 lignes, 47 tests, environnement jsdom). Il rend la vraie page en simulant `@/features/visual-studio/api`, `use-user-photos`, les contextes, `PhotoLibraryPickerDialog`, `PhotoPreparationDialog`, `StudioVideoPanel` et `VideoStudioSessions`. Il couvre :
  - l'archivage et la restauration (depuis la fenêtre des sessions) ;
  - Entrée et Maj+Entrée ;
  - l'envoi qui interprète sans générer ;
  - le verrou contre le double clic ;
  - la réponse perdue (texte et `request_id` gardés) ;
  - l'isolation entre espaces A et B ;
  - le lecteur seul ;
  - le blocage Premium ;
  - les séries et le pilote ;
  - le choix de branche ;
  - les rôles et l'ordre des références ;
  - le glisser-déposer ;
  - l'import local ;
  - la scène et l'intégration ;
  - les presets Soul ;
  - le retour carrousel ;
  - la mise en page mobile ;
  - le défilement vers le conseil.
- `src/test/studio-memory.test.tsx`, `studio-composition.test.tsx`, `studio-summary.test.ts` et `visual-studio-api.test.ts` testent les composants et modules déjà séparés.
- `src/test/carousel-studio-dialog.test.tsx` et `brand-review-gate-regressions.test.tsx` testent les liens vers `/photos/studio` (aller-retour), pas la page elle-même.
- E2e : aucun test Playwright ne visite le Studio (`e2e/` vérifié par grep).

**Tests à ajouter AVANT de découper**

Trous constatés par grep des textes dans `visual-studio.test.tsx` :
1. **Largeur de la conversation** : glisser la poignée et vérifier la valeur dans `localStorage`, double-clic pour revenir à 430, flèches (±24, bornes 340-760).
2. **Tiroir « Outils et créations »** :
   - « Photos proposées » envoie `reference` avec le rôle `subject` ;
   - « Références visuelles de ma charte » envoie `charter_index` ;
   - « Reprendre » une composition ouvre l'éditeur ;
   - « Voir les compositions plus anciennes » appelle `mock.older` avec `20 + n` (le mock existe mais n'est pas utilisé).
3. **Menu Options** : « Avant / après » et « Mockup d'offre » ouvrent la fenêtre ; `onSaved` envoie `reference` avec le rôle `composition`.
4. **Relance mannequin** : « Préparer la scène avec « X » » remplit le brouillon puis envoie avec `branch_reference_mode: "current"`. « Le garder pour ma marque » ouvre le casting de `StudioMemoryPanel`.
5. **« Corriger les textes de cette affiche »** : ouvre l'éditeur avec la composition du message.
6. **Garde d'entrée** : messages de chargement, d'absence d'espace et de démo, sans aucun appel à `studioRequest`. Bandeau « Cette session est archivée » et bouton « Restaurer la session ».
7. **Galerie** : « Voir les images plus anciennes » au-delà de 20 versions.
8. **Filet global (le plus utile)** : un test « instantané de l'écran » sur 4 états figés : sans session, proposition de scène, série en échec partiel, intégration prête. Il enregistre la liste des boutons et intitulés (`getAllByRole("button").map(b => b.textContent)`) et la séquence des appels `mock.request`. C'est l'équivalent front du `handler_contract_test.ts` de CARTE.md : il doit rester identique à chaque lot.

**Risque et ordre conseillé**

Niveau : **moyen à élevé**.
- Pourquoi c'est risqué : c'est le fichier le plus modifié du studio (97 commits en 90 jours, 6 de correction). La logique de reprise après une réponse perdue et la synchronisation des références sont subtiles.
- Pourquoi c'est faisable : le filet est déjà bon (47 tests sur la vraie page) et les sélecteurs des tests passent par les rôles et les textes, donc un déplacement de JSX à DOM identique ne les casse pas.
- Point Lovable : Lovable aime réécrire ce fichier. Un lot doit se faire sans session Lovable ouverte.

Une PR par lot, et `npm test` doit rester vert sans toucher aux tests existants :
1. **Lot 0** : ajouter les tests ci-dessus, sans toucher au code.
2. **Lot 1** : `attachments.ts`, `proposal-labels.ts` et `useChatWidth.ts` (fonctions pures et hook isolé).
3. **Lot 2** : `StudioSessionsDialog.tsx` et `StudioToolDialogs.tsx` (fenêtres modales, peu de logique).
4. **Lot 3** : `StudioProposalCard.tsx`.
5. **Lot 4** : `StudioToolsSheet.tsx` et `StudioImageStream.tsx`.
6. **Lot 5** : `StudioMessageList.tsx` et `StudioComposer.tsx`.
7. **Lot 6** : `useStudioSession.ts`, puis une PR séparée pour retirer `save`/`saveVersion`.

Vérification à chaque lot : `npx tsc --noEmit --skipLibCheck`, `npx vitest run src/test/visual-studio.test.tsx` et `npm run build`.

**Avancement (15/10/2026)** : lot 0 fait. `src/test/visual-studio-page-net.test.tsx` (14 tests, aucune ligne de la page touchée) : garde d'entrée (chargement, aucun espace, démo, sans appel au Studio), bandeau « session archivée » et restauration, largeur réglable (flèches ±24, bornes 340-760, double-clic à 430, valeur hors bornes, pas de poignée sur petit écran), tiroir d'outils (photo proposée en `subject`, charte en `charter_index`, « Reprendre » une composition, compositions plus anciennes avec `20 + n`), menu Options (avant / après et mockup renvoient l'image en `composition`), galerie au-delà de 20 images, relance mannequin (« Préparer la scène », « Le garder pour ma marque »), « Corriger les textes de cette affiche », et l'instantané d'écran sur 4 états (boutons, titres, appels serveur) figé dans `src/test/__snapshots__/visual-studio-page-net.test.tsx.snap`. Vérifié : changer le pas des flèches ou le rôle d'une photo proposée fait échouer le filet. Lot 1 fait : `src/features/visual-studio/attachments.ts` (`referenceRoleForPhoto`, `readAttachedIds`, `writeAttachedIds`), `proposal-labels.ts` (`readyFollowUpFor` renvoie `{ identitySheet, productName, readyFollowUp }`, `proposalGenerateLabelFor`), `useChatWidth.ts` (constantes, largeur, poignée et flèches : `onResizerKey`) ; expressions recopiées à l'identique ; page 2 059 → 1 941 lignes, les 90 tests du Studio (filet et instantanés compris) inchangés. Lot 2 fait : `StudioSessionsDialog.tsx` (l'archivage reste dans la page, appelé par `onArchive`) et `StudioToolDialogs.tsx` (mockup, préparation, avant / après ; le `mutate("reference", …)` reste dans la page, appelé par `onAttach(photoId, role)` avec le même rôle : `composition`, ou celui de la photo préparée). L'éditeur de composition et le choix dans la bibliothèque restent dans la page : ils dépendent de l'enregistrement et de la navigation, ils partiront avec `useStudioSession` (lot 6). Page → 1 837 lignes, 90 tests inchangés. Lot 3 fait : `StudioProposalCard.tsx` (ancienne `confirmation()`, JSX identique ; ce qu'elle lisait dans la page arrive en props, `state.refetch` devient `onRetryAccess`) ; la classe `studio-chat-confirmation` reste sur le conteneur dans la page (l'effet de défilement la cherche). Constat : la page n'appelle la carte que si une proposition existe, donc sa branche « sans proposition » (« Une idée, une question, une image ») n'est jamais affichée ; gardée telle quelle, à retirer dans une PR à part. Page → 1 666 lignes, 90 tests inchangés. Lot 4 fait : `StudioToolsSheet.tsx` (tiroir d'outils ; la relecture d'une composition et la page suivante de l'historique restent dans la page sous les noms `resumeComposition` et `loadOlderCompositions`, corps identiques, appelés par `onResumeComposition` et `onLoadOlderCompositions`) et `StudioImageStream.tsx` (galerie ; le choix d'une image, sélection et jonction d'une scène, reste dans la page via `onSelectVersion`, les deux gestes clic et clavier appelant le même corps qu'avant). Page → 1 564 lignes, 90 tests inchangés. Lot 5 fait : `StudioMessageList.tsx` (fil, boutons du chat, relance mannequin, état des créations ; la carte de la demande et le tiroir d'outils sont passés par la page en `proposalCard` et `children` ; l'ouverture de l'éditeur d'affiche et d'un outil restent dans la page via `onEditComposition` et `onOpenExistingTool`, mêmes corps) et `StudioComposer.tsx` (zone de saisie, JSX identique ; les 35 valeurs lues dans la page arrivent en props sous le même nom, `id` `studio-draft` inchangés). Le conteneur `studio-messages` et sa `ref` restent dans la page. Import `SlidersHorizontal` inutilisé retiré. Page → 1 319 lignes, 90 tests inchangés. Lot 6 fait : `useStudioSession.ts` (état de la session, `useQuery`, brouillon, photos jointes, `mutate`, `send`, `openPhoto`, références, archivage), bloc de 639 lignes recopié à l'identique (vérifié par `diff`), mêmes hooks dans le même ordre, dépendances des effets non retouchées ; la page l'appelle à l'endroit exact où le bloc était, avec 10 valeurs d'entrée, et reçoit les 73 valeurs qu'elle utilise ensuite. Page 1 319 → 684 lignes, sortie du cliquet (moins de 800) ; 95 tests du Studio inchangés. PR à part faite : `save` et `saveVersion` retirés de `useStudioSession.ts` (aucun appel, vérifié par grep ; l'action serveur `save` reste utilisée par `useCarouselStudioReturn.ts`), le paramètre `contentPath` du hook, devenu inutile, aussi ; 95 tests inchangés. **Fiche 4 terminée** (page 2 059 → 684 lignes). Reste, hors fiche : la branche « sans proposition » de `StudioProposalCard`, jamais affichée.

---

### 5. `supabase/functions/visual-studio/index.ts` — 2001 lignes

**En une phrase :** c'est la fonction serveur du Studio. Une seule fonction, `handleStudioRequest` (l. 213-2000), reçoit les 16 actions du front (`create`, `read`, `message`, `generate`, `save`, `reference`, `selection`, `archive`…). Elle vérifie les droits, prépare la demande avec Claude, applique des dizaines de garde-fous sur les références (scène, intégration, mannequin, produit exact), lance la génération et le décompte des crédits, puis renvoie l'état complet de la session.

Repères de structure :
- La branche `message` fait à elle seule les lignes 527-1455, soit environ 930 lignes.
- Le dossier contient déjà 18 modules locaux sans test intégré au nom : `conversation.ts`, `media.ts`, `worker.ts`, `memory.ts`, `scene-workflow.ts`, `branch-context.ts`, `higgsfield-image.ts`, `contract.ts`, `competencies.ts`… Leurs tests sont dans 15 fichiers `*_test.ts` (plus `index_test.ts`). `index.ts` n'est donc plus qu'un aiguilleur, mais un aiguilleur qui contient encore toute la logique de décision du tour de conversation.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Contrat d'entrée | 62-111 (`schema` zod, 16 actions) | Valide le corps JSON envoyé par le front. |
| 2. Outils de stockage et de droits | 112-187 (`requireValue`, `unwrap`, `download`, `visionFromStorage`, `store`, `canWrite`) ; 188-212 (`charterReferences`) | Télécharge, redimensionne pour Claude (1024 puis 768 px, à cause d'une erreur mémoire 546 rencontrée), enregistre, revérifie les droits. |
| 3. Entrée, authentification et chargement de session | 213-253 (rappel Higgsfield `imageCallback`, `runPipeline`, rôle, action `styles`) ; 254-342 (action `create` : insertion et copie de la photo source) ; 343-370 (relecture, `source_ready`, `archive`/`restore`, refus si archivée) | Qui a le droit de faire quoi, et sur quelle session. |
| 4. Petites actions de session | 371-386 (`composition_read`) ; 387-390 (`memory_save`/`memory_apply`, déjà déléguées à `handleMemory`) ; 391-404 (`selection`) ; 405-526 (`reference` : ajout, changement de rôle, retrait, photo de charte, image créée) ; 1456-1491 (`composition_save`) | Chacune modifie la session avec un contrôle de `revision`. |
| 5a. Tour de conversation : garde-fous d'entrée et branche | 527-560 (réponse rejouée, limite de 50 demandes) ; 561-647 (`parent`, `referencesAtVersion`, conflit `branch_reference_choice`, `effectiveIds`, produits réservés, photos portées exclues) | Choisit quelles images partent avec la demande. |
| 5b. Tour : réservation et contexte de marque | 648-671 (`studio_reserve_interpretation`) ; 672-769 (charte, profil, proposition, stratégie, catalogue de photos, mémoire, `brandContext`, recherche par mots) | Prépare tout ce que Claude doit savoir. |
| 5c. Tour : appel à Claude | 770-797 (rôles déclarés, images pour la vision, presets Soul) ; 798-920 (`interpreterArgs`, appel, réparation si la sortie est incomplète, réparation si la réponse se répète, erreur 503 `refresh_request`) | Haiku pour le conseil, Sonnet pour la préparation. Appel unique sans relance automatique (`maxRetries: 0`). |
| 5d. Tour : règles métier après Claude | 921-1022 (dialogue seul, mannequin de la mémoire avec seconde passe de vision 955-985, alias de version, `reference_use`, choix explicites) ; 1016-1095 (édition d'une base, `newPhoto` qui passe en scène, `usedReferences`/`resolvedReferences`, originaux oubliés, rôle `auto`, sujet réel exigé) ; 1096-1143 (identité de personne, placement du produit, mémoire à sélectionner, client ancien) ; 1144-1206 (nouvelle prise, héritage de scène, passage scène → intégration, décor vide) ; 1207-1304 (produit exact, `rebaseScenePath`, `repairTargets`/`validTargets`, `sceneInputs`, contrôles scène et intégration) | C'est là que naissent la plupart des régressions : chaque correctif ajoute une règle qui peut basculer `intent.operation` en `clarify`. |
| 5e. Tour : construction de la proposition et enregistrement | 1305-1378 (`originalPath`, objet `proposal`, coût, routage Soul 2 et Marketing Studio) ; 1379-1455 (messages, journal `[visual-studio:turn]`, mise à jour avec `revision`) | Fige ce que l'utilisatrice va confirmer. |
| 6. Pilote et nouvel essai | 1492-1540 (`pilot`, `retry`, nouveau routage Marketing) | Transforme une série en une image, ou repropose une image en échec. |
| 7. Génération payante | 1541-1630 (contrôles : proposition à jour, scène validée, nouveau routage, anciennes propositions, clés d'API) ; 1608-1656 (`checkQuota`, Premium, prompt trop long, `studio_confirm_generation` avec plafond images DUR) ; 1657-1748 (tâche de fond `EdgeRuntime.waitUntil` : Higgsfield ou `executeStudioJob` avec `complete`/`fail`/`uncertain`) | Le décompte se fait par fonctions SQL (`studio_confirm_generation`, puis `studio_complete_generation`), pas par `logUsage`. C'est voulu, à ne pas « corriger » en déplaçant. |
| 8. Enregistrement dans la bibliothèque | 1750-1786 (`save`, `studio_save_library`) | Copie l'image et son original dans `user-photos`. |
| 9. Rattrapage et réponse commune | 1788-1843 (reprise Higgsfield, versions bloquées → terminée ou incertaine) ; 1844-1959 (relecture, URL signées en cache, quota, mémoire, charte, photos proposées) | **Toutes les actions qui ne font pas `return` tombent ici** : c'est la réponse « read » commune. |
| 10. Traduction des erreurs | 1961-1999 (`known` : `studio_conflict`, `studio_busy`, `studio_archived`…) | Les erreurs internes sont des chaînes reconnues **par sous-chaîne** dans le message, puis renvoyées en 409 ou 503. |

**Découpage proposé**

Le modèle existe déjà dans le dossier : `memory.ts` exporte `handleMemory(sb, actor, p, session, references)`, qui renvoie la session à jour. On généralise ce motif.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `visual-studio/request-schema.ts` | `schema` (62-111) et son type `StudioParams = z.infer<typeof schema>` | Importe `REFERENCE_ROLES` et `MAX_REFERENCES` (`competencies.ts`) et `compositionSchema`. Zod est importé par URL (`deno.land/x/zod@v3.22.4`) : garder la même URL partout. |
| `visual-studio/storage.ts` | `BUCKET`, `requireValue`, `unwrap`, `download`, `visionFromStorage`, `store`, `canWrite`, `charterReferences` (112-212) | Utilisés par presque toutes les actions : premier lot, sans changer les messages d'erreur (« Photo non prise en charge », « Ressource indisponible »). |
| `visual-studio/actions/session.ts` | `create` (254-342) ; `archive`/`restore` (360-370) ; `composition_read` (371-386) ; `selection` (391-404) | Chaque fonction reçoit `(sb, actor, p, session, references)` et renvoie la session, ou une `Response` quand l'action fait un `return json(…)`. `json` est une fermeture sur `pipe.corsHeaders` : la passer en paramètre. |
| `visual-studio/actions/reference.ts` | `reference` (405-526) | Contrôle `revision` et `refresh_request` ; utilise `charterReferences`, `activeReferences`. |
| `visual-studio/actions/composition.ts` | `composition_save` (1456-1491) | RPC `studio_save_composition`. |
| `visual-studio/actions/pilot.ts` | `pilot` / `retry` (1492-1540) | `routeToMarketingStudio`, `resolveSoulStyle`. |
| `visual-studio/actions/generate.ts` | `generate` (1541-1749), y compris la tâche de fond | `declare const EdgeRuntime` (l. 61) doit suivre. Garder l'ordre : `checkQuota` → contrôle Premium → prompt trop long → `studio_confirm_generation`. Le test « oversized final Marketing prompt » vérifie qu'aucun claim n'est fait. |
| `visual-studio/actions/save.ts` | `save` (1750-1786) | Renvoie toujours `json({ photo_id })` sans passer par la réponse commune. |
| `visual-studio/read-state.ts` | 1788-1959 (rattrapage, puis construction de la réponse) | Ordre des appels identique : le test compte les requêtes. Garder le cache `signedPaths`. |
| `visual-studio/errors.ts` | table `known` et traduction 1961-1999 | Les modules déplacés doivent lancer **exactement** les mêmes chaînes (`studio_conflict`…), sinon on passe de 409 à 503. |
| `visual-studio/turn/` en 4 fichiers (lot à part, le plus délicat) : `turn/references.ts` (561-647), `turn/brand-context.ts` (672-769), `turn/interpret.ts` (770-920), `turn/guardrails.ts` (921-1304), `turn/proposal.ts` (1305-1455) | branche `message` | **Piège principal** : les règles modifient des objets en place. `ref.role = stated` (l. 772-774) modifie les objets de `requestReferences`, qui sont **les mêmes objets** que ceux de `references`. Idem pour `intent.*`, `resolvedReferences.push/splice` et `workflow.targets`. Le déplacement doit passer les mêmes objets, sans copie (`{...}`) ni `structuredClone`. Il y a beaucoup de variables partagées (`parent`, `versionIds`, `reservedProducts`, `cleanProductGroup`, `newPhoto`, `explicitSource`, `memoryIds`) : regrouper dans un objet `TurnContext` passé par référence. Les `return json(...)` au milieu du tour (8 sorties anticipées) deviennent un retour `{ response }` que l'aiguilleur relaie. |
| `index.ts` réduit (~250 l.) | imports, authentification et chargement de session (213-253, 343-359), aiguillage des actions, `try/catch` final, `serve` | Il doit continuer d'exporter `handleStudioRequest` : `index_test.ts` l'importe depuis `./index.ts`. |

Point CI : `.github/workflows/ci.yml` (l. 99-100) exécute
`deno check --no-config --no-lock --node-modules-dir=none supabase/functions/visual-studio/index.ts`.
`npm run test:edges` tourne en `--no-check`. **Seul ce `deno check` vérifie les types**, et il ne voit les nouveaux fichiers que s'ils sont importés (directement ou non) par `index.ts`. Chaque lot doit donc brancher ses nouveaux modules dans `index.ts` dans la même PR, et lancer ce `deno check` en local. La CI exécute aussi `supabase/tests/visual-studio.mjs` (l. 197).

**Tests qui le protègent aujourd'hui**

- `visual-studio/index_test.ts` (1583 lignes, 66 tests). Il fait passer de vraies requêtes dans `handleStudioRequest` avec `fetch` simulé (Supabase REST et Storage, Anthropic). Les payloads Claude sont capturés dans `f.payloads` et les chemins appelés dans `f.requests`.
  - Actions couvertes : `message` (57 appels), `selection` (5), `read` (4), `composition_save` (3), `generate` (2), et `archive`, `restore`, `composition_read`, `create`, `reference`, `memory_apply`, `pilot` (1 chacune).
  - `save`, `generate`, `create` et `message` sont aussi vérifiés pour le rôle lecteur (l. 314).
  - Thèmes : authentification, archivage, conflit de branche, contexte de marque figé, grande photo redimensionnée, compositions, séries et pilote, scène Soul et intégration, produit exact, mannequin de la mémoire, rôles manuels, réparation d'une sortie incomplète, prompt Marketing trop long.
- Modules : `branch-context_test.ts`, `compact-integration-prompt_test.ts`, `competencies_test.ts`, `conversation_test.ts`, `higgsfield-image_test.ts`, `higgsfield-uncertain_test.ts`, `integration-direction_test.ts`, `marketing-routing_test.ts`, `media_test.ts`, `photo-preservation_test.ts`, `product-fidelity-studio_test.ts`, `repair-targets_test.ts`, `soul-direction_test.ts`, `worker_test.ts`, `asks-integration_test.ts`. Tous passent par `npm run test:edges` en CI. Fixtures : `fixtures/marketing-*.json`.
- `supabase/tests/visual-studio.mjs` (PGlite, en CI) : fonctions SQL de confirmation, crédits décomptés une seule fois, isolation entre espaces, lecteur, enregistrement idempotent dans la bibliothèque, issue incertaine, archive, historique des compositions.
- Le `deno check` de la CI attrape les erreurs de types.

**Tests à ajouter AVANT de découper**

1. **Snapshot du payload Claude** (`visual-studio/prompts_snapshot_test.ts`), à la manière de `creative-flow/prompts_snapshot_test.ts`, avec l'`assertSnapshot` de Deno. Il fige `f.payloads` (modèle, système, outil, JSON de la demande, ordre des images) pour 6 tours types :
   - conseil simple (Haiku) ;
   - nouvelle photo → scène Soul ;
   - intégration dans une scène validée ;
   - retouche d'une version ;
   - affiche avec texte exact ;
   - mannequin de la mémoire (seconde passe de vision).

   Aujourd'hui aucun snapshot n'existe dans ce dossier, et le texte des prompts (`studioSystem`, `CONVERSATION_SYSTEM`) n'est pas figé.
2. **Contrat du handler** (`visual-studio/handler_contract_test.ts`), comme le lot 3 de CARTE.md. Pour chacune des 16 actions, il fige le statut, les clés de la réponse, la liste ordonnée de `f.requests` (tables, RPC, storage) et la session enregistrée. Les références sont générées sur le code AVANT le découpage. Actions sans test direct aujourd'hui : `styles`, `retry`, `save` (propriétaire), `memory_save`, ainsi que le rattrapage d'une version bloquée dans `read`.
3. **Traduction des erreurs** : une table `code interne → statut + message` (`studio_conflict` → 409, erreur inconnue → 503, « Intégration à préciser : » gardé tel quel).
4. **Mutations en place** : un test où une référence choisie par l'utilisatrice et un rôle déclaré dans le message (« le bol est mon produit ») ressortent dans `session.references` avec `role_source: "conversation"`. Ce test casse si quelqu'un copie les objets en déplaçant le code.
5. **Ordre du quota dans `generate`** : refus Premium et quota épuisé, avec zéro appel `studio_confirm_generation` et zéro appel fournisseur ; succès avec exactement un claim.

**Risque et ordre conseillé**

Niveau : **élevé** pour la branche `message`, **faible à moyen** pour le reste.
- Le fichier est très modifié : 70 commits, 9 corrections.
- La branche `message` est un enchaînement de règles qui dépendent de leur ordre et modifient des objets partagés. Un déplacement « presque » identique change silencieusement l'opération finale (`clarify` au lieu de `edit`).
- Le reste (actions courtes, stockage, réponse « read ») se déplace sans danger une fois le contrat posé.

Une PR par lot. À chaque lot : `npm run test:edges`, le `deno check` ci-dessus, et `node supabase/tests/visual-studio.mjs` si du SQL est touché (normalement jamais).
1. **Lot 0** : les tests 1 à 5, sans toucher au code. Générer les références sur `main`. *Fait (#1478, 14/10/2026) : `prompts_snapshot_test.ts`, `handler_contract_test.ts`, harnais `contract_harness.ts`.*
2. **Lot 1** : `request-schema.ts`, `storage.ts`, `errors.ts`. *Fait (14/10/2026) : `index.ts` 2001 → 1815 lignes, aucun `.snap` modifié. La lecture des erreurs de téléchargement est dans `storage-errors.ts` (#1481). Les numéros de ligne ci-dessus datent d'avant ce lot.*
3. **Lot 2** : `actions/session.ts`, `actions/reference.ts`, `actions/composition.ts`, `actions/save.ts`. *Fait (14/10/2026) : chaque action reçoit `(ctx, session, references)` (`actions/context.ts`) et renvoie la session ou la `Response` ; `index.ts` 1815 → 1518 lignes, aucun `.snap` modifié.*
4. **Lot 3** : `actions/pilot.ts` et `actions/generate.ts` (crédits : relire le diff ligne à ligne). *Fait (14/10/2026) : corps de `generate` identique ligne à ligne (seul `pipe.corsHeaders` devient `ctx.corsHeaders`), `EdgeRuntime` déclaré dans `generate.ts` ; `index.ts` 1518 → 1258 lignes, aucun `.snap` modifié.*
5. **Lot 4** : `read-state.ts`. *Fait (14/10/2026) : `readState(ctx, session, writable)`, corps identique ligne à ligne (167 lignes) ; `index.ts` 1258 → 1087 lignes, aucun `.snap` modifié.*
6. **Lots 5 à 8** : la branche `message`, un fichier `turn/*` par PR, dans cet ordre : `brand-context`, `interpret`, `proposal`, et `guardrails` en dernier, éventuellement en deux PR (921-1143, puis 1144-1304). *Lot 5 fait (14/10/2026) : `turn/brand-context.ts`, `loadBrandContext(ctx, message)` renvoie `{ memory, brandContext, catalogue }` ; corps identique sauf `searchTerms(message)` (la demande déjà vérifiée par index.ts) ; `index.ts` 1087 → 990 lignes, aucun `.snap` modifié. Lot 6 fait (14/10/2026) : `turn/interpret.ts`, `interpret(ctx, input)` (rôles déclarés appliqués en place, vision, appel à Claude et réparations) renvoie la réponse 503 ou `{ statedRoles, selectedReference, vision, availableSoulStyles, intent, interpreterArgs }` ; corps identique (151 lignes), références passées sans copie (vérifié : une copie fait échouer le test des rôles en place) ; `index.ts` 990 → 841 lignes. Lot 7 fait (14/10/2026) : `turn/proposal.ts`, `saveProposal(ctx, input)` (proposition, routage Soul 2 / Marketing, messages, journal, enregistrement avec `revision`) renvoie la réponse anticipée ou la session enregistrée ; corps identique (151 lignes) sauf `message.slice` (demande déjà vérifiée) et `return updated.data` ; `index.ts` 841 → 686 lignes, sorti de la liste du cliquet (moins de 800 lignes). Lot 8 fait (14/10/2026) : `turn/guardrails.ts`, `applyGuardrails(ctx, input)` (règles métier après Claude, en une seule PR) renvoie la réponse anticipée ou ce dont la proposition a besoin ; corps identique (382 lignes) ; `requestReferences` et `intent` passés sans copie ; nouveau test « mannequin de la mémoire : ajouté aux références de la demande enregistrées » (une copie du tableau à l'entrée des règles passait inaperçue des 199 tests). `index.ts` 686 → 299 lignes. **Fiche 5 terminée.***

Pendant ces lots : pas de fusion de PR pendant une session Lovable ouverte (cf. CLAUDE.md), et aucun changement de comportement mêlé au déplacement.


**Résumé (3 lignes)**
1. `VisualStudioPage.tsx` (2059 l.) : un seul composant `Studio` d'environ 1 920 lignes, avec deux sous-écrans internes (`confirmation()`, `chat()`). Découpage en 10 fichiers dans `src/features/visual-studio/` et du code mort repéré (`save`/`saveVersion`, l. 823-869). Bon filet existant (47 tests), mais aucun sur le tiroir d'outils, la largeur réglable ou les fenêtres annexes.
2. `visual-studio/index.ts` (2001 l.) : un aiguilleur de 16 actions dont la branche `message` fait environ 930 lignes de règles qui modifient des objets en place (principal danger). Découpage `actions/*`, `storage`, `errors`, `read-state`, puis `turn/*`, sur le modèle de `handleMemory` ; le `deno check` de la CI ne voit les nouveaux modules que s'ils sont importés par `index.ts`.
3. Avant de découper : un snapshot des payloads Claude et un contrat des 16 actions côté serveur (aucun snapshot aujourd'hui), plus un test d'« instantané d'écran » côté front. Ensuite une PR par lot, du plus sûr au plus risqué, la branche `message` en dernier.

---

### 6. `supabase/functions/carousel-visual/index.ts` — 2 792 lignes

**En une phrase :** ce fichier transforme le texte d'un carrousel (déjà écrit par `carousel-ai`) en slides HTML 1080×1350 aux couleurs de la marque. Il prépare les consignes envoyées à l'IA de mise en page (ou compose les slides lui-même, par le code), puis passe le résultat dans une vingtaine de « gardes » qui nettoient le HTML. Tout se fait dans un seul gestionnaire HTTP de 690 lignes.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Consignes envoyées à l'IA (prompts) | 34-261 (`isDarkBackground`, `buildVisualSchemaBlock`, `buildCharterBlock`, `denseSlidesBlock`), 263-520 (`buildTextCarouselPrompt`), 522-659 (`buildMixCarouselPrompt`), 695-707 (`buildCoherencePlan`, `chunkDirective`), et **dans le gestionnaire** : 2322-2339 (style), 2341-2363 (bloc visuel), 2480-2576 (`pptxAnnotationRules` + `COMPOSE`) | Écrit les longues consignes de design : charte, schémas visuels, règles PPTX, plan de cohérence |
| Rendu des slides par l'IA | 661-693 (`parseSlidesJson`, `buildChunks`), 819-950 (`runParallelChunkGeneration` : lots de 3 slides en parallèle, puis rattrapage des slides manquantes), 952-984 (`runSingleCallGeneration`) | Appelle Claude (Sonnet ou Opus en « Qualité Max »), relit le JSON, recolle les lots |
| Composition par le code (sans IA de rendu) | 709-747 (`composeMixStages`, mixte), 749-817 (`runComposedByCodeGeneration`, photo), et dans le gestionnaire : 2597-2725 (slides éditoriales du texte, étages « sens » et « mise en forme » lancés en parallèle) | Assemble le HTML à partir de gabarits validés |
| Passe IA de contraste (photo et mixte) | 986-1079 (`applyContrastCorrectionPass`) | Repère les slides au texte clair sans voile et les fait regénérer avec un bandeau opaque |
| Gardes photo (marges, voile, accroche) | 1081-1119 (`applySafeZoneGuard`) | Marges Instagram, voile de secours, accroche agrandie en slide 1 |
| Nettoyage du texte ajouté ou en double | 1121-1146 (`stripDuplicateStepNumbers`), 1187-1204 (`stripDuplicateStepPrefixes`), 1206-1265 (`stripVisualHintText`), 1267-1350 (`protectAnchored`, `stripDenseFigureEchoes`), 1352-1393 (`stripSlideNumberBadges`), 1395-1468 (`stripInventedSurtitres`) | Retire les « SLIDE 03 », les numéros d'étape en double, les indications visuelles recopiées comme du texte, les chiffres répétés et les surtitres inventés |
| Couverture du carrousel texte | 1148-1185 (`aiCoverAccent`, `enforceTextCover`) | La slide 1 est toujours recomposée par le code, avec un seul groupe de mots en italique |
| Plomberie HTML | 1470-1491 (`injectPhotoBase64`), 1493-1520 (`forceGoogleFontsLink`), 1727-1766 (`fillOrphanPhotoPlaceholders`), 1768-1792 (`injectSlidesInvariantsFallback`) | Photos en base64, polices en `<link>`, photo manquante, invariants PPTX de secours |
| Lisibilité (contraste, taille) | 1522-1725 (`applyTitleBodyContrastGuard`, 200 lignes à lui seul), 1815-1831 (`applyTextContrastGuard`), 1833-1851 (`applyMinFontSizeGuard`) | Recolore un titre ou un corps illisible sur son fond réel ; remonte les tailles sous le plancher |
| Ancres d'édition et mesure | 1794-1813 (`logMissingAnchorsTelemetry`), 1853-1909 (`enforceVerbatimAnchorsGuard`), 1911-1971 (`enforcePhotoSlideAnchorsGuard`), 1973-1999 (`logSchemaFidelityTelemetry`) | Pose les `data-slide-text` / `data-pptx-editable` dont l'éditeur et les exports ont besoin ; réinjecte le texte source tel quel |
| Illustration de couverture (Recraft) | 2001-2102 (`applyCoverIllustration`) | Option payante : quota `photo_retouch` (`checkQuota` puis `logUsage`), appel Haiku pour le concept, puis Recraft |
| Gestionnaire HTTP | 2104-2196 (SSE, auth, limite de débit, quota `content`/`quality_max`, validation zod, espace de travail), 2198-2288 (charte : base, palette neutre, troncatures), 2386-2467 (`buildMessagesFor`, vérification des URL de modèles), 2590-2689 (aiguillage mixte / photo / éditorial / lots / appel unique), **2726-2751 (chaîne de 20 gardes dans un ordre fixe)**, 2752-2792 (`logUsage`, réponse, erreurs) | Tout le parcours d'une requête |

**Découpage proposé** (modules locaux dans `carousel-visual/`, comme les 10 modules de `carousel-ai/` ; `index.ts` garde `serve()` et réexporte les 21 fonctions exportées aujourd'hui)

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `carousel-visual/prompts.ts` | `isDarkBackground`, `buildVisualSchemaBlock`, `buildCharterBlock`, `denseSlidesBlock`, `buildTextCarouselPrompt`, `buildMixCarouselPrompt`, `buildCoherencePlan`, `chunkDirective` (34-707 sauf le rendu) | Socle (`LISIBLE_*`), `schema-formatting`, `carousel-design-plan`, `contrast-guard`. Les snapshots de `prompts_snapshot_test.ts` doivent rester identiques au caractère près. `pptxAnnotationRules` reste dans le gestionnaire à ce lot : l'en sortir, c'est en faire une fonction (lot 6) |
| `carousel-visual/render-model.ts` | `parseSlidesJson`, `buildChunks`, `runParallelChunkGeneration`, `runSingleCallGeneration`, `applyContrastCorrectionPass` | Appels Claude. Garder `keepDashes: true` et les délais (120 s) |
| `carousel-visual/compose.ts` | `composeMixStages`, `runComposedByCodeGeneration` | `photo-*`, `mix-*` ; `COMPOSED_BY_CODE_MODEL` (comptabilité des coûts) |
| `carousel-visual/html-cleanup.ts` | `stripSlideNumberBadges`, `stripDuplicateStepNumbers`, `stripVisualHintText`, `protectAnchored`, `stripDenseFigureEchoes`, `stripInventedSurtitres`, `stripDuplicateStepPrefixes`, `aiCoverAccent`, `enforceTextCover` | Ces regex portent des attributs `data-*` : voir le contrat ci-dessous |
| `carousel-visual/legibility-guards.ts` | `applySafeZoneGuard`, `applyTitleBodyContrastGuard`, `applyTextContrastGuard`, `applyMinFontSizeGuard` | `contrast-guard`, `font-size-guard`, `photo-visual-guards` |
| `carousel-visual/anchors.ts` | `enforceVerbatimAnchorsGuard`, `enforcePhotoSlideAnchorsGuard`, `logMissingAnchorsTelemetry`, `logSchemaFidelityTelemetry` | `verbatim-guard`, `schema-telemetry` |
| `carousel-visual/html-assets.ts` | `injectPhotoBase64`, `forceGoogleFontsLink`, `fillOrphanPhotoPlaceholders`, `injectSlidesInvariantsFallback` | Aucune dépendance IA |
| `carousel-visual/cover-illustration.ts` | `applyCoverIllustration` | `plan-limiter` (zone rouge, simple import : on n'y touche pas), `recraft-illustration` |
| (lot 6) `carousel-visual/post-process.ts` | une fonction `postProcessSlides(result, ctx)` qui reprend **dans le même ordre** les lignes 2726-2751 | Seul lot qui crée du code (les variables du gestionnaire passent en paramètres). C'est lui qui supprime la copie partielle `productionGuards` des tests |

Pièges propres à ce fichier :
- Un nouveau module ne doit **jamais** importer `index.ts` : son chargement lance `serve()` et ouvre un vrai socket. En contrepartie, les tests pourront importer les modules directement, sans la manœuvre `Deno.listen` des deux fichiers de test actuels.
- `src/test/carousel-dom-contract.test.ts` liste les fichiers serveur avec `git ls-files`. Un nouveau fichier qui n'est pas encore ajouté à git n'est pas lu, et un attribut déplacé « disparaît » du côté serveur. Il faut donc faire `git add` avant `npm test`.
- Le test vérifie aussi que `carousel-visual/index.ts` fait partie du périmètre : il en fera toujours partie, puisque le fichier reste.

**Rayon d'impact :** une seule fonction, `carousel-visual` : la mise en forme des carrousels texte, photo et mixte (CARTE.md, section 3). Aucun autre code n'importe `carousel-visual/index.ts` ; seuls ses deux fichiers de test le font, et `CarouselPhotoResult.tsx` y renvoie dans un commentaire sur la palette neutre. Côté front, le rayon passe par le contrat `data-*` : éditeur visuel, exports PNG / PPTX / Canva.

**Tests qui le protègent aujourd'hui**
- `carousel-visual/prompts_snapshot_test.ts`, 12 tests, avec le snapshot `__snapshots__/prompts_snapshot_test.ts.snap` (1 605 lignes). Il fige :
  - `buildTextCarouselPrompt` (charte minimale ; charte sombre complète) ;
  - `buildMixCarouselPrompt` (deux cas) ;
  - `buildCoherencePlan` (3, 5 et 8 slides) ;
  - `denseSlidesBlock` et `stripDenseFigureEchoes`.

  Il ne fige **pas** `pptxAnnotationRules`, `COMPOSE`, les invariants, ni le prompt final assemblé (`systemPromptWithAnnotations`). Il ne fige pas non plus `chunkDirective`, la consigne de la passe de contraste, ni la consigne Haiku de la couverture.
- `carousel-visual/index_test.ts`, 22 tests :
  - quota `photo_retouch` de la couverture (`applyCoverIllustration`) ;
  - gardes appliquées au photo, au mixte et au texte ;
  - numéros d'étape en double, contraste vu en direct, indications visuelles, surtitres ;
  - non-régression photo et mixte complète ;
  - couverture texte, et mémoire des dispositions du mixte sur trois régénérations.

  Point faible : `productionGuards` (ligne 336) est une **copie partielle** de la chaîne de production. Elle a 10 gardes sur 20, et `stripDenseFigureEchoes`, `injectPhotoBase64`, `forceGoogleFontsLink`, `stripInventedSlideText`… manquent.
- `src/test/carousel-dom-contract.test.ts` et `carousel-dom-contract-roundtrip.test.tsx` vérifient les attributs `data-*` (noms, et aller-retour serveur → éditeur → export).
- Ce qui n'est **pas** couvert du tout : le gestionnaire HTTP. L'en-tête de `index_test.ts` dit qu'il est impossible à capter. Depuis, pourtant, `_shared/test-edge-harness.ts` fournit `captureStdServeHandler`, déjà utilisé pour `generate-content`, `pinterest-ai` et `storytelling-ai`, qui importent le même `serve()` de std@0.168.0.

**Tests à ajouter AVANT de découper**
1. `carousel-visual/contract_test.ts` via `captureStdServeHandler` + `installFetchMock`. Quatre parcours :
   - texte composé par le code ;
   - texte rendu par l'IA en lots (au moins 5 slides, dont une avec `visual_schema`) ;
   - photo ;
   - mixte.

   Pour chacun, snapshot de la réponse renvoyée au front (HTML final de chaque slide, `design_plan`, `mix_*`, `text_*`) et des requêtes envoyées à Claude (système, messages, modèle). Vérifier aussi : un seul `logUsage("content")`, et **aucun** si l'IA échoue.
2. Dans le même fichier, un cas « lot en échec » : un lot répond 529, ses slides partent au rattrapage, et le carrousel sort complet.
3. Un snapshot du prompt système final assemblé (texte et mixte), pour figer `pptxAnnotationRules` + `COMPOSE` + les invariants avant le lot 6.
4. Un test de la chaîne complète : passer un HTML de référence dans les 20 gardes, dans l'ordre du gestionnaire. Il remplacera `productionGuards` au lot 6.

**Risque et ordre conseillé**
- **Niveau : moyen.** Une seule fonction est concernée et les gardes sont déjà exportées. Mais le gestionnaire n'est pas testé, l'ordre des gardes compte (la couverture doit passer avant les ancres, la garde verbatim avant `stripDuplicateStepPrefixes`, la taille de police en dernier), et les regex sont collées au contrat `data-*`.
- **Chantier en cours sur ce dossier :** une autre conversation travaille en ce moment sur le contrat des attributs `data-*` (`_shared/carousel-dom-contract.ts`, lot E1, commit `fe04db93`). **On ne découpe qu'une fois ce chantier fusionné**, sinon les deux PR se marchent dessus dans les mêmes regex.
- Ordre :
  - **Lot 0** (tests seuls) : points 1 à 3 ci-dessus.
  - **Lot 1** : `prompts.ts` (les snapshots ne doivent pas bouger).
  - **Lot 2** : `html-cleanup.ts` + `anchors.ts` (relancer les tests du contrat `data-*`).
  - **Lot 3** : `legibility-guards.ts` + `html-assets.ts`.
  - **Lot 4** : `render-model.ts` + `compose.ts`.
  - **Lot 5** : `cover-illustration.ts`.
  - **Lot 6** : `post-process.ts`, avec le test 4.

---

### 7. `supabase/functions/_shared/redac-gate.ts` — 2 093 lignes

**En une phrase :** c'est le « contrôle qualité rédactionnel » mesuré par le code. Il compte les tics d'IA dans un texte ou un carrousel, puis demande une seule re-passe ciblée à l'IA et ne garde la version corrigée que si **aucun** compteur n'a empiré. Les tics comptés :
- retournements « ce n'est pas X, c'est Y » ;
- chiffres inventés ;
- chiffres de recherche sans source ;
- témoignages et vécus inventés ;
- recopie de la fiche de marque ;
- accroches répétées.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Tics de formulation | 15-72 (`REVERSAL_PATTERNS`, 23 motifs), 74-84 (`MOULDED_VERBATIMS`), 956-974 (`findReversals`), 1694-1710 (`dropUserSourcedReversals`) | Repère les retournements et les formules moulées ; ne compte pas une phrase écrite par l'utilisatrice elle-même |
| Chiffres inventés | 88-170 (`measuredMultipliers`, `letterDurations`, `numbersIn`, `findFabricatedNumbers`), 635-639 (`FRENCH_NUMERALS`, déclaré **après** son usage aux lignes 100 et 200) | Liste blanche des chiffres du brief, des réponses, du branding et de l'actu ; tout autre chiffre est signalé |
| Chiffres de la recherche web | 172-424 (`statMentions`, `researchNumbers`, `SOURCE_MENTIONS`, `findUnsourcedResearchNumbers`, `findResearchNumbersUsed`, `inventedSourceTokens`, `enforceResearchNumberSources`), 585-594 (`emptiedMarkers`), 596-623 (`enforceResearchNumberCap`) | Un chiffre venu seulement de la recherche doit porter sa source dans la phrase ; au plus N chiffres de recherche quand la personne a donné son propre cas |
| Témoignages et vécus inventés | 426-477 (`testimonyPassages`, `findInventedTestimonials`), 479-546 (`findInventedExperiences`), 548-583 (`INVENTED_*_FIX`, `enforceNoInventedTestimonials`) | « Une cliente me disait… », « J'ai essayé. Résultat : » sans source → passe courte qui les retire |
| Durées contradictoires | 625-700 (`DURATION_UNITS`, `extractDurations`, `findDurationConflicts`) | « Trois semaines » dans les slides contre « un mois » dans la légende |
| Redites (accroches, fiche de marque, contenus récents) | 702-943 (`findHookEchoes`, `findBrandCopyOverlap`, `findSharedPassages`, `findRecentEchoes`, `findBrandCopyWindows`, `tokenSimilarity`), 1015-1023 (`hookEchoesBefore`), 1674-1679 (`textHook`) | Compare aux accroches du même sujet, à la fiche de marque et aux derniers contenus |
| Analyse et score du carrousel | 945-954 (`slideTexts`, `slideBody`), 976-1013 (types `RedacAnalysis`, `EchoContext`), 1025-1088 (`analyzeCarouselRedac`), 1114-1175 (`redacViolations`, `carouselRedacRawCount`, `redacScore`, `buildQualityCheck`), 1177-1202 (`rescoreCaptionOnly`), 1649-1651 (`emptyAnalysis`) | Calcule le `quality_check` affiché au front (source : le code) |
| Hashtags et chute de légende | 1090-1112 (`normalizeCaptionHashtags`), 1204-1228 (`CaptionEndingRule`, `captionEndingViolated`) | 3 hashtags sur Instagram, 2 sur LinkedIn ; forme de fin de légende imposée |
| Consignes de re-passe (texte envoyé à l'IA) | 380-381 (`UNSOURCED_RESEARCH_FIX`), 1230-1276 (`buildFixInstructions`), 1943-1973 (`buildTextFixInstructions`) | Les phrases exactes que le correcteur reçoit |
| Gate carrousel (orchestration) | 1278-1329 (`RedacGateResult`, `protectOrderPrefixes`), 1331-1403 (`applyGuardedCarouselCorrection`, garde de fidélité), 1405-1647 (`runRedacGate` : re-passe, plafond recherche, sources, témoignages, retrait en code des schémas / `big_number` / `points` inventés, CTA dupliqué) | Le chef d'orchestre des carrousels |
| Gate texte (LinkedIn, newsletter, post, reel, stories, recyclage) | 1653-1692 (`TextRedacAnalysis`, `analyzeTextRedac`), 1712-1724 (`textRedacViolations`), 1975-2093 (`textRedacRawCount`, `runTextRedacGate`) | Même logique sur un texte brut ; jusqu'à 2 passes, avec retour en arrière si la correction dérive |
| Corrections fixes et mesures « slop » | 1726-1753 (`fixFrenchElisions`, `fixElisionsInFields`), 1755-1941 (staccato, anaphores, « Résultat : », adjectifs vides, style haché, `measureSlopSignals`) | « le avant » → « l'avant » ; compteurs de télémétrie seulement, sans blocage |

**Découpage proposé** (`_shared/redac-gate/*.ts` ; `redac-gate.ts` ne contient plus que des réexports **nommés**, la même liste de 51 exports, types compris)

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `redac-gate/text-utils.ts` | `wordCount`, `sentencesOf`, `normalizeWordsForOverlap`, `wordsWithOffsets`, `tokenSimilarity`, `FRENCH_NUMERALS` | Socle sans dépendance. `FRENCH_NUMERALS` doit y aller **en premier** : trois familles s'en servent |
| `redac-gate/reversals.ts` | `REVERSAL_PATTERNS`, `MOULDED_VERBATIMS`, `findReversals`, `dropUserSourcedReversals` | `text-utils` |
| `redac-gate/numbers.ts` | `NUMBER_TOKEN`, `measuredMultipliers`, `letterDurations`, `PERCENT_AFTER`, `pctKey`, `numbersIn`, `findFabricatedNumbers` | `text-utils` ; `findFabricatedNumbers` n'est pas public aujourd'hui → exporté du sous-module, **pas** de `redac-gate.ts` |
| `redac-gate/scoring.ts` | `textRedacRawCount`, `carouselRedacRawCount`, `redacViolations`, `textRedacViolations`, `redacScore` + les types `RedacAnalysis`, `TextRedacAnalysis`, `EchoContext` | Sert à casser un **cycle** : `enforceResearchNumberSources` et `enforceNoInventedTestimonials` utilisent `textRedacRawCount` comme valeur par défaut (lignes 418 et 578), alors que celui-ci appartient au gate texte |
| `redac-gate/research-numbers.ts` | lignes 172-424 + `emptiedMarkers` + `enforceResearchNumberCap` | `correction-pass` (passes dédiées), `numbers`, `scoring` |
| `redac-gate/testimony.ts` | lignes 426-583 | `correction-pass` (`applyTestimonyRemovalPass`), `scoring` |
| `redac-gate/durations.ts` | lignes 641-700 | `text-utils` |
| `redac-gate/echoes.ts` | lignes 702-943, `hookEchoesBefore`, `textHook` | `text-utils` ; `recent-passages.ts` importe `findRecentEchoes` via `redac-gate.ts` (inchangé) |
| `redac-gate/carousel-analysis.ts` | `slideTexts`, `slideBody`, `analyzeCarouselRedac`, `buildQualityCheck`, `rescoreCaptionOnly`, `emptyAnalysis`, `normalizeCaptionHashtags`, `captionEndingViolated` | `../carousel-editorial-review.ts` (chemin à ajuster), et presque tous les sous-modules |
| `redac-gate/fix-instructions.ts` | `buildFixInstructions`, `buildTextFixInstructions`, les constantes `*_FIX` | Ce sont des **textes de prompt** : à figer par snapshot avant le déplacement |
| `redac-gate/carousel-gate.ts` | `protectOrderPrefixes`, `applyGuardedCarouselCorrection`, `runRedacGate` | `correction-pass` (`applyCorrectionPassCarousel`, `extract/reinjectCarouselTexts`) |
| `redac-gate/text-gate.ts` | `analyzeTextRedac`, `runTextRedacGate` | `correction-pass` (`applyCorrectionPass`) |
| `redac-gate/slop-signals.ts` | lignes 1726-1941 | `slideTexts` (via `carousel-analysis`). Importé par `reel-postprocess.ts` (`fixFrenchElisions`) et `content-quality.ts` (`measureSlopSignals`) via `redac-gate.ts` |

Rayon d'impact (`node scripts/carte-impact.mjs redac-gate`) : **9 fonctions**.
- `ai-text-action`, `carousel-ai`, `creative-flow`, `engagement-insight`, `generate-content`, `linkedin-ai`, `pinterest-ai`, `pinterest-photo-brief`, `pinterest-visual` ;
- importeurs directs : `creative-flow/index.ts`, `shared.ts` et `formats/{linkedin,stories,post,recycle,newsletter,reel}.ts` ; `carousel-ai`, `generate-content`, `linkedin-ai`, `ai-text-action`, `engagement-insight` ; et, dans `_shared`, `recent-passages`, `content-quality`, `reel-postprocess` ;
- un script : `scripts/eval-carousel-astra-review.ts`.

Les trois fonctions Pinterest n'importent pas `redac-gate`. Elles y arrivent par un chemin indirect :
`audience-address-pass.ts` → `correction-pass.ts` (pour le seul `unwrapCorrectionOutput`) → import dynamique de `reel-postprocess.ts` → `redac-gate.ts`. Voir la fiche 3, lot optionnel.

**Tests qui le protègent aujourd'hui** (tous dans `_shared/`, lancés par `npm run test:edges`)
- `redac-gate_test.ts` (75 tests) : retournements, CTA dupliqué, chute de légende, hashtags, recopie de marque, chiffres de recherche (sources, unités, lettres), style haché, `measureSlopSignals`, élisions.
- Fichiers ciblés :
  - `redac-gate-antithese_test.ts` (4) ;
  - `-sauf-que_test.ts` (4) ;
  - `-contraste-verbe_test.ts` (3) ;
  - `-tics-fin_test.ts` (3) ;
  - `-pourcentage_test.ts` (3) ;
  - `-testimony_test.ts` (9) ;
  - `-experience_test.ts` (8) ;
  - `-carousel-vecu_test.ts` (7) ;
  - `-lived-case_test.ts` (6, dont le plafond « ton cas d'abord ») ;
  - `-recent-echo_test.ts` (3) ;
  - `-caption-only_test.ts` (3) ;
  - `-text_test.ts` (6, `runTextRedacGate`).
- `hook-echoes_test.ts` (10), `hook-echoes-before_test.ts` (6), `editorial-voice_test.ts` (8).
- `carousel-correction-regression_test.ts` (16, dont le numéro d'ordre préservé, ligne 186), `carousel-editorial-review_test.ts` (27, dont `order_prefix_kept`), `carousel-progression_test.ts` (39, en partie), `recent-passages_test.ts`.
- Indirectement : les snapshots et contrats de `creative-flow` (`handler_contract_test.ts`) et `carousel-ai`.
- Trous constatés (grep) :
  - pas de test direct de `protectOrderPrefixes`, `findSharedPassages`, ni de la règle de garde d'`enforceResearchNumberSources` (refus d'une source inventée, `inventedSourceTokens`) ;
  - aucun test des filets en code de `runRedacGate` : retrait de `visual_schema`, de `big_number` et de `points` porteurs de chiffres inventés (lignes 1594-1623), suppression du `caption.cta` dupliqué (1629-1633) ;
  - le texte de `buildFixInstructions` (non exportée) n'est figé nulle part.

**Tests à ajouter AVANT de découper**
1. **Surface d'export :** `redac-gate-exports_test.ts` compare `Object.keys(await import("./redac-gate.ts")).sort()` à la liste actuelle (43 valeurs exportées). Rien ne doit être perdu ni ajouté.
2. **Snapshot des consignes :**
   - `buildTextFixInstructions` sur une analyse où toutes les familles sont présentes ;
   - `buildFixInstructions`, captée via `runRedacGate` avec Claude simulé (`installFetchMock`), dans le champ `extraInstructions` de la requête, chute de légende comprise.
3. **Filets en code de `runRedacGate` :**
   - `visual_schema` stats au chiffre inventé → `null` ;
   - `big_number` inventé → `null`, et le gabarit `chiffre` est retiré ;
   - `points` réduits à moins de 2 → `null`, gabarit `liste` retiré ;
   - CTA toujours dupliqué après la re-passe → `cta: ""`.
4. **`enforceResearchNumberSources` :**
   - candidat qui ajoute un nom ou une année absents de la recherche → refusé ;
   - candidat qui réduit les chiffres non sourcés sans rien dégrader → gardé.
5. **`protectOrderPrefixes` directement :** « 2. », « 3) », « Étape 4 » restaurés champ par champ ; `visual_schema` ignoré.
6. **Golden de bout en bout :** `runTextRedacGate` et `runRedacGate` sur deux contenus de référence, avec un correcteur simulé déterministe. On fige le `content` final et le `quality_check`.

**Risque et ordre conseillé**
- **Niveau : élevé.**
  - 9 fonctions, dont tous les formats texte ;
  - 39 commits en 90 jours, dont 10 corrections ;
  - les familles se servent les unes des autres (`slideTexts`, `tokenSimilarity`, `normalizeWordsForOverlap`, `FRENCH_NUMERALS`, `textRedacRawCount` par défaut) ;
  - deux dépendances vers `correction-pass` ;
  - une boucle d'imports existe déjà : `correction-pass` → `reel-postprocess` (import dynamique) → `redac-gate` → `correction-pass`.
- Ordre (une PR par lot ; aucun snapshot ne doit bouger) :
  - **Lot 0** : correction de la zone dans `impact-creation.mjs`, et tests 1 à 6.
  - **Lot 1** : `text-utils`, `reversals`, `numbers`, `durations`.
  - **Lot 2** : `echoes`, `slop-signals`.
  - **Lot 3** : `scoring`, `research-numbers`, `testimony`.
  - **Lot 4** : `carousel-analysis`, `fix-instructions`.
  - **Lot 5** : `carousel-gate`, `text-gate`.
- À faire **après** le découpage de `correction-pass` (fiche 3), dont il dépend.

**Avancement (14/10/2026)** : lot 0 fait (tests seuls, aucune ligne de `redac-gate.ts` touchée ; la correction de zone de `impact-creation.mjs` était déjà faite, #1479).
- Test 1 : `redac-gate-exports_test.ts` (43 valeurs + 8 types).
- Test 2 : `redac-gate-fix-instructions_snapshot_test.ts` (`buildTextFixInstructions` ; `buildFixInstructions` captée dans la requête de `runRedacGate`, toutes familles et les deux formes de chute de légende).
- Tests 3 à 5 : `redac-gate-safety-nets_test.ts`.
- Test 6 : `redac-gate-golden_snapshot_test.ts` (texte corrigé, texte dont la correction dérive, carrousel corrigé, carrousel dont la correction est refusée).
- **Constat relevé par les tests, corrigé le 14/10/2026** : `inventedSourceTokens` comptait tout mot à majuscule ajouté par la correction comme une source inventée (« … possible. Une bonne partie des artisans… » était refusé à cause du « Une »). Il ignore maintenant les mots courants de début de phrase, les mots déjà présents dans le texte et les articles élidés devant un nom commun ; un nom de source ou une année absents de la recherche restent refusés (`redac-gate-safety-nets_test.ts`).
- Lot 1 fait : `redac-gate/text-utils.ts`, `reversals.ts`, `numbers.ts`, `durations.ts` (code déplacé à l'identique ; `redac-gate.ts` réexporte `numbersIn` et `dropUserSourcedReversals`, les autres symboles restent internes). `redac-gate.ts` : 2 093 → ~1 800 lignes, aucun snapshot modifié, rayon d'impact inchangé.
- Lot 2 fait : `redac-gate/echoes.ts` (avec le type `EchoContext`, propre aux redites, au lieu de `scoring.ts`), `slop-signals.ts`, et `carousel-analysis.ts` amorcé avec `slideTexts` / `slideBody` (les mesures de style en ont besoin ; sans ça, `slop-signals` importerait `redac-gate.ts`). `redac-gate.ts` → ~1 340 lignes, aucun snapshot modifié.
- Lot 3 fait : `redac-gate/scoring.ts` (types `RedacAnalysis`, `TextRedacAnalysis` et formules ; casse le cycle `textRedacRawCount`), `research-numbers.ts` (avec `emptiedMarkers`, `enforceResearchNumberCap`), `testimony.ts`. Les constantes `*_FIX` y sont exportées en attendant le lot 4. `redac-gate.ts` → ~800 lignes, aucun snapshot modifié.
- Lot 4 fait : `redac-gate/carousel-analysis.ts` complété (`analyzeCarouselRedac`, `buildQualityCheck`, `rescoreCaptionOnly`, `emptyAnalysis`, hashtags, chute de légende), `fix-instructions.ts` (`buildFixInstructions`, `buildTextFixInstructions` et les 3 constantes `*_FIX`). `redac-gate.ts` → ~540 lignes, consignes identiques au snapshot.
- Lot 5 fait : `redac-gate/carousel-gate.ts` (`protectOrderPrefixes`, `applyGuardedCarouselCorrection`, `runRedacGate`), `text-gate.ts` (`analyzeTextRedac`, `runTextRedacGate`). **Fiche 7 terminée** : `redac-gate.ts` 2 093 → 35 lignes (sommaire de réexports nommés, 43 valeurs + 8 types), aucun snapshot modifié sur l'ensemble des lots.

---

### 8. `src/components/creer/CarouselEditor.tsx` — 3816 lignes

Découpage validé par Laetitia le 14/10/2026 et fait le jour même (lot E3,
PR #1495, #1498, #1500, #1507, #1512, #1517, #1518) : 3 816 → 1 155 lignes. Les tests qui le
protègent : `src/test/carousel-editor-*.test.tsx` (lot E2, plus
`carousel-editor-wiring.test.tsx` du lot E3-0) et les autres
`src/test/carousel-*.test.tsx` qui montent l'éditeur. Ils doivent passer sans
être retouchés.

**Ce qu'il mélange** (lignes au 14/10/2026, commit `ff1ebdc5`) :

| Lignes | Mission |
|---|---|
| 1-280 | Outils de calcul sur la slide (élément sous le pointeur, repères, verrou), liste des raccourcis |
| 282-368 | Petites briques : section repliable, miniature, forme du cadre photo |
| 370-1722 | `SlideCanvas`, l'aperçu : réactions souris / clavier dans l'iframe (`bind`, ~700 lignes), poignées, barre d'outils flottante, dessins par-dessus l'aperçu |
| 1724-1862 | Le cœur : document, historique, `emit`, écho (`inputKey`) |
| 1863-2394 | Les actions (copier / coller, raccourcis, grouper, styles, thèmes, polices) |
| 2395-2793 | En-tête, encadré « Contrôle qualité » (portail), miniatures, colonne de l'aperçu |
| 2794-3745 | Panneau de réglages : calques, onglets, texte, photo, bloc, slide, carrousel, « Toutes les slides », « Mes styles » |
| 3747-3816 | Légende, vérificateur, fenêtres Instagram et photo |

**Découpage** : dossier `src/components/creer/CarouselEditorParts/`. Le nom
commence par `CarouselEditor` exprès : le test du contrat `data-*`
(`carousel-dom-contract.test.ts`) et le rapport d'impact
(`scripts/impact-creation.mjs`) ne regardent que les chemins
`src/components/creer/CarouselEditor…`. Un dossier `carousel-editor/` leur
échapperait.

| PR | Contenu |
|---|---|
| E3-0 | Tests de branchement seuls |
| E3-1 | `canvas-geometry.ts` (outils de calcul), `PanelBits.tsx` (petites briques) |
| E3-2 | `CanvasToolbar.tsx` (barre flottante) |
| E3-3 | `SlideCanvas.tsx` + `canvas-events.ts` (l'aperçu fait 1 350 lignes : au-delà des 800 du cliquet, il part en deux) |
| E3-4 | `LayersPanel.tsx` (calques et sélection multiple), `SlideSettings.tsx` (onglets Slide et Carrousel), `panel-controls.tsx` |
| E3-5 | `TextSettings.tsx`, `ElementSettings.tsx` (`PhotoSettings`, `BlockSettings`) |
| E3-6 | `EditorHeader.tsx`, `QualityPanel.tsx`, `SlideStrip.tsx`, `AllSlidesPanel.tsx` |

**Ne bouge pas** : le cœur (document, historique, `emit`, écho). C'est là
qu'est née la boucle infinie corrigée par `ec445582`.

**Règles du déplacement** :
- l'état tapé mais pas encore validé (nom d'un style, recherche de police)
  reste dans `CarouselEditor` : déplacé dans un panneau qui disparaît, il
  serait perdu en changeant d'onglet ;
- la barre flottante et les réactions de l'aperçu lisent `latest.current`
  (les actions du dernier rendu), jamais une copie ;
- la variable `document` de l'éditeur est le carrousel, pas la page :
  `tsc` attrape toute confusion dans un fichier déplacé ;
- pas de retouche de l'éditeur par Lovable pendant le lot ;
- après chaque PR : `node scripts/cliquet-dette.mjs --update` dans la même PR.

---

### 9. `supabase/functions/_shared/correction-pass.ts` — 1 234 lignes

**En une phrase :** ce fichier contient les relectures par l'IA, une par format (LinkedIn, carrousel, newsletter, légende Instagram, reel, stories). Chaque relecture a son long prompt et sa façon d'extraire le texte, de le corriger puis de le remettre à sa place. S'y ajoutent trois petites passes factuelles (source des chiffres de recherche, témoignages inventés, chiffres de recherche en trop) que `redac-gate` déclenche.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Réglages et choix du modèle | 7-46 (`CorrectionFormat`, `CorrectionOptions`), 48-55 (`unwrapCorrectionOutput`), 57-62 (`correctionModel`), 64-74 (`sourceFirstCorrectionPrompt`) | Retire l'emballage de la réponse ; passe au modèle « content » et au prompt « fidélité aux sources » dès qu'une source est fournie |
| Texte de la newsletter : sortie et retour | 76-93 (`extractNewsletterTexts`, `reinjectNewsletterTexts`) | Champs balisés `[NEWSLETTER …]` ; un marqueur perdu ou déplacé → le brouillon est gardé |
| Faut-il relire le carrousel ? | 95-213 (`CONSEIL_NUM_RE`, `CTA_GENERIC_RE`, `SLOGAN_PATTERNS`, `carouselNeedsPolish`) | Repérage sans IA : saute la relecture d'un carrousel déjà propre |
| Prompts de relecture par format | 215-500 (`CORRECTION_PROMPTS` : linkedin 223-292, carousel 294-349, newsletter 351-387, instagram_caption 389-419, reel 421-471, stories 473-499) | ~280 lignes de consignes ; le prompt `carousel` n'a **aucun appelant trouvé** (à confirmer, ne pas supprimer pendant le découpage) |
| Prompt du carrousel balisé | 502-581 (`CAROUSEL_CORRECTION_PROMPT`, non exporté) | Relecture slide par slide de l'ancien chemin |
| Texte du carrousel : sortie et retour | 583-632 (`extractCarouselTexts`), 634-646 (`keepUnlessRealEdit`), 648-726 (`reinjectCarouselTexts`) | Blocs `[SLIDE N - BODY]` ; refuse une « correction » qui ne change que des espaces |
| Relecture texte générique | 728-792 (`applyCorrectionPass`) | Un appel Claude, puis une garde de structure (`keepStructureOrRevert`) qui annule la correction si une liste ou des paragraphes disparaissent |
| Relecture du carrousel | 794-927 (`applyCorrectionPassCarousel`) : relecture éditoriale « sémantique » 827-881 (modèle de `carousel-model`, rapport `editorial_review`) **ou** ancien bloc balisé 882-926 | Deux mécanismes très différents dans une même fonction |
| Stories : sortie, retour et relecture | 929-935 (commentaire **mal placé** : il décrit la relecture du reel), 936-1008 (`extractStoriesTexts`, `storiesAuditableText`, `reinjectStoriesTexts`), 1010-1054 (`applyCorrectionPassStories`) | Texte et petit titre de chaque story |
| Relecture du reel | 1056-1103 (`applyCorrectionPassReel`) | Importe `./reel-postprocess.ts` **dynamiquement** (ligne 1068), et ce module importe `redac-gate.ts` |
| Passes factuelles dédiées | 1105-1126 (`RESEARCH_SOURCING_PROMPT`, `TESTIMONY_REMOVAL_PROMPT`), 1128-1188 (`applyTestimonyRemovalPass`, `applyResearchSourcingPass`), 1190-1234 (`RESEARCH_EXCESS_PROMPT`, `applyResearchExcessPass`) | Haiku à température 0, avec des bornes de longueur (0,6-1,2 ; 0,7-1,3 ; 0,5-1,1) et une garde de structure |

**Découpage proposé** (`_shared/correction-pass/*.ts` ; `correction-pass.ts` réexporte par leur nom les 25 exports actuels)

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `correction-pass/options.ts` | lignes 7-74 | `../content-clarity.ts`, `../anthropic.ts` (zone rouge, simple import) |
| `correction-pass/prompts.ts` | `CORRECTION_PROMPTS`, `CAROUSEL_CORRECTION_PROMPT` (215-581) | Texte pur, sans dépendance. `CAROUSEL_CORRECTION_PROMPT` devient exporté du sous-module seulement |
| `correction-pass/fields.ts` | newsletter (76-93), `keepUnlessRealEdit`, `extract/reinjectCarouselTexts`, `extractStoriesTexts`, `storiesAuditableText`, `STORY_TITLE_MAX_WORDS`, `reinjectStoriesTexts` | Pur, sans IA. Ce sont les fonctions les plus réutilisées (`carousel-ai`, `creative-flow/formats/{carousel,newsletter,stories}`, `redac-gate`) |
| `correction-pass/polish-scan.ts` | lignes 95-213 | Pur |
| `correction-pass/passes.ts` | `applyCorrectionPass`, `applyCorrectionPassCarousel`, `applyCorrectionPassStories`, `applyCorrectionPassReel` | `../carousel-model.ts`, `../carousel-editorial-review.ts`, `../text-structure-guard.ts`. L'import dynamique devient `import("../reel-postprocess.ts")`. Le commentaire des lignes 929-935 se recolle au-dessus de `applyCorrectionPassReel` (commentaire seulement) |
| `correction-pass/factual-passes.ts` | lignes 1105-1234 | `options` (`unwrapCorrectionOutput`), `../text-structure-guard.ts` |

Rayon d'impact (`node scripts/carte-impact.mjs correction-pass`) : **9 fonctions**, les mêmes que `redac-gate`.
- Importeurs directs :
  - `creative-flow/index.ts` et `formats/{stories,carousel,recycle,newsletter,reel}.ts` ;
  - `carousel-ai/index.ts` ;
  - `_shared/redac-gate.ts` et `_shared/audience-address-pass.ts`.
- Lot optionnel après découpage : faire importer `correction-pass/options.ts` (pour `unwrapCorrectionOutput`) directement par `audience-address-pass.ts`. Ce changement d'**un** import devrait sortir `pinterest-ai`, `pinterest-photo-brief` et `pinterest-visual` du rayon de `correction-pass` **et** de `redac-gate`. C'est la seule réduction réelle du rayon dans ces trois fiches ; elle reste à mesurer avec `carte-impact.mjs` avant et après, et se fait en PR à part.

**Tests qui le protègent aujourd'hui**
- `correction-pass_test.ts` (17) :
  - source transmise à la relecture newsletter ;
  - `keepUnlessRealEdit` ;
  - stories, extraction et réinjection (titre trop long, pastilles jamais réécrites) ;
  - newsletter (marqueurs perdus ou désordonnés, emballage Markdown) ;
  - `sourceFirstCorrectionPrompt`, `correctionModel`, `unwrapCorrectionOutput`.
- `correction-pass-scan_test.ts` (9) : `carouselNeedsPolish`.
- `text-structure-guard_test.ts` : `applyCorrectionPass`, qui rejette une correction cassant une liste, pour chaque format.
- Prompts : seulement des vérifications de morceaux de phrase.
  - `linkedin-position_test.ts` : prompt LinkedIn ;
  - `socle_test.ts` (ligne 349) : « 9. STYLE HACHÉ » des stories ;
  - `redac-gate_test.ts` (ligne 705) : `RESEARCH_SOURCING_PROMPT` ;
  - `redac-gate-carousel-vecu_test.ts` : `TESTIMONY_REMOVAL_PROMPT`.
- Carrousel :
  - `carousel-correction-regression_test.ts` et `carousel-editorial-review_test.ts` couvrent `applyCorrectionPassCarousel`, y compris la relecture sémantique ;
  - `carousel-progression_test.ts` couvre le budget de contexte (`context-budget`) ;
  - `redac-gate-lived-case_test.ts` et `hook-echoes-before_test.ts` couvrent `extract/reinjectCarouselTexts`.
- Snapshot indirect : `creative-flow/__snapshots__/handler_contract_test.ts.snap` contient le prompt LinkedIn, le prompt « fidélité aux sources » et une passe « correctrice factuelle ». Les prompts newsletter, légende Instagram, reel, stories et les deux prompts carrousel n'apparaissent dans **aucun** snapshot. C'est le trou n°1 listé en CARTE.md, section 5.
- Sans test direct trouvé : `applyCorrectionPassReel`, `applyCorrectionPassStories`, `applyResearchExcessPass`, `applyResearchSourcingPass`, `applyTestimonyRemovalPass` (bornes de longueur, repli sur l'original).

**Tests à ajouter AVANT de découper**
1. `correction-pass-prompts_snapshot_test.ts` (`assertSnapshot`) :
   - les 6 entrées de `CORRECTION_PROMPTS` ;
   - `sourceFirstCorrectionPrompt` avec et sans source, pour chaque format ;
   - les 3 prompts factuels.

   Cela ferme le trou n°1 de la carte.
2. `correction-pass-calls_snapshot_test.ts` avec `installFetchMock`. On fige la requête envoyée (modèle, système, messages, température, max_tokens) et le texte renvoyé pour :
   - `applyCorrectionPass` (avec et sans `extraInstructions`, avec et sans source) ;
   - `applyCorrectionPassCarousel`, chemin balisé (c'est le seul moyen de figer `CAROUSEL_CORRECTION_PROMPT`) ;
   - `applyCorrectionPassStories` ;
   - `applyCorrectionPassReel` (ce qui vérifie aussi que l'import dynamique se charge) ;
   - les 3 passes factuelles.
3. Replis : réponse trop courte, sans marqueur `[STORY 1 - ` ou `[SECTION 1`, ou hors des bornes de longueur → l'original est rendu.
4. `reinjectCarouselTexts` en direct : repli `title` / `hook` / `accroche`, légende objet ou chaîne, `instagram_caption`, hashtags jamais touchés.
5. Surface d'export : `Object.keys(await import("./correction-pass.ts"))`, 23 valeurs exportées.

**Risque et ordre conseillé**
- **Niveau : moyen à élevé.** La structure est simple (des prompts, de l'extraction et de la réinjection, des appels), mais :
  - 9 fonctions sont touchées ;
  - 42 commits en 90 jours, dont 12 corrections (le plus fort taux des trois) ;
  - ~360 lignes de prompts ne sont figées par aucun snapshot ;
  - le chemin relatif d'un import dynamique est facile à oublier.
- Ordre :
  - **Lot 0** (tests seuls) : points 1 à 5.
  - **Lot 1** : `prompts.ts` (les nouveaux snapshots ne doivent pas bouger).
  - **Lot 2** : `options.ts` + `fields.ts` + `polish-scan.ts`.
  - **Lot 3** : `factual-passes.ts`.
  - **Lot 4** : `passes.ts`.
  - **Lot 5** (optionnel, mesuré) : l'import direct dans `audience-address-pass.ts`.

**Avancement (14/10/2026)** : lot 0 fait. `_shared/correction-pass-prompts_snapshot_test.ts` (points 1 et 5 : 16 snapshots de prompts, liste des 23 exports), `correction-pass-calls_snapshot_test.ts` (points 2 et 3 : 16 requêtes figées avec Claude simulé, replis sur l'original), `correction-pass-reinject_test.ts` (point 4). Lot 1 fait : `correction-pass/prompts.ts` (`CORRECTION_PROMPTS`, `CAROUSEL_CORRECTION_PROMPT` exporté du sous-module seulement), réexport par le nom dans `correction-pass.ts` (1 234 → 871 lignes) ; `carousel-design-boundaries_test.ts` et `design-text-boundaries_test.ts` rangent un sous-module de `_shared` avec son module d'origine (sinon `correction-pass/prompts` n'était « rangé nulle part ») ; rayon inchangé (9 fonctions). Lot 2 fait : `options.ts` (types, `unwrapCorrectionOutput`, `correctionModel`, `sourceFirstCorrectionPrompt`), `fields.ts` (newsletter, carrousel, stories : extraction et réinjection), `polish-scan.ts` (`carouselNeedsPolish`) ; `prompts.ts` prend son type dans `options.ts` ; 871 → 465 lignes. Lot 3 fait : `factual-passes.ts` (3 prompts et 3 passes factuelles) ; 464 → 342 lignes. Lot 4 fait : `passes.ts` (`applyCorrectionPass`, `…Carousel`, `…Stories`, `…Reel`), import dynamique devenu `import("../reel-postprocess.ts")`, commentaire du reel recollé au-dessus de sa fonction ; `correction-pass.ts` n'est plus qu'un sommaire de 39 lignes (1 234 au départ). Lot 5 fait (mesuré avec `carte-impact.mjs` avant / après) : `audience-address-pass.ts` importe `unwrapCorrectionOutput` depuis `correction-pass/options.ts`. `pinterest-ai`, `pinterest-photo-brief` et `pinterest-visual` sortent du rayon de `redac-gate`, `correction-pass`, `carousel-model`, `reel-postprocess` (9 → 6) et de `carousel-editorial-review` / `-contract` (10 → 7). **Fiche 9 terminée.**

**Ordre global conseillé**
1. La correction de la zone orange dans `scripts/impact-creation.mjs` (valable pour les fiches 2 et 3).
2. `correction-pass` (fiche 3) : c'est le plus petit, et `redac-gate` en dépend.
3. `redac-gate` (fiche 2).
4. `carousel-visual` (fiche 1), une fois fusionné le chantier en cours sur le contrat `data-*`.

Après chaque lot, lancer `npm run test:edges`, `npm test` (contrat `data-*`, impact) et `node scripts/carte-impact.mjs redac-gate correction-pass` : le rayon doit rester identique, sauf au lot optionnel.

---

### 10. `supabase/functions/_shared/format-briefs.ts` — 1273 lignes

**En une phrase :** c'est le cahier des consignes de rédaction : un long texte par format (carrousel, reel, stories, LinkedIn, Pinterest, newsletter, légende photo, post Instagram), plus le bloc « prise de position ». Le reel (~490 lignes) et les stories (~400 lignes) en font les trois quarts, et une retouche de l'un oblige à ouvrir le fichier de tous les autres.

Vérification `node scripts/carte-impact.mjs format-briefs` → `format-briefs (1) : creative-flow`. Seule fonction serveur qui l'importe : `creative-flow/index.ts` (ligne 21). Il est aussi importé par 8 fichiers de test (`_shared/socle_test.ts`, `multi-subject_test.ts`, `story-formatting_test.ts`, `audience-address-fields_test.ts`, `linkedin-position_test.ts`, `redac-gate-testimony_test.ts`, `redac-gate-sauf-que_test.ts`, `carousel-ai/lived-case-prompt_test.ts` pour `positionDepthBlock`) et lu comme du **texte** par `angle-families_test.ts`.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Socle commun | 1-31 (imports, `annoncedItems`) | Importe les règles du socle (`socle.ts`), `carousel-length`, `multi-subject`, `lived-case`. `annoncedItems` (« 5 erreurs » → 5) sert au reel ET aux stories. |
| Carrousel | 33-88 (`carouselBrief`) | Consigne du carrousel côté creative-flow (chemin peu ou pas utilisé, voir fiche 1). |
| Reel | 90-594 (`ReelBriefParams`, `reelBrief`) | Consigne du script : 3 couches, oralité, densité de mots, exemple avant/après (l. 113-313), calibrage par objectif (315-359), éléments perso (361-384), hook choisi (386-415), sujet, inspiration, angle imposé, numérotation, récap (417-451), structure + contrainte « pas de face cam » (453-479), JSON de sortie complet avec `plan_tournage` (481-591). |
| Stories : adresse tu / vous | 596-636 (`StoriesBriefParams`, `storiesAddressLines`) | Les phrases d'adresse : mot pour mot l'historique sans réglage, alignées sur la fiche de marque sinon. |
| Stories : séquences de vente | 638-676 (`getStoriesVenteInstructions`) | 5 trames par gamme de prix (petit, moyen, premium, physique, gratuit). |
| Stories : consigne complète | 678-996 (`storiesBrief`) | Éléments perso, hook story 1 (3 variantes selon temps et face cam), structures, 6 angles de narration, fil narratif, bibliothèque photos (l. 900-920), garde-fous, JSON de sortie. |
| LinkedIn | 998-1030 (`linkedinBrief`) | Position, interdiction des témoignages inventés, gabarit éditorial choisi (`LINKEDIN_TEMPLATES`). |
| Pinterest | 1032-1075 (`pinterestBrief`) | Titre et description SEO, lien et tableau. |
| Newsletter | 1077-1136 (`newsletterBrief`) | Objet, intro, corps, conclusion, texte brut. |
| Prise de position (transverse) | 1138-1158 (`positionDepthBlock`) | Bloc ajouté au post, au reel et aux stories par `buildGeneratePrompt` ; variantes « mon cas » et « actu + ressenti ». |
| Légende photo | 1160-1209 (`photoCaptionBrief`) | Le hors-champ de la photo. |
| Post Instagram | 1211-1273 (`captionBrief`) | Longueur selon l'objectif (visibilité, confiance, vente, défaut). |

**Découpage proposé** : un dossier `_shared/format-briefs/`, un fichier par format. `_shared/format-briefs.ts` reste et devient un simple sommaire qui réexporte tout (`export * from "./format-briefs/reel.ts";` …). Aucun import à changer, ni dans `creative-flow/index.ts`, ni dans les 8 tests.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `_shared/format-briefs/common.ts` | `annoncedItems` (à exporter) | Importe `carousel-length.ts`. Seul fichier que les briefs ont le droit d'importer entre eux. |
| `_shared/format-briefs/carousel.ts` | `carouselBrief` | Aucune dépendance. |
| `_shared/format-briefs/reel.ts` | `ReelBriefParams`, `reelBrief` | Importe `socle.ts` (zone rouge, en lecture seule), `multi-subject.ts` (`recapReelBlock`), `common.ts`. **Piège :** `angle-families_test.ts` lit `format-briefs.ts` entre `"CHOIX DE STRUCTURE"` et `"Ne choisis PAS"` (`reel_structures`) : le faire lire `format-briefs/reel.ts`. |
| `_shared/format-briefs/stories.ts` | `StoriesBriefParams`, `storiesAddressLines`, `getStoriesVenteInstructions`, `storiesBrief` | Importe `socle.ts`, `multi-subject.ts` (`recapStoriesBlock`), `audience-address.ts` (type), `common.ts`. **Piège :** `angle-families_test.ts` y lit 3 listes (`const structuresBlock` → `return \`FORMAT : SÉQUENCE STORIES`, `"narrative_angle"`, lignes `SÉQUENCE …`) : le faire lire `format-briefs/stories.ts`. Garder `getStoriesVenteInstructions` non exporté hors du dossier. |
| `_shared/format-briefs/linkedin.ts` | `linkedinBrief` | Importe `LINKEDIN_STORYTELLING_RULES`, `LINKEDIN_TEMPLATES` (`copywriting-prompts.ts`, zone rouge) et `VOIX_ORALE_LINKEDIN`. |
| `_shared/format-briefs/pinterest.ts` | `pinterestBrief` | Aucune dépendance (Pinterest reste volontairement hors voix orale : `socle_test.ts` le vérifie). |
| `_shared/format-briefs/newsletter.ts` | `newsletterBrief` | `VOIX_ORALE`. |
| `_shared/format-briefs/caption.ts` | `captionBrief` | `VOIX_ORALE`. |
| `_shared/format-briefs/photo-caption.ts` | `photoCaptionBrief` | `VOIX_ORALE_LEGENDE_PHOTO`. |
| `_shared/format-briefs/position.ts` | `positionDepthBlock` | `LIVED_CASE_FIRST`, `NEWS_FEELING_FIRST`, type `CaseMode` (`lived-case.ts`). Transverse (post, reel, stories) : c'est `buildGeneratePrompt` qui l'ajoute, **aucun brief ne doit l'importer**. Il est aussi testé depuis `carousel-ai/lived-case-prompt_test.ts`. |
| `_shared/format-briefs.ts` (sommaire) | `export *` de chaque fichier ; garder l'en-tête « Extracted verbatim… » | Doit rester un fichier : `SOCLE_CHEMINS` (`socle.ts` l. 664-682) et les `origines` des règles le citent, et `socle_test.ts` vérifie que le fichier existe. Mettre à jour ces chemins vers le fichier du format pour que la carte du socle reste juste. |

Frontières : `boundaries_test.ts` ne couvre que `creative-flow/formats/`. **Il faut l'étendre** (ou ajouter `_shared/format-briefs/boundaries_test.ts`) : un brief n'importe aucun autre brief, sauf `common.ts`. Outils : `scripts/carte-impact.mjs` gère déjà les sous-dossiers de `_shared` (il le fait pour `_shared/ideas/`) et sortira `format-briefs/reel (1) : creative-flow` ; `scripts/impact-creation.mjs` classera ces fichiers en zone verte sans modification. Bonus à prévoir dans `impact-creation.mjs` : une table `format-briefs/<format>` → libellé du format, pour qu'une retouche du brief reel annonce « Reel » et non « tous les formats de creative-flow ». Mettre à jour CARTE.md (sections 3 et 4).

Option écartée : ranger chaque brief dans `creative-flow/formats/<format>.ts`. Cela respecterait « un format = un fichier », mais les tests de `_shared/` (socle, multi-subject, story-formatting…) devraient importer `creative-flow/index.ts`, qui lance `serve()` à l'import. Le dossier `_shared/format-briefs/` + sommaire est plus sûr.

**Tests qui le protègent aujourd'hui**

- Indirectement, les snapshots de `creative-flow` (`prompts_snapshot_test.ts`, `prompts_snapshot_formats_test.ts`, `handler_contract_test.ts`) : chaque brief y apparaît au moins une fois (carrousel, reel nurture, stories vente premium avec photos choisies, stories confiance, LinkedIn avec gabarit, Pinterest avec lien, newsletter, légende photo, post objectif confiance).
- `_shared/socle_test.ts` : les règles du socle bien recopiées dans `storiesBrief`, `reelBrief` (angle imposé, visibilité, numérotation), `linkedinBrief`, `newsletterBrief`, `captionBrief`, `photoCaptionBrief`, `pinterestBrief` (pas de voix orale).
- `_shared/multi-subject_test.ts` : blocs récap du reel et des stories.
- `_shared/audience-address-fields_test.ts` : `storiesAddressLines` et `storiesBrief` avec tu / vous.
- `_shared/story-formatting_test.ts` : contrat de sortie de `storiesBrief`.
- `_shared/linkedin-position_test.ts`, `redac-gate-testimony_test.ts`, `redac-gate-sauf-que_test.ts` : consignes de `linkedinBrief`.
- `carousel-ai/lived-case-prompt_test.ts` : `positionDepthBlock`.
- `_shared/angle-families_test.ts` : chaque identifiant de structure, d'angle de narration et de séquence de vente a une famille (lecture du texte).

Branches **jamais figées mot pour mot** (vérifié par grep dans les 3 `.snap`) : reel `face_cam: "non"`, reel objectif visibilité, reel avec inspiration ou angle imposé, reel numéroté ou récap ; stories vente petit / moyen / physique / gratuit, stories « 5 min », stories avec éléments perso (`vecu`, `energy`, `message_cle`), stories au « vous » ou au « tu » ; post objectif visibilité ou vente ; `positionDepthBlock` avec actu. Certaines ont des tests par morceaux (`includes`), aucune n'a de snapshot.

**Tests à ajouter AVANT de découper**

1. `_shared/format-briefs_snapshot_test.ts` : un snapshot par fonction et par branche, sans passer par `creative-flow` (donc sans `serve()`) : `carouselBrief()` ; `reelBrief` × {chaîne seule (ancienne signature), objectif visibilité, objectif vente, `face_cam: "non"`, hook partiel (seulement `text`), inspiration, angle + structure, sujet « 5 erreurs », sujet récap, éléments perso} ; `storiesBrief` × {défaut, 5 min face cam oui / non, vente × 5 gammes, éléments perso, catalogue sans / avec photos choisies, tu, vous, garde-fou rempli} ; `linkedinBrief` × {null, chaque clé de `LINKEDIN_TEMPLATES`} ; `pinterestBrief` × {rien, lien, tableau, les deux} ; `newsletterBrief()` ; `photoCaptionBrief` × {null, description} ; `captionBrief` × {null, visibilite, visibilité, confiance, vente, conversion} ; `positionDepthBlock` × 3 formats × {sans actu, actu} × {false, own_case, news_feeling}.
2. Un test « sommaire » : la liste des exports de `format-briefs.ts` est exactement `carouselBrief, reelBrief, storiesBrief, storiesAddressLines, linkedinBrief, pinterestBrief, newsletterBrief, photoCaptionBrief, captionBrief, positionDepthBlock` (+ types). Il attrape un oubli dans les `export *`.
3. Lancer `npm run test:edges` : les snapshots de creative-flow ne doivent pas bouger au découpage.

**Risque et ordre conseillé**

Niveau : **faible**. Ce sont des fonctions pures qui rendent du texte, un seul appelant serveur, et le sommaire évite de toucher aux imports. Le vrai risque est le « presque à l'identique » : un retour à la ligne ou une espace perdu dans un modèle de texte change le prompt sans que personne ne le voie. Le test 1 rend ce risque visible.

Une PR par lot :
1. **Lot T** : `_shared/format-briefs_snapshot_test.ts` + test du sommaire. Aucun code touché.
2. **Lot 1** : `common.ts`, `carousel.ts`, `pinterest.ts`, `newsletter.ts`, `caption.ts`, `photo-caption.ts`, `position.ts` (les petits) + sommaire + frontières étendues.
3. **Lot 2** : `linkedin.ts`.
4. **Lot 3** : `reel.ts` + `angle-families_test.ts` (`reel_structures`) mis à jour.
5. **Lot 4** : `stories.ts` + `angle-families_test.ts` (3 listes stories) mis à jour.
6. **Lot 5 (documentation et outils)** : CARTE.md, `SOCLE_CHEMINS` et `origines` dans `socle.ts` (zone rouge : ne changer que des chaînes de chemin), table par format dans `impact-creation.mjs`.
Ce découpage est indépendant de celui de `index.ts` (fiche 1) : on peut le faire en premier, c'est le moins risqué des deux.

**Avancement (14/10/2026)** : lot T fait (`_shared/format-briefs_snapshot_test.ts`, 104 cas + liste des exports). Lot 1 fait : `common.ts`, `carousel.ts`, `pinterest.ts`, `newsletter.ts`, `caption.ts`, `photo-caption.ts`, `position.ts` déplacés à l'identique, sommaire en `export *` (sans `common.ts`, qui reste interne), frontières dans `_shared/format-briefs/boundaries_test.ts`. `format-briefs.ts` : 1 273 → 976 lignes. Lot 2 fait : `linkedin.ts` (`linkedinBrief`, avec ses imports `copywriting-prompts.ts` et `VOIX_ORALE_LINKEDIN`) ; 976 → 941 lignes. Lot 3 fait : `reel.ts` (`ReelBriefParams`, `reelBrief`) ; `angle-families_test.ts` lit `reel_structures` dans `format-briefs/reel.ts` ; 941 → 430 lignes. Lot 4 fait : `stories.ts` (`StoriesBriefParams`, `storiesAddressLines`, `getStoriesVenteInstructions` non exporté, `storiesBrief`) ; `angle-families_test.ts` lit ses 3 listes stories dans `format-briefs/stories.ts` ; `format-briefs.ts` n'est plus qu'un sommaire de 18 lignes. Lot 5 fait : `SOCLE_CHEMINS` et `origines` de `socle.ts` pointent vers le fichier de chaque brief (chaînes de chemin et commentaires seulement) ; table `FORMAT_BRIEF_FILES` dans `impact-creation.mjs` (un fichier de brief → son format), avec un test qui exige un libellé pour chaque fichier du dossier. **Fiche 10 terminée.**

---

## 2 bis. Les fiches 11 à 18 (rédigées le 15/10/2026)

Le classement a été recalculé le 15/10/2026 (`node scripts/gros-fichiers.mjs --top 25`, 90 jours depuis le 17/07/2026) : les fichiers déjà découpés (fiches 2, 3, 4, 5, 7, 9, 10) ont chuté, et de nouveaux fichiers sont montés. Ces huit fiches couvrent les suivants, hors `src/lib/carousel-editor.ts` et `CarouselEditor.tsx` (chantiers en cours ailleurs). Le numéro de fiche suit l'ordre de rédaction, pas le rang.

| # | Fichier | Lignes | Commits | Corrections | Score | Fiche |
|---|---|---:|---:|---:|---:|---|
| 1 | `src/pages/CreerUnifie.tsx` | 2319 | 118 | 21 | 920 | 1 (en cours) |
| 2 | `supabase/functions/carousel-visual/index.ts` | 2792 | 46 | 6 | 250 | 6 |
| 3 | `supabase/functions/creative-flow/index.ts` | 440 | 83 | 28 | 155 | 3 ✅ |
| 4 | `supabase/functions/carousel-ai/index.ts` | 483 | 113 | 12 | 131 | 2 ✅ |
| 5 | `src/pages/VisualStudioPage.tsx` | 684 | 103 | 6 | 124 | 4 ✅ |
| 6 | `src/components/creer/CreerStepResult.tsx` | 1096 | 33 | 8 | 85 | **11** |
| 7 | `src/lib/carousel-editor.ts` | 1808 | 27 | 2 | 80 | — (chantier en cours) |
| 8 | `supabase/functions/deep-diagnostic/index.ts` | 1084 | 20 | 12 | 72 | **12** |
| 9 | `src/components/creer/CarouselEditor.tsx` | 1155 | 41 | 1 | 65 | 8 |
| 10 | `src/components/calendar/CalendarPostDialog.tsx` | 1062 | 22 | 9 | 65 | **13** |
| 11 | `src/components/branding/BrandingReview.tsx` | 1411 | 16 | 7 | 62 | **14** |
| 12 | `src/lib/export-carousel-hybrid-pptx.ts` | 1767 | 15 | 3 | 57 | **15** |
| 13 | `src/components/creer/ReelMontage.tsx` | 917 | 28 | 6 | 56 | **16** |
| 14 | `src/hooks/use-content-generator.ts` | 1185 | 21 | 5 | 55 | **17** |
| 15 | `supabase/functions/cron-health/index.ts` | 959 | 30 | 4 | 54 | **18** |

Les plages de lignes de chaque fiche ont été relevées le 15/10/2026 ; comme pour les fiches 1 à 10, le **repère** (nom de fonction, d'état ou de commentaire) fait foi quand les numéros bougent. Les rangs cités dans les fiches peuvent différer d'une ou deux places de ce tableau (calculs faits à quelques minutes d'écart) : c'est sans effet sur le découpage.

### 11. `src/components/creer/CreerStepResult.tsx` — 1 096 lignes

> **Mis à jour le 15/10/2026 (chantier C du plan simplicité)** : les actions d'après (blocs 15 à 19 ci-dessous : boutons, menu « Autres actions », enregistrer, repartir de zéro) sont sorties dans `src/components/creer/ResultActions.tsx` (barre collée en bas, 3 actions au plus + menu « Plus d'options ») ; le texte à copier dans `src/lib/result-copy-text.ts` ; la durée annoncée pendant l'attente dans `GenerationTimeHint.tsx`. Le fichier est passé à 777 lignes (sous le seuil de 800, sorti du cliquet). Garde-fou : `src/test/creer-resultat-actions.test.tsx`. Les plages de lignes ci-dessous datent d'avant ce changement.

**En une phrase :** c'est l'écran « résultat » de /creer pour tous les formats. Il affiche l'attente pendant la génération (texte qui s'écrit en direct, brouillon de carrousel, barre et astuces), fête l'arrivée du résultat, choisit le bon écran de format (`switch (format)`), puis affiche tous les boutons d'après : créer les visuels, publier ou programmer, le menu « Autres actions » (télécharger, copier, changer d'angle, transformer en…), enregistrer et repartir de zéro.

> Lignes vérifiées le 15/10/2026 sur `f70c0f28c` (dernier commit sur le fichier : `7b4e93239`, 08/10/2026, « Carrousels photo et mixte : plan et brouillons pendant l'attente »). Les numéros bougent à chaque modification : le **repère** (nom de fonction, d'état ou de commentaire) est la référence fiable.
> Mesures : `git log --since=2026-07-17 --oneline -- src/components/creer/CreerStepResult.tsx` → 33 commits, dont 8 corrections (`fix`, `corrig`…). Référence du cliquet : 1 096 lignes, 10 `any` (`scripts/cliquet-dette.baseline.json`).

Repères de structure :
- Un seul composant exporté, `CreerStepResult` (export par défaut). **Aucun autre export.** L'interface `Props` (non exportée) compte **64 props**.
- Deux parents : `src/pages/CreerUnifie.tsx` (le bloc `<CreerStepResult …>`, ~60 props) et `src/components/creer/LaunchSequenceResults.tsx` (un résultat par chapitre de la séquence de lancement, 12 props). Les deux le chargent en différé (`lazy(() => import("@/components/creer/CreerStepResult"))`).
- 8 fichiers de test de CreerUnifie le **remplacent par un faux** avec `vi.mock('@/components/creer/CreerStepResult', () => ({ default: … }))` : le chemin et l'export par défaut ne doivent pas bouger.
- Fichier 100 % affichage : aucun appel serveur, aucune IA, aucun quota. Tout ce qui agit (générer, publier, exporter, enregistrer) arrive par des props `on…` venues du parent.
- `docs/creation-contenu/CARTE.md` (l. 69) le présente comme « le point d'aiguillage naturel par format ».

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Nettoyage du texte en direct | 27-53 (`cleanStreamingContent`) | L'IA envoie du JSON entouré de « ```json » : on en extrait le champ `content` au fil de l'eau (retours à la ligne, guillemets). Rend `""` tant que seul un `{` est arrivé (on garde alors le squelette). Fonction pure. |
| 2. Bouton « Ouvrir dans Canva » des stories | 54-79 (`CanvaHeroButton`) | Gros bouton avec le logo Canva dessiné en SVG, état « Ouverture… ». |
| 3. Textes d'attente et de fête | 81-184 (`PROGRESS_MESSAGES`, `VISUAL_PROGRESS_MESSAGES`, `FORMAT_DONE_LABELS`, `TIPS_GENERIC`, `TIPS_BY_FORMAT`, `getTipsForFormat`) | Messages qui tournent pendant la rédaction (par format) et pendant la création des visuels ; phrase « Ton script de reel est prêt »… ; astuces (générales + par format). |
| 4. Squelette d'attente | 186-225 (`SkeletonPreview`) | Formes grises animées : 4 slides (carrousel), un écran vertical (reel), 3 stories, sinon des lignes de texte. |
| 5. Cibles « Transformer en… » | 226-237 (`TRANSFORM_TARGETS`) | Les 8 formats proposés, avec emoji et libellé. |
| 6. Contrat avec le parent | 239-398 (`interface Props`, déstructuration) | Les 64 props, dont les commentaires qui expliquent le pourquoi (`reelMp4Url`, `visualsAutoError`, `visualChunkProgress`, `onCarouselStaleChange`, `onAddPhoto`…). |
| 7. Minuteries d'attente (rédaction) | 399-407, 435-463 | `messageIndex`, `tipIndex` (départ au hasard), `progress`, `startTimeRef` ; barre qui monte vite puis ralentit vers 85 %. |
| 8. Minuteries d'attente (visuels) | 405-406, 465-489 | `visualProgressIndex`, `visualProgress` ; barre calée sur la durée réelle (`tau` 22 s en Qualité Max, 11 s sinon), plafond 92 %. |
| 9. Signaux remontés par les écrans de format | 408-424 | `storyActions` (exports des stories, remontés par `StoryResult`), `reelStep` (étape du parcours reel, remontée par `ReelResult`, **fail-open** : `null` = bouton Publier affiché), `carouselToolsSlot` (emplacement où l'éditeur de carrousel envoie ses encadrés par portail). |
| 10. Fête à l'arrivée du résultat | 427-433, 491-504, 704-714 | `prevGenerating`, `showCelebration` : confettis + « … est prêt ✨ » **seulement** sur le passage génération → résultat (pas après un rechargement), et pas si le visuel Pinterest manque (`pinterestVisualMissing`). `includeLogo` / `handleIncludeLogoChange` (préférence logo des téléchargements) vivent aussi ici (432-433). |
| 11. Écran d'attente de la rédaction | 506-585 (`if (generating)`) | Texte en direct (`streamingContent` + mission 1), brouillon de carrousel (`CarouselDraftPreview`, « Étape 2 / 2 · Rédaction » si `step2of2`), sinon squelette + message + barre ; « Relecture finale… » et barre à 65 % mini quand `generationStage === "correcting"` ; message Qualité Max à la place des astuces. Puis `if (!result) return null` (587). |
| 12. Aiguillage par format | 589-627 (`renderResult`) | Carrousel avec visuels → `CarouselEditorConnected` (grisé dans un `fieldset` pendant une régénération) ; carrousel photo / mixte avec photos ou `photo_directive` → `CarouselPhotoResult` ; puis `switch (format)` : carrousel, reel, story, post, linkedin, newsletter, pinterest_photo, pinterest_visual, défaut = `PostResult`. |
| 13. « Copier le texte » selon le format | 629-700 (`copyOut`, `handleCopyText`) | Newsletter (`newsletterCopyText`), texte retouché (`edited_text`, sauf reel), brief photo Pinterest, reel **selon l'étape affichée** (légende, plan de tournage, sinon script), épingle, stories (une par bloc, avec sticker), sinon `full_text` / `content` / hook + corps + CTA, en dernier recours le JSON. Tout passe par `copyTextForChannel` (LinkedIn sans markdown). |
| 14. Bandeaux autour du résultat | 716-768 | Badge « Généré à partir de ta photo / tes N photos » (`usedPhotoCount`) ; bouton « Éditer le texte » (hors carrousel) ; astuce « pose tes couleurs de marque » (carrousel sans charte, lien /branding) ; « Continuer dans Canva (optionnel) » (carrousel avec visuels) ; `CanvaHeroButton` (stories). |
| 15. Création des visuels du carrousel | 770-840 | Pendant `visualLoading` : faux slides, message (vrais lots « 2/4 lots prêts » si `visualChunkProgress`, sinon messages tournants), barre, attente annoncée (50 s / 20 s). Sinon : erreur des essais auto (`data-testid="visuals-auto-error"`) + bouton « Créer les visuels » / « Réessayer les visuels ». |
| 16. Newsletter : copier | 842-849 | Bouton « Copier ma newsletter » (`data-testid="copy-newsletter"`) + « Aucun email n'est envoyé depuis cet écran ». |
| 17. Publier ou programmer | 851-871 | Bouton `data-testid="publish-or-schedule"`. Reel : caché tant que `reelStep?.isLast === false` (écrit `!== false` exprès). Style « contour » si un autre bouton est prioritaire ; libellé « Ajouter au calendrier » pour la newsletter ou si `canAutoPublish === false`. |
| 18. Menu « Autres actions » | 873-1060 | Télécharger (carrousel avec visuels : `DownloadMenuItems` PNG / PDF / PPTX + logo ; sans visuels : PPTX ; stories ; Pinterest visuel ; Pinterest photo) ; « Copier le texte » ; Regénérer les visuels ; « Nouvelle proposition » (carrousel) ; « Changer d'angle » (974-1016, liste d'angles selon `currentChannel`) ; « Transformer en » (1017-1051 : `window.open('/creer?sujet=…&format=…&from=transform')`) ; « Nouveau contenu ». |
| 19. Enregistrer / repartir de zéro | 1062-1093 | `saveNotice` ; « Enregistrer mon contenu » (`data-testid="save-as-idea"`) ; « Créer un nouveau contenu » ; `<div ref={setCarouselToolsSlot} data-testid="carousel-tools-slot" />` en tout dernier (cible du portail de la mission 9). |

**Découpage proposé** : un sous-dossier `src/components/creer/result/` pour l'affichage (précédent : `src/components/creer/CarouselEditorParts/`), et `src/features/creer/` pour les deux fonctions pures (déjà le rangement des lots de CreerUnifie). `CreerStepResult.tsx` **reste au même chemin, avec son export par défaut et ses 64 props inchangées** : il garde les états partagés, la fête, le bouton Publier et l'assemblage. Taille visée : ~400 lignes.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/creer/clean-streaming-content.ts` | `cleanStreamingContent` (27-53), à exporter | Aucune dépendance. Les expressions régulières se recopient caractère pour caractère (un `\\` perdu casse l'affichage en direct sans erreur). |
| `src/features/creer/result-copy-text.ts` | Le corps de `handleCopyText` (637-700) devient `resultCopyText(format, result, reelStepKey)`, qui **rend** le texte au lieu d'appeler `copyOut`. Dans le composant : `const handleCopyText = () => copyOut(resultCopyText(format, result, reelStep?.key));` | Seule retouche du corps permise : remplacer chaque `copyOut(x); return;` par `return x;`. **Piège :** garder l'ordre des tests et les deux « on continue si vide » (reel à l'étape légende sans légende → script ; stories sans texte → repli général). Importe `newsletterCopyText`. `copyTextForChannel` reste dans le composant (`copyOut`). |
| `src/components/creer/result/result-texts.ts` | `PROGRESS_MESSAGES`, `VISUAL_PROGRESS_MESSAGES`, `FORMAT_DONE_LABELS`, `TIPS_GENERIC`, `TIPS_BY_FORMAT`, `getTipsForFormat`, `TRANSFORM_TARGETS` (81-184, 226-237) | Que des constantes. Les clés de format (`pinterest_visual`, `story`…) doivent rester celles de CreerUnifie (`paramFormat`). |
| `src/components/creer/result/CanvaHeroButton.tsx` | `CanvaHeroButton` (54-79) | L'`id="canvaHeroG"` du dégradé SVG ne doit pas changer (un seul bouton par écran). |
| `src/components/creer/result/GenerationWaitScreen.tsx` | `SkeletonPreview` (186-225), les états et la minuterie de la mission 7 (402-404, 407, 435-463), le bloc `if (generating) { … }` (506-585) | Le parent fait `if (generating) return <GenerationWaitScreen … />;` **après tous ses hooks** (règle des hooks React : pas de retour anticipé avant un `useState` / `useEffect`). Props : `format`, `streamingContent`, `draftSlides`, `outlineTitles`, `step2of2`, `qualityMax`, `generationStage`, `photos`. **La fête (`prevGenerating`) reste dans le parent** : elle doit voir le passage `true → false`, que l'écran d'attente, démonté à ce moment-là, ne voit pas. Différence admise : les minuteries repartent de zéro à chaque montage, ce qui est déjà le cas aujourd'hui (remise à zéro quand `generating` passe à `false`). |
| `src/components/creer/result/VisualsProgressPanel.tsx` | États et minuterie de la mission 8 (405-406, 465-489) + le bloc d'attente des visuels (776-817) | Props : `qualityMax`, `visualChunkProgress`. **Piège :** aujourd'hui la minuterie tourne dès que `visualLoading` est vrai, même si le panneau n'est pas affiché (régénération avec visuels déjà là). Une fois déplacée, elle ne démarre qu'à l'affichage du panneau : sans effet visible, mais à noter dans la PR. Le bouton « Créer les visuels » et `visuals-auto-error` (819-837) peuvent rester dans le parent ou suivre dans ce fichier : garder `data-testid` et libellés. |
| `src/components/creer/result/ResultFormatSwitch.tsx` | `renderResult` (589-627), devenu un composant | Reçoit en plus `onReelStepChange={setReelStep}`, `onStoryActionsChange={setStoryActions}`, `toolsPortal={carouselToolsSlot}` : ces trois états **restent dans le parent** (ils pilotent le bouton Publier, le héros Canva, le menu Télécharger et le portail). **Piège :** le portail (`carouselToolsSlot`) doit rester la `div` en bas du parent, sinon les encadrés de sauvegarde remontent au-dessus de l'éditeur. Mettre à jour CARTE.md l. 69 : l'aiguillage par format vit désormais ici. |
| `src/components/creer/result/MoreActionsMenu.tsx` | Le `<DropdownMenu>` complet (873-1060), `includeLogo` / `handleIncludeLogoChange` (432-433) | Reçoit `handleCopyText`, `storyActions`, `hasVisuals` et les props d'export / d'angle / de transformation. Garder `data-testid="more-actions"` (e2e-visite) et les libellés « Autres actions » / « Copier le texte » (`linkedin-copy.test.tsx` ouvre le menu par ces noms). Option : sortir aussi « Changer d'angle » (974-1016) en `ChangeAngleSubmenu.tsx` et « Transformer en » (1017-1051) en `TransformToSubmenu.tsx`. **Piège :** « Transformer en » ouvre `/creer?…&from=transform` ; ne pas confondre avec `?mode=transform` (CreerUnifie l. 157, autre parcours). |
| `src/components/creer/CreerStepResult.tsx` (reste) | `Props`, états partagés (`reelStep`, `storyActions`, `carouselToolsSlot`), fête (missions 10), bandeaux (14), newsletter (16), Publier (17), Enregistrer / repartir (19), assemblage | Garder le chemin et l'**export par défaut** : 2 `lazy(import(…))` et 8 `vi.mock` en dépendent. Ne renommer aucune prop. |

Outils : **aujourd'hui, le rapport d'impact de la CI ne dit rien quand ce fichier change.** `scripts/impact-creation.mjs` (`FRONT_FILES`, l. 81-93) connaît CreerUnifie, `formatRenderers/*`, `CreerStepEdit`… mais aucune expression ne reconnaît `CreerStepResult.tsx`. Ajouter une ligne `[/^src\/components\/creer\/CreerStepResult\.tsx$|^src\/components\/creer\/result\/|^src\/features\/creer\/(clean-streaming-content|result-copy-text)\.ts$/, "Parcours /creer : écran de résultat (tous formats)"]`, avec un cas dans `src/test/impact-creation.test.ts`.

**Tests qui le protègent aujourd'hui**

- `src/test/linkedin-copy.test.tsx` (bloc « /creer — « Copier le texte » du résultat ») : **le seul test qui affiche vraiment `CreerStepResult`**. Il ouvre « Autres actions », clique « Copier le texte » et vérifie que le LinkedIn est copié sans markdown (contenu IA et texte retouché). Rien sur les autres formats.
- `src/test/reel-result.test.tsx` : vérifie que `ReelResult` remonte bien `{ key, step, isLast, montageDone }` (« isLast seulement à la fin »). Il protège le signal, pas ce que `CreerStepResult` en fait (bouton Publier caché, copie selon l'étape).
- 7 tests de CreerUnifie (`creer-photos-manquantes`, `creer-entrees-calendrier-brief`, `creer-angles-reel-photos`, `creer-sequence-lancement`, `creer-cta-label-visuels`, `creer-reprise-modifier-reset`, `creer-publication-exports`) et `creation-initial-draft.test.tsx` : ils **remplacent** `CreerStepResult` par un faux et lisent les props qu'il reçoit. Ils protègent le câblage côté parent, pas l'écran lui-même ; ils casseraient seulement si le chemin ou l'export par défaut changeaient.
- `src/test/regeneration-backup.test.tsx` : le filet « Régénérer / Changer d'angle » côté hook, pas le menu.
- Les écrans de format ont leurs propres tests (`carousel-editor-*`, `reel-result`…), indépendants de ce fichier.
- Playwright (`e2e-visite/*` : `publish-or-schedule` dans 11 fichiers, `more-actions` dans `stories-visuelles.spec.ts` et `pptx-export-check.ts`) : **ne tourne pas en CI** (« Pièges communs », point 4).

Aucun test ne lit le **texte** de ce fichier (grep de `CreerStepResult` dans `src/test`, `e2e`, `e2e-visite`, `scripts` : seulement des `vi.mock`, un `import` et des commentaires). Le piège commun n° 3 ne s'applique donc pas ici, contrairement à CreerUnifie.

Branches **jamais testées** : l'écran d'attente (texte en direct, brouillon de carrousel, « Relecture finale »), la fête et ses deux exceptions, l'aiguillage carrousel (éditeur / photo / mixte sans photo), la copie de tous les formats sauf LinkedIn, le bouton Publier caché pour un reel non terminé, l'attente des visuels (lots réels), « Changer d'angle », « Transformer en ».

**Tests à ajouter AVANT de découper**

Dans un nouveau `src/test/creer-step-result.test.tsx` (environnement dom), avec les écrans de format remplacés par des faux (`vi.mock` de `formatRenderers/*`, `CarouselEditorConnected`, `CarouselDraftPreview`, `Confetti`) qui affichent leur nom et exposent leurs props :

1. **Attente de la rédaction** : `streamingContent` = « ```json {"content":"Bonjour\nmonde" » → affiche « Bonjour » puis « monde » sur deux lignes et « L'IA rédige en temps réel… » ; `streamingContent` = `{"title":` → squelette (pas de texte) ; carrousel avec `draftSlides` et `step2of2` → faux `CarouselDraftPreview` + « Étape 2 / 2 · Rédaction » ; `generationStage: "correcting"` → « Relecture finale : on gomme les tournures d'IA… » ; `qualityMax` → « Mode qualité Max activé » à la place de l'astuce.
2. **Fête** : `rerender` de `generating: true` à `false` avec un résultat → « Ton script de reel est prêt ✨ » (format reel) ; premier affichage directement avec un résultat → pas de fête ; `pinterest_visual` sans `pin_html` → pas de fête.
3. **Aiguillage** : un cas par format (reel, story, post, linkedin, newsletter, pinterest_photo, pinterest_visual, format inconnu → `PostResult`) ; carrousel avec `visualSlides` + `onCarouselDocumentChange` → éditeur, et `fieldset` désactivé quand `visualLoading` ; carrousel `carousel_type: "photo"` avec photos → `CarouselPhotoResult` ; `carousel_type: "mix"` sans photos mais avec `photo_directive` → `CarouselPhotoResult` ; carrousel texte → `CarouselResult`. Vérifier que l'éditeur reçoit en `toolsPortal` la `div` `carousel-tools-slot`.
4. **Copier le texte** (via le menu, comme `linkedin-copy.test.tsx`) : une attente exacte par branche : newsletter, `edited_text` (post) et `edited_text` ignoré pour un reel, brief photo Pinterest complet, épingle, stories avec sticker et timing, script reel, reel à l'étape « caption » et « tournage » (le faux `ReelResult` appelle `onStepChange`), reel à l'étape « caption » sans légende → script, repli `hook` + `body` + `cta`, repli JSON. Ces attentes servent de contrat direct à `resultCopyText` après le lot 1.
5. **Publier ou programmer** : reel avec `isLast: false` → bouton absent ; reel sans signal → bouton présent (fail-open) ; reel `isLast: true` → présent ; `canAutoPublish: false` ou newsletter → « Ajouter au calendrier » ; `publishOrScheduleLabel` prioritaire.
6. **Menu « Autres actions »** : carrousel avec visuels → sous-menu « Télécharger » ; sans visuels + `onExportPptx` → « Télécharger PPTX » ; stories (le faux `StoryResult` appelle `onExportActionsChange`) → « Ouvrir dans Canva » en héros + « Télécharger » ; « Changer d'angle » liste les angles LinkedIn quand `currentChannel: "linkedin"` et affiche « Actuel : … » ; « Transformer en » n'a pas le format en cours et ouvre `/creer?sujet=…&objectif=…&format=reel&angle=…&from=transform` (espion sur `window.open`) ; absent sans `sourceIdea`.
7. **Visuels du carrousel** (minuteries simulées, `vi.useFakeTimers`) : `visualChunkProgress {done: 2, total: 4}` → « Design des slides… 2/4 lots prêts » ; `visualsAutoError` → `visuals-auto-error` + « Réessayer les visuels » ; astuce /branding seulement sans `charterColors`.
8. **Séquence de lancement** : un rendu de `LaunchSequenceResults` avec 2 chapitres (le deuxième parent, jamais testé) pour vérifier que chaque onglet affiche son résultat.
9. **Rapport d'impact** : la ligne `FRONT_FILES` ci-dessus + son cas dans `src/test/impact-creation.test.ts`.

**Risque et ordre conseillé**

Niveau : **moyen**. Le code est de l'affichage pur (ni serveur, ni quota), un seul composant exporté, et aucun test ne lit son texte : c'est plus simple que CreerUnifie. Mais c'est la porte de sortie de **tous** les formats, il a eu 8 corrections en 90 jours, et presque rien ne le protège directement (un seul test, sur LinkedIn). Les pièges réels sont discrets : un retour anticipé placé avant un hook (écran blanc), la fête déplacée dans l'écran d'attente (elle ne se déclenche plus jamais), le portail des encadrés déplacé (ils remontent au-dessus de l'éditeur), le bouton Publier d'un reel qui disparaît en silence si le fail-open est réécrit.

**Chantier en parallèle :** une autre session découpe en ce moment `src/pages/CreerUnifie.tsx` (lots I/J, fiche 1 ; lot I fusionné : #1579). La fiche 1 dit de **ne pas sortir** le bloc `<CreerStepResult …>` de CreerUnifie. Ce découpage-ci ne doit donc **toucher ni CreerUnifie, ni les noms des 64 props, ni le chemin, ni l'export par défaut** : sinon conflit avec les PR en cours et 8 `vi.mock` à reprendre. Vérifier avant chaque PR qu'aucune PR CreerUnifie ouverte ne modifie `CreerStepResult.tsx` ; pas de session Lovable ouverte sur /creer pendant ces PR.

Une PR par lot :
1. **Lot T** : `src/test/creer-step-result.test.tsx` (tests 1 à 8) + ligne `FRONT_FILES` et son test (test 9). Aucun code de l'écran touché.
2. **Lot 1 (pur)** : `clean-streaming-content.ts`, `result-copy-text.ts`, `result/result-texts.ts`, `result/CanvaHeroButton.tsx`. Ajouter un test unitaire direct de `cleanStreamingContent` et de `resultCopyText` (environnement node, `src/test/*.test.ts`).
3. **Lot 2** : `result/GenerationWaitScreen.tsx` (avec `SkeletonPreview`).
4. **Lot 3** : `result/VisualsProgressPanel.tsx`.
5. **Lot 4** : `result/MoreActionsMenu.tsx` (+ sous-menus angle et transformation si on le choisit).
6. **Lot 5** : `result/ResultFormatSwitch.tsx` + CARTE.md (l. 69, l'aiguillage par format change d'adresse).
7. **Lot 6 (documentation)** : mettre à jour cette fiche (avancement) et `docs/creation-contenu/CARTE.md`.

Vérifications à chaque PR :
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/creer-step-result.test.tsx src/test/linkedin-copy.test.tsx src/test/reel-result.test.tsx` puis les 8 tests qui remplacent l'écran par un faux (`npx vitest run src/test/creer- src/test/creation-initial-draft.test.tsx`), puis `npm test` complet en CI ;
- après la fusion : `node scripts/cliquet-dette.mjs --update` (le fichier repasse sous 800 lignes dès le lot 2 ou 3 et sort de la référence ; aucun nouveau fichier ne doit dépasser 800 lignes ni ajouter de `any`, les 10 `any` actuels suivent le code déplacé).

---

### 12. `supabase/functions/deep-diagnostic/index.ts` — 1 084 lignes

**En une phrase :** c'est le diagnostic de fin d'onboarding. La fonction rassemble les sources (site, « À propos », Instagram public, captures, comptes connectés) et écrit deux prompts. Elle lance en parallèle la préparation de la fiche de marque (`diagnostic-enrichment`), puis demande le diagnostic à Claude (Sonnet, outil `rendre_diagnostic`). Elle trie ensuite les constats selon leur source réelle, enregistre le résultat et ses priorités, et sert un diagnostic de repli si Claude échoue. Tout cela tient dans un seul `serve()` d'environ 530 lignes (l. 357-886).

> Lignes vérifiées sur le fichier au 15/10/2026 (dernier commit : `26bf1fce6`, #1153). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou de commentaire `// ======`) est la référence fiable.

Repères de structure :
- **Un seul appelant côté front** : `src/components/onboarding/DiagnosticLoading.tsx` (l. 302), via `invokeWithTimeout("deep-diagnostic", …)`, avec `isOnboarding: true` **en dur**, un délai de 180 s (avec sources) ou 120 s (sans source), et `applyFallback()` côté front si l'appel échoue. Aucun autre écran ne l'appelle (grep `deep-diagnostic` dans `src/`). Conséquence : le chemin payant (`checkQuota` l. 424 et `logUsage("audit", "deep_diagnostic")` l. 350) n'est atteint par **aucun écran aujourd'hui**. Il reste testé et doit être gardé tel quel. Ne le supprimer qu'après décision, dans une PR à part.
- La forme de la réponse (`success`, `id`, `diagnostic`, `sources_used`, `sources_failed`) est lue par `src/lib/diagnostic-data.ts` et `DiagnosticView.tsx`. La mock de `e2e-visite/onboarding-diagnostic.spec.ts` (l. 95) en recopie la forme.
- Fonction sœur : `diagnostic-enrichment/index.ts` (882 lignes, aussi dans le cliquet). Elle est appelée « fire-and-forget » par ce fichier (l. 770) et retrouve la dernière ligne `diagnostic_results` (`savedDiagId: null`). Elle a sa propre copie de la garde « sortie vide » (`isDegenerateEnrichment`).
- Déjà sortis dans `_shared/` : `scraping.ts` (scrapes, captures, styles du site), `diagnostic-social.ts` (comptes connectés, testé par `diagnostic-social_test.ts`), `parse-ai-json.ts`.
- Le `serve()` n'est **pas** protégé par `import.meta.main`. Résultat : `index_test.ts` doit neutraliser `Deno.listen` avant d'importer le fichier (l. 23-44). C'est la bidouille que `carousel-ai` et `branding-coaching` ont déjà remplacée par `if (import.meta.main) serve(…)`.
- Pas de `deno check` en CI pour cette fonction (il n'existe que pour `visual-studio` et `studio-video`). `npm run test:edges` tourne en `--no-check`. Les types ne sont donc vérifiés par personne.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Imports et réglages | 1-14 | 11 imports partagés ; `MAX_TEXT_PER_SOURCE` (8 000 caractères par source), `GLOBAL_TIMEOUT_MS` (55 s, coupe **seulement** la collecte des sources). |
| 2. Routes des priorités | 15-32 (`DIAGNOSTIC_ROUTES`, `LEGACY_DIAGNOSTIC_ROUTES`, `normalizeDiagnosticRoute`) | Ramène chaque route proposée par Claude vers une page qui existe (ancienne route → nouvelle, inconnue → `/branding`). |
| 3. Forme imposée à Claude | 34-111 (`DIAGNOSTIC_TOOL`) | Schéma de l'outil `rendre_diagnostic` : résumé, `screenshot_readable`, forces, faiblesses, scores, priorités (avec `first_step`, `example`, `source`), `branding_prefill`. La liste des 11 sources est recopiée 3 fois. |
| 4. Lecture et contrôle de la réponse | 113-165 (`robustJsonParse`), 167-188 (`MARKUP_RE`, `isDegenerateDiagnostic`, `stripMarkupFromSummary`) | Répare un JSON tronqué (bug « domaine Mattioli », #640/#645). Repère une réponse vide (aucune force ni faiblesse). Coupe une balise XML restée dans le résumé. |
| 5. Provenance des constats | 190-230 (`SCREENSHOT_SOURCES`, `hasScreenshotFinding`, `finalizeDiagnosticEvidence`) | Ne garde que les constats dont la source a vraiment été lue. Écrit `social_screenshot` dans les échecs si la capture n'a rien donné. Met à `null` le score d'un canal non lu. Appelle `normalizeDiagnosticRoute`. **Modifie `analysis`, `sourcesUsed` et `sourcesFailed` en place.** |
| 6. Appel à Claude et décision de crédit | 232-355 (`runFastDiagnostic`) | Ajoute les captures et visuels connectés en vision. Fait l'appel Sonnet (`abortTimeoutMs: 90_000`, 4 000 tokens, température 0,6 avec capture, 0,7 sinon). Réessaie une fois si la réponse est vide, et une fois si une capture lisible n'est citée nulle part. Sert le repli `buildFallbackDiagnostic` en cas d'échec. Ne prépare `logUsage("audit", "deep_diagnostic")` que si l'IA a réussi **et** hors onboarding. |
| 7. Entrée, droits, espace, quota | 357-433 | CORS, minuterie globale, `authenticateRequest`, `checkRateLimit`, lecture du corps, `assertWorkspaceMembership`, espace propriétaire (`maybeSingle`, #653), choix de `workspaceId` (onboarding = **toujours** l'espace propriétaire, sinon l'espace demandé, cf. contamination du 30/06), `profileUserId` pour `scrape_cache`, `checkQuota("audit")` hors onboarding. |
| 8. Collecte des sources | 435-575 | Site : cache `scrape_cache` de moins d'1 h, sinon scrape direct, puis indices de style (`loadWebsiteStyleHints`, 444-461 ; bloc 462-507). « À propos » ou LinkedIn (509-527). Instagram public (529-544). Jusqu'à 3 captures (`processScreenshots`, 546-561). Comptes connectés (`readSocialDiagnosticEvidence`, 563-573). Tout en parallèle, attendu par `Promise.allSettled` (575). |
| 9. Prompt système | 577-642 (`systemPrompt`) | 7 règles (sources uniquement, preuves, pas de « champ vide dans l'outil », signaux de conversion, réseaux, priorités actionnables, ton), JSON attendu, routes autorisées, barème. Texte fixe, sans variable. |
| 10. Prompt utilisateur | 644-716 (`userParts`, `userPrompt`) | Contexte, `=== PROFIL ===` (avec les libellés `activityTypeLabel` / `blockerLabel`, #688), `=== RÉPONSES LIBRES ===`, une section `=== SOURCE: … ===` par source, alertes « aucune source » et « sources non analysées », consignes finales. |
| 11. Lancement de la fiche de marque | 718-789 | Construit `enrichmentPrompt` (le `userPrompt` coupé à 16 000 caractères, plus le site complet et les styles). Relit `scrape_cache` une **2e fois**. Lance `fetch(…/diagnostic-enrichment)` sans l'attendre, **avant** l'appel du diagnostic (#713 : 79 s d'attente gagnées). |
| 12. Diagnostic puis provenance | 791-806 | `runFastDiagnostic(…)` puis `finalizeDiagnosticEvidence(…)`. |
| 13. Enregistrement et crédit | 808-857 | Insertion `diagnostic_results`, non bloquante. `audit_recommendations` (une ligne par priorité, `detail` = why + first_step + example). `usageLog` attendu dans le même `Promise.allSettled`. |
| 14. Réponse et erreurs | 862-886 | Réponse JSON (`branding_prefill: null`, rempli plus tard par la phase 2) ; `AuthError` → son statut ; le reste → 500 « Erreur interne du serveur ». |
| 15. Conseils par type d'activité | 888-941 (`ACTIVITY_INSIGHTS`) | 10 types d'activité (artisane, coach, consultante…), avec forces, astuces et priorité. Le champ `priority` n'est lu nulle part. |
| 16. Diagnostic de repli | 943-1084 (`buildFallbackDiagnostic`) | Diagnostic honnête sans IA : forces tirées du profil, faiblesses (dont le « filet » qui en garantit au moins une), score calculé, résumé sans gabarit « le domaine "…" », 3 priorités fixes, `_fallback: true`. |

Constats relevés (non corrigés, à garder en tête) :
- Le libellé `"instagram"` de `failedLabels` (l. 698) ne sert jamais : la source en échec s'appelle `instagram_public`. Claude reçoit donc « instagram_public » au lieu de « Instagram (@handle) ».
- Le commentaire « diagnostic = 3 credits » (l. 423) est périmé : il y a aujourd'hui un compteur unique, une unité `audit`.
- `scrape_cache` est lu deux fois avec la même requête (l. 465 et 737).
- Des commentaires d'autres fichiers citent des **numéros de ligne** de ce fichier, déjà faux aujourd'hui. Dans `DiagnosticLoading.tsx` (l. 256-260) : « L776/L808 », « L738 » et « L418-434 », alors que la comparaison à `"invisible"` est aux l. 989 et 1021, `ACTIVITY_INSIGHTS` à la l. 890 et le profil du prompt aux l. 652-671. Dans `diagnostic-enrichment/index.ts` (l. 229) : « index.ts L655 ». Après découpage, les remplacer par le nom du fichier et du repère.

**Découpage proposé** (code déplacé à l'identique, dans le dossier `deep-diagnostic/`. `index.ts` réexporte `runFastDiagnostic`, `normalizeDiagnosticRoute` et `finalizeDiagnosticEvidence`, que `index_test.ts` importe depuis `./index.ts`.)

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `deep-diagnostic/routes.ts` | `DIAGNOSTIC_ROUTES`, `LEGACY_DIAGNOSTIC_ROUTES`, `normalizeDiagnosticRoute` | Aucune dépendance. La liste doit rester alignée avec la ligne « Routes disponibles » du prompt système (l. 640) : le dire en commentaire des deux côtés, ou faire construire cette ligne à partir de la liste dans un lot de comportement à part. |
| `deep-diagnostic/tool.ts` | `DIAGNOSTIC_TOOL` | Importe seulement le type `AnthropicTool`. Ne pas factoriser les 3 listes de sources dans ce lot : le schéma envoyé à Claude doit rester identique octet pour octet (le snapshot du test 2 le vérifie). |
| `deep-diagnostic/parse.ts` | `robustJsonParse`, `MARKUP_RE`, `isDegenerateDiagnostic`, `stripMarkupFromSummary` (à exporter) | Importe `tryParseAiJson`. Le libellé `"deep-diagnostic"` passé à `tryParseAiJson` sert aux journaux : le garder. Ne pas fusionner avec `isDegenerateEnrichment` de `diagnostic-enrichment` (deux fonctions, deux PR). |
| `deep-diagnostic/evidence.ts` | `SCREENSHOT_SOURCES`, `hasScreenshotFinding` (à exporter), `finalizeDiagnosticEvidence` | Importe `routes.ts`. **Piège :** la fonction modifie en place `analysis`, `sourcesUsed` et `sourcesFailed`, et la réponse finale renvoie ces mêmes tableaux. Il faut passer les tableaux eux-mêmes, sans copie (`[...sourcesUsed]` ou `structuredClone` casseraient `sources_used` dans la réponse sans qu'aucun test actuel ne le voie). |
| `deep-diagnostic/fallback.ts` | `ACTIVITY_INSIGHTS`, `buildFallbackDiagnostic` (à exporter) | Aucune dépendance. Les clés `activityType` et la valeur `"invisible"` sont des **clés** envoyées par le front (`DiagnosticLoading.tsx` l. 252-262) : ne rien renommer. Recopier tel quel le champ `priority`, non lu. |
| `deep-diagnostic/fast-diagnostic.ts` | `runFastDiagnostic` | Importe `tool.ts`, `parse.ts`, `evidence.ts` (`hasScreenshotFinding`), `fallback.ts`, `callAnthropic`, `getModelForAction`, `logUsage`. **Ne pas introduire de `_deps`** : les tests simulent Claude et `ai_usage` par `installFetchMock` (faux `fetch` global), qui marche quel que soit le fichier. Garder `logUsage` **dans** cette fonction : c'est elle qui sait si l'IA a réussi (règle checkQuota → appel IA → logUsage, fix #843). Garder `abortTimeoutMs: 90_000` (#859) : le délai du front (120 / 180 s) est calculé dessus. |
| `deep-diagnostic/sources.ts` | Lignes 435-575 regroupées dans `collectDiagnosticSources({ supabaseAdmin, userId, profileUserId, workspaceId, websiteUrl, linkedinUrl, instagramHandle, documentIds, freeformAnswers, signal })`, qui renvoie `{ scrapedContent, sourcesUsed, sourcesFailed, instagramScreenshots, connectedImages, cachedStyleHints }` | **Piège n°1 :** `cachedStyleHints`, `instagramScreenshots` et `connectedImages` sont des `let` réaffectés **à l'intérieur** des promesses. Ne les lire qu'**après** `Promise.allSettled` : les renvoyer en fin de fonction, jamais avant. **Piège n°2 :** `controller.signal` (minuterie de 55 s) doit être le même signal que celui du handler, sinon la collecte n'est plus bornée. `profileUserId` (propriétaire de l'espace) sert à `scrape_cache`, `userId` sert à `processScreenshots` et `readSocialDiagnosticEvidence` : ne pas les confondre en passant un seul identifiant. |
| `deep-diagnostic/prompts.ts` | `DIAGNOSTIC_SYSTEM_PROMPT` (texte de `systemPrompt`, l. 578-642, sans variable) et `buildDiagnosticUserPrompt({ profile, freeformAnswers, scrapedContent, sourcesUsed, sourcesFailed, screenshotCount, instagramHandle, websiteUrl })` (l. 644-716) | Fonctions pures, testables sans réseau. **Piège :** l'alerte « Aucune source en ligne » lit `sourcesUsed` **avant** `finalizeDiagnosticEvidence` : l'ordre des appels dans le handler doit rester sources → prompt → phase 2 → diagnostic → provenance. L'ordre des sections `=== SOURCE: … ===` suit l'ordre d'insertion dans `scrapedContent`, qui dépend de l'ordre d'arrivée des réponses. C'est déjà le cas aujourd'hui, mais un snapshot doit fixer `scrapedContent` à la main. |
| `deep-diagnostic/enrichment.ts` | Lignes 727-789 dans `startBrandingEnrichment({ supabaseAdmin, userId, workspaceId, profileUserId, userPrompt, websiteUrl, cachedStyleHints, isOnboarding, allowOverwrite })` | **Ne pas `await` le `fetch`** : il part sans être attendu (`.catch(() => {})`), et la fonction doit l'être aussi (au plus, attendre la relecture `scrape_cache`, comme aujourd'hui). La lancer **avant** `runFastDiagnostic` (#713). Garder `allowOverwrite === true` (comparaison stricte) et `savedDiagId: null`. Le `try/catch` « Ignorer » qui entoure tout reste autour de l'appel. |
| `deep-diagnostic/save.ts` | Lignes 812-849 dans `saveDiagnostic(supabaseAdmin, { userId, workspaceId, analysisResult, sourcesUsed, sourcesFailed })`, qui renvoie `{ savedDiagId, fastSaves }` | L'insertion `diagnostic_results` reste non bloquante (#875 : erreur journalisée, réponse renvoyée quand même). Le `usageLog` est ajouté à `fastSaves` **dans le handler**, puis un seul `Promise.allSettled`. La règle ESLint `nowadays/require-supabase-error-check` s'applique à `supabase/functions/**` : le code déplacé doit continuer de lire `error` (lancer `npx eslint supabase/functions/deep-diagnostic/`). |
| `deep-diagnostic/index.ts` (ce qui reste, ~200 l.) | Handler exporté `handleDeepDiagnostic(req)` : CORS, minuterie, auth, limite de débit, espace, `checkQuota`, enchaînement des étapes, réponse, erreurs ; puis `if (import.meta.main) serve(handleDeepDiagnostic)` ; réexports | **Ordre à garder** : auth → débit → corps → membre de l'espace → espace propriétaire → `workspaceId` → `profileUserId` → `checkQuota` (avant toute collecte ni appel IA) → sources → prompts → phase 2 → diagnostic → provenance → enregistrement + crédit → réponse. `clearTimeout(timeout)` sur **toutes** les sorties (429, refus d'espace, succès, erreur). |

Frontières (nouveau `deep-diagnostic/boundaries_test.ts`, sur le modèle de `carousel-ai/boundaries_test.ts`) : aucun module n'importe `index.ts` ; `routes.ts`, `tool.ts`, `fallback.ts` et `prompts.ts` n'importent aucun autre fichier du dossier (sauf `routes.ts` pour `prompts.ts` si la ligne des routes est un jour générée) ; seuls `fast-diagnostic.ts` (pour `logUsage`) et `index.ts` (pour `checkQuota`) importent `_shared/plan-limiter.ts`, et seul `fast-diagnostic.ts` importe `_shared/anthropic.ts` (en dehors du type `AnthropicTool` dans `tool.ts`). Ajouter `deno check --no-config --no-lock --node-modules-dir=none supabase/functions/deep-diagnostic/index.ts` dans `.github/workflows/ci.yml`, à côté de ceux de `visual-studio` et `studio-video`. Ce check ne voit les nouveaux fichiers que s'ils sont importés par `index.ts` : brancher chaque module dans la même PR que sa création.

Option écartée : ranger `buildFallbackDiagnostic`, `robustJsonParse` ou le scrape du site dans `_shared/`. Un seul appelant chacun : ils restent dans le dossier de la fonction. `_shared/` ne bougerait que si `diagnostic-enrichment` voulait les reprendre, dans une autre PR.

**Tests qui le protègent aujourd'hui**

- `deep-diagnostic/index_test.ts` (184 lignes, 8 tests, lancé par `npm run test:edges`) :
  - `normalizeDiagnosticRoute` : anciennes routes et route inventée ;
  - `runFastDiagnostic` : succès → une ligne `ai_usage` (`audit`, `deep_diagnostic`) ; échec de Claude → repli **sans** crédit (#843) ; onboarding → aucun crédit ; capture lisible oubliée → second appel ;
  - `finalizeDiagnosticEvidence` : provenance d'une capture, capture illisible (score Instagram à `null`, constat inventé retiré), statistiques LinkedIn seules (score à `null`).
- `_shared/diagnostic-social_test.ts` : lecture des comptes connectés (module déjà sorti).
- `_shared/scraping-visual_test.ts` et `_shared/validate-site-palette_test.ts` : indices de style du site, en amont.
- Côté front : `src/test/brand-learned-colors-label.test.tsx` (affichage des couleurs, pas l'edge).
- `e2e-visite/onboarding-diagnostic.spec.ts` : remplace l'edge par une réponse simulée. Il ne teste donc pas ce fichier, et il **ne tourne pas en CI**.

Aucun test ne lit le **texte** de ce fichier (grep du chemin dans `supabase/functions/**/*_test.ts`, `src/test`, `scripts`). Seul `scripts/cliquet-dette.baseline.json` le cite (1 084 lignes, 18 `any`).

Jamais testé aujourd'hui : le handler lui-même (le `serve` n'est pas capté) ; le **texte** des deux prompts (aucun snapshot) ; le schéma `DIAGNOSTIC_TOOL` ; `robustJsonParse` sur JSON tronqué ; le réessai sur réponse vide ; `stripMarkupFromSummary` ; `buildFallbackDiagnostic` (seulement `_fallback: true`) ; le choix de `workspaceId` en onboarding ; l'ordre `checkQuota` → appel IA ; le 429 sans appel IA ; le corps envoyé à `diagnostic-enrichment` ; les lignes `audit_recommendations`.

**Tests à ajouter AVANT de découper**

1. **Contrat du handler** (`deep-diagnostic/handler_contract_test.ts`, avec `captureStdServeHandler` et `installFetchMock` de `_shared/test-edge-harness.ts`, comme `creative-flow/handler_contract_test.ts`). Pour chaque cas, un snapshot de : statut, réponse JSON, chaque appel à Claude (modèle, `system`, `messages` avec images remplacées par un repère, outil, `max_tokens`, `temperature`), corps envoyé à `/functions/v1/diagnostic-enrichment`, lignes insérées dans `diagnostic_results` et `audit_recommendations`, lignes `ai_usage`. Cas :
   - onboarding, profil seul, sans source (Claude répond bien) ;
   - onboarding avec « À propos » rempli ;
   - hors onboarding, succès : **un** crédit `audit` ;
   - hors onboarding, Claude en échec : repli, **zéro** crédit ;
   - hors onboarding, quota épuisé : 429, **zéro** appel à Claude, zéro appel à `diagnostic-enrichment`, zéro insertion ;
   - réponse vide puis bonne : 2 appels, le 2e avec la consigne corrective ;
   - réponse vide deux fois : repli `_fallback: true` ;
   - résumé avec une balise `</summary>` : coupé avant ;
   - `workspace_id` d'un espace client envoyé **en onboarding** : les insertions portent l'espace propriétaire ;
   - même chose **hors onboarding** : l'espace demandé est respecté ;
   - utilisateur non authentifié : statut de l'`AuthError`.

   Il faudra étendre le faux `fetch` du harnais : `workspace_members` (propriétaire), `scrape_cache` (une ligne en cache avec et sans `style_hints`), et capture des POST vers `diagnostic-enrichment` et des insertions par table. Le faire dans un harnais local (`deep-diagnostic/contract_harness.ts`, comme `visual-studio`), sans modifier `test-edge-harness.ts` partagé. Générer les références sur `main`, **avant** toute ligne déplacée.
2. **Snapshots des prompts** (`deep-diagnostic/prompts_snapshot_test.ts`) : `systemPrompt` et `DIAGNOSTIC_TOOL` figés tels quels. `userPrompt` figé pour : profil complet avec libellés, profil avec clés seules (sans `*Label`), réponses libres complètes, `scrapedContent` à 4 sources fixé à la main, aucune source, sources en échec (`website`, `linkedin`, `instagram_public`, `social_screenshot`). Avant le lot 2, passer par le contrat du handler ; après, appeler directement `buildDiagnosticUserPrompt`.
3. **Repli** (`buildFallbackDiagnostic`) : un snapshot par branche. Avec ou sans activité, avec ou sans `uniqueness`, `activityType` connu (`coach`) ou inconnu, présence web oui ou non, blocage `invisible` ou autre (filet « au moins une faiblesse »), score plancher 10 et plafond.
4. **Lecture de la réponse** : `robustJsonParse` sur JSON entouré de ```` ```json ````, virgule finale, caractère de contrôle, JSON coupé au milieu d'une chaîne, texte sans JSON (erreur attendue) ; `isDegenerateDiagnostic` ; `stripMarkupFromSummary`.
5. **Provenance sans copie** : un cas de contrat où une capture lisible ajoute `instagram_screenshot` à `sources_used` **dans la réponse**. Ce test casse si quelqu'un copie les tableaux en déplaçant le code.
6. Après chaque lot : `npm run test:edges` **sans aucun `.snap` modifié**, et le `deno check` ci-dessus.

**Risque et ordre conseillé**

Niveau : **moyen**. Le fichier est petit à côté des fiches 1 à 7, et ses morceaux sont déjà presque des fonctions. Mais il casse souvent : 18 commits depuis le 17/07/2026, dont 12 corrections. Ce qui casse le plus, d'après `git log` :
- **la réponse de Claude** (JSON tronqué, XML dans le résumé, réponse vide : #640, #645, #786) ;
- **les couleurs et le contenu du site** transmis à la fiche de marque (`622b61ce6`, #652, #1060, et #713 pour l'ordre des phases) ;
- **les crédits et les délais** (#843, #850, #859) ;
- **l'espace de travail** (#653, #657) ;
- **les libellés envoyés au prompt** (#688, #703, #1153).

Trois commits « Changes » viennent de Lovable, directement sur `main`. Or **aucun de ces points n'est figé aujourd'hui au niveau du handler** : le seul filet est `runFastDiagnostic` et `finalizeDiagnosticEvidence`. Le lot T n'est donc pas optionnel.

Une PR par lot, dans cet ordre :
1. **Lot T (tests seuls)** : tests 1 à 5 + harnais local. Aucune ligne d'`index.ts` touchée.
   ✅ Fait le 15/10/2026. `deep-diagnostic/contract_harness.ts` (faux PostgREST filtré par `eq.`, stockage des captures, file de réponses de Claude, capture de `diagnostic-enrichment`, des insertions et des crédits ; `chargerInternes()` charge `robustJsonParse`, `isDegenerateDiagnostic`, `stripMarkupFromSummary`, `buildFallbackDiagnostic` et `DIAGNOSTIC_TOOL` sans toucher à `index.ts`). `handler_contract_test.ts` : 16 cas (les 11 prévus, plus refus d'espace 403, site en cache avec et sans indices de style, capture lisible ajoutée à `sources_used` dans la réponse, sources en échec). Le prompt système et l'outil y sont remplacés par un repère (longueur) : ils sont figés en entier une seule fois dans `prompts_snapshot_test.ts` (8 tests : réglages de l'appel, 3 prompts utilisateur, 4 branches du repli, lecture des réponses). Constats : un caractère de contrôle dans une chaîne est gardé tel quel (le parseur partagé le lit avant le nettoyage local) ; `npx eslint supabase/functions/deep-diagnostic/` sort déjà 3 erreurs sur `index.ts` (`no-control-regex` l. 140, deux `catch {}` vides l. 143 et 162), à garder telles quelles en déplaçant `parse.ts` (lot 1). Après le lot 1, remplacer `chargerInternes()` par des imports directs.
2. **Lot 0** : `export async function handleDeepDiagnostic(req)` + `if (import.meta.main) serve(handleDeepDiagnostic)` (même motif que `carousel-ai`, l. 452-456). Retirer la neutralisation de `Deno.listen` dans `index_test.ts` (import statique) et passer le contrat du handler sur l'appel direct. Ajouter le `deno check` en CI. Contrat identique.
   ✅ Fait le 15/10/2026 : `serve(async (req) => {…})` devient `export async function handleDeepDiagnostic(req)` (corps inchangé, mêmes lignes), appelé par `if (import.meta.main) serve(handleDeepDiagnostic)`. Les trois fichiers de test importent directement `./index.ts`. Étape « deep-diagnostic edge type-check » ajoutée à `.github/workflows/ci.yml`. Aucun `.snap` modifié.
3. **Lot 1** : `routes.ts`, `tool.ts`, `parse.ts`, `evidence.ts`, `fallback.ts` (morceaux sans état) + `boundaries_test.ts`.
   ✅ Fait le 15/10/2026 : les 5 fichiers sortis à l'identique (seuls ajouts : `export` et un commentaire en tête), `index.ts` passe de 1 093 à 687 lignes, donc sous 800 dès ce lot : `node scripts/cliquet-dette.mjs --update` l'a retiré de la référence. `prompts_snapshot_test.ts` importe directement `tool.ts`, `parse.ts` et `fallback.ts` (`chargerInternes()` supprimé du harnais). Un commentaire au-dessus du prompt système rappelle d'aligner la ligne « Routes disponibles » sur `DIAGNOSTIC_ROUTES`. Les 3 erreurs ESLint d'origine ont suivi le code dans `parse.ts`. Aucun `.snap` modifié.
4. **Lot 2** : `prompts.ts` (texte du prompt système et constructeur du prompt utilisateur). Snapshots identiques.
   ✅ Fait le 15/10/2026 : `DIAGNOSTIC_SYSTEM_PROMPT` et `buildDiagnosticUserPrompt(…)` (index.ts : 687 → 552 lignes). Écart à la fiche : la fonction reçoit `instagramScreenshots` (le tableau) et non `screenshotCount`, pour garder la ligne `instagramScreenshots.length === 0` à l'identique. Snapshots existants identiques ; 3 tests ajoutés (prompt système envoyé = la constante, 4 sources fixées à la main, libellés des sources en échec). Le libellé brut `instagram_public` dans l'alerte est désormais figé : le corriger reste au lot 7.
5. **Lot 3** : `fast-diagnostic.ts` (crédits : relire le diff ligne à ligne, `logUsage` reste après succès).
   ✅ Fait le 15/10/2026 : `runFastDiagnostic` déplacé tel quel (diff relu : seules les lignes d'import changent ; `logUsage` reste dans la fonction, après succès, `abortTimeoutMs: 90_000` gardé). `index.ts` (425 lignes) n'importe plus `_shared/anthropic.ts` ; `boundaries_test.ts` l'exige désormais. Aucun `.snap` modifié.
6. **Lot 4** : `sources.ts` (le plus délicat : variables réaffectées dans les promesses, signal partagé, deux identifiants d'utilisateur).
   ✅ Fait le 15/10/2026 : `collectDiagnosticSources({…, signal })` renvoie les six valeurs après `Promise.allSettled` ; `controller.signal` devenu `signal` (5 lignes), `MAX_TEXT_PER_SOURCE` exporté par `sources.ts` (encore lu par la phase 2 dans `index.ts`). `index.ts` : 287 lignes. Ordre des sources en échec et contrat identiques (aucun `.snap` modifié).
7. **Lot 5** : `enrichment.ts` et `save.ts`. `index.ts` passe sous 800 lignes : `node scripts/cliquet-dette.mjs --update` fait baisser la référence (ou la retire de la liste).
   ✅ Fait le 15/10/2026 : `startBrandingEnrichment(…)` (le `fetch` part sans être attendu, try/catch « Ignorer » resté dans le handler) et `saveDiagnostic(supabaseAdmin, …)` qui renvoie `{ savedDiagId, fastSaves }` ; le crédit est ajouté à `fastSaves` dans le handler. `index.ts` : 195 lignes (référence du cliquet déjà retirée au lot 1). `save.ts` type le client en `SupabaseClient` (le `deno check` strict refusait le `({ error })` implicite sur un client `any`). Aucun `.snap` modifié.
8. **Lot 6 (documentation)** : remplacer les numéros de ligne cités dans `DiagnosticLoading.tsx` (l. 256-260) et `diagnostic-enrichment/index.ts` (l. 229) par le fichier et le repère. Ce sont des commentaires seulement.
   ✅ Fait le 15/10/2026 (commentaires seulement ; `diagnostic-enrichment/index.ts` garde sa taille au cliquet).
9. **Lot 7 (comportement, à part)** : libellé `instagram_public` dans `failedLabels`, une seule lecture de `scrape_cache`, commentaire « 3 credits », ligne des routes du prompt générée depuis `DIAGNOSTIC_ROUTES`, décision sur le chemin payant jamais appelé par le front. Ce sont des changements de code, pas des déplacements : ils sortent du découpage, et chacun change un snapshot (diff à relire).

À chaque lot : `npm run test:edges`, `deno check` de la fonction, `npx eslint supabase/functions/deep-diagnostic/`, et `npx tsc --noEmit --skipLibCheck` si un fichier front est touché (lot 6). Pas de fusion pendant une session Lovable ouverte. Après la fusion, tester un vrai onboarding sur le site en ligne (`e2e-visite/onboarding-diagnostic.spec.ts` simule l'edge et ne prouve donc rien sur ce fichier).

---

### 13. `src/components/calendar/CalendarPostDialog.tsx` — 1 062 lignes

**En une phrase :** c'est la fenêtre qui s'ouvre quand on clique sur un post du calendrier : elle charge le post, l'enregistre tout seul au fil de la frappe, ajoute des visuels, génère un brouillon rapide, envoie vers /creer avec tout le contexte du post, publie tout de suite sur Instagram ou LinkedIn, programme une publication, et affiche le tout en 3 onglets (mobile) ou en 2 colonnes (ordinateur).

> Lignes vérifiées sur le fichier au 15/10/2026 (dernier commit : `c5e8c4f6d`, #1463). Les numéros bougent à chaque modification : le **repère** (nom de fonction ou de constante) est la référence fiable.

Repères de structure :
- Un seul importeur : `src/pages/Calendar.tsx` (ligne 39, export nommé `CalendarPostDialog`, rendu l. 1079 dans un `LocalErrorBoundary`). Il fournit `onSave`, `onAutoSave` (`handleAutoSave`, l. 520), `onDelete`, `onUnplan`, `onDateChange`, `prefillData`.
- Le fichier contient **deux composants** : `CalendarPostDialog` (l. 67-71), une simple enveloppe qui remonte tout à neuf grâce à une clé `JSON.stringify([user?.id, column, value, editingPost?.id, open])` (changement de compte, d'espace, de post ou fermeture = état remis à zéro), et `CalendarPostDialogSession` (l. 73-1062), qui fait tout le reste.
- Il a déjà été allégé : `CalendarPostMetadata.tsx` (266 lignes, réglages), `CalendarPostContent.tsx` (240, zone de texte et boutons IA), `CalendarPostPreview.tsx` (626, aperçu). Ce qui reste, c'est l'état (~35 `useState`, 6 `useRef`), les actions (enregistrer, publier, programmer, naviguer) et la mise en page.
- Référence du cliquet : 1 062 lignes, 47 `any` (`scripts/cliquet-dette.baseline.json`).
- `scripts/impact-creation.mjs` (l. 93) range ce fichier sous « Lien calendrier → générateur ».

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Socle | 1-65 | Imports (dont deux fichiers serveur partagés : `_shared/reel-caption`, `_shared/calendar-caption`), `interface Props` (le type du contenu enregistré est écrit deux fois, l. 52 et 53), `isoToLocalInput` (date ISO → champ `datetime-local`). |
| 2. Enveloppe « on repart à neuf » | 67-71 | `CalendarPostDialog` : clé de remontage par compte, espace (`useWorkspaceFilter`), post et ouverture. |
| 3. État de la fenêtre | 73-140 | Hooks (`useAuth`, `useConfirm`, `useNavigate`, `useIsMobile`, `useWorkspaceFilter`, `useWorkspaceId`, `useProfile`, `useSocialConnections`) ; ~35 états (sujet, angle, statut, notes, canal, objectif, format, brouillon, accroche, visuels, série, publication, programmation, onglets, volets) ; sujet auto-extensible (`themeRef`, 97-104) ; `savedPreviewContent` + `previewMounted` (125-129) ; refs d'auto-save (136-140). |
| 4. Chargement du post | 142-208 | `buildSaveData` + `effectiveId` (post existant OU post neuf déjà auto-enregistré) ; prénom et compte Instagram du profil (151-155) ; effet d'init : remplit tout depuis `editingPost`, `prefillData` ou à vide. Le brouillon se reconstruit dans cet ordre : `content_draft` > `full_content` > texte des stories > `texte_parle` du script reel (166-171). Remet aussi à zéro onglets, volets, `createdIdRef`, auto-save et programmation. |
| 5. Enregistrement automatique | 210-249, 294-298 | `liveDataRef` (photo du formulaire à chaque rendu) ; « armement » après ouverture par un `setTimeout(0)` (216-221) pour ne pas enregistrer l'état d'ouverture ; `runAutoSave` (227-239, aussi branché sur « Réessayer ») ; effet avec délai de 1,2 s, jamais sans sujet (240-249) ; `handleSave` (enregistrer et fermer). |
| 6. Brief créatif lié | 251-264 | Lit `content_briefs` par `calendar_post_id` ; `guide` de production selon l'angle (`getGuide`). |
| 7. Visuels | 268-292 | `handleMediaUpload` : contrôle de taille (`UX_UPLOAD_LIMITS.media`), envoi dans le bucket `calendar-media` sous `<id utilisateur>/…` (convention reprise par `src/lib/reel-voice.ts`). |
| 8. Copier | 300-302 | `handleCopy` (`copyTextForChannel` : sans markdown pour LinkedIn). |
| 9. Publier tout de suite | 304-427 | Instagram : `igValidImages`, `igVideo` (reel monté, `isDurableReelUrl`), `instagramPublishDisabledReason` (canal, stories, reel sans vidéo, 0 image, trop d'images) ; `markPostPublished` (écrit `publish_status: "published"`, un essai de plus, puis avertissement « Ne le republie pas ») ; `handlePublishInstagram` (légende reel via `reelCalendarCaption`, sinon `calendarPublishCaption` : seule la légende part, jamais le texte des slides). LinkedIn : `linkedInText`, `linkedInPublishDisabledReason`, `handlePublishLinkedIn`. |
| 10. Programmer | 429-510 | `canSchedule`, `scheduleNeedsConnection`, `scheduleAfterTokenExpiry` (le jeton expire avant la date ?) ; `handleSchedulePublish` (9 gardes dans l'ordre, puis `scheduled_publish_at`, `auto_publish`, `publish_status: "scheduled"`) ; `handleCancelSchedule`. |
| 11. Brouillon rapide par l'IA | 520-556 | `handleQuickGenerate` : `generate-content` type `calendar-quick`, objectif filtré, `workspace_id` seulement si différent de l'utilisatrice, délai 150 s, cas `limit_reached` ; `handleSmartGenerate` choisit : carrousel, reel, stories ou LinkedIn → /creer, sinon brouillon rapide sur place. |
| 12. Aller vers /creer (navigate state) | 512-518, 558-619 | `ANGLE_TO_CAROUSEL` ; `handleOpenAtelier` (`resumeIdea` via `resumeCrosspost` ou carrousel déjà mis en forme) ; `handleNavigateToGenerator` (URL par canal / format + `launchContext`) ; `handleNavigateToDeepen` ; `handleNavigateToFormat`. Les trois premiers enregistrent d'abord (`onAutoSave`), ferment la fenêtre, puis naviguent 100 ms plus tard. |
| 13. Affichage : blocs | 621-832 | `ssd`, `syncStatus` ; `editionBlock` (sujet, `CalendarPostContent`, visuels, volet « Notes, brief & commentaires » avec `PostCommentsSection`) ; `metaBlock` (`CalendarPostMetadata`) ; `previewBlock` (`CalendarPostPreview`) ; en-tête de contexte (`canalMeta`, `formatMeta`, `dateLabel`, `ANGLE_ID_LABELS`, `angleLabel`, menu de statut, 759-817) ; volet « Détails » (820-832). |
| 14. Affichage : pied de fenêtre | 834-962 | `publishNowDisabled`, `alreadyPublished`, `canPublishActions` ; états de publication (programmé, publié, en cours, échec) ; panneau de programmation ; indicateur d'auto-save + « Réessayer » ; « Supprimer » (deux fois : bouton visible + menu) ; menu « Publier ▾ » / « Options » (publier, programmer, remettre dans mes idées, supprimer). |
| 15. Mise en page + lecteur plein écran | 964-1061 | `Dialog` : 3 onglets sur mobile, 2 colonnes sur ordinateur ; `Sheet` : titre selon le type, `SavedContentPreview` (modifiable sauf carrousel, portée `{ column, value }`), « Modifier dans l'éditeur de carrousel », `RevertToOriginalButton` (remet `original_content_data`). |

**Découpage proposé** : un dossier `src/components/calendar/post-dialog/` pour l'affichage, des hooks dans `src/hooks/`, et les petites fonctions pures dans `src/features/calendar/`. `CalendarPostDialog.tsx` garde l'enveloppe, `Props`, les états, l'effet d'init et la mise en page : cible ~350 lignes. L'export `CalendarPostDialog` ne change pas : rien à toucher dans `Calendar.tsx`.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/calendar/post-dialog-helpers.ts` | `isoToLocalInput`, `ANGLE_TO_CAROUSEL`, `ANGLE_ID_LABELS` + calcul d'`angleLabel`, table `canalMeta`, reconstruction du brouillon (166-171) sous le nom `draftFromPost(editingPost)`. Optionnel : un type `CalendarPostSaveData` pour remplacer le type écrit deux fois dans `Props`. | Fonctions pures, aucun appel. `ANGLE_TO_CAROUSEL` sert à `handleNavigateToGenerator` : l'importer depuis le hook de navigation. Ne pas fusionner avec le `PostFormData` de `Calendar.tsx` (l. 508, champs optionnels) dans ce lot. |
| `src/components/calendar/post-dialog/PostContextHeader.tsx` | En-tête de contexte (759-817) : réseau, format, date, menu de statut, objectif et angle. | Reçoit `postCanal`, `format`, `objectif`, `angle`, `selectedDate`, `status`, `setStatus`. Garder `aria-label="Changer le statut du post"`. |
| `src/components/calendar/post-dialog/PostEditionBlock.tsx` | `editionBlock` (627-723) + chargement du brief lié (251-262) et `guide` (264). | Beaucoup de props (≈25) : c'est normal, ne pas les regrouper dans un objet dans ce lot. `autoFocus` et `themeRef` (taille auto du sujet) doivent suivre. La requête `content_briefs` filtre par `calendar_post_id` (protégée par les règles d'accès) : ne pas y ajouter de filtre d'espace en passant. |
| `src/components/calendar/post-dialog/PostActionsFooter.tsx` | `actionsBlock` (842-962) : états de publication, panneau de programmation, indicateur d'auto-save, « Supprimer », menu « Publier ▾ ». | Reçoit les valeurs calculées par le hook de publication (mission 9-10) et `runAutoSave`. Les deux `confirm(...)` de suppression gardent leur texte exact. Le libellé du bouton (`"Publier"` / `"Options"`) et « Annuler » / « Fermer » ne respectent pas la règle « verbe + objet » de CLAUDE.md : **ne pas les changer ici**, PR à part. |
| `src/components/calendar/post-dialog/PostContentViewerSheet.tsx` | Le `Sheet` plein écran (1020-1059), dont le retour à la version d'origine. | Dépend de `savedPreviewContent` / `setSavedPreviewContent` et de `previewMounted` (anti-mise à jour après démontage) : ils restent dans la fenêtre et passent en props. Le bouton « Modifier dans l'éditeur de carrousel » appelle `handleOpenAtelier` (passé en prop). |
| `src/hooks/use-calendar-post-autosave.ts` | `liveDataRef`, `lastSavedRef`, `skipAutoSaveRef`, `savingRef`, effet d'armement, `runAutoSave`, effet avec délai. | **Piège d'ordre** : l'effet d'init (mission 4) remet `createdIdRef` et `autoSaveState` à zéro, puis l'armement capture la photo « de départ » au tour suivant. Appeler le hook **juste après** l'effet d'init, à la même place, sinon le premier enregistrement part dès l'ouverture (faux « Enregistré ») ou jamais. `createdIdRef` et `setAutoSaveState` doivent sortir du hook (l'init et `effectiveId` s'en servent). Garder la liste de dépendances de l'effet telle quelle (avec le commentaire `eslint-disable`). |
| `src/hooks/use-calendar-post-media.ts` | `uploading` + `handleMediaUpload`. | Chemin de stockage `${session.user.id}/…` dans `calendar-media` : ne pas le passer à l'id d'espace (d'autres écrans lisent cette convention). |
| `src/hooks/use-calendar-quick-generate.ts` | `isGenerating` + `handleQuickGenerate`. | Le corps envoyé (`type: "calendar-quick"`, `theme`, `objectif`, `angle`, `format`, `notes`, `profile`, `canal`, `workspace_id`) est celui que fige `supabase/functions/generate-content/contract_test.ts` (cas « calendar-quick Instagram (CalendarPostDialog) ») : à l'identique. Garder le délai de 150 s et son commentaire. Passe par `invokeWithTimeout` (étiquetage Sentry). |
| `src/hooks/use-calendar-post-publish.ts` | Missions 9 et 10 : `igValidImages`, `igVideo`, `instagramPublishDisabledReason`, `markPostPublished`, `handlePublishInstagram`, `linkedInText`, `linkedInPublishDisabledReason`, `handlePublishLinkedIn`, `canSchedule`, `scheduleNeedsConnection`, `scheduleTokenExpiry`, `scheduleAfterTokenExpiry`, `handleSchedulePublish`, `handleCancelSchedule`, et l'appel à `useSocialConnections`. | **Piège test (le plus fort)** : `src/test/calendar-caption.test.ts` et `src/test/calendar-reel-integration.test.ts` relisent le **texte** de `CalendarPostDialog.tsx` (AST), en sortent `handlePublishInstagram` et `linkedInText` par leur nom, et les exécutent en injectant les variables **par leur nom** : `user`, `workspaceId`, `instagramPublishDisabledReason`, `igVideo`, `igValidImages`, `contentDraft`, `theme`, `savedPreviewContent`, `reelCalendarCaption`, `calendarPublishCaption`, `publishReelToInstagram`, `publishToInstagram`, `markPostPublished`, `setPublishingInstagram`, `toast`, `isNotConnectedError`, `friendlyError`. Garder ces noms exacts et changer le chemin lu par les deux tests **dans la même PR**. Les états de publication (`publishStatus`, `scheduledAt`, `scheduleInput`…) restent dans la fenêtre au premier passage : l'effet d'init les remplit depuis le post. |
| `src/hooks/use-calendar-post-navigation.ts` | `handleOpenAtelier`, `handleNavigateToGenerator`, `handleNavigateToDeepen`, `handleNavigateToFormat`, `handleSmartGenerate`. | **Piège test** : `src/test/calendar-creer-contract.test.ts` lit le texte de `CalendarPostDialog.tsx` et découpe chaque fonction de `const <nom> = ` jusqu'au prochain `const handle… = ` ; il y cherche les clés `fromCalendar`, `calendarPostId`, `existingContent`, `format`, `objectif`, `angle`, `postDate` (+ `resumeIdea` pour l'atelier), les `params.set("sujet"|"objectif"|"from"|"calendar_id"…)` et `navigate(`. Le faire lire le nouveau fichier. Garder l'ordre des fonctions et le style `const handleX = `. **Fermeture** : `onOpenChange(false)` change la clé de l'enveloppe, donc la fenêtre est démontée avant la navigation (100 ms plus tard) ; les handlers doivent continuer d'utiliser les valeurs capturées (`theme`, `contentDraft`…), jamais des refs relues après coup. `scripts/impact-creation.mjs` (l. 93) : ajouter ce fichier à la ligne « Lien calendrier → générateur » (+ un cas dans `src/test/impact-creation.test.ts`) ; mettre à jour `docs/creation-contenu/CARTE.md` (l. 155-160). |
| `src/components/calendar/CalendarPostDialog.tsx` (reste) | Enveloppe à clé, `Props`, états, effet d'init, `buildSaveData` / `effectiveId`, `metaBlock`, `previewBlock`, `detailsPanel`, mise en page mobile / ordinateur. | L'enveloppe et sa clé restent ici (isolement entre comptes et espaces, voir commit `1724d8ed8`). `useWorkspaceFilter` reste appelé dans les deux composants. |

À ne **pas** corriger pendant le découpage (noté pour une PR à part) :
- Clés envoyées à /creer mais jamais lues par `CreerUnifie.tsx` ni ses hooks (vérifié par grep de `locState`) : `notes`, `existingAccroche`, `launchId`, `launchContext`, `contentType`, `contentTypeEmoji`, `category`, `angleSuggestion`, `chapter`, `chapterLabel`, `audiencePhase`. Le paramètre `carousel_type` n'est lu que par `ChatGuidePage.tsx`, pas par /creer. Les garder tels quels : les supprimer est une décision, pas un déplacement.
- `handleNavigateToFormat` n'enregistre pas avant de partir et n'envoie ni state ni date (contrairement aux trois autres). **16/10/2026 : retiré.** Aucun bouton ne l'appelait depuis le retrait du menu « Changer de format » (commit Lovable du 06/03/2026) ; la prop `onNavigateToFormat` est retirée de `CalendarPostContent` et `PostEditionBlock`.
- Les deux boutons « Supprimer » (pied + menu) font la même chose.

**Tests qui le protègent aujourd'hui**

- `src/test/calendar-creer-contract.test.ts` : lecture du texte ; les clés du navigate state et les paramètres d'URL de `handleNavigateToGenerator`, `handleNavigateToDeepen`, `handleOpenAtelier` existent des deux côtés (calendrier et /creer), `calendar_id` toujours envoyé.
- `src/test/calendar-caption.test.ts` : exécute `handlePublishInstagram` (carrousel d'images : la légende seule part) et `linkedInText` (légende seule, post texte inchangé), extraits du texte.
- `src/test/calendar-reel-integration.test.ts` : exécute `handlePublishInstagram` pour un reel (légende retouchée dans le lecteur, texte personnalisé gardé).
- `src/test/creer-entrees-calendrier-brief.test.tsx` : côté /creer seulement. Il **recopie à la main** les formes de state de `handleNavigateToDeepen`, `handleNavigateToGenerator`, `handleOpenAtelier` ; il n'importe pas la fenêtre et ne verrait pas une clé changée ici.
- `supabase/functions/generate-content/contract_test.ts` : le cas `calendar-quick` côté serveur.
- Indirectement : `calendar-photo-composition.test.tsx` (`CalendarPostPreview`), `crosspost-continuity.test.ts` (`resumeCrosspost`), `publish-guards.test.ts` (`INSTAGRAM_DIRECT_MAX_IMAGES`), `reel-publication.test.ts` et `_shared/calendar-caption_test.ts` (les règles de légende utilisées ici).
- Playwright : aucun test n'ouvre cette fenêtre (grep de « Thème / sujet », « Détails du post », « Aperçu live », « Enregistrement automatique » dans `e2e/` et `e2e-visite/` : rien ; les `calendrier-*.spec.ts` testent le panneau d'idées et le glisser-déposer). Et ils ne tournent pas en CI.

**Aucun test ne rend `CalendarPostDialog` à l'écran.** L'auto-save, le chargement du post, la programmation, la suppression, le lecteur plein écran, la remise à zéro par la clé et le choix de destination de `handleSmartGenerate` ne sont figés nulle part.

**Tests à ajouter AVANT de découper**

1. `src/test/calendar-post-dialog.test.tsx`, rendu réel (même frontière que `creer-entrees-calendrier-brief.test.tsx` : on simule `AuthContext`, `use-workspace-query`, `use-profile`, `use-social-connections`, `use-mobile`, le client `supabase`, `invokeWithTimeout`, `instagram-publish`, `linkedin-publish`, et on espionne `navigate`). **Chargement** : un post avec `content_draft` ; sans `content_draft` mais `full_content` ; stories ; script reel → le bon brouillon s'affiche. `prefillData` et post neuf : canal par défaut (`defaultCanal: "all"` → Instagram).
2. **Auto-save** (horloge simulée) : rien n'est envoyé à l'ouverture ; une frappe → un seul `onAutoSave` après 1,2 s ; rien sans sujet ; échec → « Non enregistré » puis « Réessayer » relance ; post neuf → le 2e enregistrement réutilise l'id reçu au 1er ; fermer / rouvrir repart de zéro.
3. **Remise à zéro par la clé** : changer d'espace (A → B) ou de post vide bien les champs (aucune fuite de texte d'un post à l'autre).
4. **Navigation vers /creer** (horloge simulée pour les 100 ms) : pour `handleOpenAtelier` (avec et sans `resumeIdea`), `handleNavigateToGenerator` (carrousel avec angle → `carousel_type`, reel, stories, LinkedIn, newsletter, autre canal), `handleNavigateToDeepen`, `handleNavigateToFormat` : URL et state **exacts** (`toEqual`), `onAutoSave` appelé avant `navigate`, fenêtre fermée. `handleSmartGenerate` : quels formats partent vers /creer, lesquels restent en brouillon rapide.
5. **Publication immédiate** : chaque raison de blocage (`instagramPublishDisabledReason` × canal LinkedIn, `story_serie`, reel sans vidéo, reel avec vidéo, 0 image, trop d'images) ; `markPostPublished` : 2 écritures si la 1re échoue, puis l'avertissement « Ne le republie pas » ; « Publier » disparaît quand le post est publié (`status` ou `publish_status`).
6. **Programmation** : les 9 gardes de `handleSchedulePublish` dans l'ordre (sans id, connexion inconnue → `refresh`, compte non connecté, stories, reel sans vidéo, sans image, LinkedIn sans texte, sans date, date passée) ; la mise à jour envoyée en cas de succès ; l'avertissement « jeton expiré avant la date » ; l'annulation.
7. **Brouillon rapide** : corps exact envoyé à `generate-content` (objectif hors liste → `null`, `workspace_id` absent quand c'est son propre espace), délai 150 000, `limit_reached` → toast sans erreur, statut `idea` → `drafting`.
8. **Lecteur plein écran** : titre selon le type, carrousel non modifiable, « Modifier dans l'éditeur de carrousel » ouvre l'atelier, retour à l'original (succès et erreur).
9. Rendre `calendar-creer-contract.test.ts` vérifiable sur **plusieurs fichiers** (une liste de chemins au lieu d'un seul), pour que le lot de navigation n'ait qu'un chemin à changer.

**Risque et ordre conseillé**

Niveau : **moyen à élevé**. Trois raisons. (1) Aucun test de rendu : une régression de l'auto-save ou de l'init passe la CI. (2) La publication est **réelle et publique** : une erreur dans `markPostPublished` ou les gardes peut créer un doublon chez la cliente. (3) Trois tests lisent le texte du fichier et cassent au moindre déplacement (« Pièges communs », point 3).

Ce qui casse le plus souvent (`git log --since=2026-07-17` : 23 commits) :
- **Publication et programmation : 9 commits** (`78b9b9170`, `ee83277ea`, `abc570415` reel monté et légende ; `e9cd7169f` légende seule ; `0605fc460` nombre d'images ; `67e68c441` programmation avec vidéo ; `1724d8ed8` état de connexion ; `1b3c32d1b`, `d62ae00da` retour après connexion).
- **Lien vers /creer : 4 commits** (`c5e8c4f6d` date oubliée dans « Approfondir » ; `50fe46518`, `502b740df` `resumeIdea` ; `272ddaf81` clé de remontage et lecteur).
- Affichage : 6 commits (sujet sur plusieurs lignes `faf3140e2`, `085cae1e5`, `90d55b270` ; « Supprimer » visible `5d319f07c` ; charte `8ee41b0c5` ; composition photo `025a739f5`). Le reste : délai du brouillon rapide (`b29de9449`), copie LinkedIn (`1efb31523`), erreurs Supabase vérifiées (`9a7f081db`), stories (`d0546e299`).

Une PR par lot (pas de session Lovable ouverte sur /calendrier pendant ces PR) :
1. **Lot T** : `src/test/calendar-post-dialog.test.tsx` (tests 1 à 8) + test 9. Aucun code touché.
   **Fait le 15/10/2026** : `src/test/calendar-post-dialog.test.tsx`, 52 cas, rendu réel de la fenêtre (menus Radix et volets rendus ouverts par des faux ; `CalendarPostContent`, `CalendarPostMetadata` et `CalendarPostPreview` remplacés par des faux qui exposent leurs props). Snapshots des URL et states envoyés à /creer et du corps du brouillon rapide dans `src/test/__snapshots__/`. Test 9 : `calendar-creer-contract.test.ts` lit une liste `FICHIERS_DIALOG` (un chemin à ajouter au lot 7). Vérifié contre 4 pannes volontaires (2e écriture de `markPostPublished` retirée, armement de l'auto-save coupé, date retirée d'« Approfondir », garde « date passée » retirée) : rouges à chaque fois. L'armement n'était vu qu'avec un post existant ouvert sans rien toucher : cas ajouté.
   À noter pour les lots suivants : la raison exacte de blocage de « Publier maintenant » n'est pas affichée (le bouton est seulement désactivé) ; le test fige l'état activé / désactivé, les textes restent figés par `calendar-caption` et `calendar-reel-integration`.
2. **Lot 1** : `src/features/calendar/post-dialog-helpers.ts` (fonctions pures). Risque très faible.
   **Fait le 15/10/2026** : `isoToLocalInput`, `ANGLE_TO_CAROUSEL`, `CANAL_META` (ex-table `canalMeta`), `ANGLE_ID_LABELS` + `angleLabelOf(angle)`, `draftFromPost(editingPost)`. Corps identiques ; le type commun de `Props` n'est pas touché (optionnel, laissé). Test `src/test/post-dialog-helpers.test.ts` ; fichier reconnu par le rapport d'impact (« Lien calendrier → générateur »). Les 52 cas du lot T passent sans retouche.
3. **Lot 2** : `PostContextHeader.tsx` et `PostContentViewerSheet.tsx`.
   **Fait le 15/10/2026** : dossier `src/components/calendar/post-dialog/`. `PostContextHeader` reçoit `postCanal`, `format`, `objectif`, `angle`, `selectedDate`, `status`, `setStatus` et calcule lui-même réseau, format, date et libellés (`aria-label` gardé). `PostContentViewerSheet` reçoit `savedPreviewContent` / `setSavedPreviewContent` / `previewMounted` / `handleOpenAtelier` et la portée `{ column, value }`. JSX déplacé à l'identique. Cas ajouté au lot T : statut changé depuis le menu de l'en-tête (une panne volontaire sur ce menu n'était vue par aucun test).
4. **Lot 3** : `PostEditionBlock.tsx` et `PostActionsFooter.tsx`.
   **Fait le 15/10/2026** : JSX déplacé à l'identique, valeurs en props (35 chacun, non regroupées, comme prévu). Écart avec la fiche : la lecture du brief lié (`content_briefs`) et le `guide` restent dans la fenêtre et passent en props. Sur mobile, l'onglet « Éditer » est démonté quand on change d'onglet : une lecture dans le composant serait relancée à chaque retour (changement de comportement). `confirm` et `navigate` passent aussi en props (pas de nouvel appel de hook). Pannes volontaires vues (« Réessayer » coupé, champ sujet coupé). Fenêtre : 953 → 742 lignes, sous le seuil de 800 (sortie de la référence du cliquet).
5. **Lot 4** : `use-calendar-post-media.ts` et `use-calendar-quick-generate.ts`.
   **Fait le 15/10/2026** : `useCalendarPostMedia(setMediaUrls)` → `{ uploading, handleMediaUpload }` ; `useCalendarQuickGenerate({ theme, objectif, angle, format, notes, profileData, postCanal, workspaceId, user, status, setContentDraft, setAccroche, setStatus })` → `{ isGenerating, handleQuickGenerate }`, appelé à la place de l'ancienne fonction (valeurs lues à chaque rendu). Corps des fonctions inchangés (délai 150 s et son commentaire gardés). Cas ajouté au test de la fenêtre : envoi des visuels (chemin `<id utilisateur>/…` même dans l'espace d'une autre personne, fichier trop lourd refusé, visuel retiré), jamais testé avant. Pannes volontaires vues (chemin passé à l'espace, délai 150 → 120 s).
6. **Lot 5** : `use-calendar-post-autosave.ts` (attention à l'ordre d'appel, test 2 obligatoire).
   **Fait le 15/10/2026** : `useCalendarPostAutosave({...})` → `{ runAutoSave }`, appelé à la place exacte des effets (juste après l'effet d'init). Les 4 refs internes (`lastSavedRef`, `liveDataRef`, `skipAutoSaveRef`, `savingRef`) sont dans le hook ; `createdIdRef` et `setAutoSaveState` restent dans la fenêtre. Effets et listes de dépendances identiques (commentaire `eslint-disable` gardé). Pannes volontaires vues (armement coupé, id du post neuf non retenu). Essai : appeler le hook AVANT l'effet d'init ne casse aucun test, car l'armement attend un `setTimeout(0)`, donc le rendu provoqué par l'init. Le piège d'ordre est moins fort qu'annoncé ; la place d'origine est gardée quand même.
7. **Lot 6** : `use-calendar-post-publish.ts` + `calendar-caption.test.ts` et `calendar-reel-integration.test.ts` repointés.
   **Fait le 15/10/2026** : `useCalendarPostPublish({ user, workspaceId, postCanal, format, mediaUrls, contentDraft, theme, savedPreviewContent, effectiveId, scheduleInput, navigate, setPublishStatus, setPublishedPostId, setScheduledAt, setPublishError, setSchedulerOpen })`, appelé à la place des missions 9-10. Le hook porte `useSocialConnections` et les états `publishingInstagram`, `publishingLinkedIn` et `savingSchedule` ; les états du post restent dans la fenêtre. Tous les noms sont gardés. Les deux tests AST lisent le hook (seuls le chemin et le type de fichier changent). Pannes volontaires vues (2e écriture de `markPostPublished` retirée, légende Instagram = brouillon brut, légende reel = brouillon brut).
8. **Lot 7 (en dernier)** : `use-calendar-post-navigation.ts` + `calendar-creer-contract.test.ts` repointé + `impact-creation.mjs` / `impact-creation.test.ts` + CARTE.md. À faire après le lot J de la fiche 1 (arrivée depuis ailleurs dans /creer) ou bien avant, mais pas en même temps : les deux touchent le même contrat.
   **Fait le 15/10/2026 : fiche 13 terminée.** `useCalendarPostNavigation({...})` → `{ handleSmartGenerate, handleOpenAtelier, handleNavigateToGenerator, handleNavigateToDeepen, handleNavigateToFormat }`, même ordre, même style `const handleX = `. `calendar-creer-contract.test.ts` lit la fenêtre ET le hook (`FICHIERS_DIALOG`) ; sans le hook, le test échoue (fonctions introuvables). Rapport d'impact et CARTE.md à jour. Panne volontaire vue par deux tests (date retirée d'« Approfondir »). `CalendarPostDialog.tsx` : 1 062 → 413 lignes, 10 fichiers sortis (`post-dialog-helpers.ts`, 4 composants dans `post-dialog/`, 5 hooks). Suites notées plus haut, **toutes faites le 16/10/2026** (une PR chacune) : double « Supprimer » (entrée du menu retirée, menu masqué quand il serait vide ; bloc « suppression ») ; libellés « verbe + objet » (« Publier ce post », « Gérer ce post », « Annuler la programmation », « Fermer sans programmer », « Programmer ce post », « Connecter mon compte » ; bloc « libellés ») ; `handleNavigateToFormat` retiré (plus aucun bouton ne l'appelait depuis le 06/03/2026) ; clés jamais lues par /creer : Laetitia a choisi de les utiliser, notes, accroche et contexte de lancement rejoignent le contenu existant envoyé aux générateurs (`src/features/creer/calendar-entry-context.ts`, tests `calendar-entry-context.test.ts` et `creer-entrees-calendrier-brief.test.tsx`).

Vérifications à chaque lot :
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/calendar-post-dialog.test.tsx src/test/calendar-creer-contract.test.ts src/test/calendar-caption.test.ts src/test/calendar-reel-integration.test.ts src/test/creer-entrees-calendrier-brief.test.tsx`, puis `npm test` ;
- `node scripts/cliquet-dette.mjs` (le fichier doit maigrir, jamais grossir ; aucun nouveau fichier au-delà de 800 lignes) ; après la fusion, `node scripts/cliquet-dette.mjs --update` ;
- dans le cloud, l'installation des dépendances échoue : la CI de la PR sert de vérification ;
- mettre à jour ce document (et CARTE.md pour le lot 7) dans la même PR.

---

### 14. `src/components/branding/BrandingReview.tsx` — 1 411 lignes

**En une phrase :** c'est l'écran « Voici ce que j'ai compris de ton projet » : il montre la fiche de marque trouvée par l'analyse (site, Instagram, documents), une carte par section (7 cartes : histoire, client·e idéal·e, proposition de valeur, ton, stratégie, offres, charte), et quand la personne valide, il **écrit lui-même dans 7 tables** (`storytelling`, `persona`, `brand_proposition`, `brand_profile`, `brand_strategy`, `offers`, `brand_charter`). Affichage, édition, navigation et écriture en base sont dans le même fichier.

> Lignes vérifiées sur le fichier au 15/10/2026 (dernier commit sur le fichier : `f70c0f28c`, #1578). Le **repère** (nom de fonction ou de commentaire) reste la référence si les numéros bougent.

**Où il est monté.** Un seul écran le rend : `src/pages/BrandingPage.tsx` (import l. 34, rendu l. 518, vue `topView === "review"`), avec `onProgress` (sauvegarde des cartes déjà relues dans `branding_autofill.analysis_result.reviewed_sections`), `onDone` (passe l'import en `completed`), `existingOfferNames`, `onReanalyzeWithBio` et `mandatory={fromOnboarding}` (parcours d'inscription : pas de « Finir plus tard »).
Autres importeurs : `src/lib/demo-autofill-data.ts` et `src/components/onboarding/BrandLearnedSection.tsx` (type `AnalysisResult` seulement). Côté serveur, aucun import, mais `supabase/functions/diagnostic-enrichment/index.ts` fabrique l'objet que l'écran lit (commentaires l. 350, 360, 612, 753) et pose le drapeau `allow_overwrite` (l. 363). Aucune edge function n'est appelée par le fichier lui-même ; `BrandingCoachingFlow` (ouvert par « On affine ensemble ») appelle `branding-coaching` et `charter-coaching`.

Repères : 28 `any` gelés dans `scripts/cliquet-dette.baseline.json`. Aucun test ne lit le **texte** du fichier (vérifié : pas de `readFileSync` / `?raw` qui le vise).

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Contrat de données | 21-61 | `AnalysisResult` (forme de la fiche envoyée par `diagnostic-enrichment`, exporté et utilisé par 3 fichiers) et `Props` du composant. |
| Liste des sections | 63-83 | `COACHING_SECTION_MAP`, `SECTIONS` (clé, titre, emoji, **ordre des 7 cartes**), type `SectionKey`. |
| Petits éléments d'affichage | 85-115 | `getConfidence`, `ConfidenceBadge` (« Confiant·e / À vérifier / À compléter »), `Chip`, `SourceTag` (Site ✓, Instagram ✗…). |
| Affichage des 5 sections en lecture | 117-206 | `StorySection`, `PersonaSection`, `ValuePropSection`, `ToneSection`, `StrategySection` : pur affichage, aucun état. |
| Offres modifiables | 208-277 | `OfferItem`, `OffersSection` : alerte doublon seulement s'il y a un vrai homonyme (`existingOfferNames`), édition et suppression d'une offre avant enregistrement. |
| Charte modifiable | 279-440 | `CHARTER_COLOR_SLOTS`, `CharterData`, `normalizeHex` (exporté), `CharterSection` (exporté) : titre honnête selon la confiance (« détectées » / « estimées » / « proposée »), saisie des couleurs (pipette + hex) et des typos. |
| Garde d'écriture + synthèse | 442-484 | `writeOrThrow` (refuse un « enregistré ✓ » quand Supabase renvoie une erreur ou zéro ligne) ; `fillBrandProfileSynthesis` (complète `mission`, `target_description`, `target_problem`, `offer`… dans `brand_profile`, lus par la génération). |
| Écritures par section | 486-758 | `saveStory` (486-525), `savePersona` (526-587, âge/métier dans `portrait.qui_elle_est`), `saveValueProp` (588-626), `saveTone` (627-658), `saveStrategy` (659-702, pilier générique de l'onboarding compté comme vide), `saveOffers` (703-727, refuse les homonymes, une seule insertion), `saveCharter` (729-758, `visual_evidence`, sortie tôt si rien à compléter). Toutes : `fillOnlyEmpty` (ne jamais écraser une saisie) sauf `allow_overwrite`. |
| Tables d'aiguillage | 760-777 | `SAVE_FNS` (section → fonction d'écriture), `QUERY_KEYS` (caches React Query à rafraîchir), `RENDERERS`, `sectionHasData`. |
| État de la relecture | 780-801, 854-880 | `validated` (repris de `reviewed_sections`), `written` (ne pas réécrire une section déjà écrite après une erreur de `onProgress`), `savingRef` (anti double-clic), `markValidated` ; offres et charte modifiées (`editedOffers`, `editedCharter`) ; bio Instagram ; `projectText` / `showProjectInput` (**jamais utilisés**). |
| Navigation entre cartes | 803-852 | `index`, `goTo` / `goNext` / `goPrev`, `completeReview` et `canComplete` (attendre les photos en onboarding), flèches du clavier (sauf dans un champ), swipe (seuil 60 px). |
| Actions de validation | 882-1002 | `logEvent` (PostHog, **jamais** `ai_usage` : ce serait compté dans le quota), `clearToReview`, `handleKeepAsIs` (« Garder tel quel »), `handleToReview` (« À revoir »), `handleValidate` (une carte), `handleValidateAll` (« Je valide tout » : section par section, ramène la première carte en échec, jamais de faux succès). |
| En-tête | 1004-1105 | Message de confiance, sources analysées, bandeau « Tes informations existantes sont conservées », bouton « Je valide tout » du haut, aide « Coller ma bio Instagram » → `onReanalyzeWithBio`. |
| Coaching dans la relecture | 1107-1139 | `BrandingCoachingFlow` en surimpression ; à la fin, la section est marquée écrite et validée (`onComplete`). |
| Carte en cours | 1141-1302 | Fil de progression (pastilles), carte de la section (3 cas : déjà commencée, pas assez d'infos, normal), `BrandLogoSuggestion` sur la carte charte, boutons « C'est bon ✓ / À revoir / On affine ensemble », Précédent / Suivant. |
| Carte de fin | 1304-1358 | Cartes restantes, `BrandPhotosPicker` en onboarding, « Créer mon premier contenu → » / « Voir mon branding complet → », « Valider tout le reste ». |
| Barre fixe du bas | 1360-1409 | « x/7 validées », « Je valide tout », « Finir plus tard » (hors onboarding), barre de progression. |

**Découpage proposé** : un dossier `src/components/branding/review/` pour l'affichage et un module `src/lib/branding-review-save.ts` pour les écritures. `BrandingReview.tsx` reste le point d'entrée : il garde le composant principal et **réexporte** `AnalysisResult`, `CharterSection` et `normalizeHex`. Aucun import à changer dans `BrandingPage.tsx`, `demo-autofill-data.ts`, `BrandLearnedSection.tsx` ni dans les tests.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/components/branding/review/types.ts` | `AnalysisResult`, `OfferItem`, `CharterData`, `SECTIONS`, `SectionKey`, `COACHING_SECTION_MAP` | Aucun import. `BrandingReview.tsx` fait `export type { AnalysisResult } from "./review/types"`. Garder l'ordre de `SECTIONS` : les tests cliquent sur « Aller à « Tes offres » » et comptent 7 cartes. |
| `review/ReviewBits.tsx` | `getConfidence`, `ConfidenceBadge`, `Chip`, `SourceTag` | `Chip` sert aussi à `CharterSection` et aux sections : c'est le seul fichier que les autres fichiers d'affichage importent. |
| `review/SectionViews.tsx` | `StorySection`, `PersonaSection`, `ValuePropSection`, `ToneSection`, `StrategySection`, `RENDERERS`, `sectionHasData` | `RENDERERS` contient aussi offres et charte (versions sans édition) : il importe `OffersSection.tsx` et `CharterSection.tsx`. |
| `review/OffersSection.tsx` | `OffersSection` | Texte « existe déjà dans Mes offres » vérifié par `branding-import-regressions.test.tsx`. |
| `review/CharterSection.tsx` | `CHARTER_COLOR_SLOTS`, `normalizeHex`, `CharterSection` | `branding-review-charter.test.tsx` importe `CharterSection` et `normalizeHex` depuis `@/components/branding/BrandingReview` : garder la réexportation (ou faire pointer le test vers le nouveau fichier **dans la même PR**). `brand-learned-colors-label.test.tsx` et `BrandLearnedSection.tsx` citent « la même règle que BrandingReview/CharterSection » en commentaire : mettre le chemin à jour. |
| `src/lib/branding-review-save.ts` | `writeOrThrow`, `fillBrandProfileSynthesis`, les 7 `save*`, `SAVE_FNS`, `QUERY_KEYS` | Fichier sans React : importe `supabase`, `importTarget` / `readImportRows`, `isEmptyVal` / `fillOnlyEmpty`, `withoutOnboardingDefaults`. Les tests remplacent `@/integrations/supabase/client` par un faux (`vi.mock`) : ça marche quel que soit le fichier qui l'importe. **Piège workspace :** le choix de colonne est fait à la main (`workspaceId && workspaceId !== userId ? "workspace_id" : "user_id"`, 8 fois). Le déplacer tel quel. Ne PAS le remplacer par `workspaceScopeFilter` pendant le découpage : ce dernier filtre sur `workspace_id = userId` quand l'espace vaut l'id de l'utilisatrice, ce qui change les lignes trouvées. Ce serait une correction à part (voir plus bas). |
| `review/use-review-carousel.ts` | `index`, `goTo`, `goNext`, `goPrev`, `finished`, l'effet clavier, `handleTouchStart` / `handleTouchEnd` | Le hook reçoit `coachingSection` (les flèches sont coupées pendant le coaching). Garder la garde « pas de flèches dans un champ » (saisie des couleurs et offres). |
| `review/use-review-validation.ts` | `validated`, `validatedRef`, `written`, `savingRef`, `markValidated`, `toReview`, `clearToReview`, `savingSection`, `validatingAll`, `showConfetti`, `refinedSections`, `logEvent`, `handleKeepAsIs`, `handleToReview`, `handleValidate`, `handleValidateAll`, et le corps de `onComplete` du coaching | **Le cœur du risque.** `written` évite une 2e insertion d'offre quand `onProgress` échoue (test dédié) ; `savingRef` bloque les doubles clics ; `validated.size === 6` déclenche les confettis. Déplacer sans retoucher les listes de dépendances des `useCallback` (elles contiennent `preFilledSections` et `validatingAll` inutiles : les laisser, ce n'est pas le sujet). `useWorkspaceId` vient de `@/hooks/use-workspace-query` : **le faux de `branding-review-carousel.test.tsx` ne fournit que `useWorkspaceId`** ; importer `useWorkspaceFilter` dans ce hook ferait planter le test. |
| `review/ReviewHeader.tsx` | En-tête (titre, « Je valide tout » du haut, message de confiance, sources, bandeau « informations existantes », bio Instagram) + calcul `confMsg`, `allSources`, `sourceLabels` | Reçoit `onReanalyzeWithBio`. L'aide « Coller ma bio Instagram » apparaît aussi si `analysis.sources_failed` contient `instagram`. |
| `review/ReviewCard.tsx` | Carte en cours (pastilles, 3 cas, boutons, Précédent / Suivant) | Importe `BrandLogoSuggestion` (`placement="brand_review"`). Les tests remplacent ce composant par `null` via son chemin : garder le même chemin d'import. |
| `review/ReviewEndCard.tsx` | Carte de fin | Importe `BrandPhotosPicker` (`onReadyChange`). Les textes « Un instant… » et « Créer mon premier contenu → » sont comptés par le test (2 boutons : carte de fin + barre). |
| `review/ReviewStickyBar.tsx` | Barre fixe du bas | Texte « x/7 validées », « Fiche validée ! 🎉 » et « Finir plus tard » vérifiés par les tests. |
| `BrandingReview.tsx` (reste) | Le composant principal qui assemble : props, offres et charte modifiées, bio Instagram, coaching en surimpression, choix des écrans | ~150 lignes visées. Garder `export default` et les réexportations. |

Code mort repéré (à retirer dans un lot à part, pas pendant un déplacement) : props `onDescribeProject` et `allSourcesFailed`, états `projectText` / `showProjectInput` (l. 52-54, 876-877) ; `BrandingPage.tsx` ne les passe jamais. ✅ Retiré le 15/10/2026 (étape 7).

Hors découpage, à noter pour plus tard :
- **Connecteurs intelligents** : les `save*` écrivent directement en base, sans passer par la détection de changement de branding. Normal pour un premier remplissage (champs vides), mais en reprise d'onboarding (`allow_overwrite`) le positionnement ou le ton peuvent changer sans suggestion de mise à jour. ✅ Tranché le 15/10/2026 (étape 7) : pas d'analyse automatique (1 crédit à chaque fois) ; la carte de fin affiche un rappel de relire offres, ton et stratégie quand `allow_overwrite` est posé et qu'au moins une section a été réécrite (`ReviewEndCard`, prop `recheckHint`).
- **Vocabulaire UI** : les boutons « OK » des offres (l. 252) et de la charte (l. 372) ne respectent pas « verbe + objet » (« Enregistrer l'offre », « Enregistrer ma charte »). Petit lot à part : les tests de la charte cliquent sur « OK », il faudra les mettre à jour dans la même PR. ✅ Fait le 15/10/2026 : « Appliquer mes modifications » dans les deux cas (rien n'est enregistré en base à ce clic, seulement à la validation de la carte : « Enregistrer » aurait été trompeur).

**Tests qui le protègent aujourd'hui**

- `src/test/branding-review-carousel.test.tsx` (4 tests) : une seule carte visible, « Suivant » ; « Je valide tout » écrit les 7 sections ; une écriture en échec ne montre pas le succès et ramène la carte fautive ; en onboarding, attendre les photos avant « Créer mon premier contenu → ».
- `src/test/branding-import-regressions.test.tsx`, bloc « Structured review » (l. 197-278, 10 tests sur `BrandingReview`) : charte avancée, histoire et variantes de proposition non écrasées ; charte déjà remplie validée sans erreur ; homonymes d'offre bloqués avant toute écriture ; échec de lecture des offres = aucune insertion ; pilier générique remplacé, pilier écrit à la main gardé ; alerte doublon seulement si vrai doublon ; plusieurs offres en une seule écriture, `workspace_id` vide en compte personnel ; section « déjà commencée » non comptée comme relue, « Finir plus tard » → `onDone(false)` ; reprise des cartes relues et pas de 2e insertion d'offre après un échec de `onProgress`. Ce test tourne avec un espace `w1` différent de l'utilisatrice `u1` : il couvre la branche `workspace_id`.
- `src/test/branding-review-charter.test.tsx` (7 tests) : `normalizeHex`, titre honnête selon la confiance, édition, couleur vidée ou invalide retirée, Annuler, « Ajouter mes couleurs ».
- `src/test/fill-only-empty.test.ts` : la règle « ne compléter que le vide » utilisée par toutes les écritures.
- `src/test/identity-page-scope.test.tsx` : remplace `BrandingReview` par un faux (vérifie seulement que `BrandingPage` le monte).
- `e2e-visite/branding-t6.spec.ts` (T6a, import URL → l'écran s'affiche) : **ne tourne pas en CI** (piège commun 4).

Jamais testés : `savePersona` (âge/métier dans `portrait.qui_elle_est`, existant ou non), `saveTone`, `saveStory` avec `allow_overwrite` (`step_7_polished`), `fillBrandProfileSynthesis` (`mission`, `target_description`, `offer`), le chemin `allow_overwrite: true` en général, « Garder tel quel », « À revoir » puis rappel sur la carte de fin, le coaching (`onComplete`), le clavier et le swipe, la bio Instagram, la colonne `user_id` quand l'espace vaut l'id de l'utilisatrice.

**Tests à ajouter AVANT de découper**

1. `src/test/branding-review-save.test.ts` (environnement node, faux Supabase en mémoire comme dans `branding-import-regressions`) : pour chacune des 7 sections, × {ligne absente → insertion avec le bon `workspace_id`, ligne existante avec champs vides → complétée, ligne existante remplie → intacte, `allow_overwrite` → écrasée} ; plus `savePersona` avec âge/métier (fusion dans `portrait.qui_elle_est`), `saveStory` avec vision → `brand_profile.mission`, `saveValueProp` → `target_problem`, `value_prop_difference`, `offer`, et `version_one_liner` jamais écrasé. Au lot T, il passe par le composant (`Je valide tout`) ; au lot 2, il appelle directement `SAVE_FNS`.
2. Un test « portée » : espace = id de l'utilisatrice → filtre `user_id` ; espace différent → filtre `workspace_id` et `workspace_id` rempli à l'insertion. Il verrouille le piège workspace du tableau.
3. Dans `branding-review-carousel.test.tsx` : « Garder tel quel » sur une section déjà commencée (aucune écriture, carte validée) ; « À revoir » puis carte de fin qui affiche « à revoir » ; flèche droite = carte suivante, mais pas quand le focus est dans un champ ; swipe de moins de 60 px = rien ; « Finir plus tard » absent quand `mandatory`.
4. Coaching : avec un faux `BrandingCoachingFlow` qui appelle `onComplete`, vérifier que la section est validée, marquée « Affiné », et qu'une 2e validation ne réécrit pas en base (`written`).
5. Un test « réexportations » : `BrandingReview.tsx` exporte bien `default`, `CharterSection`, `normalizeHex` (+ le type `AnalysisResult`, vérifié par `tsc`).
6. Bio Instagram : `sources_failed: ["instagram"]` → « Coller ma bio Instagram → », saisie, « Réanalyser avec ma bio » appelle `onReanalyzeWithBio` avec le texte nettoyé.

**Lot T fait (15/10/2026).** Tests 1 et 2 : `src/test/branding-review-save.test.tsx` (33 cas, via « Je valide tout »). Tests 3 à 6 : `src/test/branding-review-behaviors.test.tsx` (10 cas, faux `BrandingCoachingFlow` qui appelle `onComplete`).

**Lot 1 fait (15/10/2026).** Affichage pur sorti dans `src/components/branding/review/` (`types.ts`, `ReviewBits.tsx`, `SectionViews.tsx`, `OffersSection.tsx`, `CharterSection.tsx`), à l'identique (seuls des `export` ajoutés). `BrandingReview.tsx` : 1411 → 1013 lignes ; il réexporte `AnalysisResult`, `CharterSection` et `normalizeHex`.

**Lot 2 fait (15/10/2026).** Écritures sorties dans `src/lib/branding-review-save.ts` (`writeOrThrow`, `fillBrandProfileSynthesis`, les 7 `save*`, `SAVE_FNS`, `QUERY_KEYS`), à l'identique : colonne de portée toujours choisie à la main. `BrandingReview.tsx` : 1013 → 685 lignes, sorti du cliquet. `branding-review-save.test.tsx` gagne 5 cas qui appellent `SAVE_FNS` directement (donnée vide, offre sans nom, homonymes dans l'import, mise à jour sans ligne, `QUERY_KEYS`).

**Lot 3 fait (15/10/2026).** Navigation sortie dans `src/components/branding/review/use-review-carousel.ts` (`useReviewCarousel(coachingSection)` : carte en cours, `goTo` / `goNext` / `goPrev`, flèches du clavier, swipe), à l'identique. `toReview` et `validatingAll` restent dans le composant (validation, lot 4). `BrandingReview.tsx` : 685 → 647 lignes.

**Lot 4 fait (15/10/2026).** Validation sortie dans `src/components/branding/review/use-review-validation.ts` (`validated`, `written`, `savingRef`, `markValidated`, « à revoir », confettis, `logEvent`, « Garder tel quel », « C'est bon », « Je valide tout »), à l'identique, listes de dépendances comprises. Seul changement de forme : la fin du coaching devient `completeCoaching(section)` (même corps, la section passée en paramètre). `editedOffers` / `editedCharter` sont déclarés avant l'appel du hook. `BrandingReview.tsx` : 647 → 487 lignes.

**Lot 5 fait (15/10/2026) : fiche terminée.** Écrans sortis dans `review/ReviewHeader.tsx` (avec la bio Instagram et le calcul des sources), `ReviewCard.tsx`, `ReviewEndCard.tsx` et `ReviewStickyBar.tsx`, à l'identique ; chaque bloc reçoit ses valeurs en props typées. `BrandingReview.tsx` : 487 → 184 lignes (1 411 au départ). Restent à faire, en PR séparées : étape 7 ci-dessous (code mort, helper de portée qui corrige le constat du lot T, boutons « OK », connecteurs intelligents).

> **Constat du lot T (non corrigé, pas un déplacement).** En compte personnel (espace = id de l'utilisatrice), `saveCharter`, `saveTone`, `saveValueProp`, `saveStrategy` et `fillBrandProfileSynthesis` lisent leur fiche unique avec `.eq("user_id", …)` **sans** `.is("workspace_id", null)`, contrairement à `readImportRows` (histoire, client·e idéal·e, offres). Une personne qui a aussi un espace nommé peut donc voir la charte (ou le profil) de cet autre espace complétée, ou la validation bloquée par « plusieurs lignes ». À corriger dans la PR « un seul helper de portée » (étape 7), avec un test qui pose une ligne `workspace_id: "w9"` en compte personnel. ✅ **Corrigé le 15/10/2026** : `reviewScope()` + `selectInScope()` dans `src/lib/branding-review-save.ts` remplacent les 8 copies ; en compte personnel, toutes les lectures filtrent aussi `workspace_id is null` (règle de `readImportRows`). Test ajouté (lignes `w9` dans charte, profil, proposition, stratégie : intactes) ; il échoue sur l'ancien code.

**Risque et ordre conseillé**

Niveau : **moyen**. Le fichier est très corrigé : 16 commits depuis le 17/07/2026, dont 7 corrections, presque toutes sur l'écriture en base (`#1437` faux « déjà commencé », `#1383` charte déjà remplie qui plantait, `#976` fiabilisation des imports, `#657` refaire son onboarding, `#645` type de la fiche, `622b61ce6` vraies couleurs du site, `#735` « Je valide tout » remonté). Les bugs passés sont des « verts menteurs » (succès affiché alors que rien n'est écrit) et des écrasements de saisie : c'est exactement ce que le découpage des écritures peut réveiller. L'affichage, lui, est sans risque (composants purs). Bonne nouvelle : aucun test ne lit le texte du fichier, et un seul écran le monte.

Une PR par lot. À chaque lot : `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run src/test/branding-review-carousel.test.tsx src/test/branding-import-regressions.test.tsx src/test/branding-review-charter.test.tsx src/test/fill-only-empty.test.ts src/test/identity-page-scope.test.tsx` (+ le nouveau test), puis `npm test`. Après fusion : `node scripts/cliquet-dette.mjs --update` (la référence ne fait que baisser ; les nouveaux fichiers restent sous 800 lignes). Pas de session Lovable ouverte sur /branding pendant ces PR.

1. **Lot T** : tests 1 à 6. Aucun code touché.
2. **Lot 1 (affichage pur)** : `review/types.ts`, `ReviewBits.tsx`, `SectionViews.tsx`, `OffersSection.tsx`, `CharterSection.tsx` + réexportations. Mettre à jour les commentaires qui citent « BrandingReview/CharterSection ».
3. **Lot 2 (écritures)** : `src/lib/branding-review-save.ts`, à l'identique (colonne choisie à la main conservée). Le test 1 passe à l'appel direct de `SAVE_FNS`.
4. **Lot 3 (navigation)** : `review/use-review-carousel.ts`.
5. **Lot 4 (validation)** : `review/use-review-validation.ts`. Le plus délicat : relire le diff ligne à ligne (`written`, `savingRef`, ordre `markValidated` → `clearToReview` → `goNext`).
6. **Lot 5 (écrans)** : `ReviewHeader.tsx`, `ReviewCard.tsx`, `ReviewEndCard.tsx`, `ReviewStickyBar.tsx`. Mettre à jour la ligne 15 du classement dans ce document.
7. **Après le découpage, PR séparées (changements de comportement, pas des déplacements)** : retrait du code mort (`onDescribeProject`, `allSourcesFailed`, `projectText`) ; un seul helper de portée dans `branding-review-save.ts` à la place des 8 copies (en gardant la règle actuelle, test 2 à l'appui) ; boutons « OK » renommés ; décision sur les connecteurs intelligents en cas d'`allow_overwrite`. **Les 4 faites le 15/10/2026 : fiche 14 close.**

---

### 15. `src/lib/export-carousel-hybrid-pptx.ts` — 1 767 lignes

**En une phrase :** c'est le fabricant du « PowerPoint — éditable » des carrousels, et donc aussi du bouton « Ouvrir dans Canva » : pour chaque slide, il ouvre le HTML dans un cadre caché, repère les textes, les formes, les photos, les voiles et les emojis, les retire de l'image, photographie ce qui reste (html2canvas), puis empile dans la slide PowerPoint les fonds, la photo d'origine, l'image de fond, les formes, le texte modifiable et le logo. Tout ça dans une seule fonction de 640 lignes (`exportCarouselHybridPptx`), dont 570 pour une seule slide.

> Lignes vérifiées le 15/10/2026 (dernier commit sur le fichier : `ce1ad326c`, 04/10/2026). Les numéros bougent à chaque modification : le **repère** (nom de fonction ou commentaire `// ----`) est la référence fiable.

**Qui l'appelle**

- `src/hooks/use-creer-exports.ts` (l. 118 et 144) : **import dynamique** (`await import("@/lib/export-carousel-hybrid-pptx")`) pour le téléchargement PowerPoint de /creer et pour « Ouvrir dans Canva » (`returnBlob: true`, `onProgress`).
- `src/components/calendar/CalendarPostPreview.tsx` (l. 8) : **import direct** (`exportCarouselHybridPptx`, type `OriginalPhoto`), appelé l. 244 (téléchargement) et l. 260 (Canva). Conséquence : pptxgenjs et html2canvas partent déjà dans le paquet de code du calendrier. Ce n'est pas l'objet du découpage, mais il ne faut pas aggraver la chose (voir pièges).
- Tests : `src/test/export-scrim-fusion.test.ts` et `carousel-editor-canva.test.tsx` importent `parseScrimStyle` ; `export-photo-backdrop.test.ts` importe `zoneCoversRect` et `zoneOverlapsRect` ; `creer-publication-exports.test.tsx` remplace tout le module par un faux (`vi.mock('@/lib/export-carousel-hybrid-pptx', …)`) ; `carousel-dom-contract.test.ts` (l. 79) exige que **ce chemin exact** fasse partie des fichiers « front » du contrat `data-*`.
- Bout en bout (hors CI) : `e2e/pptx-mixed-text.spec.ts` et `e2e/pptx-hybrid-photo-occultee.spec.ts` chargent le fichier **par son chemin** (`import('/src/lib/export-carousel-hybrid-pptx.ts')`) ; `e2e-visite/perf-carousel.spec.ts` télécharge le PPTX hybride depuis l'app réelle et l'ouvre avec jszip.
- Mentionné dans le commentaire d'en-tête de `src/lib/export-budget.ts` (budgets de temps partagés avec le pont Canva).

**Comparaison avec `src/lib/export-carousel-pptx.ts` (2 296 lignes)** : pas de code dupliqué à fusionner. Les deux fichiers font deux métiers différents. L'export « classique » **reconstruit** chaque slide à partir des données (un constructeur par type de slide : `buildHookSlide`, `buildTipSlide`, 9 schémas…). L'export hybride **relit le HTML** déjà dessiné. Ils ne partagent que 4 lignes de mise en page (`defineLayout` « INSTAGRAM » 7,5 × 9,375 pouces, `author`) et l'appel à `exportFileName`. La retouche photo se ressemble dans la forme (image → canvas → JPEG) mais pas dans le but : `compressPhotoForPptx` réduit à 1 920 px en qualité 0,75 ; `cropToRatioBase64` recadre au format du cadre en qualité 0,92. La vraie ressemblance est ailleurs : « monter un cadre caché et attendre qu'il soit prêt » existe en 3 versions (`mountIframe`/`waitReady` ici, `src/lib/export-story-pptx.ts` l. 96-121, `src/lib/export-carousel-png.ts` l. 31-128), chacune avec son propre CSS. Ne pas les fusionner pendant ce découpage : ce serait une refonte, pas un déplacement.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| Imports | 1-30 | pptxgenjs, html2canvas-pro, Sentry, budgets (`export-budget`), et une quinzaine de mesureurs de `pptx-font-mapping.ts` (`extractAnnotatedBlocks`, `extractShapeBlocks`, `extractStandaloneEmojiZones`…). |
| Types et dimensions | 32-75 | `VisualSlide`, `OriginalPhoto` (exporté), `PhotoZone`, `SlideData`, `HybridCharter` (exporté) ; slide 1080 × 1350 px = 7,5 × 9,375 pouces, `PX_PER_IN` = 144. |
| Photo : mesure et recadrage | 77-145 | `measureImageNatural` (taille réelle du logo), `cropToRatioBase64` (recadrage centré au format exact du cadre, pour éviter toute déformation dans PowerPoint). |
| Voiles de lisibilité | 147-274 | Le long commentaire explique le défaut Canva du 22/07. `ScrimSpec`, `parseScrimStyle` (exporté : reconnaît les voiles écrits par `photo-overlay-templates`), `burnScrimsIntoPhoto` (cuit le voile dans la photo). |
| Cadre caché | 276-381 | `mountIframe` : le HTML de la slide + polices de la page et de la charte + le CSS qui cache ce qui sera posé à part (`data-pptx-hide`, `data-pptx-photo-hide`, `data-pptx-shape-hide`). `waitReady` : polices, images (`waitForExportImages`), flou du verre dépoli, filtres photo, et la parade contre l'onglet en arrière-plan (rAF contre `setTimeout`). |
| Photographie de la slide | 383-519 | `raceTimeout`, `RASTER_SCALE` = 1,5, `MAX_GRADIENT_CAPTURES` = 0 (désactivé, décision du 27/06), `MAX_EMOJI_CAPTURES` = 24 ; `renderEmojiImage` (emoji isolé dessiné et détouré) ; `captureBody` (html2canvas de toute la slide, borné par `CAPTURE_TIMEOUT_MS`). |
| Texte de secours | 521-598 | `findOverlayElement` et `blockFromElement` (slides photo sans annotation : on retrouve le texte court `overlay_text`), `BlockRender`, `applyTextTransform`. |
| Zones photo et fonds opaques | 600-834 | `stripDataUrlsFromBackground` ; `extractPhotoZones` (annotations `data-pptx-photo`, sinon détection, avec le correctif « même photo sur toutes les slides ») ; `ClearedBackdrop`, `zoneCoversRect` et `zoneOverlapsRect` (exportés) ; `clearOpaqueBackdropsBehindZone` (le défaut du 24/08 : photo en encart cachée par le fond). |
| Placement du texte modifiable | 836-1123 | `isMonoFont`, `desiredTextWidthIn` (marge de largeur contre les polices de remplacement), `BlockLayoutContext`, `CARD_INSET_PX`, `BUDGET_GAP_LINES`, `parentCardOf`, `verticalBudgetPx`, `maxFitPt` (taille mini 15 pt seulement s'il y a la place), `addBlockToSlide` (155 lignes : cadre, police, couleur, une ligne ou plusieurs, réduction de 80 % au plus, surligneur, `fit: "shrink"`). |
| Préparation de l'export | 1125-1168 | Signature de `exportCarouselHybridPptx` ; photos rangées à part remises en données (`inlineSlidesMedia`, `inlineCarouselMedia`, depuis le 04/10) ; mise en page ; logo chargé une fois ; `cropCache` ; slides créées d'avance **dans l'ordre**. |
| Une slide : repérage | 1170-1356 (`renderSlideAt`) | Monte le cadre (1170-1184), `promoteMixedText` ; texte stratégie A annotée / B `overlay_text` / C détection (1189-1225) ; filet de texte non annoté (1227-1251) ; formes (stratégie D, 20 au plus, 1253-1283) ; dégradés en image séparée (1285-1331, éteint) ; emojis isolés (1333-1356). |
| Une slide : photos | 1358-1479 | Zones photo utilisables (pas si `editor_id` : la photo retouchée dans l'éditeur reste dans l'image), repli « photo 1 » + 2 messages Sentry (1359-1408) ; masquage des zones et des fonds opaques, choix du fond natif (1410-1450) ; voiles à cuire dans la photo (1452-1479). |
| Une slide : empilement des calques | 1481-1738 | Photographie (1481-1487) puis, du dessous au-dessus : fonds à repeindre sous la photo (1489-1516), photos d'origine recadrées + voiles cuits (1518-1565), formes natives et pastilles élargies (`drawNativeShape`, `deferredPills`, 1567-1681), image de fond (1684), pastilles, dégradés, emojis (1686-1707), texte (1709-1715), logo (1717-1730). En cas d'erreur : `ExportImageError` remonte, sinon fond uni de la charte (1731-1734). Trace de durée (1735-1738). |
| Lots et sortie | 1741-1767 | Slides traitées `RENDER_CONCURRENCY` par `RENDER_CONCURRENCY`, `onProgress` ; `returnBlob` pour Canva, sinon téléchargement. |

**Découpage proposé** : un dossier `src/lib/export-carousel-hybrid/`, un fichier par mission. `src/lib/export-carousel-hybrid-pptx.ts` reste à sa place, garde `exportCarouselHybridPptx` (la boucle et la sortie, ~90 lignes) et réexporte ce que les autres utilisent (`OriginalPhoto`, `HybridCharter`, `ScrimSpec`, `parseScrimStyle`, `zoneCoversRect`, `zoneOverlapsRect`). Aucun appelant, aucun test, aucun e2e à modifier.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `export-carousel-hybrid/types.ts` | Types (32-69 : `VisualSlide`, `OriginalPhoto`, `PhotoZone`, `SlideData`, `HybridCharter`, plus `BlockRender` 547-555 et `BlockLayoutContext` 878-881) et dimensions (71-75) | Aucune dépendance, à part le type `EditableBlock`/`TextRun` de `pptx-font-mapping.ts` (en `import type`). Seul fichier que tous les autres importent. |
| `export-carousel-hybrid/photo-crop.ts` | `measureImageNatural`, `cropToRatioBase64` (77-145) | Aucun import. Pas de canvas dans jsdom : pas testable en unitaire, seulement par les e2e. |
| `export-carousel-hybrid/scrims.ts` | Le commentaire d'en-tête « Voiles de lisibilité », `ScrimSpec`, `parseScrimStyle`, `burnScrimsIntoPhoto` (147-274) | Garder le commentaire avec le code : il explique le défaut Canva. `parseScrimStyle` dépend du format écrit par `_shared/photo-overlay-templates.ts` (côté serveur, chantier `carousel-visual` : **ne pas y toucher**). |
| `export-carousel-hybrid/iframe.ts` | `mountIframe`, `waitReady` (276-381) | Contient le CSS des attributs `data-pptx-hide`, `data-pptx-photo-hide`, `data-pptx-shape-hide` : à déplacer **caractère pour caractère**. Importe `export-image-readiness`, `export-glass-blur`, `export-photo-filters`, `charterFontUrl`. Garde 2 des 4 `as any` du fichier. |
| `export-carousel-hybrid/capture.ts` | `raceTimeout`, `RASTER_SCALE`, `MAX_GRADIENT_CAPTURES`, `MAX_EMOJI_CAPTURES` (avec leurs commentaires), `renderEmojiImage`, `captureBody` (383-519) | Seul fichier (avec `render-slide.ts`) qui importe **html2canvas-pro**. `CAPTURE_TIMEOUT_MS` reste dans `export-budget.ts` (le pont Canva en déduit son budget : ne pas le recopier). |
| `export-carousel-hybrid/text-blocks.ts` | `findOverlayElement`, `blockFromElement`, `applyTextTransform` (521-598, sans `BlockRender` parti dans `types.ts`) | Aucun import lourd. |
| `export-carousel-hybrid/photo-zones.ts` | `stripDataUrlsFromBackground`, `extractPhotoZones`, `ClearedBackdrop`, `zoneCoversRect`, `zoneOverlapsRect`, `clearOpaqueBackdropsBehindZone` (600-834) | Lit `data-pptx-photo` (attribut **partagé** avec le serveur). Importe `normalizeHex`. Pas de pptxgenjs ni html2canvas : doit rester léger. |
| `export-carousel-hybrid/text-layout.ts` | `isMonoFont`, `desiredTextWidthIn`, `CARD_INSET_PX`, `BUDGET_GAP_LINES`, `parentCardOf`, `verticalBudgetPx`, `maxFitPt`, `addBlockToSlide` (836-1123) | Lit `data-photo-reading-panel`, `data-photo-text-layout`, `data-photo-editorial-text`. N'a besoin de pptxgenjs **que pour les types** : écrire `import type PptxGenJS from "pptxgenjs"`. Tous les commentaires datés (audit fidélité 10/07, #425, #179) partent avec le code. |
| `export-carousel-hybrid/render-slide.ts` | Le corps de `renderSlideAt` (1170-1738) devient `renderHybridSlide(ctx, i)` | **Seul déplacement qui n'est pas strictement à l'identique** : la fonction interne lit aujourd'hui 8 variables de `exportCarouselHybridPptx` (`visualSlides`, `slidesData`, `charter`, `originalPhotos`, `slideObjs`, `cropCache`, `logoBase64`, `logoSize`). Les passer dans un objet `ctx`, sans rien changer d'autre. `cropCache` doit rester **un seul** objet partagé par toutes les slides. Garder les 2 messages Sentry mot pour mot (ils servent de filtre dans Sentry) et le `throw` de `ExportImageError` (l'export doit refuser une image manquante). ~570 lignes : sous les 800, donc hors cliquet. |
| `src/lib/export-carousel-hybrid-pptx.ts` (entrée) | Préparation (1129-1168), boucle par lots (1741-1758), sortie (1760-1767), réexports | Garder ce **chemin exact** : import dynamique de `use-creer-exports.ts`, import direct de `CalendarPostPreview.tsx`, `vi.mock` de `creer-publication-exports.test.tsx`, chemin en dur des 2 e2e, ligne 79 de `carousel-dom-contract.test.ts`. |

Option pour plus tard (pas dans ce plan) : couper `render-slide.ts` en `collect-layers.ts` (repérage 1185-1356), `photo-layers.ts` (1358-1479) et `place-layers.ts` (1489-1730). À ne faire que si une correction future le demande : l'ordre des calques est le cœur du fichier et il est plus lisible d'un seul tenant.

**Pièges propres à ce fichier**

1. **Le nom du dossier n'est pas libre.** `carousel-dom-contract.test.ts` ne relit côté front que les fichiers qui commencent par `src/lib/carousel` ou `src/lib/export-carousel` ; `scripts/impact-creation.mjs` (l. 85) range `src/lib/export-carousel-*` sous « Carrousels : exports ». Un dossier `src/lib/export-carousel-hybrid/` reste dans les deux. Un nom comme `src/lib/pptx-hybrid/` en sortirait : le contrat `data-*` ne verrait plus les attributs réservés au front (`data-pptx-hide`…) et le rapport d'impact n'annoncerait plus « exports ».
2. **Les étiquettes `data-*` (règle n°8 de CLAUDE.md).** Le fichier lit 10 attributs, dont 7 partagés avec le serveur (`data-pptx-editable`, `data-pptx-photo`, `data-pptx-shape`, `data-injected-scrim`, `data-photo-reading-panel`, `data-photo-text-layout`, `data-photo-editorial-text`). Le découpage n'en renomme aucun et n'ajoute rien à `supabase/functions/_shared/carousel-dom-contract.ts`. Les noms sont écrits par `supabase/functions/carousel-visual/`, `src/lib/carousel-editor.ts` et `src/components/creer/CarouselEditor.tsx` : **chantiers en cours ailleurs, à ne pas toucher**. Contrainte : ne pas ouvrir une PR de ce découpage en même temps qu'une PR qui renomme un attribut. Sinon le renommage atterrit dans l'ancien fichier, et la fusion le perd sans erreur visible.
3. **Le poids du code.** pptxgenjs et html2canvas sont lourds. Le pont Canva (`use-open-in-canva.ts`) et `export-budget.ts` ont été séparés exprès pour ne pas les tirer. Règle : aucun fichier de l'appli (hors tests) n'importe directement `src/lib/export-carousel-hybrid/*`. Les petites fonctions pures (`parseScrimStyle`, `zoneCoversRect`) ne doivent pas importer html2canvas ou pptxgenjs, sauf en `import type`. Après chaque lot : `npm run check-build`.
4. **Des tests qui dépendent du chemin**, pas du texte : aucun test ne lit le code comme du texte, mais 5 tests et 2 e2e importent ou remplacent le fichier par son chemin. Comme l'entrée reste et réexporte, rien à changer. Si un test vise un jour une fonction déplacée, le faire pointer vers le nouveau fichier dans la même PR.
5. **Les e2e ne tournent pas en CI** (piège commun 4). Or c'est le seul endroit où la vraie photographie (canvas, html2canvas, polices) est testée. Il faut les lancer à la main avant et après chaque lot (voir test 5).
6. **Le cliquet anti-dette.** Le fichier compte 4 `any` gelés (l. 361, 362, 1365 ×2). Ils partent dans `iframe.ts` et `render-slide.ts`, qui restent sous 800 lignes. Après chaque lot : `node scripts/cliquet-dette.mjs --update` pour baisser la référence.

**Tests qui le protègent aujourd'hui**

- `src/test/export-scrim-fusion.test.ts` (9 cas) : `parseScrimStyle` (dégradé en haut ou en bas, sans angle, voile uni, teinte de la marque, refus d'un fond opaque ou d'un dégradé inconnu).
- `src/test/export-photo-backdrop.test.ts` (6 cas, dont une boucle sur les gabarits en encart) : `zoneCoversRect` / `zoneOverlapsRect`.
- `src/test/carousel-editor-canva.test.tsx` : `parseScrimStyle` relit l'intensité d'un voile réglée dans l'éditeur.
- `src/test/creer-publication-exports.test.tsx` : seulement **quand** /creer appelle l'export (le module est remplacé par un faux).
- `src/test/carousel-dom-contract.test.ts` : les attributs `data-*` lus par le fichier sont déclarés dans le contrat.
- `src/test/pptx-validate.test.ts` : teste le **vérificateur** de PPTX utilisé par les e2e (fond aplat hybride, photo occultée par une forme), pas l'export lui-même.
- Hors CI : `e2e/pptx-mixed-text.spec.ts` (chaque mot exporté une seule fois en texte modifiable, pas de texte sombre dans l'image, polices de la charte), `e2e/pptx-hybrid-photo-occultee.spec.ts` (photo en encart jamais cachée), `e2e-visite/perf-carousel.spec.ts` (export depuis l'app réelle).

Jamais testés en CI (vérifié par grep) : `extractPhotoZones` (et le correctif « même photo partout »), `clearOpaqueBackdropsBehindZone`, `stripDataUrlsFromBackground`, tout le placement du texte (`desiredTextWidthIn`, `parentCardOf`, `verticalBudgetPx`, `maxFitPt`, `addBlockToSlide`), le repli « photo 1 », l'ordre des calques, `returnBlob` / `onProgress`, le fond de secours en cas d'erreur. Le placement du texte, c'est 290 lignes et la majorité des corrections de l'été (10/07, #179, #420, #425).

**Tests à ajouter AVANT de découper**

1. **Rendre testables les fonctions internes** (lot T, seule retouche de code permise) : ajouter le mot `export` devant `desiredTextWidthIn`, `parentCardOf`, `verticalBudgetPx`, `maxFitPt`, `addBlockToSlide`, `applyTextTransform`, `stripDataUrlsFromBackground`, `isMonoFont`, `extractPhotoZones`, `clearOpaqueBackdropsBehindZone`, `findOverlayElement`. Rien d'autre ne change.
2. `src/test/export-hybrid-text-layout.test.ts` (environnement node, comme `export-scrim-fusion.test.ts`) : une fausse slide qui note chaque `addText` (même procédé que `export-pinterest-editable-pptx.test.ts`). Cas pour `addBlockToSlide`, avec un instantané des options : texte centré, aligné à droite, dans une carte (bord intérieur respecté), carte trop étroite (repli sur la boîte HTML), petite police montée à 15 pt quand il y a la place, refusée quand le bloc suivant est trop près, réduction à 80 % au plus, une ligne (`wrap: false`), runs avec surligneur, `uppercase`, panneau de lecture photo (largeur brute). Plus des cas directs : `desiredTextWidthIn` (mono une ligne, mono +25 %, serif +18 %), `parentCardOf` (plus petite carte, pastilles ignorées), `verticalBudgetPx` (voisin de la même colonne, autre colonne ignorée, bas de carte), `maxFitPt` (une ligne, plusieurs lignes).
3. `src/test/export-hybrid-photo-zones.test.tsx` (environnement jsdom) : jsdom renvoie des rectangles vides, donc remplacer `getBoundingClientRect` dans le test par une lecture de positions données. Cas : `extractPhotoZones` avec annotations (index invalide ignoré, doublon signalé), sans annotation avec `fallbackPhotoIndex` = 3 (la slide 3 doit recevoir la photo 3 et non la 1), image de fond en `data:` ; `clearOpaqueBackdropsBehindZone` (photo plein cadre : effacer suffit ; photo en encart : à repeindre ; fond à texture : laissé ; voile semi-transparent : laissé) ; `stripDataUrlsFromBackground` (dégradé gardé, `data:` retiré, virgules dans les parenthèses, tout retiré donne `none`) ; `findOverlayElement` (le plus petit élément qui contient le texte).
4. **Contrat d'ordre des calques**, `src/test/export-hybrid-layer-order.test.tsx` : faux pptxgenjs qui note les appels dans l'ordre, faux html2canvas, `export-image-readiness`, `export-glass-blur`, `export-photo-filters`, `carousel-media` et `export-logo` remplacés. On vérifie : l'ordre fond sous photo → photo → formes → image de fond → pastilles → emojis → texte → logo ; slides dans l'ordre malgré le traitement par lots ; `onProgress` appelé une fois par slide ; `returnBlob` rend un Blob ; `editor_id` = pas de photo d'origine ; `ExportImageError` remonte, une autre erreur donne le fond uni de la charte. **À vérifier d'abord** : que jsdom charge bien un cadre `srcdoc`. Si non, poser ce test juste après le lot 2 (en remplaçant `export-carousel-hybrid/iframe.ts` par un faux), et **avant** le lot 4.
5. **Référence e2e avant/après** : ajouter à `e2e/pptx-hybrid-photo-occultee.spec.ts` et `e2e/pptx-mixed-text.spec.ts` une comparaison du XML des slides (`ppt/slides/slide*.xml`, sans le contenu des images) avec un fichier de référence enregistré. À lancer à la main avant chaque lot pour créer la référence, puis après : `npx playwright test e2e/pptx-mixed-text.spec.ts e2e/pptx-hybrid-photo-occultee.spec.ts`. Un XML identique prouve un déplacement à l'identique.
6. **Liste des exports** : un test vérifie que `export-carousel-hybrid-pptx.ts` exporte exactement `exportCarouselHybridPptx`, `parseScrimStyle`, `zoneCoversRect`, `zoneOverlapsRect` (+ types). Il repère un réexport oublié.

**Risque et ordre conseillé**

Niveau : **moyen**. Ce n'est pas un générateur (aucun prompt, aucun crédit), mais c'est la sortie que l'utilisatrice récupère, par 3 chemins : PowerPoint depuis /creer, Canva depuis /creer, PowerPoint et Canva depuis le calendrier. Le fichier bouge beaucoup : `git log --since=2026-07-17` donne 15 commits (plus 1 fusion), dont 3 corrections marquées `fix` (`0aeb127a8` photo en encart occultée, `37135ea97` export Canva qui se bloquait, `d24c03aa0` reprise et export carrousel), et les derniers datent du 01 au 04/10 (voiles teintés, verre dépoli, photos rangées à part). Ce qui protège vraiment le rendu (e2e) ne tourne pas en CI. Les déplacements de fonctions sont sans risque ; le seul passage délicat est le lot 4 (la fonction interne devient une fonction à part).

Une PR par lot :
1. **Lot T** : tests 1, 2, 3 et 6 (le seul code touché est le mot `export`). Créer la référence XML du test 5.
2. **Lot 1** : `types.ts`, `photo-crop.ts`, `scrims.ts`, `photo-zones.ts` + réexports dans l'entrée.
3. **Lot 2** : `iframe.ts`, `capture.ts`, `text-blocks.ts`. Puis poser le test 4 s'il n'a pas pu l'être au lot T.
4. **Lot 3** : `text-layout.ts`.
5. **Lot 4** : `render-slide.ts` (objet `ctx`). L'entrée tombe à ~90 lignes. Relire le diff ligne à ligne : seuls les noms des 8 variables partagées ont le droit de changer.
6. **Lot 5 (documentation)** : en-tête de `export-budget.ts` (« le fabricant » devient `export-carousel-hybrid/capture.ts`), `docs/creation-contenu/CARTE.md` (ligne des tests carrousel) et cette fiche.

Vérifications à chaque PR : `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint src/lib/export-carousel-hybrid*`, `node scripts/cliquet-dette.mjs`, `npm run check-build` (pptxgenjs et html2canvas toujours chargés à la demande depuis /creer), puis les 2 e2e `pptx-*` lancés à la main avec un XML identique à la référence. Pas de session Lovable ouverte sur les exports pendant ces PR. Ce découpage ne dépend d'aucune autre fiche. Il doit seulement éviter de croiser une PR qui renomme un attribut `data-*` (chantiers `carousel-visual` et éditeur).

**Avancement (15/10/2026)** : lot T fait. Seul code touché : le mot `export` devant 11 fonctions et 4 types internes. `src/test/export-hybrid-text-layout.test.ts` (24 cas, 11 instantanés des options passées à pptxgenjs : alignements, carte, carte trop étroite, plancher 15 pt accordé ou refusé, réduction à 80 %, une ligne, runs surlignés, police et couleur de la charte, panneau de lecture photo). `src/test/export-hybrid-photo-zones.test.tsx` (12 cas : annotations, repli « photo N de la slide N », fonds plein cadre / en encart / à texture / voile, `stripDataUrlsFromBackground`, `findOverlayElement`) ; jsdom n'ayant pas de mise en page, les rectangles sont lus dans un attribut `data-r` à l'intérieur d'un vrai cadre. `src/test/export-hybrid-exports.test.ts` fige la liste des exports. Test 5 posé : `e2e/pptx-reference.ts` compare le XML des slides des deux e2e `pptx-*` à une référence locale (`PPTX_REF=save` avant un lot, `PPTX_REF=check` après ; vérifié qu'un changement d'une option la fait échouer). Les e2e tournent dans une session cloud avec `npx vite --host 127.0.0.1 --port 8080` et une config Playwright qui pointe vers `/opt/pw-browsers/chromium`. Test 4 (ordre des calques) reporté après le lot 2 : jsdom ne charge pas les cadres `srcdoc`. Lot 1 fait : `export-carousel-hybrid/types.ts` (types et dimensions, `BlockRender` et `BlockLayoutContext` compris), `photo-crop.ts`, `scrims.ts` (avec le commentaire du défaut Canva) et `photo-zones.ts`, déplacés à l'identique ; l'entrée les réexporte (liste des exports inchangée). Entrée 1 767 → 1 254 lignes ; XML des slides des 2 e2e identique à la référence. Lot 2 fait : `iframe.ts` (`mountIframe`, `waitReady`, CSS des attributs `data-pptx-*-hide` caractère pour caractère), `capture.ts` (`raceTimeout`, échelle et plafonds avec leurs commentaires, `renderEmojiImage`, `captureBody`) et `text-blocks.ts` ; entrée → 943 lignes, 2 `any` partis dans `iframe.ts`. Test 4 posé : `src/test/export-hybrid-layer-order.test.tsx` (6 cas) remplace `iframe.ts` par un faux cadre jsdom et fige l'ordre fond sous photo → photo → formes → image de fond → pastilles → emojis → texte → logo, l'ordre des slides malgré les lots, `onProgress`, `returnBlob`, `editor_id`, le fond de secours et `ExportImageError`. Constat (non corrigé) : une erreur de `mountIframe` (cadre qui ne charge pas en 8 s) est levée **avant** le `try` de la slide, donc elle fait échouer tout l'export au lieu de donner le fond de secours ; à décider dans une PR à part. Lot 3 fait : `text-layout.ts` (`isMonoFont`, `desiredTextWidthIn`, `CARD_INSET_PX`, `BUDGET_GAP_LINES`, `parentCardOf`, `verticalBudgetPx`, `maxFitPt`, `addBlockToSlide`, avec leurs commentaires datés), pptxgenjs importé en `import type` ; entrée → 680 lignes, sortie du cliquet (moins de 800) ; instantanés du placement, ordre des calques et XML des e2e inchangés. Lot 4 fait : `render-slide.ts`, `renderHybridSlide(ctx, i)` = corps de l'ancienne `renderSlideAt`, recopié à l'identique (vérifié ligne à ligne) ; les 8 variables lues autour arrivent dans `ctx` sous le même nom (`HybridSlideContext`), `cropCache` reste un seul objet partagé ; messages Sentry et `throw` d'`ExportImageError` inchangés. Entrée → 98 lignes (préparation, boucle par lots, sortie, réexports) ; `render-slide.ts` 612 lignes. Lot 5 fait : en-tête de `export-budget.ts` (le fabricant inclut désormais le dossier, dont `capture.ts`), ligne des tests carrousel de `docs/creation-contenu/CARTE.md`. **Fiche 15 terminée** (`export-carousel-hybrid-pptx.ts` 1 767 → 98 lignes, 9 fichiers dans `src/lib/export-carousel-hybrid/`, tous sous 800 lignes). Reste, hors fiche : le constat `mountIframe` ci-dessus.

---

### 16. `src/components/creer/ReelMontage.tsx` — 917 lignes

**En une phrase :** c'est l'écran « Monter la vidéo » d'un reel : il fait choisir entre « Je me filme » et « Je ne me montre pas », propose un clip par phrase (banque libre, vidéos de la créatrice, clips du Studio vidéo), gère la voix enregistrée, les plans du Studio posés sur un passage, puis lance l'assemblage en MP4, le range dans la bibliothèque et propose le téléchargement. Tout ça dans un seul composant de 22 `useState`, 9 `useRef` et 9 `useEffect`.

> Lignes vérifiées sur le fichier au 15/10/2026 (dernier commit sur le fichier : `43263bfdf`, 29/09/2026). Le fichier a 0 `as any` / `: any` (référence du cliquet : 917 lignes, 0 `any`).

Repères :
- **Un seul endroit l'affiche** : `src/components/creer/formatRenderers/ReelResult.tsx` (import l. 34, rendu l. 279-287), à l'étape « Montage » du parcours reel en 4 étapes. Il est monté à la première visite de l'étape et **jamais démonté ensuite** (caché par `hidden`), pour que les clips choisis survivent à un aller-retour vers la légende.
- **Ce qu'il renvoie à la page** (5 props de sortie) : `initialProject` / `onProjectChange` (le projet de montage, rangé dans `result.montage_project`, donc sauvegardé avec le contenu par /creer) ; `onPhaseChange` (`idle` / `rendering` / `done` / `error`, lu par `ReelResult` pour `montageDone`) ; `onMp4Ready` (l'URL **durable** du MP4, ou `null`), qui part vers la publication Instagram via `onMp4Change` de `ReelResult`.
- **Fonctions serveur appelées** (toujours via une bibliothèque `src/lib`, jamais en direct) :
  - `reel-render` (actions `submit`, `status`, `archive`) via `src/lib/reel-render.ts` : `submitReelRender`, `pollReelRender`, `archiveReelMp4`. Le calcul du plan (`buildRenderPlan`, `sectionDuration`, `countSectionsWithoutVoice`…) vit dans `src/lib/reel-plan.ts`, réexporté par `reel-render.ts`.
  - `stock-photo-keywords` (mots-clés IA) via `suggestStockKeywords` (`src/lib/stock-photos.ts`, réexporté par `stock-videos.ts`) et `stock-video-search` (Pexels) via `searchStockVideos`. Aucune de ces trois fonctions n'appelle `checkQuota` (vérifié par grep) : le montage ne consomme pas de crédit.
  - `studio-video` via `readStudioVideo` (`src/features/studio-video/api.ts`, passe par `invokeWithTimeout`).
  - Le stockage `calendar-media` (dépôt et liste des vidéos de la créatrice) via `src/lib/reel-user-videos.ts`.
- **Composants enfants** : `ReelVoiceRecorder` (téléprompteur, 326 lignes, à part) et `StudioVideoPanel` (dans la boîte de dialogue Studio).
- **Liens avec d'autres écrans, par des chaînes de caractères** (aucun import) : paramètres d'URL `studio_passage` et `studio_clip` (posés au retour du Studio photo par `VisualStudioPage.tsx`, lus aussi par `ReelResult.tsx` l. 154) ; clé de session `studio-video-for-reel:<workspace>` (posée par `src/features/studio-video/VideoLibrary.tsx` l. 53) ; lien sortant `/photos/studio?reel_passage=<i>` ; brouillon Studio `studio-video:<user>:<workspace>:reel:…`.
- Le rapport d'impact le connaît : `scripts/impact-creation.mjs` l. 88 (« Reel : écran de montage »), cas dans `src/test/impact-creation.test.ts` l. 99. `docs/creation-contenu/CARTE.md` le cite l. 34 et l. 712.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Types et petits outils | 54-137, 912-917 | `Section`, `Props`, `Phase`, `SelectedClip` (source `stock` / `mine` / `studio`), `StudioCutaway`, **`ReelMontageProject` (exporté)**, `fromStock`, `fromMine`, `MontageMode` (`"filme"` / `"cache"`, `null` tant que rien n'est choisi), et l'outil `set` (remplace la case `i` d'un tableau, utilisé partout). |
| 2. Retour du Studio (photo, vidéo, bibliothèque) | 151-180 | États `studioTarget` (boîte de dialogue ouverte sur quel passage) et `pendingCutaway` (clip à prévisualiser) ; lecture de `studio_passage` / `studio_clip` dans l'URL et de `studio-video-for-reel:<workspace>` en sessionStorage **à chaque rendu** ; effet qui relit le clip une seule fois (`returnClipLoaded`) puis efface la clé de session ; effet qui fait défiler jusqu'au passage `studio-reel-passage-<i>`. |
| 3. Texte du script modifié après le montage | 181-190, 844-847 | `associationTexts`, `needsReview` (le texte a changé depuis le projet sauvegardé), empreinte `sectionFingerprint` ; bandeau « Le texte du Reel a changé… » et bouton « J'ai vérifié les passages ». |
| 4. Voix | 215-221, 578-626 | `voiceMode` (`recorded` / `silent`, pas de voix synthétique), `voiceClips` (URL + durée de chaque prise) ; boutons « Ma voix off » / « Sans voix », mention honnête « Le son de tes vidéos n'est pas conservé… », `ReelVoiceRecorder`. |
| 5. Sauvegarde du projet et invalidation du MP4 | 223-264 | `renderKey` (empreinte de tout ce qui change la vidéo, URL du Studio retirées) ; envoi du projet à `onProjectChange` **sauf au premier rendu** (`lastPersistedProject`) ; compteur de génération `activeRender` (modifié pendant le rendu, l. 243-245) pour ignorer les réponses tardives ; effet qui remet `archived` à faux et appelle `onMp4Ready(null)` quand une entrée change, **sauf au premier rendu** (`seenRenderKey`, sinon la reprise d'un reel déjà monté effaçait le MP4 restauré). |
| 6. Banque libre (Pexels) | 147-148, 191, 266-311, 653-699 | `keywords`, `results`, `loading` ; recherche initiale **une seule fois par montage du composant** (`stockSearchStarted`), seulement en mode « Je ne me montre pas » ; `runSearch` (6 clips portrait, ne remplace jamais un clip `mine` ou `studio`) ; champ de mots-clés, bouton loupe, vignettes cliquables. |
| 7. Mes vidéos (dépôt et bibliothèque) | 193-197, 313-347, 701-737, 786-812, 818-824 | `myVideos`, `uploadingSection`, `fileInputRef`, `uploadTargetRef` ; chargement de la bibliothèque ; `openFilePicker`, `handleFileChosen` (dépôt + durée), `pickFromLibrary` ; bouton « Ma vidéo », liste « Mes vidéos déjà déposées… », badges ; curseur « Fenêtre » (choix du moment de la vidéo, mode « cache » seulement) ; champ fichier caché. |
| 8. Plans du Studio sur un passage | 739-784, 893-907 | Encadré « Ajouter un plan du Studio sur ce passage » (choisir, créer, préparer une image) ; prévisualisation et « Insérer dans ce passage » (clip de fond si le passage n'en a pas et que le clip est assez long, sinon plan de coupe limité à la durée de la scène) ; curseur « Début du plan », « Retirer ce plan » ; boîte de dialogue `StudioVideoPanel` avec `draftKey` et la consigne préremplie (texte parlé coupé à 680 caractères). |
| 9. Assemblage (rendu) | 349-464 | `handleAssemble` : gardes (texte à revérifier, clip Studio muet en mode « filme », aucun clip, phrase enregistrée sans clip → `window.confirm`, phrase sans voix → refus), URL du Studio signées à nouveau (`readStudioVideo`), `buildRenderPlan` selon le mode, sous-titres à la charte (`subtitleSettingsFromCharter`), `submitReelRender` + `pollReelRender`, puis archivage chez nous. |
| 10. Rangement et téléchargement du MP4 | 199-213, 466-514 | États `phase`, `tick`, `mp4Url`, `archived`, `errorMsg`, `archiving`, `downloadFailed`, `downloading`, refs `completedRender`, `archiveBusy` ; remontée de `phase` à la page ; `handleArchiveRetry` (« Ranger cette vidéo » sans relancer le rendu) ; `handleDownload` (téléchargement direct, sinon lien « Ouvrir le MP4 dans un nouvel onglet »). |
| 11. Affichage | 516-892 | En-tête « Monter la vidéo » + badge beta (518-525) ; fourche à deux modes égaux (527-558) ; rappel du mode et « Changer » (561-576) ; conseil 1080p du mode « filme » (628-633) ; une carte par phrase (635-816, missions 6 à 8 mélangées dedans) ; pied « x clips sur y prêts » + « Assembler mon reel » (826-843) ; alerte clip Studio muet (848-850) ; progression, erreur, lecteur vidéo, téléchargement et statut « Rangée dans ta bibliothèque » (852-890). |

**Découpage proposé** : un dossier `src/features/reel-montage/`, sur le modèle de `src/features/studio-video/`. `ReelMontage.tsx` reste à sa place, garde le `export default` et **réexporte** `type ReelMontageProject` : ni `ReelResult.tsx`, ni les deux tests qui l'importent n'ont à changer. Il garde aussi l'appel des hooks dans le même ordre et le squelette du JSX.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/reel-montage/types.ts` | `Section`, `Phase`, `SelectedClip`, `StudioCutaway`, `ReelMontageProject`, `MontageMode`, `fromStock`, `fromMine`, `set` (mission 1). | `ReelMontageProject` est la forme de `result.montage_project`, sauvegardée en base avec le contenu : **ne renommer aucun champ** (`version`, `sectionTexts`, `montageMode`, `voiceMode`, `clips`, `voiceClips`, `cutaways`). Garder le nom `set` ou le renommer partout dans la même PR. `Props` reste dans `ReelMontage.tsx`. |
| `src/features/reel-montage/montage-project.ts` | En fonctions pures : le calcul de `renderKey` (225-228) et la construction du projet sauvegardé (233-235). Les deux retirent l'URL des clips et plans du Studio : aujourd'hui le code est écrit deux fois. | Garder **exactement** l'ordre des clés dans `JSON.stringify` : un ordre différent change la clé, donc invalide le MP4 d'un reel déjà monté à la première modification. `reelSourceKey` (`src/lib/reel-publication`) est aussi utilisé par la publication : l'importer, ne pas le copier. |
| `src/features/reel-montage/assemble-guards.ts` | Les gardes du début de `handleAssemble` (350-390) en une fonction pure qui rend « ok », « refus + message » ou « confirmation + message ». | Les messages sont lus par les tests (« Un clip du Studio est muet… », « Choisis au moins un clip… ») : à l'identique, apostrophes comprises (le fichier mélange `'` et `’`). Le `window.confirm` et le `toast` restent dans le composant. Les deux comptes viennent de `reel-plan.ts` (`sectionsWithVoiceButNoClip`, `countSectionsWithoutVoice`), déjà testés dans `reel-render.test.ts`. |
| `src/features/reel-montage/build-montage-plan.ts` | Nouvelle signature des URL du Studio (401-414) + choix du plan selon le mode (415-432) : `buildMontagePlan({ spoken, clips, cutaways, montageMode, voiceMode, voiceClips, charter, workspaceId })`. | Async (appelle `readStudioVideo`), mais sans état React : testable seul. `voice_mode: "tts"` du mode « filme » est voulu (ignoré par le moteur), garder le commentaire. |
| `src/features/reel-montage/use-reel-studio-return.ts` | Mission 2 : `studioTarget`, `pendingCutaway`, lecture de l'URL et de la clé de session, les deux effets (151-180). | Trois clés partagées avec d'autres écrans **par du texte** (voir Repères) : `studio_passage`, `studio_clip`, `studio-video-for-reel:`. Le défilement vise l'`id` `studio-reel-passage-<i>` posé par la carte du passage : garder ce nom. Ne pas « nettoyer » la lecture de sessionStorage à chaque rendu dans cette PR : le test « Ma bibliothèque » en dépend (la clé est relue tant que le clip n'est pas chargé). |
| `src/features/reel-montage/use-reel-stock-search.ts` | Mission 6 hors affichage : `keywords`, `results`, `loading`, effet `stockSearchStarted`, `runSearch`. | Écrit dans `clips` (`setClips`) : le recevoir en paramètre, l'état `clips` reste dans le composant. L'annulation lit `activeRender.current.mounted` (mission 5) : passer la ref, pas une copie. **Piège coût** : la recherche initiale doit rester une fois par montage du composant, pas par choix de mode (test « finishes the initial stock search… without a paid retry »). |
| `src/features/reel-montage/use-reel-my-videos.ts` | Mission 7 hors affichage : `myVideos`, `uploadingSection`, `fileInputRef`, `uploadTargetRef`, `openFilePicker`, `handleFileChosen`, `pickFromLibrary`, chargement de la bibliothèque. | Écrit aussi dans `clips` (même règle). `listReelVideos` doit rester appelé **seulement quand le composant est monté** : `reel-result.test.tsx` vérifie qu'aucun appel ne part aux autres étapes. |
| `src/features/reel-montage/use-reel-render.ts` | Missions 5 (invalidation) et 10 + `handleAssemble` (le reste, qui appelle `assemble-guards` et `build-montage-plan`) : `phase`, `tick`, `mp4Url`, `archived`, `errorMsg`, `archiving`, `downloadFailed`, `downloading`, `completedRender`, `archiveBusy`, `activeRender`, `renderBusy`, `mp4Callback`, `seenRenderKey`, `handleArchiveRetry`, `handleDownload`. | **Le plus risqué.** `activeRender` est modifié pendant le rendu (l. 243-245) et partagé avec la recherche Pexels : le hook doit le créer et le rendre. Deux façons d'appeler la page cohabitent : `mp4Callback.current?.(null)` dans l'effet, `onMp4Ready?.(…)` en direct dans `handleAssemble` et `handleArchiveRetry` : **ne pas uniformiser** dans la PR de déplacement. L'affichage lit `completedRender.current?.generation === activeRender.current.generation` (l. 872) : le hook doit exposer les deux refs ou un booléen calculé au rendu. |
| `src/features/reel-montage/MontageModeChoice.tsx` | Fourche « Je me filme » / « Je ne me montre pas » (527-558) et ligne « Changer » (561-576). | Affichage pur. Les tests cherchent les boutons par leur nom (`/Je me filme/`, `/Je ne me montre pas/`, `Changer`) : libellés inchangés. Aucun mode présélectionné (décision du 01/08). |
| `src/features/reel-montage/MontageVoiceChoice.tsx` | Choix de la voix, mention honnête et `ReelVoiceRecorder` (578-626). | Le texte « son de tes vidéos n'est pas conservé dans ce mode » est cherché par `reel-result.test.tsx`. `ReelVoiceRecorder` reçoit `initialClips={voiceClips}` : il garde les prises au remontage (`reel-voice-resume.test.tsx`). |
| `src/features/reel-montage/MontagePassageCard.tsx` | Une carte de passage (636-815), avec dedans : vignettes Pexels, « Ma vidéo » et liste, encadré Studio (prévisualisation, insertion, curseur, retrait), curseur « Fenêtre ». | Le plus gros bloc d'affichage, et il contient de la **logique** : le calcul de la durée de scène est écrit trois fois (755-756, 777-778, et `sectionDuration(s)` pour la fenêtre). Le sortir en une fonction `sceneLength(...)` dans `montage-project.ts` serait plus propre, mais dans une PR **à part**, après le déplacement. Libellés et `aria-label` cherchés par les tests : « Reprendre une de mes vidéos », « Clip sélectionné », « Choisir un clip du Studio », « Insérer dans ce passage ». L'`id` `studio-reel-passage-<i>` reste sur la `Card`. |
| `src/features/reel-montage/MontageResult.tsx` | Pied « Assembler mon reel » (826-843), alertes (844-850), progression, erreur, lecteur, téléchargement, « Ranger cette vidéo », statut (852-890). | Affichage pur si on lui passe les valeurs du hook de rendu. Libellés cherchés par les tests : « Assembler mon reel », « Télécharger le MP4 », « Ouvrir le MP4 dans un nouvel onglet », « Ranger cette vidéo », « Pas rangée dans ta bibliothèque », « montage précédent ». |
| `src/features/reel-montage/StudioClipDialog.tsx` | La boîte de dialogue Studio (893-907). | `draftKey` contient `JSON.stringify([subject, sectionTexts, index])` : un changement de forme fait perdre le brouillon Studio en cours d'une cliente. Le `slice(0, 680)` de la consigne est voulu. Besoin de `user` (`useAuth`). |

Pour chaque nouveau fichier : `scripts/impact-creation.mjs` (l. 88) ne reconnaît aujourd'hui que `ReelMontage.tsx`. Ajouter `^src\/features\/reel-montage\/` à la même ligne (« Reel : écran de montage ») **dans la PR du lot 1**, avec un cas dans `src/test/impact-creation.test.ts` (l. 99), sinon le rapport de CI ne signalera plus une retouche du montage. Mettre à jour `docs/creation-contenu/CARTE.md` (l. 34 et l. 712).

À ne **pas** faire dans ce chantier : toucher `ReelVoiceRecorder.tsx`, `src/lib/reel-plan.ts`, `src/lib/reel-render.ts` ou la fonction `reel-render` (moteur et archivage, qui ont leurs propres tests). Le découpage ne concerne que l'écran.

**Tests qui le protègent aujourd'hui**

Rendu réel du composant :
- `src/test/reel-montage-publication.test.tsx` (15 cas en 13 blocs, le filet principal). Couvre : le MP4 n'est remonté qu'après archivage ; une modification du script garde les prises et le téléchargement mais retire la publication ; archivage raté → téléchargement temporaire, jamais publiable ; réponse tardive ignorée après modification ou démontage (rendu et « Ranger cette vidéo ») ; un 2ᵉ rendu raté garde le 1er téléchargement ; « Ranger cette vidéo » sans relancer le rendu ; téléchargement bloqué (CORS) → lien nouvel onglet ; clip Studio muet refusé en mode « filme » ; insertion d'un plan du Studio ; clip Studio restauré par son identifiant et URL signée à nouveau ; retour du Studio photo sur le bon passage ; clip choisi dans « Ma bibliothèque » puis clé effacée ; recherche Pexels initiale non relancée après un changement de mode. **Tous ces cas passent par le mode « Je me filme » ou « Je ne me montre pas » + sans voix ou voix déjà là** : la voix enregistrée manquante n'est jamais testée sur le composant.
- `src/test/reel-result.test.tsx` (bloc « montage vidéo : monté seulement à son étape », l. 228 et suivantes) : aucun appel réseau avant l'étape Montage, fourche affichée sans appel, mention honnête et recherche lancée au choix « Je ne me montre pas », pas d'étape Montage sans texte parlé, retour direct au montage après le Studio photo (`studio_passage`).

Tests de ce qu'il utilise (protègent la logique, pas le câblage) :
- `src/test/reel-render.test.ts` : `sectionsWithVoiceButNoClip`, `countSectionsWithoutVoice`, `sectionDuration`, `voiceSectionDuration`, `buildRenderPlan` (modes tts, recorded, silent, fenêtre `seek`).
- `src/test/reel-voice-resume.test.tsx` : `ReelVoiceRecorder` garde les prises au remontage.
- `src/test/reel-archive-path.test.ts` : chemin d'archivage du MP4.
- Côté serveur (`npm run test:edges`) : `reel-render/recipe_test.ts`, `archive-url_test.ts`, `reel_reference_test.ts`.
- `src/test/impact-creation.test.ts` : le chemin du fichier est reconnu.

Aucun test ne lit le **texte** du fichier (vérifié par grep) : contrairement à CreerUnifie, déplacer le code ne cassera aucun test par simple déplacement. Les tests cherchent seulement des libellés à l'écran.

Playwright : aucun test `e2e/` ni `e2e-visite/` ne clique dans le montage (grep de « Assembler mon reel », « Je me filme », « Monter ma vidéo » vide). `e2e-visite/reel-angles-live.spec.ts` ne fait que nommer l'étape Montage. Et ces tests ne tournent pas en CI.

**Tests à ajouter AVANT de découper**

1. **Voix enregistrée manquante** (mode « Je ne me montre pas » + « Ma voix off ») : une phrase avec clip sans prise → toast « Enregistre la voix de cette phrase… », aucun `submitReelRender` ; deux phrases → message au pluriel avec le nombre.
2. **Phrase enregistrée sans clip** : `window.confirm` appelé avec « La phrase 1 est enregistrée mais n'a aucun clip… » (et la version au pluriel) ; « Annuler » → aucun rendu ; « OK » → rendu lancé sans cette phrase.
3. **Plan envoyé au moteur, par mode** (sur `mocks.submit.mock.calls[0][0]`) : « filme » (durées des prises), « cache » + voix (URL et durées des prises), « cache » + sans voix ; et `subtitle_settings` rempli quand `useBrandCharter` rend une charte (aujourd'hui toujours mocké à `null`).
4. **Texte à revérifier** : `initialProject.sectionTexts` différent du script → bandeau `role="alert"`, « Assembler mon reel » désactivé ; clic sur « J'ai vérifié les passages » → bouton actif et `onProjectChange` reçoit les nouveaux `sectionTexts`.
5. **Mes vidéos** : dépôt réussi (`uploadReelVideo` mocké) → badge « Ma vidéo · … », toast, champ fichier vidé ; dépôt raté → toast d'erreur, aucun clip changé ; pendant le dépôt, les boutons « Ma vidéo » sont désactivés.
6. **Fenêtre de lecture** : curseur visible seulement en mode « cache » avec une vidéo `mine` plus longue que la scène ; déplacer le curseur → `seek` transmis au plan de rendu.
7. **Plan du Studio** : clip trop court pour porter la voix d'un passage sans fond → toast d'erreur, rien inséré ; mode « filme » sans prise → « Insérer dans ce passage » désactivé ; curseur « Début du plan » et « Retirer ce plan » → `onProjectChange` avec `start` modifié puis `cutaways: [null]`.
8. **Boîte de dialogue Studio** : `StudioVideoPanel` mocké qui garde ses props ; vérifier `writable`, `showComposer`, `draftKey` (`studio-video:test-user:space:reel:…`) et `initialPrompt` (texte parlé coupé à 680 caractères) pour « Choisir » et pour « Créer ».
9. **`onPhaseChange`** : suite `idle` → `rendering` → `done` (et `error` quand le rendu échoue).
10. **Recherche Pexels manuelle** : Entrée dans le champ ou clic sur la loupe → `searchStockVideos` avec le nouveau mot-clé ; une vidéo `mine` choisie n'est pas remplacée par le 1er résultat ; erreur → toast.
11. **Projet sauvegardé** : un test qui fige la forme exacte envoyée à `onProjectChange` après une modification (clés, URL Studio vides), et la valeur de `renderKey` vue de l'extérieur : remonter le composant avec le même `initialProject` ne doit **pas** appeler `onMp4Ready(null)`.

**Lot T fait (15/10/2026).** Tests 1 à 11 dans `src/test/reel-montage.test.tsx` (24 cas, `ReelVoiceRecorder` et `StudioVideoPanel` remplacés par des faux qui gardent leurs props). Les plans attendus sont recalculés avec le vrai `buildRenderPlan` : le test vérifie le câblage (quelles valeurs partent au moteur), pas la recette.

**Lot 1 fait (15/10/2026).** `src/features/reel-montage/types.ts` (`Section`, `Phase`, `SelectedClip`, `StudioCutaway`, `ReelMontageProject`, `MontageMode`, `fromStock`, `fromMine`, `set`), à l'identique (seuls des `export` ajoutés) ; `ReelMontage.tsx` réexporte `ReelMontageProject`. `scripts/impact-creation.mjs` reconnaît `src/features/reel-montage/` (cas ajouté dans `impact-creation.test.ts`), CARTE.md à jour.

**Lot 2 fait (15/10/2026).** Affichage pur sorti à l'identique : `MontageModeChoice.tsx` (`MontageModeFork`, la fourche, et `MontageModeSummary`, le rappel du mode avec « Changer »), `MontageVoiceChoice.tsx` (voix, mention honnête, `ReelVoiceRecorder`) et `StudioClipDialog.tsx` (lit `user` avec `useAuth`, `draftKey` inchangé). `ReelMontage.tsx` : 849 → 743 lignes, sorti du cliquet.

**Lot 3 fait (15/10/2026).** Fonctions pures : `montage-project.ts` (`montageRenderKey`, `savedMontageProject` : un seul endroit vide les URL du Studio, ordre des clés inchangé), `assemble-guards.ts` (`assembleRefusal`, `chosenClips`, `voiceGuards` : messages à l'identique ; le `toast` et le `window.confirm` restent dans le composant), `build-montage-plan.ts` (`buildMontagePlan`, async, sans état React). Tests unitaires : `src/test/reel-montage-guards.test.ts` (11 cas, dont la clé de rendu figée sur l'ancienne formule). `ReelMontage.tsx` : 743 → 671 lignes.

**Lot 4 fait (15/10/2026).** Sources de clips sorties à l'identique : `use-reel-stock-search.ts` (`useReelStockSearch` : `keywords`, `results`, `loading`, recherche initiale une fois par montage, `runSearch` ; reçoit `setClips` et la ref `activeRender`) et `use-reel-my-videos.ts` (`useReelMyVideos` : bibliothèque, dépôt, reprise ; reçoit `setClips`). Les deux hooks sont appelés juste après l'effet d'invalidation, là où vivaient leurs effets. `ReelMontage.tsx` : 671 → 573 lignes.

**Lot 5 fait (15/10/2026).** `use-reel-studio-return.ts` (`useReelStudioReturn` : `studioTarget`, `pendingCutaway`, lecture de `studio_passage` / `studio_clip` / `studio-video-for-reel:`, défilement vers `studio-reel-passage-<i>`) et `MontagePassageCard.tsx` (une carte de passage, props typées, `id` resté sur la `Card`), à l'identique. La durée de scène écrite trois fois n'est pas factorisée ici (lot 7). `ReelMontage.tsx` : 573 → 364 lignes.

**Lot 6 fait (15/10/2026) : fiche terminée.** `use-reel-render.ts` (`useReelRender` : états du rendu, `onPhaseChange`, `activeRender` créé ici et rendu au composant pour la recherche Pexels, invalidation au changement d'entrée sauf au premier rendu, `handleAssemble`, `handleArchiveRetry`, `handleDownload` ; `mp4Callback` et `onMp4Ready` laissés tels quels) et `MontageResult.tsx` (pied, alertes, progression, lecteur, téléchargement, statut), à l'identique. Seule retouche : la condition « Ranger cette vidéo » (`completedRender` de la génération actuelle) arrive calculée par le hook (`archiveRetryAvailable`), au même moment du rendu. Effet de bord connu : l'effet `onPhaseChange` s'exécute désormais après celui de la sauvegarde du projet (callbacks indépendants). `ReelMontage.tsx` : 364 → 156 lignes (918 au départ). Reste le lot 7 (facultatif) : durée de scène écrite trois fois, `onMp4Ready` / `mp4Callback` à uniformiser.

**Risque et ordre conseillé**

Niveau : **moyen**. Le composant n'a qu'un parent et aucun test ne lit son texte, ce qui rend le déplacement plus simple que pour CreerUnifie. Mais `git log --since=2026-07-17` montre 28 commits, dont 8 corrections (« fiabilise les reels sans voix », « retain takes and prior downloads across montage retries », « archive provider CDN renders and recover downloads without rerendering », « Empêcher un clip Studio muet de remplacer une prise face caméra »…), et 3 commits de synchro Lovable le 23/07 (retrait puis re-ajout du fichier). Les bugs passés viennent tous du **cycle de vie du MP4** (réponse tardive, archivage, invalidation au premier rendu) et du **Studio vidéo** (10 commits les 28 et 29/09). Ce sont précisément les parties les plus couplées (`activeRender` partagé, refs modifiées pendant le rendu). Le reste (affichage, Pexels, mes vidéos) est sans grand risque. Le fichier est calme depuis le 29/09 : bon moment pour le faire, hors session Lovable sur /creer.

Une PR par lot, code déplacé à l'identique. Pour chaque PR : `npm test` (au minimum `npx vitest run src/test/reel-montage-publication.test.tsx src/test/reel-result.test.tsx src/test/reel-render.test.ts src/test/reel-voice-resume.test.tsx src/test/impact-creation.test.ts`), `npx tsc --noEmit -p tsconfig.app.json`, puis `node scripts/cliquet-dette.mjs` (le fichier ne doit que maigrir) et, après la fusion, `node scripts/cliquet-dette.mjs --update` pour verrouiller les lignes gagnées.

1. **Lot T — tests seulement** : tests 1 à 11, dans `src/test/reel-montage-publication.test.tsx` ou un nouveau `src/test/reel-montage.test.tsx`. Aucun code touché.
2. **Lot 1 — types** : `types.ts` + réexport de `ReelMontageProject` depuis `ReelMontage.tsx` + `impact-creation.mjs` (dossier `src/features/reel-montage/`) et son cas de test + CARTE.md.
3. **Lot 2 — affichage pur** : `MontageModeChoice.tsx`, `MontageVoiceChoice.tsx`, `StudioClipDialog.tsx`.
4. **Lot 3 — fonctions pures** : `montage-project.ts`, `assemble-guards.ts`, `build-montage-plan.ts`, avec leurs tests unitaires (`src/test/reel-montage-guards.test.ts`…).
5. **Lot 4 — sources de clips** : `use-reel-stock-search.ts`, `use-reel-my-videos.ts`.
6. **Lot 5 — Studio et cartes** : `use-reel-studio-return.ts`, `MontagePassageCard.tsx`.
7. **Lot 6 — rendu** : `use-reel-render.ts` + `MontageResult.tsx`. En dernier, seul dans sa PR.
8. **Lot 7 (facultatif, après)** : les vraies retouches repérées pendant le déplacement (durée de scène écrite trois fois, appels `onMp4Ready` / `mp4Callback` à uniformiser), une par PR, chacune avec son test.

Objectif : `ReelMontage.tsx` sous ~250 lignes (états `clips`, `cutaways`, `voiceClips`, `montageMode`, appels des hooks, squelette du JSX). Ce chantier est indépendant du lot G de la fiche 1 (`use-reel-artifact.ts` dans CreerUnifie) : les deux ne se croisent que par `onMp4Ready` → `ReelResult` → `onMp4Change`, qu'aucun des deux ne doit renommer. Éviter de les mener en même temps pour qu'une régression sur la vidéo publiée soit facile à attribuer.

---

### 17. `src/hooks/use-content-generator.ts` — 1 185 lignes

**En une phrase :** c'est le « standard téléphonique » de la création : quand /creer lance une génération, c'est ce hook qui prépare la demande pour chaque format (carrousel, reel, stories, post Instagram, LinkedIn), appelle la bonne fonction serveur, prépare les questions d'approfondissement, gère le texte qui s'écrit en direct (streaming), lit la réponse de l'IA même quand son JSON est abîmé, et traduit les erreurs (quota épuisé, réseau) en messages lisibles.

> Lignes vérifiées sur le fichier au 15/10/2026 (dernier commit sur le fichier : `f70c0f28c`, #1578, seul changement : `posthog` vient désormais de `@/lib/posthog-lazy`). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou de commentaire) est la référence fiable.

Qui l'utilise (grep `use-content-generator` dans `src/`) :
- **Un seul appelant réel** : `src/pages/CreerUnifie.tsx` (import l. 87, appel `useContentGenerator()` l. ~491). La page redistribue ensuite `generate`, `generateStream`, `markQuotaExhausted`… à `useDoGenerate` (`src/hooks/use-do-generate.ts`), `useLaunchSequence` et `useCreerFlowPersistence` (`streaming`, `streamingContent` pour le filet `pendingStream`).
- **Imports de types seulement** : `Question` dans `src/components/creer/CreerStepQuestions.tsx` (l. 6) et `src/hooks/use-do-generate.ts` (l. 19) ; `GenerateParams` dans `src/hooks/use-launch-sequence.ts` (l. 9).
- **9 fichiers de test** : `src/test/generation-lifecycle.test.tsx` exécute le vrai hook ; 8 tests de la page le **remplacent entièrement** par `vi.mock('@/hooks/use-content-generator', …)` : `creer-photos-manquantes`, `creer-entrees-calendrier-brief`, `creer-angles-reel-photos`, `creer-sequence-lancement`, `creer-cta-label-visuels`, `creer-reprise-modifier-reset`, `creer-publication-exports`, `creation-initial-draft` (tous `.test.tsx`).
- Cité en commentaire seulement : `src/features/creer/creer-step.ts`, `src/pages/ChatGuidePage.tsx`, `supabase/functions/creative-flow/prompts_snapshot_test.ts` (l. 254, non-régression « canal des questions » `linkedin_post`).
- Aucun test ne lit le **texte** de ce fichier (grep `readFileSync` / `?raw` vide). Bonne nouvelle : le piège commun n° 3 ne s'applique pas ici.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Types d'entrée et de sortie | 24-113, 1169-1185 | `GenerateParams` (~60 champs : reel, carrousel, photos, structure validée, récit, texte d'abord, Qualité Max, photos d'ambiance…), `GenerateQuestionsParams`, `Question`, `ContentResult`, et tout en bas `GenerateStreamParams`. |
| 2. Lecture tolérante du JSON de l'IA | 115-272 | `escapeUnescapedControlChars` (vrais sauts de ligne dans une chaîne), `salvageContentField` (dernier recours : extraire le seul champ `content`), `parseAIJson` (fences ```json, objet ou tableau, virgules traînantes, guillemets simples). C'est ce qui évite d'afficher le blob ```json brut dans un post. **Non exporté** aujourd'hui. |
| 3. Messages d'erreur et quota | 274-308 | `cleanErrorMessage` (un JSON d'erreur devient une phrase), `QUOTA_EXHAUSTED_MESSAGE` (« Tes crédits du mois sont utilisés… »), `quotaInlineMessage` (garde le message serveur s'il contient « disponible à partir »). |
| 4. État du hook, workspace, remise à zéro | 310-391 | Filet workspace (`useWorkspaceId`, neutralisé quand il vaut `user.id`) ; ~10 états (`generating`, `result`, `error`, `questionsError`, `quotaExhausted`, `generationStage`, `draftSlides`, `outlineTitles`…) ; enveloppe `useStreamingInvoke` ; compteurs `generationEpoch` / `questionsEpoch` (une réponse arrivée trop tard est ignorée) ; `reset` ; `markQuotaExhausted` / `clearQuotaExhausted` (pour les appels directs faits ailleurs). |
| 5a. `generate` : préparation | 393-453 | Remise à zéro des états, liste `SUPPORTED` (`newsletter` et `auto` refusés avec « Choisis un format valide… »), structure de l'angle (`getStructureForCombo`), séparation du sujet et du contenu du calendrier (`CALENDAR_MARKER`, pour rester sous 500 caractères). |
| 5b. `generate` : carrousel | 455-513 | Corps `carousel-ai` `type: "express_full"` via `invokeWithHeartbeat` : règle d'envoi des pixels (automatique oui ; plan validé, texte d'abord, photos brutes non), `photo_contexts`, `confirmed_structure`, `scenario_origin`, `quality_max`, `narrative_thread`, `photos_only`, `text_first` + `photo_catalog` (40 max). `onStatus` alimente `draftSlides`, `outlineTitles`, `generationStage`. Délai 400 s (commentaire du budget serveur). |
| 5c. `generate` : reel | 515-555 | `creative-flow` `contentType: "reel"` : réponses mappées en `anecdote` / `emotion` / `conviction` par position **et** envoyées en paires question → réponse (#1043). Délai 180 s. |
| 5d. `generate` : stories | 557-593 | `contentType: "stories"`, réponses en paires (#1042), `preferred_photo_ids` (10 max) en mode photo. Délai 150 s. |
| 5e. `generate` : post Instagram | 595-634 | `contentType: "instagram_post"`, angle + étapes de structure, photos allégées pour la vision (`downscalePhotosForVision`). Délai 150 s. |
| 5f. `generate` : LinkedIn (chemin de secours) | 636-672 | `contentType: "post_linkedin"`. Le vrai chemin LinkedIn passe par `generateStream`. ⚠️ Libellé `[Contenu existant]` (sans « à approfondir ») : différent des autres formats, à garder tel quel. Délai 180 s. |
| 5g. `generate` : lecture de la réponse | 679-753 | Quota détecté par le **code** `limit_reached` avant toute autre erreur ; `parseAIJson` ; garde de forme (`hasUsableContent` : slides, sections, stories) ; renumérotation `renumberSlides` (« SLIDE 4.5 ») ; photos d'ambiance libres de droit (`import("@/lib/stock-ambient-photos")` dynamique, `onStockAmbientPhotos`) ; mesure PostHog `content_generation_timing`. |
| 5h. `generate` : erreurs | 754-773 | Quota → `handleQuotaError` + `quotaExhausted` ; sinon `error` nettoyé ; `finally` qui remet `generating` & co à zéro **seulement** si la demande est toujours la plus récente. |
| 6a. `generateQuestions` : mémoire anti-répétition | 775-836 | Séparation du sujet (copie de 5a) ; lecture des 8 derniers `content_briefs` du workspace (`workspaceScopeFilter`), 3 sujets non vides gardés, 120 caractères chacun, bloc plafonné à 1 500. Non bloquant. |
| 6b. `generateQuestions` : carrousel | 838-874 | `carousel-ai` `type: "deepening_questions"` ; vision seulement en photo / mixte / photos brutes (`pure_photo` envoyé comme `photo`). Délai 90 s avec photos, 60 s sinon. |
| 6c. `generateQuestions` : autres formats | 875-951 | `creative-flow` `step: "questions"` ; `contentType` : `linkedin_post`, `newsletter`, `post_pinterest`, sinon `instagram_post` ; contexte plafonné à 7 800 (40 % pour le sujet) ; vision si `photoMode`. Délai 180 s avec photos, 60 s sinon. |
| 6d. `generateQuestions` : lecture et erreurs | 953-989 | Tableau ou `{ questions: [] }` → `Question[]` ; erreur posée dans `error` **et** `questionsError`. |
| 7a. `generateStream` : corps de la demande | 991-1094 | Table `contentTypeMap` (`post_instagram`, `post_linkedin`, `post_newsletter`, `post_pinterest`) ; angle cherché dans les 4 catalogues (`EDITORIAL_ANGLES`, `LINKEDIN_…`, `PINTEREST_…`, `PINTEREST_VISUAL_…`) ; `preGenAnswers` positionnels ; photos allégées ; `deepResearch` ; `news_context` ; lien et tableau Pinterest. ⚠️ Ici, le sujet n'est **pas** séparé du contenu du calendrier (différent de 5a). |
| 7b. `generateStream` : envoi et lecture | 1096-1138 | `streamInvoke("creative-flow", …)`, erreurs et quota comme 5h, texte vide → « La génération a échoué. Réessaie. », texte non JSON → `{ content: texte }`. |
| 8. Ce que le hook rend | 1140-1167 | 24 clés : `generate`, `generating`, `generationStage`, `draftSlides`, `outlineTitles`, `result`, `setResult`, `error`, `quotaExhausted`, `markQuotaExhausted`, `clearQuotaExhausted`, `reset`, `generateQuestions`, `loadingQuestions`, `questions`, `setQuestions`, `questionsError`, `generateStream`, `streamingContent`, `streaming`, `streamDone`, `streamStage`, `streamError`, `streamReset`. |

À noter, sans y toucher pendant le découpage (ce serait un changement de comportement) : `GenerateParams.format` accepte `newsletter` mais `generate` le refuse ; `generateQuestions` gère `pinterest` alors que ce format n'existe pas dans `GenerateParams` ; `streamError` est rendu mais `CreerUnifie` ne le lit pas ; la séparation du sujet est copiée deux fois (5a, 6a) et absente du streaming (7a). Chacun mérite sa propre PR, après le découpage.

**Découpage proposé** : un dossier `src/features/creer/generator/` (à côté des fonctions déjà sorties de la page, comme `format-mappers.ts` ou `pending-stream.ts`). `src/hooks/use-content-generator.ts` **reste au même chemin**, garde le nom `useContentGenerator`, ses états, les compteurs d'époque, les appels réseau et les 24 clés rendues. Il réexporte les types (`export type { … } from "@/features/creer/generator/types"`). Aucun import à changer ailleurs, aucun `vi.mock` à réécrire.

Principe : les nouveaux fichiers **fabriquent** les corps de demande et **lisent** les réponses (fonctions pures ou presque). Les **appels** (`invokeWithTimeout`, `invokeWithHeartbeat`, `streamInvoke`) restent dans le hook, avec les vérifications d'époque entre chaque `await`.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `generator/types.ts` | `GenerateParams`, `GenerateQuestionsParams`, `Question`, `ContentResult`, `GenerateStreamParams` | Le hook réexporte les 5 types : `CreerStepQuestions.tsx`, `use-do-generate.ts`, `use-launch-sequence.ts` continuent d'importer depuis `@/hooks/use-content-generator`. Garder `import("@/components/creer/PhotoUploadZone").PhotoItem` tel quel. |
| `generator/tolerant-json.ts` | `escapeUnescapedControlChars`, `salvageContentField`, `parseAIJson` (à exporter) | **Piège de nom :** ne pas le fusionner avec `src/lib/parse-ai-json.ts` (`parseAiJson`, qui lève `AiParseError` et n'a pas le sauvetage du champ `content`). Deux comportements différents ; une fusion serait un autre chantier. |
| `generator/error-messages.ts` | `cleanErrorMessage`, `QUOTA_EXHAUSTED_MESSAGE`, `quotaInlineMessage` | Aucune dépendance. Utilisé 4 fois dans le hook (`markQuotaExhausted`, 3 `catch`). |
| `generator/bodies/carousel.ts` | Le corps `express_full` (l. 463-497) en `buildCarouselGenerateBody(params, ctx)` + `CAROUSEL_GENERATE_TIMEOUT_MS = 400000` avec son commentaire de budget | `ctx` = `effectiveSubject`, `existingContent`, `structurePrompt`, `effectiveWorkspaceId`. Fonction `async` (la ligne `photos:` attend `downscalePhotosForVision`). **`onStatus` reste dans le hook** (il touche aux états et à l'époque). Le fichier le plus modifié (11 des 21 commits) : c'est le gain principal. |
| `generator/bodies/reel.ts`, `story.ts`, `post.ts`, `linkedin.ts` | Chacun son corps `creative-flow` (l. 516-547, 558-586, 596-627, 639-664) + sa constante de délai (180 s, 150 s, 150 s, 180 s) avec le commentaire | Un format = un fichier, comme côté serveur ; un fichier de corps n'importe jamais celui d'un autre format. `post.ts` et `linkedin.ts` lisent `EDITORIAL_ANGLES` / `CONTENT_STRUCTURES` (`@/lib/content-structures`). **Ne renommer aucune clé** : `src/lib/generation-telemetry.ts` (`describeGeneration`) lit `step`, `contentType`, `photo_mode`, `type`, `carousel_type` pour étiqueter les échecs dans Sentry. |
| `generator/read-generate-response.ts` | l. 681-718 : détection quota `limit_reached`, erreurs serveur, `parseAIJson`, `hasUsableContent`, `renumberSlides` → `readGenerateResponse(format, data, invokeError)` | Garder l'ordre exact (quota **avant** l'erreur générique, voir PR #308). Le `throw Object.assign(…, { _isQuota: true, data })` doit rester identique : `handleQuotaError` le reconnaît. Les photos d'ambiance (l. 720-733) **restent dans le hook** : il y a une vérification d'époque après leur `await`. |
| `generator/questions-request.ts` | `fetchRecentBriefsContext(workspaceId)` (l. 799-836), corps carrousel `deepening_questions` (850-871) et `creative-flow` `questions` (877-947) avec leurs délais, `parseQuestions(raw)` (957-974) | Importe `supabase` et `workspaceScopeFilter` : les tests devront mocker `@/integrations/supabase/client` (pas mocké dans `generation-lifecycle.test.tsx` aujourd'hui). La table des `contentType` des questions (`linkedin_post`…) est figée côté serveur par `creative-flow/prompts_snapshot_test.ts` : ne pas l'« harmoniser » avec `contentTypeMap`. |
| `generator/stream-body.ts` | `contentTypeMap`, résolution d'angle dans les 4 catalogues, construction de `streamBody` (l. 1019-1094) → `buildStreamBody(params, defaultWorkspaceId)` | `async` (photos allégées). L'appel `streamInvoke`, le texte vide et la lecture (1096-1135) restent dans le hook. |
| `src/hooks/use-content-generator.ts` (reste) | Imports, filet workspace, états, époques, `reset`, `markQuotaExhausted`, les 3 fonctions réduites à leur squelette (préparer → appeler → vérifier l'époque → lire → poser l'état), l'objet rendu | Cible : ~400 lignes, donc sous le seuil du cliquet. Les 8 tests de page continuent de le remplacer par chemin ; `generation-lifecycle.test.tsx` continue de mocker `@/lib/invoke-with-timeout`, `@/lib/invoke-with-heartbeat`, `@/hooks/use-streaming-invoke`, `@/lib/image-vision`, `@/lib/posthog-lazy`, `@/lib/quota-error-handler` : un mock par chemin s'applique aussi aux nouveaux fichiers, à condition qu'ils importent par l'alias `@/…` (le faire systématiquement). |

Règle 7 de CLAUDE.md : les appels passent toujours par `invokeWithHeartbeat` (carrousel), `invokeWithTimeout` (le reste) et `useStreamingInvoke` (streaming). En gardant les appels dans le hook, rien ne change pour Sentry. `knip` bloque les fichiers morts : chaque nouveau fichier doit être importé par le hook dans la même PR.

Option écartée : couper le hook en trois hooks (`useGenerate`, `useQuestions`, `useStreamGenerate`). Ils partagent `generationEpoch`, `error`, `result` et `quotaExhausted` ; `generate` et `generateStream` s'annulent l'un l'autre par la même époque. Les séparer changerait ce partage, et `CreerUnifie` devrait appeler trois hooks (donc toucher la page, en plein découpage par une autre session).

**Tests qui le protègent aujourd'hui**

- `src/test/generation-lifecycle.test.tsx` (le seul qui exécute le vrai hook, 7 cas) : une génération terminée après `reset` est ignorée ; une ancienne demande ne remplace pas la nouvelle ; un streaming tardif après `reset` est ignoré ; 4 cas carrousel photo (`automatic`, `user_validated`, `pure_photo`, `text_first`) sur l'envoi ou non des pixels allégés.
- Indirectement, `src/test/streaming-lifecycle.test.tsx` (le moteur `useStreamingInvoke`), `src/test/generation-telemetry.test.ts` (étiquetage Sentry), `src/test/stock-ambient-photos.test.ts` (photos d'ambiance), `src/test/parse-ai-json.test.ts` (**l'autre** analyseur, pas celui de ce hook).
- Les 8 tests de la page **ne protègent pas** le hook : ils le remplacent. Ils figent seulement son chemin et les clés qu'ils simulent (`result`, `setResult`, `questions`, `setQuestions`, `reset`, `streamReset`, `generate`, `generateQuestions`).
- Côté serveur, `supabase/functions/creative-flow/prompts_snapshot_test.ts` vérifie que `linkedin_post` au step `questions` donne bien le canal LinkedIn.

Jamais testés aujourd'hui (vérifié par grep dans `src/test`) : le corps envoyé pour le reel, les stories, le post, LinkedIn et les questions ; `parseAIJson` et `salvageContentField` ; `cleanErrorMessage` et le message quota ; la garde `hasUsableContent` ; la renumérotation ; la mémoire anti-répétition (`content_briefs`) ; le plafond de contexte 7 800 ; `contentTypeMap` et la résolution d'angle du streaming ; le texte vide ou non JSON en streaming ; la mesure `content_generation_timing`.

**Tests à ajouter AVANT de découper**

Tous dans `src/test/`, en rendu du vrai hook (`renderHook(useContentGenerator)`) avec les mêmes mocks que `generation-lifecycle.test.tsx`, plus un mock de `@/integrations/supabase/client` et de `@/lib/stock-ambient-photos`. Aucun code du hook touché.

1. `content-generator-bodies.test.tsx` : pour chaque appel, capturer (nom de fonction, corps, délai) et le figer avec `toMatchSnapshot()`. Cas : carrousel × {texte, photo automatique, photo plan validé, mixte, photos brutes, texte d'abord avec un catalogue de 45 photos (doit couper à 40), Qualité Max, `narrativeThread`, `editorialIntent`, `slideCount`, actu de 4 000 caractères (coupée à 3 800), sujet avec `[Contenu existant à approfondir]`} ; reel × {réponses seules (mapping par position + paires), `preGenAnswers` fournis, `faceCam` absent → `"oui"`} ; stories × {réponses, mode photo avec 12 `userPhotoId` (coupé à 10)} ; post × {angle connu, mode photo} ; LinkedIn × {sujet calendrier → `[Contenu existant]`}. Plus : `format: "newsletter"` et `"auto"` → message « Choisis un format valide… » et **aucun** appel.
2. `content-generator-response.test.tsx` : la lecture de la réponse via `generate({ format: "post" })` : JSON entouré de ```json ; vrai saut de ligne dans la chaîne ; guillemets droits non échappés (sauvetage de `content`) ; virgule traînante ; tableau. Carrousel `slides: []` → message « La génération n'a pas fonctionné… » ; slides numérotées 1, 4.5, 9 → 1, 2, 3 ; une slide `stock_ambient` → `onStockAmbientPhotos` appelé seulement en `carouselType: "photo"`. Mesure PostHog `content_generation_timing` avec `format` et `quality_max`.
3. `content-generator-quota.test.tsx` : `data.error = "limit_reached"` → `handleQuotaError` reçoit `_isQuota` et `data`, `quotaExhausted` = message crédits, `error` vide ; `quota.reason = "error"` → **pas** traité comme quota ; message « disponible à partir… » gardé tel quel ; message d'erreur en JSON → phrase lisible ; `markQuotaExhausted` / `clearQuotaExhausted`. Même jeu pour `generateStream`.
4. `content-generator-questions.test.tsx` : carrousel avec et sans photos (délai 90 s / 60 s, `pure_photo` envoyé comme `photo`) ; `contentType` pour `linkedin`, `newsletter`, `pinterest`, `post` ; contexte de 10 000 caractères avec et sans contenu du calendrier (plafond 7 800, règle des 40 %) ; mémoire : 5 briefs dont un vide → 3 lignes, sujet de 150 caractères coupé, filtre workspace ; échec de lecture des briefs → les questions arrivent quand même ; réponse en tableau et en `{ questions }` ; erreur → `error` et `questionsError` remplis.
5. `content-generator-stream.test.tsx` : corps figé pour les 4 formats + un format inconnu (→ `post_instagram`) ; angle trouvé dans le catalogue LinkedIn puis Pinterest visuel ; lien Pinterest envoyé seulement pour `pinterest` ; photos seulement si `photoMode` **et** une image ; flux vide → « La génération a échoué. Réessaie. » ; texte non JSON → `{ content: texte }`.
6. Un test « contrat » : `Object.keys(result.current).sort()` vaut exactement les 24 clés listées plus haut. Il attrape une clé oubliée dans l'objet rendu, que les tests de page (qui remplacent le hook) ne verraient pas.

**Risque et ordre conseillé**

Niveau : **moyen**. Un seul appelant (`CreerUnifie`), pas de test qui lit le texte du fichier, et l'essentiel du code à déplacer fabrique des objets : c'est rassurant. Mais **toutes** les générations de /creer passent par ici, le fichier bouge beaucoup (21 commits depuis le 17/07/2026, dont 11 sur le carrousel : #1451, #1410, #1389, #1387, #1166, #1148, #1067…) et la protection actuelle tient en 7 cas. Une clé oubliée dans un corps de demande ne casse rien de visible : le serveur l'ignore et le contenu est juste moins bon (exemples vécus : réponses aux questions perdues pour le reel #1043 et les stories #1042). Les tests 1 et 5 rendent ce risque visible. Le point le plus fragile est l'ordre des `await` et des vérifications d'époque : il reste dans le hook.

Coordination : la fiche 1 (`CreerUnifie.tsx`) est terminée depuis le 15/10/2026 (lot J, #1581) ; plus de conflit avec la page. Ce découpage-ci ne touche toujours **pas** la page : chemin, nom `useContentGenerator` et 24 clés rendues identiques. Pas de session Lovable ouverte sur /creer pendant ces PR.

Une PR par lot :
1. **Lot T** : tests 1 à 6 ci-dessus. Aucun code touché. Verts avant tout déplacement.
   **Fait le 15/10/2026** : `src/test/content-generator-bodies.test.tsx` (20 cas, corps de `generate`), `-response` (24, lecture de la réponse), `-quota` (9, vrai `handleQuotaError`), `-questions` (23), `-stream` (15, dont le contrat des 24 clés) ; snapshots dans `src/test/__snapshots__/` (chaînes de plus de 200 caractères notées `<N car.>`, date de renouvellement du quota fixée). Vérifié contre trois pannes volontaires (paires question → réponse du reel retirées, plafond du catalogue 40 → 50, clé `streamError` oubliée) : rouges à chaque fois.
   **Constat** (figé par un test, à corriger dans sa propre PR après le découpage) : `parseAIJson` cherche un tableau AVANT de sauver le champ `content`. Un post au JSON cassé (guillemets non échappés) qui contient une liste (`"hashtags": ["a"]`) s'affiche donc comme la liste `["a"]` au lieu du texte.
2. **Lot 1** : `generator/types.ts`, `generator/tolerant-json.ts`, `generator/error-messages.ts` (le hook réexporte les types).
   **Fait le 15/10/2026** : déplacement vérifié ligne à ligne (seuls changent les `export` ajoutés, les en-têtes et les imports). `QUOTA_EXHAUSTED_MESSAGE` n'existait plus : `error-messages.ts` contient `cleanErrorMessage` et `quotaInlineMessage`. Dossier `src/features/creer/generator/` reconnu par le rapport d'impact (`impact-creation.mjs` + cas de test). Hook : 1 181 → 889 lignes, 26 → 21 `any` (référence du cliquet baissée). Aucun snapshot du lot T modifié.
3. **Lot 2** : `generator/bodies/carousel.ts` (le plus modifié, à faire seul).
   **Fait le 15/10/2026** : `buildCarouselGenerateBody(params, ctx)` + `CAROUSEL_GENERATE_TIMEOUT_MS` (commentaire du budget gardé). Corps et choix de `carousel_type` déplacés à l'identique ; `onStatus`, l'appel et l'époque restent dans le hook. Snapshots du lot T inchangés ; panne volontaire dans le nouveau fichier (catalogue 40 → 50) vue par `content-generator-bodies`. Hook : 889 → 845 lignes.
4. **Lot 3** : `generator/bodies/reel.ts`, `story.ts`, `post.ts`, `linkedin.ts` + `generator/read-generate-response.ts`.
   **Fait le 15/10/2026** : un `build…GenerateBody(params, ctx)` + `…_GENERATE_TIMEOUT_MS` par format (commentaires de budget gardés), type commun `bodies/context.ts` ; `readGenerateResponse(format, data, invokeError)` (quota avant l'erreur générique, garde de forme, renumérotation). Nouveau test `src/test/content-generator-boundaries.test.ts` : un fichier de corps n'importe aucun autre format (vérifié en ajoutant un import interdit). Pannes volontaires vues : `face_cam` du reel, renumérotation retirée. Snapshots du lot T inchangés. Hook : 845 → 690 lignes, sous le seuil de 800 (sorti de la référence du cliquet).
5. **Lot 4** : `generator/questions-request.ts`.
   **Fait le 15/10/2026** : `fetchRecentBriefsContext`, `buildCarouselQuestionsRequest` et `buildQuestionsRequest` (chacun rend `{ body, timeoutMs }`, délais 90/60 s et 180/60 s inchangés), `parseQuestions`. Les deux appels et les époques restent dans le hook ; `supabase` et `workspaceScopeFilter` ne sont plus importés par le hook. Pannes volontaires vues par `content-generator-questions` (plafond 7 800 → 7 900, 3 briefs → 4). Snapshots du lot T inchangés. Hook : 690 → 535 lignes.
6. **Lot 5** : `generator/stream-body.ts`.
   **Fait le 15/10/2026** : `buildStreamBody(params, defaultWorkspaceId)` (table `contentTypeMap`, angle cherché dans les 4 catalogues, réponses positionnelles, photos allégées, recherche, actu, lien Pinterest). `streamInvoke`, la lecture du texte et l'époque restent dans le hook, qui n'importe plus les catalogues d'angles ni `downscalePhotosForVision`. Panne volontaire vue par `content-generator-stream` (`post_pinterest` modifié). Snapshots du lot T inchangés. Hook : 535 → 438 lignes (1 181 au départ, cible ~400 atteinte à 10 % près).
7. **Lot 6 (documentation)** : `docs/creation-contenu/CARTE.md` (ligne `use-content-generator.ts` du tableau des fichiers front, et « Appelants front » de creative-flow : le hook appelle toujours, les corps vivent dans `generator/bodies/`) et ce document.
   **Fait le 15/10/2026 : fiche 17 terminée.** `use-content-generator.ts` : 1 181 → 438 lignes, 12 fichiers dans `src/features/creer/generator/`. Suites restantes (une PR chacune, avec un cas de test qui change exprès) : les deux séparations du sujet, `newsletter` dans `generate`, `streamError`. **Fait le 16/10/2026 :** le constat `parseAIJson` du lot T. Un tableau rangé dans un objet qui porte un champ `content` (ex. `"hashtags": [...]`) ne remplace plus le texte du post ; le sauvetage de `content` agit (`content-generator-response.test.tsx`).

Vérifications à chaque PR : `npx tsc --noEmit -p tsconfig.app.json` ; `npx vitest run src/test/generation-lifecycle.test.tsx src/test/content-generator-*.test.tsx` puis `npm test` (les 8 tests de page doivent rester verts sans retouche) ; `npm run knip` ; `node scripts/cliquet-dette.mjs`. **Aucun snapshot du lot T n'a le droit de changer** : si un corps de demande change, c'est une régression, on corrige le code. Après la fusion : `node scripts/cliquet-dette.mjs --update` pour verrouiller les lignes gagnées (référence actuelle : 1 185 lignes, 26 `any`). Les suites à faire **après** (une PR chacune, avec un cas de test qui change exprès) : fusionner les deux séparations du sujet, décider du sort de `newsletter` dans `generate` et de `streamError`.

---

### 18. `supabase/functions/cron-health/index.ts` — 959 lignes

**En une phrase :** c'est le bulletin de santé de l'app. Il rend un seul gros JSON, en lecture seule, que Laetitia lit chaque matin (scope `daily` : publications, connexions sociales, retours bêta, Photoroom, Higgsfield, facturation Stripe, erreurs JS, e-mails, automates pg_cron, images Studio bloquées) et chaque lundi (scope `weekly` : coûts IA en €, top 5 des consommatrices, comptes internes, cohortes, publications, qualité des carrousels, comptes à plusieurs espaces). Chaque nouvelle sonde ou chaque nouveau modèle à tarifer ajoute quelques lignes dans ce même fichier. C'est pour ça qu'il change presque tous les deux jours.

Qui le déclenche : **aucun cron du dépôt**. Aucune migration et aucun workflow `.github` ne l'appellent. Ce sont les deux routines planifiées de Laetitia (hors dépôt) qui le lancent par `node e2e-visite/cron-health.mjs` : la visite guidée quotidienne (étape 8bis, scope `daily`) et la routine du lundi (`--hebdo`, scope `weekly`). Ce script fait un `POST /functions/v1/cron-health` avec l'en-tête `x-cron-secret` (`CRON_STATS_SECRET`, le même secret que `activation-funnel`). `e2e-visite/cron-health.spec.ts` (Playwright, **hors CI**) lit aussi le scope `daily` et fait échouer le run sur 3 signaux : posts bloqués, programmés en retard, connexions expirées. Seule migration liée : `20261014150000_cron_jobs_health.sql`, la fonction SQL `cron_jobs_health` lue par `crons-pg.ts`.

Repères de structure :
- Tout le travail se fait dans **une seule fonction anonyme** passée à `Deno.serve` (l. 308-959). Rien n'est exporté. Le scope `weekly` y occupe à lui seul les lignes 455-955 : il garde ses grilles de prix, ses fonctions de calcul et ses blocs dans des variables locales.
- Le dossier contient déjà 11 petits modules, presque tous testés (9 fichiers `*_test.ts`, 35 `Deno.test`) : `photoroom-alerte.ts`, `higgsfield-alerte.ts`, `feedback-new.ts`, `garde-redite.ts`, `fil-reparations.ts`, `durees-carrousels.ts`, `plan-carrousels.ts`, `crons-pg.ts`, `sante-emails.ts`, `echantillon.ts` (sans test) et `studio-bloquees.ts` (sans test). Le bon motif existe donc déjà : le jugement est rangé à part et testé. Mais la lecture, l'assemblage et les grilles de prix sont restés dans `index.ts`.
- Pas d'IA, pas de crédit, aucune écriture en base, **aucun e-mail envoyé** (`sante-emails.ts` ne fait que compter). Seuls appels sortants : `GET` Photoroom (`/v1/account`) et `GET` Stripe (`/events`, `/subscriptions`).
- 95 occurrences de `any` (99 dans la référence du cliquet, qui compte autrement). La référence du cliquet est de 959 lignes.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| En-tête et imports | 1-38 | Le commentaire d'en-tête décrit les deux scopes et les règles de sécurité (pas de données personnelles). Imports des 11 modules locaux, de `_shared/carousel-plan-format.ts` et de `_shared/internal-accounts.ts`. |
| Comptes exclus, CORS, unités | 40-59 (`isExcludedEmail`, `isTestEmail`, `cors`, `json`, `HOUR`, `DAY`) | Le scope daily ne retire que les comptes de test : l'admin reste dedans pour qu'on voie sa connexion LinkedIn. Le scope weekly retire aussi l'admin. |
| Sonde Photoroom | 61-92 (`photoroomCredits`) | Appelle l'API Photoroom (`PHOTOROOM_API_KEY`). C'est `photoroom-alerte.ts` qui juge (faux positif du 09/09). |
| Budget Higgsfield | 94-136 (`higgsfieldBudget`) | Lit `higgsfield_image_spend` et `studio_image_requests`. Le plafond vient de `HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD`, le jugement de `higgsfield-alerte.ts`. Appelé **dans les deux scopes**. |
| Santé de la facturation | 138-282 (`STRIPE_API`, `LIVRAISON_GRACE`, `PERIODE_RETARD_JOURS`, `isoFromUnix`, `stripeGet`, `facturationHealth`) | 3 mesures, nées de l'incident Stripe du 24 au 31/07 : événements que Stripe n'arrive pas à livrer, abonnés app payants sans ligne `subscriptions` (filtre `metadata.user_id`, pour écarter les liens de paiement Binôme), périodes de facturation périmées. `STRIPE_SECRET_KEY`. |
| Lecture paginée | 284-306 (`fetchAllRows`) | Contourne le plafond silencieux de 1000 lignes de PostgREST (#601). Utilisée partout et **passée en paramètre** à `santeQuotidienne`. |
| Entrée commune | 308-328 | Vérifie le secret (401), choisit le scope (`weekly` sinon `daily`), crée le client service role, lit `profiles`, puis construit `excludedIds`, `isClient`, `now` et `emailOf`. |
| Scope daily : lectures | 330-357 | Un `Promise.all` de 10 lectures : `calendar_posts`, `social_connections`, `beta_feedback` ×2, Photoroom, facturation, `santeQuotidienne`, Higgsfield, `lireCronsPg`, `studioImagesBloquees`. |
| Scope daily : calculs et réponse | 358-453 | Échecs de publication sur 48 h, posts bloqués en `publishing` depuis plus d'1 h, programmés en retard de plus de 45 min, publiés sur 24 h, connexions à risque (`connState` : Instagram et LinkedIn seulement, LinkedIn à 50 jours), retours bêta triés par gravité, puis le JSON final (avec `...sante`). |
| Scope weekly : lectures et doublons d'espaces | 455-492 | `ai_usage` (35 jours), `calendar_posts`, Higgsfield, `workspace_members` (owners), puis `espaces_owner_multiples` (#1460, comptes internes compris). |
| Fenêtres de temps | 493-503 (`ai`, `cal`, `inWindow`, `week`, `curFrom`… `prevTo`) | Semaine en cours et semaine précédente, utilisées par tout le reste du scope. |
| **Grilles de prix** | 505-605 (`IMAGE_COST_EUR`, `TEXT_COST_EUR_PER_MTOKEN`, `REVIEW_COST_EUR_PER_MTOKEN`, `ZERO_COST_LABELS`) | Le prix de chaque modèle, avec l'historique en commentaire. C'est **la partie la plus modifiée** (8 commits sur 30). `ZERO_COST_LABELS` recopie `COMPOSED_BY_CODE_MODEL` de `_shared/plan-limiter.ts`. |
| Calcul des coûts | 607-655 (`summarize`, `aiCur`, `aiPrev`) | Appels, tokens, modèles, actions, coûts images et texte, et `modeles_non_tarifes` (garde #697 : un modèle inconnu doit « crier »). |
| Cohortes et publications | 657-678 | Rétention par semaine d'inscription (5 semaines, `ontGenere`), puis publications de la semaine et de la semaine d'avant. |
| Qualité : lectures | 680-755 (`carRows`, `scoreStats`, `cqEvents`, `cqAll`, `planAll`, `planClients`) | Lit `generated_carousels` et `content_quality_events`. Si la colonne `content_preview` manque, il relit sans elle. Si la table manque, il se rabat sur les brouillons. Les lignes `carousel_plan` sont mises à part. |
| Coût de la relecture éditoriale | 757-794 (`addEditorialReview`) | Ajoute au résumé le coût de la relecture des carrousels, qui n'est pas dans `ai_usage`. **Modifie l'objet résumé en place** : `modeles_non_tarifes.push`, `cout_*`, `relecture_*`. Les noms datés (`-2026xxxx`) sont ramenés au nom court. |
| Top 5 et comptes internes | 796-843 (`top_consommatrices_7j`, `comptes_internes_7j`) | Coût par consommatrice (e-mail masqué, `maskEmail`), avec sa part du total, plus la consommation de la recette, comptée à part. |
| Bloc qualité | 845-940 (`eventScoreStats`, retravail, sujets regénérés, `parFormat`, `construireEchantillon`, `qualite`) | Score de gate, garde anti-redite, fil des carrousels, durées, plan des carrousels (pour chacun : clientes, semaine d'avant, comptes internes), funnel par format, échantillon pour le juge du lundi. |
| Réponse weekly et erreurs | 942-958 | JSON final. Toute exception non rattrapée donne un 500 `{ error }`. |

Constats relevés (non corrigés, à garder en tête) :
- Le commentaire de `ZERO_COST_LABELS` (l. 602-604), celui de `_shared/usage-labels_test.ts` (l. 7 et 161) et celui de `plan-limiter.ts` (l. 464-465) disent que cette edge « n'importe rien de `_shared/` ». C'est faux depuis #1364 et #1450 (`internal-accounts.ts`, `carousel-plan-format.ts`). La recopie de `"composition-code"` n'est donc plus obligatoire. On pourrait importer `COMPOSED_BY_CODE_MODEL`, mais `plan-limiter.ts` est un gros module : à vérifier, et dans une PR à part.
- `round2` est écrit deux fois (l. 640 et 787). `isoFromUnix` protège toutes les dates Stripe, sauf la comparaison `now - e.created * 1000` (l. 239). Avec un `created` absent, cette comparaison donne `NaN > …` = faux : l'événement est ignoré, sans plantage.
- La CI ne fait **aucun `deno check`** sur cette edge (il n'y en a que pour `visual-studio` et `studio-video`), et `npm run test:edges` tourne en `--no-check`. Aucun test n'importe `index.ts` aujourd'hui. Une faute de frappe dans un import ne se verrait donc qu'une fois l'edge déployée.

**Découpage proposé** : tout reste dans le dossier `cron-health/` (un fichier = une mission). Les fonctions qui vivent aujourd'hui dans la fonction anonyme deviennent des fonctions exportées. Elles reçoivent en paramètres ce qu'elles lisaient « autour d'elles » : `supabase`, `now`, `isClient`, `inWindow`… `index.ts` ne garde que l'entrée et l'aiguillage.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `cron-health/lecture.ts` | `HOUR`, `DAY`, `fetchAllRows` avec son commentaire PostgREST (l. 58-59, 284-306) | À sortir en premier : la facturation, Higgsfield, le daily et le weekly en dépendent. `santeQuotidienne` le reçoit toujours en paramètre (type `FetchAllRows` de `sante-emails.ts`) : ne pas changer cette signature dans le même lot. |
| `cron-health/photoroom.ts` | `photoroomCredits` (61-92) | `PHOTOROOM_API_KEY`, `fetch` réel avec 10 s de délai. Importe `photoroom-alerte.ts`, qu'on laisse pur (sans réseau) : ne pas fusionner les deux fichiers. |
| `cron-health/higgsfield-budget.ts` | `higgsfieldBudget` (94-136) | Importe `lecture.ts` et `higgsfield-alerte.ts`. Lit 3 variables d'environnement `HIGGSFIELD_*`. Appelé par les deux scopes. |
| `cron-health/facturation.ts` | `STRIPE_API`, `LIVRAISON_GRACE`, `PERIODE_RETARD_JOURS`, `isoFromUnix`, `stripeGet`, `facturationHealth` (138-282), avec tout le commentaire de l'incident | `STRIPE_SECRET_KEY`, `GET` seulement. `e2e-visite/stripe-api-guard.mjs` (bloquant en CI via `src/test/stripe-api-guard.test.ts`) analyse **tout fichier qui contient « stripe »** : le nouveau fichier sera analysé automatiquement. Garder chaque date Stripe derrière `isoFromUnix`, sinon la garde casse. |
| `cron-health/quotidien.ts` | Lignes 330-453 dans `bilanQuotidien({ supabase, now, isClient, emailOf })`, qui renvoie l'objet (sans `generated_at`). `index.ts` fait le `json(...)`. | Garder l'**ordre exact** du `Promise.all` et sa déstructuration (10 éléments). `connState` et `SEVERITY_RANK` partent avec. Les seuils 45 min / 1 h / 48 h / 7 j / 50 j restent identiques. `e2e-visite/cron-health.spec.ts` cite « le seuil identique dans `cron-health/index.ts` » : mettre ce commentaire à jour. |
| `cron-health/tarifs.ts` | `IMAGE_COST_EUR`, `TEXT_COST_EUR_PER_MTOKEN`, `REVIEW_COST_EUR_PER_MTOKEN`, `ZERO_COST_LABELS` (505-605), exportés, **avec tous leurs commentaires** (l'historique des prix y est) | **Piège n°1 :** `_shared/usage-labels_test.ts` lit le **texte** de `../cron-health/index.ts` dans 5 tests (l. 18, 115, 131, 163, 180). Ses regex attendent la fermeture `\n    \};`, **à 4 espaces** (`IMAGE_COST_EUR`, `TEXT_…`, `REVIEW_…`). Au niveau du fichier, l'accolade passe à 0 espace et les 5 tests échouent (« introuvable dans cron-health/index.ts »). Il faut changer le chemin lu ET la regex, dans la même PR. C'est le fichier que les futures PR « tarifer un modèle » toucheront seul : c'est le vrai gain du découpage. |
| `cron-health/couts.ts` | `summarize` (607-652) et `addEditorialReview` (757-794), avec `round2` en un seul exemplaire | Importe `tarifs.ts`. `addEditorialReview` **modifie le résumé en place** : il ne faut ni copier (`{...summary}`) ni renvoyer un nouvel objet. Son 4e paramètre vaut aujourd'hui `cqEvents \|\| []` par défaut, lu au moment de l'appel : le rendre obligatoire et le passer explicitement aux 4 appels. **Ordre à garder :** `addEditorialReview(aiCur…)` AVANT le top 5, car `part_du_cout_pct` divise par `aiCur.cout_total_estime_eur` relecture comprise. `inWindow` est passé en paramètre. |
| `cron-health/fenetres.ts` | `inWindow`, `week` (496-503), `week` devenant `week(now, offset)` | Fonctions pures. Les bornes restent `t >= from && t < to`. |
| `cron-health/usage-hebdo.ts` | `espaces_owner_multiples` (469-492), cohortes (657-676), publications (677-678), `top_consommatrices_7j` et `comptes_internes_7j` (796-843) | Chaque bloc devient une fonction qui reçoit `profiles`, `emailOf`, `isClient` et les lignes déjà lues. Le top 5 appelle `summarize` puis `addEditorialReview` pour chaque consommatrice : garder ce filtre `cqEvents` par `user_id`. `maskEmail` vient de `_shared/internal-accounts.ts`. |
| `cron-health/qualite.ts` | `lireEvenementsQualite` (lectures 695-755, avec la relecture sans `content_preview` et le repli si la table manque) et `blocQualite` (`scoreStats` 705-718, 845-940) | Les événements doivent être lus **avant** `couts.ts`, car la relecture éditoriale en dépend. `lireEvenementsQualite` renvoie donc `{ cqEvents, cqAll, planAll, planClients }`, que `index.ts` passe ensuite aux coûts puis au bloc qualité. `cqEvents` vaut `null` si la table manque : 4 sous-blocs basculent alors sur `null`, à garder tel quel. |
| `cron-health/hebdo.ts` | Orchestration du scope weekly (455-468, puis appels dans l'ordre actuel, objet final 942-955 sans `generated_at`) | Cible ~80 lignes, sans aucun calcul. |
| `cron-health/index.ts` (ce qui reste) | En-tête, exclusions, `cors`, `json`, secret, scope, client, `profiles`, `isClient`, `emailOf`, aiguillage `bilanQuotidien` / `bilanHebdo`, `generated_at`, `scope`, `try/catch` 500 | Cible ~90 lignes. Mettre le handler dans une fonction exportée `handleCronHealthRequest`, avec `if (import.meta.main) Deno.serve(handleCronHealthRequest)` comme `check-subscription` : ce changement va dans un lot à part, pas dans le lot T (voir plus bas). |

Frontières : le dossier n'a pas de `boundaries_test.ts` et n'en a pas besoin pour ce chantier. Une règle suffit, à écrire en commentaire dans `hebdo.ts` : les modules de calcul (`couts.ts`, `usage-hebdo.ts`, `qualite.ts`, `fenetres.ts`, `tarifs.ts`) n'importent jamais `index.ts`, `hebdo.ts` ni `quotidien.ts`. `cron-health` n'est pas un générateur de contenu : `scripts/impact-creation.mjs` et CARTE.md ne changent pas. `node scripts/carte-impact.mjs internal-accounts` continuera d'afficher `cron-health`.

**Tests qui le protègent aujourd'hui**

- **Aucun test n'exécute `index.ts`.** Personne ne l'importe, et le harnais `_shared/test-edge-harness.ts` n'est pas branché dessus.
- Les modules du dossier : `photoroom-alerte_test.ts` (6), `higgsfield-alerte_test.ts` (8), `garde-redite_test.ts` (5), `sante-emails_test.ts` (6), `feedback-new_test.ts` (2), `fil-reparations_test.ts` (2), `durees-carrousels_test.ts` (2), `plan-carrousels_test.ts` (2), `crons-pg_test.ts` (2). Ils protègent les **jugements**, pas l'assemblage. `echantillon.ts` et `studio-bloquees.ts` n'ont pas de test.
- `_shared/usage-labels_test.ts` : 5 tests lisent le **texte** de `index.ts`. Ils vérifient que `"composition-code"` est dans `ZERO_COST_LABELS`, que chaque rédacteur et relecteur carrousel a un tarif, que chaque modèle image par défaut est tarifé, ainsi que les 4 modèles Higgsfield et les 2 Marketing Studio.
- `_shared/internal-accounts_test.ts` : la règle « comptes de test = internes sauf l'admin » du scope daily.
- `src/test/stripe-api-guard.test.ts` (Vitest, CI) : aucune lecture de champ Stripe périmé dans les fichiers qui parlent de Stripe, dont celui-ci.
- Hors CI : `e2e-visite/cron-health.spec.ts` (3 assertions sur la vraie edge) et la lecture humaine de `e2e-visite/cron-health.mjs`. Ils ne protègent pas un découpage (piège commun n°4).

**Tests à ajouter AVANT de découper**

1. **Contrat du handler, scope daily** (`cron-health/handler_contract_test.ts` + un harnais local `cron-health/contract_harness.ts`). Capter le handler avec `captureServeHandler("./index.ts")` (il marche avec `Deno.serve`, **sans toucher au code**). Figer l'heure avec `FakeTime` (`std/testing/time.ts`). Le faux `fetch` générique de `installFetchMock` renvoie `[]` pour toutes les tables : il ne suffit pas. Il faut un faux `fetch` qui :
   - sert des tables déjà remplies ;
   - applique les filtres `eq.`, `gte.`, `lt.`, `in.()`, ainsi que `offset`/`limit` ;
   - répond au `count` exact de `visual_studio_versions` (en-tête `Content-Range`) et au RPC `cron_jobs_health` ;
   - simule `image-api.photoroom.com/v1/account`, `api.stripe.com/v1/events` et `/v1/subscriptions` ;
   - note chaque requête (table, filtres, ordre).

   Un seul jeu de données qui couvre : un échec de publication récent et un ancien, un post bloqué, un post programmé en retard, une connexion Instagram expirée, une LinkedIn vieillissante sans date, une Pinterest ignorée, un compte de test exclu mais **l'admin gardé**, des retours bêta `blocking`, `minor` et `new`, un événement Stripe non livré, un abonnement app sans ligne en base, un abonnement Binôme sans `metadata.user_id` (non compté), une période périmée, Photoroom le jour du reset. `assertSnapshot` sur le JSON entier (`generated_at` est figé par `FakeTime`).
2. **Daily en mode dégradé** : sans `PHOTOROOM_API_KEY`, sans `STRIPE_SECRET_KEY`, Stripe en 500, RPC `cron_jobs_health` en erreur, `HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD` absent. On attend toujours un **200**, avec un `erreur` dans le bloc concerné.
3. **Contrat du handler, scope weekly** : `ai_usage` avec des modèles connus, un modèle inconnu (il doit sortir dans `modeles_non_tarifes`), `composition-code` (il ne doit pas en sortir), une ligne `model_used` nulle (`inconnu`) ; des comptes internes (totaux à part) ; une relecture au nom daté `claude-opus-5-5-2026…` ; des `guard` `lost-number:…` ; des lignes `carousel_plan` ; 2 owners pour un même compte ; des cohortes sur 5 semaines ; un carrousel retravaillé et un sujet regénéré. Snapshot du JSON entier.
4. **Les 3 chemins de repli de la qualité** : `content_quality_events` sans la colonne `content_preview` (erreur PostgREST qui la nomme, puis nouvelle lecture), table absente (`source: "brouillons"` et les 4 sous-blocs à `null`), puis table complète. Un snapshot pour chaque.
5. **Pagination** : `ai_usage` à 2 345 lignes et `profiles` à 1 001 lignes. Les totaux doivent être exacts, avec 3 requêtes `offset` 0, 1000 et 2000 pour `ai_usage`.
6. **Entrée** : `OPTIONS` (CORS), secret absent ou faux (401), corps illisible (scope `daily`), `profiles` en erreur (500 `{ error }`).
7. **Liste des requêtes** : snapshot de la liste triée des requêtes de chaque scope (tables, colonnes, filtres). Elle attrape une lecture oubliée ou doublée au déplacement.
8. **Rendre `usage-labels_test.ts` indifférent à l'indentation** (regex `\n\s*\};`) et lui faire lire un chemin unique, une constante `CRON_HEALTH_TARIFS`. Au lot 3, on ne changera ainsi qu'une ligne.
9. Petits tests à poser au passage : `echantillon_test.ts` (sources « clientes » et « comptes internes », semaine calme) et `studio-bloquees_test.ts` (count et erreur).
10. Après chaque lot : `npm run test:edges` **sans aucun `.snap` modifié**, et `deno check --no-config --no-lock --node-modules-dir=none supabase/functions/cron-health/index.ts` en local. Si ce `deno check` passe sur `main`, ajouter la même ligne à `.github/workflows/ci.yml`, comme pour `visual-studio`.

**Risque et ordre conseillé**

Niveau : **faible à moyen**. Le code est en lecture seule : pas d'IA, pas de crédit, pas d'écriture en base, pas d'e-mail. Une régression ne bloque donc aucune utilisatrice. En revanche, elle **aveugle Laetitia** sans bruit : un modèle compté 0 €, une alerte qui ne sonne plus, un bloc qui disparaît. C'est exactement ce qui s'est passé avec #697 (Sonnet 5 compté zéro pendant un mois), #937 (faux positif Photoroom) et #663 (fausses alertes Binôme). Le risque vient aussi de trois choses :
- aujourd'hui, **aucun test n'exécute le fichier** ;
- le scope weekly est fait de fermetures qui se partagent des variables, et `addEditorialReview` modifie les résumés en place, dans un ordre qui compte ;
- 5 tests lisent son texte avec une regex sensible à l'indentation.

Les 30 commits depuis le 17/07/2026 (dont 1 doublon Lovable de #1526, `43cc79706 Changes`, et 4 corrections : #663, #937, #1053, #1365) se rangent ainsi :
- 8 ajouts à la **grille de prix** : #697, #700, #1049, #1050, #1052, relecture Opus 5.5, Fable 5.1, #1365 ;
- 10 nouveaux **signaux de qualité** au bilan du lundi : #593, #1053, #1393, #1396, #1399, #1400, #1428, #1450, #1514, #1526 ;
- 7 nouvelles **sondes du matin** : #660, #663, #937, #949, #1390, #1504, #1563 ;
- 4 changements **transverses** : pagination #601, faux signaux #919, liste unique des comptes internes et top 5 #1364, espaces owner #1460.

Aucun de ces commits ne touche à plus d'une mission à la fois. Le découpage colle donc à la façon dont le fichier évolue : une PR « tarifer un modèle » ne toucherait plus que `tarifs.ts`, et une nouvelle sonde que `quotidien.ts` plus son module.

Une PR par lot :
1. **Lot T (tests seuls)** : tests 1 à 9. Aucune ligne de `index.ts` touchée. Références générées sur `main`.
2. **Lot 1** : `lecture.ts`, `photoroom.ts`, `higgsfield-budget.ts`, `facturation.ts` (fonctions déjà isolées en haut du fichier). On vérifie la garde Stripe (`npm test`).
3. **Lot 2** : `quotidien.ts` (scope daily entier), avec le commentaire de `e2e-visite/cron-health.spec.ts` mis à jour.
4. **Lot 3** : `tarifs.ts`, avec `usage-labels_test.ts` qui pointe vers ce fichier, et les commentaires de `plan-limiter.ts` (l. 464-465) et de `usage-labels_test.ts` mis à jour (chemins seulement).
5. **Lot 4** : `fenetres.ts` et `couts.ts`. Relire le diff ligne à ligne : mutation en place, 4e paramètre explicite, ordre avant le top 5.
6. **Lot 5** : `qualite.ts`, `usage-hebdo.ts` et `hebdo.ts`. À la fin, `index.ts` fait environ 90 lignes. Lancer `node scripts/cliquet-dette.mjs --update` (la référence baisse ; le fichier sort de la liste sous 800 lignes).
7. **Lot 6 (changements de code, à part)** : `handleCronHealthRequest` exporté avec `import.meta.main` ; corriger les commentaires « n'importe rien de `_shared/` » ; éventuellement, importer `COMPOSED_BY_CODE_MODEL` au lieu de le recopier ; un seul `round2` si ce n'est pas déjà fait ; `deno check` ajouté à la CI.

À chaque lot :
- `npm run test:edges` sans `.snap` modifié ;
- le `deno check` local ;
- pas de fusion pendant une session Lovable ouverte ;
- **redéployer l'edge `cron-health`** après la fusion (`e2e-visite/edges-a-redeployer.mjs`). Si un bloc disparaît du JSON, `cron-health.mjs` affiche « non mesuré (edge cron-health pas redéployée) » au lieu d'une erreur : vérifier le lendemain matin que chaque bloc est bien là, et le lundi suivant pour le scope weekly.

**Avancement (15/10/2026)** : lot T fait, aucune ligne d'`index.ts` touchée. `cron-health/handler_contract_test.ts` (15 cas) fait tourner le vrai handler, capté par `captureServeHandler`, sur une base en mémoire : `contract_harness.ts` (faux PostgREST qui applique `eq.`, `gte.`, `lt.`, `in.()`, `offset`/`limit`, le `count` exact en `HEAD` et le RPC `cron_jobs_health` ; fausses API Photoroom et Stripe ; horloge figée) et `contract_donnees.ts` (le jeu de données des points 1 et 3). Snapshots : JSON entier du daily et du weekly, liste triée des requêtes de chaque scope, 3 variantes dégradées du daily (clés absentes et RPC en erreur, Stripe et Photoroom en erreur HTTP, tables en panne), 3 chemins de la qualité (sans `content_preview`, table absente, table vide). Pagination vérifiée (`ai_usage` 2 345 lignes en 3 pages, `profiles` 1 001 en 2), entrée vérifiée (OPTIONS, 401, corps illisible, 500 sur `profiles`). `_shared/usage-labels_test.ts` lit un chemin unique `CRON_HEALTH_TARIFS` et ses regex tolèrent toute indentation de `};`. `echantillon_test.ts` (5 cas) et `studio-bloquees_test.ts` (3 cas) posés. `FakeTime` n'est pas utilisé : il fige aussi les minuteries, `figerHeure` ne remplace que `Date.now()` et `new Date()`. Lot 1 fait : `lecture.ts` (`HOUR`, `DAY`, `fetchAllRows`), `photoroom.ts`, `higgsfield-budget.ts` et `facturation.ts` (avec tout le commentaire de l'incident Stripe) déplacés à l'identique ; la garde Stripe analyse désormais `facturation.ts` (20 fichiers) et reste verte. `index.ts` : 959 → 710 lignes, sorti du cliquet (moins de 800) ; aucun snapshot du contrat modifié. Lot 2 fait : `quotidien.ts` (`bilanQuotidien({ supabase, now, isClient, emailOf })`, le scope daily entier, même ordre du `Promise.all` de 10 lectures, `connState` et `SEVERITY_RANK` compris) ; `index.ts` ajoute `generated_at` et `scope` après l'appel, comme avant ; commentaire de `e2e-visite/cron-health.spec.ts` pointé vers `quotidien.ts`. `index.ts` → 586 lignes, aucun snapshot modifié. À changer au lot 3 : le message « ajouter son tarif dans cron-health/index.ts » de `e2e-visite/cron-health.mjs` (l. 260). Lot 3 fait : `tarifs.ts` (`IMAGE_COST_EUR`, `TEXT_COST_EUR_PER_MTOKEN`, `REVIEW_COST_EUR_PER_MTOKEN`, `ZERO_COST_LABELS`, exportés au niveau du fichier avec tout l'historique des prix) ; `usage-labels_test.ts` lit `cron-health/tarifs.ts` (une ligne, plus les 4 messages d'erreur) ; chemins mis à jour dans le commentaire de `plan-limiter.ts` et le message de `cron-health.mjs`. `index.ts` → 485 lignes, aucun snapshot modifié. Désormais, tarifer un modèle = ne toucher que `tarifs.ts`. Lot 4 fait : `fenetres.ts` (`inWindow`, `week(now, offset)`) et `couts.ts` (`summarize`, `addEditorialReview`, un seul `round2` au niveau du module). `addEditorialReview` modifie toujours le résumé en place ; son 4e paramètre est devenu obligatoire, les deux appels qui comptaient sur la valeur par défaut passent `cqEvents || []` ; l'ordre « relecture avant le top 5 » est inchangé (rappelé en tête de `couts.ts`). `index.ts` → 394 lignes, aucun snapshot modifié. Lot 5 fait : `qualite.ts` (`lireQualite` lit les carrousels puis `content_quality_events` avec ses deux replis et rend `{ carCur, carPrev, cqEvents, cqAll, planAll, planClients }` ; `scoreStats` ; `blocQualite`), `usage-hebdo.ts` (`espacesOwnerMultiples`, `cohortes`, `publications`, `topConsommatrices`, `comptesInternes`) et `hebdo.ts` (`bilanHebdo`, orchestration seule, mêmes lectures dans le même ordre, relecture éditoriale avant le top 5, règle de frontière en commentaire). La lecture des carrousels a rejoint celle des événements dans `lireQualite` (même ordre qu'avant). `index.ts` → 80 lignes : entrée, secret, scope, `profiles`, aiguillage. Aucun snapshot modifié. Lot 6 fait : `handleCronHealthRequest` exporté, `Deno.serve` derrière `if (import.meta.main)` comme `check-subscription` ; le contrat du handler importe directement la fonction. Commentaires « n'importe rien de `_shared/` » corrigés (`tarifs.ts`, `usage-labels_test.ts`, `plan-limiter.ts`) : la recopie de `composition-code` reste, pour ne pas charger `plan-limiter.ts` dans cette edge, et `usage-labels_test.ts` la surveille toujours. Un seul `round2` depuis le lot 4. `deno check` de `cron-health/index.ts` ajouté à la CI. **Fiche 18 terminée** (`index.ts` 959 → 88 lignes). Après la fusion : redéployer l'edge `cron-health`, puis vérifier le lendemain matin que chaque bloc du daily est là, et le lundi suivant pour le weekly.

---

## 2 ter. Les fiches 19 à 23 (rédigées le 16/10/2026)

Classement recalculé le 16/10/2026 (`node scripts/gros-fichiers.mjs --top 25`, 90 jours depuis le 18/07/2026). Les fiches 12, 13, 14, 16 et 17 sont terminées, et la fiche 11 n'a plus lieu d'être (777 lignes). Ces cinq fiches couvrent les fichiers suivants par score. `src/lib/carousel-editor.ts`, `CarouselEditor.tsx` et `carousel-visual/` restent exclus (chantiers en cours ailleurs).

| # | Fichier | Lignes | Commits | Corrections | Score | Fiche |
|---|---|---:|---:|---:|---:|---|
| 10 | `src/components/creer/formatRenderers/StoryResult.tsx` | 1070 | 25 | 4 | 52 | **19** |
| 11 | `src/pages/Calendar.tsx` | 1156 | 14 | 8 | 50 | **20** |
| 13 | `src/pages/InstagramStats.tsx` | 1412 | 11 | 6 | 47 | **21** |
| 14 | `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` | 1518 | 14 | 2 | 44 | **22** |
| 15 | `src/hooks/use-onboarding.ts` | 918 | 18 | 7 | 44 | **23** |

Comme pour les fiches précédentes, le **repère** (nom de fonction, d'état ou de commentaire) fait foi quand les numéros de ligne bougent. Chaque fiche signale aussi des défauts repérés en lisant le code : aucun n'est corrigé ici, chacun fera l'objet d'une PR à part, avec un test qui change exprès. La fiche 22 commence par une décision à prendre (lot 0).

### 19. `src/components/creer/formatRenderers/StoryResult.tsx` — 1 070 lignes

**En une phrase :** c'est l'atelier des stories dans /creer (et dans le recyclage de contenu) : il affiche la séquence générée une story à la fois, laisse tout modifier (texte, sticker, titre, citation, liste), choisit le fond (photo ou couleur) et la photo (bibliothèque, photo attachée, banque Pexels), place le texte et la photo sur l'aperçu, bascule entre face cam et story designée, supprime une story, corrige les expressions « robot », et exporte en PNG, en PPTX ou vers Canva.

> Lignes vérifiées sur le fichier au 16/10/2026 (dernier commit : `0741ba4bc`, #1655, chantier D : stories une à la fois). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou de commentaire) est la référence fiable.

Repères de structure :
- **Deux importeurs réels** (grep `formatRenderers/StoryResult` dans `src/`) :
  - `src/components/creer/CreerStepResult.tsx` (import l. 13, rendu l. 578) : passe `result`, `onStoriesUpdate`, `photos` et `onExportActionsChange={setStoryActions}` (état l. 373, renvoyé à `ResultActions` l. 746). Le `onStoriesUpdate` vient de `src/pages/CreerUnifie.tsx` (l. 1886) : il réécrit `result.raw.stories` (ou `sequences`, ou `slides`).
  - `src/components/ContentRecycling.tsx` (import l. 24, rendu l. 528) : passe seulement `result` et `onStoriesUpdate` (réécrit `storiesSequence` et le texte affiché via `recycledStoriesText`). **Pas d'`onExportActionsChange`** : c'est ici que s'affiche la rangée de boutons d'export locale (l. 709-724).
  - Import de type seulement : `StoryExportActions` dans `src/components/creer/ResultActions.tsx` (l. 6).
- Exports : `export default function StoryResult` (l. 115) et `export interface StoryExportActions` (l. 53). Tout le reste est privé.
- Déjà sorti : `StoryNav.tsx` (31 lignes) et `StoryPersonalAnchor.tsx` (36) le 15/10/2026 (chantier D) ; avant : `StoryPhotoSuggestions.tsx` (453, banque Pexels + bande bibliothèque), `StoryVisualDirectControls.tsx` (171, aperçu déplaçable), `StorySequenceReaderDialog.tsx` (125, lecture de la séquence), et la logique dans `src/lib/story-visual.ts` (569, rendu HTML déterministe) et `src/lib/story-photos.ts` (102, URL signées et conversion en data URL). Ce qui reste : l'état de la séquence, ~12 fonctions de modification, le choix des photos, les exports et un gros rendu de carte (l. 733-1025, ~290 lignes).
- Référence du cliquet : 1 070 lignes, 18 `any` (`scripts/cliquet-dette.baseline.json`, l. 36-39). Le tableau du classement (section 1, rang 21) dit encore 1 089 lignes : chiffre du 14/10, avant le chantier D.
- `scripts/impact-creation.mjs` (l. 91) le range sous « Écran de résultat : Story » par la règle générale `formatRenderers/(\w+)Result.tsx` ; cas figé par `src/test/impact-creation.test.ts` (l. 71). `docs/creation-contenu/CARTE.md` (l. 35) le cite pour le format Stories.
- Aucun test ne lit le **texte** de ce fichier (grep `readFileSync` / `?raw` : rien). Le piège commun n° 3 ne s'applique pas.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Socle | 1-74 | Imports ; `LIBRARY_POOL` (12 photos signées d'avance) et `LIBRARY_STRIP` (4 vignettes par story) ; `PhotoLike` ; `StoryExportActions` (exporté, 52-62) ; `Props` (64-74). |
| 2. Petites fonctions de texte | 76-112 | `getTextField` (le champ du texte : `text`, `texte` ou `content`), `getStoryText`, `getDisplayedBody`, `hasMirroredBody` (le texte du visuel recopie le récit), `replaceCitationInNarration`, `publicationTimeLabel` (matin / midi / soir). Pures, aucun appel. |
| 3. État de la séquence et retour du parent | 115-135 | `stories` = résultat + plan visuel de repli (`withStoryVisualFallback`) ; `readerOpen`, `personalAnchor`, `currentStory` / `shownStory` ; effet qui remplace l'état local seulement quand le **contenu** reçu change (`rawSignature` = `JSON.stringify`, comparé à `prevSignature`). |
| 4. Charte → réglages du rendu | 137-152 | `useBrandCharter` ; objet `branding` (4 couleurs + réglages stories : assemblage, pastille, coins, alignement). Copié presque mot pour mot dans `src/hooks/use-story-export.ts` (l. 41-55). |
| 5. Photo de chaque story | 154-235 | `attachedByStory` (159-193 : 1 photo attachée = toutes les stories à fond photo ; 2+ = une par story, sans doublonner celles de la bibliothèque déjà placées) ; `libraryUrls` (195-220 : `photo_id` → URL signée, jamais enregistrée) ; `getStoryPhotoUrl` (222-235 : `photo_url` > `photo_id` résolu > photo attachée). |
| 6. Aperçus | 237-247 | `frames` : HTML de chaque story via `buildStoryFrameHtml` (sans réseau) ; `hasFrames`. |
| 7. Exports | 248-338 | `buildExportFrames` (254-275 : URL de bibliothèque redemandées à l'export, chaque photo convertie en data URL, erreur « La photo de la story N est indisponible… » si elle manque) ; `handleExport` (PNG), `handleExportPptx`, `handleOpenInCanva` (titre `Stories — <label>`) ; effet qui remonte les actions au parent (310-338, `null` sans frame et au démontage). |
| 8. Correction des expressions « robot » | 340-363, 1065 | `fullText` ; `fixStoryExpressions` (récit + `title_pill`, `body_pill`, `quote`, `list_pills`) ; `RedFlagsChecker` en bas. |
| 9. En-tête de la séquence | 365-379, 687-726 | `ANGLE_LABELS` (7 angles), `angleInfo`, `publicationTime` ; rendu : badge d'angle, `structure_label`, horaire, « Lire la séquence », et les 3 boutons d'export **seulement sans `onExportActionsChange`**. |
| 10. Modifier les textes | 381-452 | `updateStoryText` (garde le visuel aligné si `hasMirroredBody`), `insertPersonalAnchor` (phrase perso au début de la story 1), `updateVisualPill` (citation → récit synchronisé, `body_pill_edited`), `updateVisualListPill`, `updateStickerText`. |
| 11. Placer le texte et la photo | 454-507 | `setTextPosition` (Haut / Milieu / Bas, efface x / y), `updateVisualViewport`, `moveStoryText`, `resetStoryViewport`, `setBackground` (photo ou couleur). |
| 12. Face cam ↔ story designée | 509-552 | `toggleFaceCam` : en version designée, fabrique un plan visuel minimal (`body_pill` = 350 premiers caractères du texte, fond photo, gabarit `photo_pills`). |
| 13. Choisir une photo | 554-669 | `applyStoryPhoto` (stock ou « Ma photo », `onlyIfEmpty` : jamais écraser une photo déjà là) ; `applyLibraryPhoto` (garde `photo_id`, efface `photo_url` et le crédit) ; vivier bibliothèque (619-645 : `useUserPhotos`, 12 photos prêtes signées une fois) ; `stripPourStory` (647-666 : les 4 plus pertinentes pour la story, `classerParPertinence`) ; `pickerFor`. |
| 14. Supprimer une story | 671-683, 1045-1063 | `deleteTarget`, `removeStory` (jamais la dernière, décale `pickerFor`, toast) ; fenêtre de confirmation. |
| 15. Carte d'une story | 728-1026 | Ancre perso (728-730), `StoryNav` (731), puis pour chaque story (cartes toutes montées, `hidden` sauf celle affichée) : en-tête (738-776 : numéro, rôle, « Me filmer » / « Story designée », « Supprimer ») ; texte (777-789) ; sticker (790-831) ; réglages visuels (832-961 : fond, position, avertissement visage, champs selon le gabarit `citation` / `liste` / autre) ; mention de la photo (962-988 : bibliothèque, crédit Pexels ou directive) ; `StoryPhotoSuggestions` (989-1006) ; aperçu déplaçable `StoryVisualDirectControls` (1008-1021). |
| 16. Fenêtres et pied | 1028-1067 | `PhotoLibraryPickerDialog` (1 photo), `StorySequenceReaderDialog`, confirmation de suppression, `RedFlagsChecker`, `AiGeneratedMention`. |

**Découpage proposé** : les fonctions pures dans `src/features/stories/` (nouveau dossier), l'affichage dans `src/components/stories/` (où vivent déjà `StoryNav`, `StoryPersonalAnchor`…), la logique dans `src/hooks/`. `StoryResult.tsx` garde `Props`, l'état de la séquence, l'appel aux hooks, l'en-tête de carte et la mise en page : cible ~350 lignes. L'export par défaut et `StoryExportActions` restent dans `StoryResult.tsx` : rien à toucher dans `CreerStepResult.tsx`, `ContentRecycling.tsx` ni `ResultActions.tsx`.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/stories/story-text.ts` | Mission 2 (`getTextField`, `getStoryText`, `getDisplayedBody`, `hasMirroredBody`, `replaceCitationInNarration`, `publicationTimeLabel`) + `ANGLE_LABELS` (sorti du composant, en constante). | Fonctions pures. Ne pas « unifier » `getTextField` avec la lecture `text \|\| texte \|\| content` de `story-visual.ts` dans ce lot (voir bugs plus bas). |
| `src/features/stories/story-branding.ts` | Le calcul de `branding` (138-152) sous le nom `storyBrandingFromCharter(charter)`. | Ne **pas** brancher `use-story-export.ts` dessus dans la même PR (autre écran, PR à part). |
| `src/components/stories/StorySequenceHeader.tsx` | Rendu de l'en-tête (687-726). | Reçoit `angleInfo`, `structureLabel`, `publicationTime`, `count`, `onRead`, `showLocalExports` (= `hasFrames && !onExportActionsChange`) et les 3 actions + leurs états. Libellés exacts (« Télécharger les visuels », « PPTX éditable », « Ouvrir dans Canva »). |
| `src/components/stories/StoryDeleteDialog.tsx` | Confirmation de suppression (1045-1063). | Textes exacts : `story-result-editing.test.tsx` clique « Supprimer cette story » et « Garder la story ». |
| `src/components/stories/StoryTextFields.tsx` | Texte de la story + sticker (777-831). | `id` et `aria-label` à garder **au caractère près** (« Texte complet de la story N », « Option N du sticker de la story N », « Texte du sticker de la story N ») : les tests s'en servent. |
| `src/components/stories/StoryVisualFields.tsx` | Réglages visuels (832-961) + mention de la photo (962-988). | Garder `role="group"`, `aria-label="Fond de la story"`, `data-story-background` et `aria-pressed` : `e2e-visite/stories-visuelles.spec.ts` (l. 135-137) compte les fonds par ces attributs. Reçoit `libraryUrls` (pour « Photo de ta bibliothèque ») et les fonctions de modification. |
| `src/hooks/use-story-photo-sources.ts` | Missions 5 et 13 côté lecture : `attachedByStory`, `libraryUrls` + son effet, `getStoryPhotoUrl`, vivier (`libraryPool` + effet), `stripPourStory`. Renvoie ces 4 valeurs. | Garder les deux effets avec leur garde `cancelled` et la liste de dépendances de l'effet `libraryIdsSignature` (commentaire `eslint-disable` compris). Continuer d'importer `useUserPhotos`, `getSignedPhotoUrls`, `resolveLibraryPhotoUrls` **par les mêmes chemins** : les tests les remplacent par `vi.mock` sur ces chemins. |
| `src/hooks/use-story-atelier-exports.ts` | Mission 7 : `exporting`, `exportingPptx`, `useOpenInCanva`, `buildExportFrames`, `handleExport`, `handleExportPptx`, `handleOpenInCanva`, effet de remontée. | Nom distinct de `use-story-export.ts` (exports hors atelier, règles différentes : **ne pas fusionner**). Listes de dépendances identiques (`charter` et non `branding`, `frames` dans l'effet de remontée). Le message d'erreur de photo manquante reste mot pour mot (`story-export-integrity.test.tsx`). |
| `src/hooks/use-story-edits.ts` | Missions 8, 10, 11, 12 et `applyStoryPhoto` / `applyLibraryPhoto` : toutes les fonctions qui écrivent dans `stories`. Reçoit `setStories`, `stories` (pour `fixStoryExpressions`, `setTextPosition`, `insertPersonalAnchor`) et `onStoriesUpdate`. | **Le lot le plus risqué** (voir Pièges, point 1). `removeStory` reste dans le composant (il touche `pickerFor` et `deleteTarget`). `useState` de `stories` et l'effet de retour du parent restent dans `StoryResult.tsx`. |
| `StoryResult.tsx` (reste) | `Props`, `StoryExportActions`, l'état (mission 3), `frames`, `removeStory`, `pickerFor`, l'en-tête de carte (738-776), `StoryPhotoSuggestions`, l'aperçu déplaçable, les fenêtres. | Garder le `<div className="space-y-2" data-selection-enabled="true">` (l. 732) : voir Pièges. |

**Tests qui le protègent aujourd'hui**

- `src/test/story-result-editing.test.tsx` (22 cas, rendu réel) : horaire unique et lecture de la séquence, plan de repli d'une story sauvegardée sans visuel, ancre perso, texte déplacé sur l'aperçu, citation ↔ récit, texte sous la citation, position gardée à la réouverture, nouvelle séquence de même longueur, édition locale gardée si le parent renvoie le même contenu, pastille personnalisée, liste, options de sticker, suppression (confirmée, annulée, jamais la dernière), une story à la fois. Il remplace par des faux : charte (vide), bibliothèque (vide), Canva, `story-photos`, `photo-storage`, exports, `RedFlagsChecker`, `StoryPhotoSuggestions`, `PhotoLibraryPickerDialog`.
- `src/test/story-export-integrity.test.tsx` (4 cas) : correction « robot » partout, URL de bibliothèque redemandée à l'export et jamais enregistrée, `photo_id` introuvable non remplacé par une photo attachée, export d'une story sur fond couleur.
- `src/test/recycle-save-structure.test.tsx` : remplace `StoryResult` par un faux (vérifie seulement qu'il reçoit la séquence).
- `src/test/impact-creation.test.ts` (l. 71) : classement du fichier dans le rapport d'impact.
- Indirectement : `src/test/story-photo-suggestions.test.tsx` (2 cas, l'enfant seul) ; les tests de `CreerStepResult` remplacent l'écran de résultat par des faux (fiche 11).
- Playwright : `e2e-visite/stories-visuelles.spec.ts` (génération réelle, aperçus, fonds) ; il ne tourne pas en CI (piège commun n° 4).

**Rien ne fige** : la répartition des photos attachées (1 photo / 2+ photos), l'ordre de priorité de `getStoryPhotoUrl`, `toggleFaceCam`, `setBackground`, `setTextPosition`, `applyStoryPhoto` avec `onlyIfEmpty`, `applyLibraryPhoto`, la bande « 4 plus pertinentes », la rangée d'exports locale (cas `ContentRecycling`), le titre envoyé à Canva, le décalage de `pickerFor` après une suppression, le badge d'angle.

**Tests à ajouter AVANT de découper**

1. **Photos attachées** (`src/test/story-result-photos.test.tsx`, mêmes faux que `story-result-editing`, mais un faux `StoryPhotoSuggestions` qui expose ses props) : 1 photo → `appliedUrl` identique sur toutes les stories à fond photo ; 3 photos → une par story dans l'ordre, en sautant les stories qui ont déjà `photo_id` ou `photo_url`, sans redonner une photo de bibliothèque (`userPhotoId`) déjà placée ; `autoApply` faux quand une photo attachée couvre la story.
2. **Priorité de photo** : `photo_url` > `photo_id` résolu > attachée, lue sur `appliedUrl` et sur l'aperçu (`srcdoc` de « Aperçu story N »).
3. **Choix de photo** : `onApply(photo, { onlyIfEmpty: true })` sur une story qui a déjà un `photo_id` → rien ne change, `onStoriesUpdate` non appelé ; sans `onlyIfEmpty` → `photo_url` + crédit ; `onApplyLibrary(row)` → `photo_id`, `photo_library_description`, `photo_url: null`, `photo_stock_credit: null` (objet exact envoyé à `onStoriesUpdate`, en snapshot).
4. **Bande bibliothèque** : 15 photos (dont non prêtes) → `getSignedPhotoUrls` reçoit 12 chemins au plus ; `libraryStrip` = 4 éléments, le plus pertinent d'abord pour la directive de la story.
5. **Face cam ↔ designée** : objet exact après chaque bascule (`format`, `format_label`, `gabarit` `fond_pills` → `photo_pills`, `body_pill` tronqué à 350, `background: "photo"`), en snapshot.
6. **Fond et position** : « Couleur » / « 📷 Photo » (`aria-pressed`, `onStoriesUpdate`) ; « Haut » efface `text_position_x` / `_y` et `face_avoidance_applied`.
7. **Exports locaux** (sans `onExportActionsChange`, comme `ContentRecycling`) : les 3 boutons visibles, PNG et PPTX appelés avec le nom `structure_type` ; avec `onExportActionsChange` : boutons absents, `frameCount` juste, `null` au démontage ; titre Canva `Stories — <structure_label>`.
8. **Suppression avec le choix de photo ouvert** (faux `PhotoLibraryPickerDialog` qui expose `open` / `onConfirm`) : picker ouvert sur la story 3, suppression de la story 1 → la photo confirmée va bien sur l'ancienne story 3 (devenue 2).
9. **En-tête** : badge d'angle (`coup_de_gueule` → « 🔥 Coup de gueule doux »), `structure_label` affiché.
10. **Fonctions pures** (dès le lot 1) : `src/test/story-text.test.ts` sur les 6 fonctions de la mission 2 (dont `replaceCitationInNarration` insensible à la casse, et `getTextField` sur `{ text: "" , texte: "x" }` pour figer le comportement actuel).

**Pièges**

1. **`onStoriesUpdate` est appelé DANS les fonctions de mise à jour d'état** (`setStories(prev => { …; onStoriesUpdate?.(updated); return updated; })`, 10 fois) et directement après `setStories` dans `fixStoryExpressions` et `setTextPosition`. Les deux parents renvoient alors un nouveau `result` ; l'effet l. 128-135 voit une nouvelle signature et remplace l'état local par une copie (même contenu). Au déplacement : garder ce schéma tel quel. Ne surtout pas le remplacer par un `useEffect(() => onStoriesUpdate(stories), [stories])` : il partirait à l'ouverture et enregistrerait le plan de repli (`withStoryVisualFallback`) dans `result.raw` sans action de l'utilisatrice.
2. **Listes de dépendances volontairement « fausses »** : `frames` et `buildExportFrames` dépendent de `charter` et non de `branding` (recréé à chaque rendu ; `eslint-disable`). Les « corriger » recalcule le HTML de toutes les stories à chaque rendu (iframes rechargées). L'effet de remontée (310-338) dépend de `frames` : chaque frappe envoie `null` puis les nouvelles actions au parent. Ne pas le changer pendant le découpage.
3. **Clés par index** (`key={i}` l. 733) et cartes **toutes montées** (`hidden`, chantier D) : chaque `StoryPhotoSuggestions` lance sa recherche Pexels décalée de `storyIndex × 700 ms` et garde son état interne (`autoApplied`, suggestions). Après une suppression, la carte n° i reçoit la story suivante. Ne pas passer à `{stories.map}` démonté / remonté ni changer les clés dans un lot de déplacement.
4. **`data-selection-enabled="true"`** (l. 732) est lu par `src/hooks/use-text-selection.ts` (l. 34) pour le menu IA sur sélection de texte, et sert de repère à `e2e-visite/stories-visuelles.spec.ts` (l. 155). Il doit rester sur le conteneur des cartes.
5. **URL signées jamais enregistrées** : `libraryUrls` sert à l'affichage seulement ; `photo_id` est ce qui part dans le JSON. `buildExportFrames` redemande les URL à l'export et refuse de remplacer un `photo_id` introuvable par une photo attachée (`7c3ac6ce8`). Garder cet ordre exact.
6. **Appels réseau (aucun appel IA ici)** : `getSignedPhotoUrls` et `resolveLibraryPhotoUrls` (stockage Supabase), `urlToDataUrl` (téléchargement), `useOpenInCanva` (connexion Canva). Les appels qui coûtent sont dans l'enfant `StoryPhotoSuggestions` (`searchStockPhotos`, `photo-describe` en mode `pick_stock` via `invokeWithTimeout`). Pas de `checkQuota` / `logUsage` à protéger dans ce fichier.
7. **Espace de travail** : pas de `useWorkspaceFilter` ici ; la charte passe par `useBrandCharter` (qui l'utilise, `use-branding.ts` l. 107) et la bibliothèque par `useUserPhotos` (`useWorkspaceId`). Ne pas ajouter de filtre en passant.
8. **Mode démo** : aucune branche démo dans le fichier (grep `demo` : rien).
9. **Rapport d'impact** : les nouveaux fichiers (`src/features/stories/`, `src/components/stories/`, `src/hooks/use-story-*.ts`) ne correspondent à aucune règle de `FRONT_FILES` (`scripts/impact-creation.mjs` l. 80-93) : le rapport de CI les dirait hors création. Au lot 1, ajouter une règle « Stories : atelier » + un cas dans `src/test/impact-creation.test.ts` + CARTE.md (l. 35). Déjà vrai aujourd'hui pour `StoryPhotoSuggestions.tsx`, `src/components/stories/*`, `src/lib/story-visual.ts` et `src/lib/story-photos.ts`.
10. **Textes lus par les tests** : « Texte complet de la story N », « Aperçu story N » (titre posé par `StoryVisualDirectControls`), « Supprimer », « Supprimer cette story », « Garder la story », « Lire la séquence », « Citation mise en avant », « Élément N de la liste »… Déplacer à l'identique.

À ne **pas** corriger pendant le découpage (noté pour une PR à part) :
- `getTextField` choisit le champ par **présence** (`"text" in story`), alors que `story-visual.ts` (l. 99, 431), `recycle-result.ts` (l. 19) et `stripPourStory` (l. 655) lisent `text || texte || content`. Une story `{ text: "", texte: "Bonjour" }` montre un champ vide mais un aperçu « Bonjour ».
- `setTextPosition` et `fixStoryExpressions` partent de `stories` (valeur du rendu) au lieu de `prev`, contrairement aux 10 autres fonctions : une modification faite juste avant dans le même tour peut être perdue.
- L'effet du vivier (l. 634-641) n'a pas de `.catch`, contrairement à celui des URL de bibliothèque (l. 215). Risque faible (`getSignedPhotoUrls` renvoie une carte vide en cas d'erreur Supabase), mais une exception laisserait une promesse rejetée sans traitement.
- `src/hooks/use-story-export.ts` (exports depuis le calendrier et les idées) n'a pas reçu les corrections de `7c3ac6ce8` : il ne redemande pas les URL de bibliothèque à l'export et exporte **sans photo, sans prévenir**, si une photo manque. Le bloc `branding` y est copié.
- Le bouton « Supprimer » (l. 773) et « Story designée » / « Me filmer » ne suivent pas la règle « verbe + objet » de CLAUDE.md.
- Commentaire périmé dans `StoryPhotoSuggestions.tsx` (l. 50) : « Vignettes bibliothèque récentes » (elles sont classées par pertinence depuis #729).
- `buildStoryFrameHtml` est appelé deux fois par story à l'export (l. 260 et 270) : sans effet visible.

**Risque et ordre conseillé**

Niveau : **moyen**. Deux tests de rendu réels couvrent déjà l'édition et l'export (26 cas), et aucun test ne lit le texte du fichier. Mais le choix des photos (3 sources, une course entre la recherche Pexels et la bibliothèque) et le retour vers le parent (piège 1) ne sont figés nulle part, et une erreur y écrase une photo ou enregistre des données sans action de la personne.

Ce qui casse le plus souvent (`git log --since=2026-07-17` : 25 commits) : photos et exports (`56960f72c`, `5cb889933`, `37135ea97`, `942818e89`, `7c3ac6ce8`) ; texte complet et modifiable (`35f225e75`, `842bff2dd`, `fbb198af3`, `dead60130`, `90c84128c`) ; mise en page et charte (`140bdf9cc`, `f5fe14fb2`, `eb60e934f`, `8d6a2e943`) ; 9 commits Lovable « Changes » (5 le 07/09, 4 le 09/10) ; `fd02d9c0c` (messages d'erreur) et `0741ba4bc` (une story à la fois).

Une PR par lot (pas de session Lovable ouverte sur /creer pendant ces PR) :
1. **Lot T** : tests 1 à 9 (`src/test/story-result-photos.test.tsx` et cas ajoutés à `story-result-editing.test.tsx`). Aucun code touché. Vérifier chaque test par une panne volontaire (ex. retirer `onlyIfEmpty`, inverser la priorité `photo_url` / `photo_id`).
2. **Lot 1** : `story-text.ts`, `story-branding.ts` + test 10 + règle « Stories : atelier » dans `impact-creation.mjs` (et son test, CARTE.md). Risque très faible.
3. **Lot 2** : `StorySequenceHeader.tsx` et `StoryDeleteDialog.tsx`. JSX à l'identique.
4. **Lot 3** : `StoryTextFields.tsx` et `StoryVisualFields.tsx`. JSX à l'identique, beaucoup de props (ne pas les regrouper dans un objet dans ce lot).
5. **Lot 4** : `use-story-photo-sources.ts` (tests 1, 2, 4 obligatoires).
6. **Lot 5** : `use-story-atelier-exports.ts` (test 7 + `story-export-integrity`).
7. **Lot 6 (en dernier)** : `use-story-edits.ts` (tests 3, 5, 6, 8 obligatoires ; piège 1). Le fichier devrait passer sous 800 lignes dès le lot 3 et sortir de la référence du cliquet.

Vérifications à chaque PR :
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/story-result-editing.test.tsx src/test/story-export-integrity.test.tsx src/test/story-result-photos.test.tsx src/test/story-photo-suggestions.test.tsx src/test/recycle-save-structure.test.tsx src/test/impact-creation.test.ts`, puis `npm test` ;
- `node scripts/cliquet-dette.mjs` (le fichier doit maigrir, jamais grossir ; aucun nouveau fichier au-delà de 800 lignes) ; après la fusion, `node scripts/cliquet-dette.mjs --update` ;
- `node scripts/impact-creation.mjs --base origin/main` : lire le rapport (format Stories seulement) ;
- dans le cloud, l'installation des dépendances échoue : la CI de la PR sert de vérification ;
- mettre à jour ce document (et CARTE.md au lot 1) dans la même PR.

---

### 20. `src/pages/Calendar.tsx` — 1 156 lignes

**En une phrase :** c'est la page « Mon calendrier » : elle lit les paramètres d'URL (date, canal, série, post à ouvrir, import, coaching), charge les contenus du mois ou de la semaine (ou ceux de Léa en mode démo), filtre et range les posts par jour, enregistre ce que la fenêtre d'un post lui renvoie, gère les actions rapides de la vue Semaine, le glisser-déposer (idée → jour, post → autre jour, post → panneau d'idées), la remise en idée, l'envoi vers /creer, les exports Excel / CSV, et affiche le tout avec une dizaine de fenêtres autour.

> Lignes vérifiées sur le fichier au 16/10/2026 (dernier commit : `7b25dade5`, #1305). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou de commentaire) est la référence fiable.

Repères de structure :
- **Un seul importeur** : `src/pages/OrganizationHub.tsx` (l. 5, `lazy(() => import("./Calendar"))`, rendu l. 37 en `<CalendarPage embedded />`), monté sur la route `/calendrier` (`src/App.tsx` l. 345). `/instagram/calendrier` redirige vers `/calendrier?canal=instagram` (l. 362) : la page n'est **jamais** rendue sans `embedded`.
- Le fichier contient **trois composants** : `ExportSection` (l. 104-194, non exporté : titre « Mon calendrier », « Ajouter un contenu », menu « Plus d'actions », exports, partage ; le nom ne dit pas tout ce qu'il fait) ; `CalendarPage` (l. 196-204, **export par défaut**), une enveloppe qui passe par `CalendarWorkspaceGate` et remonte tout à neuf avec la clé `JSON.stringify([user?.id, column, value])` ; `CalendarInWorkspace` (l. 206-1156), qui fait tout le reste.
- Fonctions de module : `getGeneratorRoute` (l. 58-77), `EMPTY_SERIES_MAP` (l. 80), `makePostToRow` (l. 82-94), `fileDate` (l. 96), `autoWidth` (l. 98-102).
- Déjà sorti : la fenêtre d'un post (`CalendarPostDialog`, fiche 13 terminée), les grilles (`CalendarGrid`, `CalendarWeekGrid`), les filtres (`CalendarFilterBar`), le panneau d'idées (`CalendarIdeasSidebar`), le glisser-déposer (`CalendarDndWrapper`, chargé en `lazy` l. 55), le porte-espace (`CalendarWorkspaceGate`), les écritures « idée ↔ calendrier » (`planSavedIdea`, `moveCalendarPost` dans `src/lib/idea-calendar-persistence.ts`). Ce qui reste : l'état (~25 `useState`, 2 `useRef`), 6 effets, une quinzaine de handlers qui écrivent dans `calendar_posts` / `saved_ideas`, et la mise en page.
- **Aucun appel d'IA ni de fonction serveur** dans ce fichier (grep `functions.invoke`, `invokeWith…` : rien). Pas de `checkQuota` / `logUsage` en jeu ici ; les appels d'IA vivent dans les fenêtres (`CalendarCoachingDialog`, `CalendarPostDialog`…).
- Référence du cliquet : 1 156 lignes, 57 `any` (`scripts/cliquet-dette.baseline.json`, l. 60-63). Le compte réel est bien 57 (`as any` + `: any`).
- `scripts/impact-creation.mjs` (l. 93) range ce fichier sous « Lien calendrier → générateur » (à cause de `handleQuickGenerate`).

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Socle | 1-55 | Imports (dont `BrandingPrompt` l. 14, **importé mais jamais utilisé** ; deux imports depuis `react`, l. 4 et l. 53) ; `CalendarDndWrapper` en `lazy`. |
| 2. Route du générateur | 57-77 | `getGeneratorRoute(post)` : stories / reel / carrousel / LinkedIn / newsletter / post → URL de /creer, puis repli sur `generated_content_type`, sinon `null` (« ouvre la fenêtre »). |
| 3. Outils d'export | 79-102 | `EMPTY_SERIES_MAP` (référence stable, voir le commentaire l. 293-295), `makePostToRow` (10 colonnes : Date, Thème, Canal, Format, Objectif, Statut, Série, Épisode, Notes, Brouillon coupé à 200), `fileDate`, `autoWidth` (largeur des colonnes Excel, 40 max). |
| 4. En-tête et actions (`ExportSection`) | 104-194 | `exportCSV` (BOM, séparateur `;`, guillemets doublés) ; `exportXLSX` (`import("xlsx")` dynamique, une feuille par canal quand le filtre est « tous ») ; boutons « Ajouter un contenu », « Préparer ma semaine » (deux fois : menu au doigt, bouton sur ordinateur), « Partager » (`CalendarShareDialog`), « Importer un contenu », exports désactivés pendant le chargement ou l'erreur (`contentsUnavailable`). |
| 5. Enveloppe « on repart à neuf » | 196-204 | `CalendarPage` : `CalendarWorkspaceGate` + clé de remontage par compte et espace (`useWorkspaceFilter`). |
| 6. État de la page | 206-256 | Hooks (`useAuth`, `useConfirm`, `useWorkspaceFilter`, `useWorkspaceId`, `useDemoContext`, `useIsMobile`, `useLocation`, `useNavigate`, `useSearchParams`) ; `currentDate` lu une seule fois depuis `?date=` (217-224) ; `postsRequest` + `mounted` (229-231, une réponse tardive est ignorée) ; ~25 états (vue, posts, filtres, fenêtre, idée, coaching, marronnier, import…) ; prénom et compte Instagram du profil (254-256). |
| 7. Lecture de l'URL | 258-290, 298-307, 419-434 | Effet `[searchParams]` : `?canal=` (seulement un canal `enabled` de `CANAL_FILTERS`), `?serie=`, `?prefill_theme=` / `?prefill_content=` (ouvre la fenêtre, puis retire les paramètres), `?coaching=1`, `?import=1` (+ `?date=`). Effet `[seriesFilter]` : recopie la série dans l'URL. Effet `?post=ID` : ouvre la fenêtre du post quand il est chargé, retire `post` et `date`. |
| 8. Objectif de rythme | 309-314 | Lit `communication_plans.instagram_posts_week` (pour `WeekDashboard`, 3 par défaut). |
| 9. Période affichée | 316-341, 436-447, 888-894 | `getWeekStart` (lundi), `weekStart`, `weekDays`, `periodRange` (partagé par le chargement et la recherche du plus proche), `calendarDays` (grille du mois, semaines commençant le lundi), navigation mois / semaine, `todayStr`, `weekLabel`, `monthName`. |
| 10. Chargement des posts | 343-387 | `fetchPosts` : mode démo → posts fabriqués depuis `demoData.calendar_posts` (id `demo-post-N`, canal `instagram`, le 1er « publié ») ; sinon `calendar_posts` filtré par `column` / `value`, `.is("workspace_id", null)` quand `column === "user_id"`, bornes de la période ; époque `postsRequest` ; erreur → `postsError`. |
| 11. Contenu le plus proche hors période | 389-417 | Seulement quand la période est vide (hors démo) : le prochain à venir, sinon le dernier passé ; `jumpToDate`. |
| 12. Filtres et rangement | 412-413, 449-483 | `filtersActive` ; `filteredPosts` (canal ; objectif lu dans `objectif` **ou** `category` ; `launch` ; `a_rediger` ; série `none` ou id) ; `seriesCounts` (avant filtre) ; `postsByDate` ; `weekPosts`. |
| 13. Ouvrir les fenêtres | 485-506 | `openImportDialog` (date et fichiers déposés), `openCreateDialog`, `handlePostClick` (`useCallback` à dépendances vides, voir le commentaire l. 500-501). |
| 14. Ce que la fenêtre d'un post renvoie | 508-600, 817-821 | `PostFormData` (l. 508), `buildPostPayload` ; `handleAutoSave` (silencieux : met à jour, ou insère **une** fois et renvoie le post créé) ; `handleSave` (toast « Générer » qui relance `handleQuickGenerate` sur le post créé) ; `handleDelete` (propose de supprimer les posts liés par `group_id`, import multi-réseaux) ; `handleUnplan`. |
| 15. Actions rapides de la vue Semaine | 602-665 | `handleQuickCreate` (idée, canal du filtre ou `instagram`), `handleQuickStatusChange`, `handleQuickDuplicate` (« (copie) », statut `idea`), `handleQuickDelete` (confirmation). |
| 16. Envoi vers /creer (navigate state) | 667-697 | `handleQuickGenerate` : URL = route de la mission 2 + `calendar_id`, `sujet`, `objectif`, `from=/calendrier`, `format=newsletter` si besoin ; state `fromCalendar`, `postId`, `calendarPostId`, `theme`, `objectif`, `angle`, `format`, `notes`, `postDate`, `existingContent`, `canal`. Sinon : ouvre la fenêtre du post. |
| 17. Déplacer un post | 699-720 | `handleMovePost` : mise à jour optimiste, `moveCalendarPost`, toast « Déplacé au … » avec « Annuler », erreur → `calendarSaveError` + rechargement. Aussi appelé par `onDateChange` de la fenêtre (1089-1093). |
| 18. Remettre en idée | 722-815 | `buildIdeaPayloadFromPost` (lit le dernier `generated_carousels` du post ; range slides, légende, hashtags, stories, visuels dans `content_data`, avec copies « compat racine ») ; `unplanPost` (met à jour l'idée liée par `calendar_post_id`, sinon en crée une ; puis supprime le post ; deux erreurs distinctes). |
| 19. Idées | 823-839 | `handleIdeaClick` (charge l'idée complète si besoin : `needsFullIdea` / `loadFullIdea`), `handleIdeaUpdated`, `handleIdeaPlannedFromSheet`. |
| 20. Glisser-déposer | 841-886 | `handleDragStart` (idée ou post) ; `handleDragEnd` : sur `"ideas-sidebar"` → `unplanPost` ; idée sur un jour → `planSavedIdea` (« déjà prévu » si rejoué) ; post sur un autre jour → `handleMovePost`. |
| 21. Affichage : calendrier | 896-991 | `calendarContent` : navigation de période, bascule Mois / Semaine, `CalendarFilterBar`, squelette, erreur (« Réessayer »), `CalendarGrid` ou `WeekDashboard` + `CalendarWeekGrid` (14 props d'actions rapides), `MarronnierBanner` (`order-last`, commentaire du bilan 24/08). |
| 22. Affichage : page et fenêtres | 993-1155 | `body` : `ExportSection`, onglets mobiles Calendrier / Mes idées, version ordinateur dans `CalendarDndWrapper` avec panneau d'idées repliable, `HubConnectBanner` (masqué en démo), `AuditRecommendationBanner`, puis 7 fenêtres (`CalendarPostDialog` dans un `LocalErrorBoundary`, `IdeaDetailSheet`, `SeasonalPhotoDialog`, `CalendarCoachingDialog`, `QuickBatchAdd`, `ImportContentDialog`). Branche non `embedded` (1145-1155 : `AppHeader`, `SubPageHeader` Instagram) **jamais rendue** aujourd'hui. |

**Découpage proposé** : un dossier `src/components/calendar/page/` pour l'affichage, des hooks dans `src/hooks/`, les fonctions pures dans `src/features/calendar/` (où vit déjà `post-dialog-helpers.ts`). `Calendar.tsx` garde l'export par défaut `CalendarPage`, l'enveloppe à clé, les états de fenêtres, l'appel des hooks dans le même ordre et la mise en page : cible ~400 lignes. Rien à toucher dans `OrganizationHub.tsx`.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/calendar/calendar-export.ts` | `makePostToRow`, `fileDate`, `autoWidth` + les corps de `exportCSV` / `exportXLSX` en `exportPostsCsv(posts, seriesNameById)` / `exportPostsXlsx(posts, canalFilter, seriesNameById)`. | Garder `import("xlsx")` **dynamique** (sinon xlsx entre dans le paquet de la page). Garder le BOM `﻿`, le `;`, le nom `calendrier-nowadays-<date>`, la coupe des noms de feuille à 31 caractères. Les toasts « Aucun contenu à exporter… » peuvent rester dans le composant. |
| `src/features/calendar/calendar-period.ts` | `getWeekStart`, construction de `calendarDays` en `buildMonthDays(year, month)`, `periodRange` en `periodRangeOf(...)`, `filteredPosts` en `filterCalendarPosts(posts, { canal, category, series })`, `postsByDate`, `seriesCounts`. | Fonctions pures. Les `useMemo` et leurs dépendances **restent dans la page** : `periodRange` doit garder une référence stable, sinon `fetchPosts` (qui en dépend) change à chaque rendu et recharge en boucle. Garder la liste exacte `["visibilite", "confiance", "vente", "credibilite"]` et la double lecture `objectif` / `category`. |
| `src/features/calendar/generator-route.ts` | `getGeneratorRoute`. | Fonction pure. Ne pas « compléter » la table pendant le déplacement (`story_serie`, `post_photo`… sont des choix). |
| `src/components/calendar/page/CalendarPageHeader.tsx` | `ExportSection` (104-194), exporté sous son nom actuel, renommage dans une PR à part. | Garde son état `shareOpen` et `CalendarShareDialog`. Le libellé « Partager » seul ne respecte pas la règle « verbe + objet » : **ne pas le changer ici**. |
| `src/components/calendar/page/CalendarPeriodNav.tsx` | Navigation de période + bascule Mois / Semaine (899-912). | Garder `aria-live="polite"`, `aria-pressed`, les `aria-label` (« Mois précédent »…) et le texte exact « Semaine » : `calendrier-periode-vide.spec.ts` clique sur le bouton « Semaine » par son nom (l. 43). |
| `src/components/calendar/page/CalendarIdeasPanel.tsx` | Panneau d'idées repliable (1035-1055). | Reçoit `ideasCollapsed`, `setIdeasCollapsed`, `fetchPosts`, `handleIdeaClick`, `ideasRefreshKey`. Le `id` de dépôt `"ideas-sidebar"` vit dans `CalendarIdeasSidebar` et est lu par `handleDragEnd` : ne pas le renommer. |
| `src/hooks/use-calendar-posts.ts` | `posts`, `postsLoading`, `postsError`, `postsRequest`, `mounted` (+ son effet), `fetchPosts` (avec la branche démo), son effet, `nearestOutsidePost` (+ son effet), `postsPerWeek` (mission 8). Rend aussi `setPosts` (les actions rapides font des mises à jour locales). | **Piège d'ordre** : l'effet `mounted` (l. 231) doit rester déclaré avant le premier `fetchPosts`. Garder les listes de dépendances telles quelles (`[user?.id, periodRange, isDemoMode, demoData, column, value]`). `fetchPosts` est passé en `onPostAdded` / `onSaved` / `onPlanned` à 5 fenêtres et à `CalendarIdeasSidebar` : il doit rester une référence `useCallback`. |
| `src/hooks/use-calendar-url-params.ts` | Les 3 effets de la mission 7. | Le plus délicat : les trois effets se relancent l'un l'autre par `navigate(..., { replace: true })`. Garder leur ordre relatif et leurs dépendances exactes (`[searchParams]`, `[seriesFilter]` avec son `eslint-disable`, `[posts, postsLoading, searchParams]`). `currentDate` lit `?date=` dans son `useState` initial : il reste dans la page. |
| `src/features/calendar/idea-from-post.ts` | Le corps « pur » de `buildIdeaPayloadFromPost` (722-781) : `ideaPayloadFromPost(post, carousel, userId, workspaceId)`. La lecture `generated_carousels` reste dans l'appelant. | Garder les copies « compat racine » (`contentData.slides`, `caption`, `hashtags`) : `IdeaDetailSheet` les lit (commentaire l. 747). Garder `status: "to_explore"` et `angle: post.angle \|\| ""` (chaîne vide, pas `null`). |
| `src/hooks/use-calendar-post-writes.ts` | `PostFormData`, `buildPostPayload`, `handleAutoSave`, `handleSave`, `handleDelete`, les 4 actions rapides, `handleMovePost`, `unplanPost`, `handleUnplan`. | Reçoit `user`, `workspaceId`, `column`, `value`, `selectedDate`, `editingPost`, `posts`, `setPosts`, `fetchPosts`, `setDialogOpen`, `setIdeasRefreshKey`, `confirm`, `canalFilter` **et** `handleQuickGenerate` (toast « Générer » de `handleSave`). `PostFormData` est le type des props `onSave` / `onAutoSave` de `CalendarPostDialog` : l'exporter. Garder la règle `workspace_id: workspaceId !== user.id ? workspaceId : undefined` (3 insertions) et, pour le duplicata, la règle différente `column !== "user_id" ? { [column]: value } : {}`. Ne pas les « harmoniser » dans ce lot. |
| `src/hooks/use-calendar-dnd.ts` | `activeDragItem`, `handleDragStart`, `handleDragEnd`. | Dépend de `unplanPost`, `handleMovePost`, `fetchPosts`, `setIdeasRefreshKey`. L'aperçu (`overlayContent`, 1021-1030) peut rester dans la page. |
| `src/hooks/use-calendar-to-creer.ts` | `handleQuickGenerate` (667-697), qui importe `getGeneratorRoute`. | **Piège de nom** : `src/hooks/use-calendar-quick-generate.ts` existe déjà (brouillon IA de la fenêtre d'un post, fiche 13). Ne pas réutiliser ce nom. **Piège test** : `calendar-creer-contract.test.ts` découpe `handleQuickGenerate` dans le texte de `Calendar.tsx` (voir plus bas). Garder le style `const handleQuickGenerate = `. Ajouter ce fichier à la ligne 93 de `impact-creation.mjs` (+ un cas dans `src/test/impact-creation.test.ts`) et à CARTE.md (l. 156). |
| `src/pages/Calendar.tsx` (reste) | `CalendarPage` + clé, `CalendarInWorkspace` : hooks, états des fenêtres, appel des nouveaux hooks dans l'ordre d'origine, `calendarContent`, `body`, `EMPTY_SERIES_MAP`. | `handlePostClick` reste un `useCallback` à dépendances vides et `seriesNameById` garde `EMPTY_SERIES_MAP` : c'est ce qui laisse agir le `memo` de `CalendarContentCard`. |

À ne **pas** corriger pendant le découpage (noté pour une PR à part, avec un cas de test qui change exprès) :
- **`?coaching=1` n'est jamais retiré de l'URL** (l. 278-280) et l'effet se relance à chaque changement de `searchParams`. Arrivée depuis /creer (`CreerStepIdea.tsx` l. 174), fermeture du coaching, puis choix d'une série : l'effet de la l. 299 réécrit l'URL et le coaching **se rouvre**. Même mécanisme pour `?canal=` (jamais retiré) : arrivée par `/calendrier?canal=linkedin` depuis un hub, choix d'un autre canal, puis d'une série → le filtre canal revient à LinkedIn. À vérifier en rendu (test 1).
- `handleQuickGenerate`, branche « pas de route » (l. 694-695) : ouvre la fenêtre **sans** `setSelectedDate(post.date)`, contrairement à `handlePostClick` et `onQuickAttachSeries`. La fenêtre reçoit alors la date d'un autre post, ou `null` ; avec `null`, `handleAutoSave` et `handleSave` sortent tout de suite (l. 521, 539) : l'auto-save échoue sans raison visible. Cas : un post sans format.
- La recherche du plus proche (l. 400) n'ajoute pas `.is("workspace_id", null)` quand `column === "user_id"`, alors que `fetchPosts` le fait (l. 375) : elle peut désigner une date où rien ne s'affiche.
- Mode démo : `fetchPosts` est le seul à être protégé. `handleQuickStatusChange`, `handleQuickDelete`, `handleDelete`, `handleMovePost` ne vérifient ni `isDemoMode` ni `user` et appellent Supabase avec un id `demo-post-N` (CLAUDE.md : « pas d'appel Supabase » en démo). La lecture `communication_plans` (l. 312) n'est pas non plus protégée. À vérifier selon ce que vaut `user` en démo.
- `handleQuickCreate` (l. 613) n'affiche rien en cas d'erreur (les autres actions rapides affichent un toast).
- Clés du state envoyées par `handleQuickGenerate` mais lues nulle part dans /creer (grep `locState` dans `CreerUnifie.tsx`, `use-creer-entry-init.ts`, `calendar-entry-context.ts`) : `postId`, `canal`. CARTE.md (l. 156-158) les cite pourtant comme « départ ». Les garder : les retirer est une décision.
- Code mort : `BrandingPrompt` (l. 14) importé sans usage ; la branche non `embedded` (1145-1155) et donc `isInstagramRoute`, `AppHeader`, `SubPageHeader`. Les variables CSS `--primary` / `--ring` sont posées deux fois (l. 994 et `OrganizationHub.tsx` l. 35).
- Libellés hors règle « verbe + objet » : « Générer » seul (toast, l. 566), « Partager » seul (l. 173).

**Tests qui le protègent aujourd'hui**

- `src/test/calendar-creer-contract.test.ts` : **lit le texte** de `Calendar.tsx` (l. 24), découpe `handleQuickGenerate` de `const handleQuickGenerate = ` jusqu'au prochain `const handle… = ` (aujourd'hui `handleMovePost`) et y cherche les clés `fromCalendar`, `calendarPostId`, `existingContent`, `format`, `objectif`, `angle`, `postDate`, les `params.set("sujet" | "objectif" | "from" | "calendar_id"` et `navigate(`.
- `src/test/creer-entrees-calendrier-brief.test.tsx` (l. 73) : côté /creer seulement. Il **recopie à la main** le state de `handleQuickGenerate` ; il ne verrait pas une clé changée ici.
- Indirectement : `calendar-workspace-gate.test.tsx` (`CalendarWorkspaceGate`), `r3-calendar-persistence.test.ts` (`planSavedIdea`, `moveCalendarPost`), `calendar-ideas-ux.test.tsx` et `ideas-load-recovery.test.tsx` (panneau d'idées).
- Playwright (`e2e-visite/calendrier-fold.spec.ts`, `calendrier-periode-vide.spec.ts` (5 cas), `calendrier-drag-out.spec.ts`) : rendent la vraie page sur un vrai compte, mais **ne tournent pas en CI** (« Pièges communs », point 4).

**Aucun test vitest ne rend `CalendarPage`** (grep `pages/Calendar`, `OrganizationHub`, `CalendarInWorkspace` dans `src/test` : seul le test de contrat, qui lit le texte). Lecture de l'URL, chargement, filtres, écritures dans `calendar_posts`, remise en idée, glisser-déposer et exports ne sont figés nulle part.

**Tests à ajouter AVANT de découper**

1. `src/test/calendar-page.test.tsx`, rendu réel de `CalendarPage` dans un `MemoryRouter` (on simule `AuthContext`, `use-workspace-query`, `DemoContext`, `use-profile`, `use-active-series`, `use-mobile`, `confirm-dialog`, un client `supabase` à chaîne enregistreuse, `idea-calendar-persistence`, `saved-idea-summaries` ; `CalendarWorkspaceGate` laisse passer ; grilles, fenêtres, panneau d'idées et `CalendarDndWrapper` remplacés par des faux qui exposent leurs props ; espion sur `navigate`). **URL** : `?date=` (et date invalide), `?canal=` (canal actif / inactif), `?serie=`, `?prefill_theme=` (fenêtre ouverte, paramètres retirés en `replace`), `?coaching=1`, `?import=1&date=`, `?post=ID` (ouvre quand chargé, retire `post` et `date`) ; figer aussi le comportement actuel de `coaching` et `canal` après un changement de série (constat ci-dessus).
2. **Chargement** : requête exacte (`eq(column, value)`, `.is("workspace_id", null)` seulement en `user_id`, bornes mois et semaine) ; réponse tardive ignorée après changement de mois ; erreur → « Impossible de charger ce calendrier. » puis « Réessayer » ; démo → posts de Léa, **aucun** appel `calendar_posts`. Plus proche : période vide → futur puis passé ; rien quand la période a des posts ou en démo.
3. **Filtres** : canal ; objectif lu dans `objectif` et dans `category` ; `launch` ; `a_rediger` ; série `none` / id ; compteurs de série avant filtre.
4. **Écritures de la fenêtre** (via les props du faux `CalendarPostDialog`) : `onAutoSave` (mise à jour ; insertion avec `workspace_id` absent dans son propre espace ; post renvoyé) ; `onSave` (toast et action « Générer ») ; `onDelete` avec posts liés (`group_id`) : « Tout supprimer » / « Ce post seulement » ; `onUnplan` ; `onDateChange`. Corps envoyés figés en `toMatchSnapshot()`.
5. **Actions rapides** (props du faux `CalendarWeekGrid`) : corps de `onQuickCreate`, `onQuickDuplicate`, `onQuickStatusChange`, `onQuickDelete` (confirmation refusée → rien).
6. **Envoi vers /creer** : `onQuickGenerate` pour chaque format (stories via `stories_count`, reel, carrousel, `post_carrousel`, LinkedIn, newsletter + `format=newsletter`, post, `generated_content_type`, aucun) → URL et state **exacts** (`toEqual`) ; sans route → fenêtre ouverte (figer la date reçue, constat ci-dessus).
7. **Déplacer** : mise à jour optimiste, `moveCalendarPost` appelé, « Annuler » rappelle `moveCalendarPost` à l'envers, échec → rechargement.
8. **Remettre en idée** : `content_data` construit depuis un carrousel lié (+ stories, visuels) ; idée liée mise à jour (`calendar_post_id: null`) ou créée ; échec de suppression du post.
9. **Glisser-déposer** (props du faux `CalendarDndWrapper`) : idée → jour (`planSavedIdea`, toast « déjà prévu » si rejoué) ; post → autre jour ; post → même jour (rien) ; post → `"ideas-sidebar"` (remise en idée).
10. **Exports** : CSV (BOM, `;`, guillemets doublés, brouillon coupé à 200, série et épisode) et Excel (une feuille par canal, `xlsx` simulé) ; liste vide → toast, aucun fichier.
11. Rendre `calendar-creer-contract.test.ts` vérifiable sur **plusieurs fichiers** côté calendrier (une liste `FICHIERS_CALENDRIER`, comme `FICHIERS_DIALOG`), pour que le dernier lot n'ait qu'un chemin à ajouter.

**Risque et ordre conseillé**

Niveau : **moyen**. Pas d'IA ni de quota ici, et la fenêtre d'un post (le plus gros morceau) est déjà sortie. Mais : (1) aucun test de rendu, alors que chaque handler **écrit** dans `calendar_posts` ou `saved_ideas` (une suppression ou une remise en idée ratée perd un contenu) ; (2) les trois effets d'URL se relancent l'un l'autre, et un ordre changé ne casse rien de visible en CI ; (3) un test lit le texte du fichier (« Pièges communs », point 3). Historique : 14 commits depuis le 17/07/2026, surtout sur les idées et le glisser-déposer (#1305, #1024, #925, #924, `19d9f77f9`, `62fb6f9d5`), la période vide (#658, #661), l'espace de travail (#1047) et l'affichage au doigt (#914, #754).

Une PR par lot (pas de session Lovable ouverte sur /calendrier pendant ces PR) :
1. **Lot T** : tests 1 à 10 + test 11. Aucun code touché. Vérifiés contre des pannes volontaires (ex. `.is("workspace_id", null)` retiré, `postDate` retiré du state, `group_id` ignoré).
2. **Lot 1** : `calendar-export.ts`, `calendar-period.ts`, `generator-route.ts` (fonctions pures). Risque très faible.
3. **Lot 2** : `CalendarPageHeader.tsx`, `CalendarPeriodNav.tsx`, `CalendarIdeasPanel.tsx` (JSX à l'identique, valeurs en props).
4. **Lot 3** : `use-calendar-posts.ts` (chargement, démo, plus proche, objectif de rythme).
5. **Lot 4** : `idea-from-post.ts` + `use-calendar-post-writes.ts` + `use-calendar-dnd.ts`. La page devrait passer sous 800 lignes ici (sortie de la référence du cliquet).
6. **Lot 5** : `use-calendar-url-params.ts` (test 1 obligatoire, ordre des effets gardé).
7. **Lot 6 (en dernier)** : `use-calendar-to-creer.ts` + `calendar-creer-contract.test.ts` repointé + `impact-creation.mjs` / `impact-creation.test.ts` + CARTE.md (l. 156). Pas en même temps qu'une PR qui touche l'arrivée dans /creer (`use-creer-entry-init.ts`) : même contrat.
8. Après le découpage, une PR par constat de la liste ci-dessus.

Vérifications à chaque lot :
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/calendar-page.test.tsx src/test/calendar-creer-contract.test.ts src/test/creer-entrees-calendrier-brief.test.tsx src/test/calendar-workspace-gate.test.tsx src/test/r3-calendar-persistence.test.ts`, puis `npm test` ;
- `npm run knip` (chaque nouveau fichier importé dans la même PR) ;
- `node scripts/cliquet-dette.mjs` (le fichier doit maigrir, jamais grossir ; aucun nouveau fichier au-delà de 800 lignes) ; après la fusion, `node scripts/cliquet-dette.mjs --update` (référence actuelle : 1 156 lignes, 57 `any`) ;
- dans le cloud, l'installation des dépendances échoue : la CI de la PR sert de vérification ;
- mettre à jour ce document (et CARTE.md pour le lot 6) dans la même PR.

### 21. `src/pages/InstagramStats.tsx` — 1 412 lignes

**En une phrase :** c'est la page « Mes statistiques » (/instagram/stats) : elle charge la configuration et les relevés mensuels de l'espace (en rattachant au passage les anciennes lignes d'avant les espaces), calcule les courbes, fait remplir les chiffres par Instagram, LinkedIn et Google Analytics, enregistre la saisie à la main, lance deux analyses par l'IA, propose de recycler un top post vers /creer, et affiche le tout en 4 onglets plus un parcours de configuration en 3 étapes.

> Lignes vérifiées sur le fichier au 16/10/2026 (dernier commit : `973525ccb`, #1029, 16/09/2026). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou de commentaire) est la référence fiable.

Repères de structure :
- Un seul importeur : `src/App.tsx` (l. 61, `lazy(() => import("./pages/InstagramStats"))`, export par défaut ; route `/instagram/stats` l. 293 dans un `ProtectedRoute`). Le chemin `/instagram/stats` est aussi cité par `AppSidebar.tsx`, `AppHeader.tsx`, `InstagramHub.tsx`, `ChatGuidePage.tsx`, `src/lib/routine-generator.ts` et `src/lib/retour-apres-detour.ts` : **ne pas changer la route**.
- Le fichier contient **deux composants** : `InstagramStats` (l. 57-62), une enveloppe qui attend `useWorkspaceReady()` et un `user`, puis remonte tout à neuf par la clé `` `${user.id}:${workspaceId}` `` (changement de compte ou d'espace = état remis à zéro), et `InstagramStatsScope` (l. 63-1412), qui fait tout le reste.
- Il a déjà été allégé : `src/components/stats/` contient `StatsForm.tsx` (306 lignes, saisie), `StatsCharts.tsx` (292, graphiques et comparaison), `ExcelImportDialog.tsx` (662), `StatsOverview.tsx` (80), `StatsReading.tsx` (61), `StatsPeriodSelector.tsx` (56), `Ga4SyncPanel.tsx` (36), `stats-types.ts` (156) ; plus `src/lib/stats-helpers.ts`, `stats-reading.ts`, `stats-persistence.ts` (`saveStatsPatch`, RPC `save_monthly_stats`), `ga4-stats.ts` et `src/hooks/use-ga4-stats.ts`. Ce qui reste : ~40 `useState`, 2 `useRef`, 9 fonctions qui écrivent en base ou appellent le serveur, 4 fonctions d'affichage (`render…`), le parcours de configuration et tout le JSX des onglets.
- Référence du cliquet : 1 412 lignes, 93 `any` (`scripts/cliquet-dette.baseline.json`, l. 84-87). C'est l'un des fichiers les plus chargés en `any` : presque toutes les requêtes passent par `supabase.from("monthly_stats" as any) as any`.
- `scripts/impact-creation.mjs` ne cite pas ce fichier (grep vide) : il n'est pas classé comme générateur. Classement : 23ᵉ (11 commits, 6 corrections, score 47).

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Socle | 1-55 | Imports (dont 5 fonctions importées mais jamais utilisées : `MONTHS_FR`, `fmtPct`, `fmtEur`, `safeDivPct`, `safeDiv`, l. 34-35) ; `BUSINESS_ICONS` (icônes lucide des modèles business, 49-55). |
| 2. Enveloppe « on repart à neuf » | 57-62 | `InstagramStats` : attend l'espace, puis clé de remontage par compte et espace ; `SkeletonCard` en attendant. |
| 3. État de la page | 63-139 | `mounted` (garde anti-mise à jour après démontage, 64-65) ; hooks (`useAuth`, `useNavigate`, `useWorkspaceFilter`, `useWorkspaceId`, `useIsOwnSpace`, `useWorkspaceReady`, `useSocialConnections`) ; `now`, `currentMonthDate`, `countryNames` (73-76) ; ~40 états : onglet, chargement, relevés, mois choisi, formulaire, `manualFields` (champs GA4 retouchés à la main, l. 87), analyses, comparaison, connexions IG / GA4 / LinkedIn, instantanés (audience, top/flop, LinkedIn, « ce qui marche »), période, configuration, parcours de configuration, `draftConfig` par défaut (132-139). |
| 4. Chargement + rattachement des anciennes lignes | 141-225 | `loadConfig` (145-184) : lit `stats_config` de l'espace ; si rien et espace propre, rattache la config la plus récente sans `workspace_id` (`update({ workspace_id: value })`). `loadStats` (186-223) : rattache les `monthly_stats` sans `workspace_id` dont le mois n'existe pas déjà dans l'espace, puis lit tous les relevés et pré-remplit la comparaison (`compareA` / `compareB`). Effet de lancement l. 225. |
| 5. Formulaire du mois choisi | 227-233 | Effet sur `[selectedMonth, allStats]` : vide `manualFields`, remplit `formData`, `formId`, `aiAnalysis`, efface `analysisMonthPosts`. |
| 6. Instantanés persistés | 235-259 | Effet sur `[allStats]` (avec `eslint-disable`) : remet à l'écran le dernier `custom_data.ig_audience`, `ig_top_posts`, `li_stats`, `ig_content_insights`, **seulement si** l'état est encore vide. |
| 7. Valeurs calculées | 261-352 | `periodRange`, `periodStats`, `isSingleMonth`, `dashboardKPIs` (`instagramKPIs`), `activeConfig` (config ou brouillon) ; `chartData` (278-343) : abonnés reconstitués à rebours pour les mois sans relevé (`followersIsEst`), pertes estimées (`lostEstimated`), portée organique, sources de trafic ; `monthOptions` (24 derniers mois). |
| 8. Saisie à la main | 354-398 | `handleChange` (marque les champs `GA4_FIELDS` comme manuels) ; `handleSave` : `statsPatch` + champs manuels → `saveStatsPatch(…, 'manual')` (RPC avec la ligne attendue) ; élargit la période si le mois enregistré en sort (377-391). |
| 9. Remplir depuis Instagram | 400-493 | `fetchFromInstagram` : `supabase.functions.invoke("instagram-insights-fetch")`, message « Reconnecte… », 8 colonnes remplies (`followers`, `reach`, `views`, `interactions`, `accounts_engaged`, `profile_visits`, `followers_gained`, `posts_count`), `custom_data.ig_audience` + `ig_top_posts`, écriture directe `update` / `insert` dans `monthly_stats` du mois en cours, toast `partial`. |
| 10. Remplir depuis LinkedIn | 495-552 | `fetchFromLinkedIn` : `linkedin-insights-fetch`, instantané rangé dans `custom_data.li_stats` (pas de colonnes LinkedIn), même écriture directe. |
| 11. Historique Instagram (12 mois) | 554-608 | `backfillHistory` : 12 appels `instagram-insights-fetch` avec `month` ; saute un mois si `reach` **et** `posts_count` sont remplis ; `setIfEmpty` (jamais d'écrasement) ; compteur `filled` / `skipped` / `empty`. |
| 12. Propriété Google Analytics | 610-647 | `loadGa4Properties` (`ga4-list-properties`), `saveGa4Property` (`ga4-select-property`, puis `refreshConnections`). Délais 30 s. |
| 13. « Ce qui marche pour toi » | 649-695 | `analyzeContent` : `instagram-insights-fetch` `analysis: true` (90 s), puis lecture de coach `engagement-insight` `mode: "content_reading"` (60 s, non bloquante), rangé dans `custom_data.ig_content_insights` du mois en cours. |
| 14. Analyse IA du mois | 697-745 | `handleAnalyze` : contenus du mois si Instagram connecté (`posts: true`, 60 s, non bloquant), historique = mois **strictement antérieurs** (6 max), `engagement-insight` `mode: "monthly_stats"` (60 s), `ai_analysis` + `ai_analyzed_at` écrits seulement si `formId`. |
| 15. Configuration | 747-771 | `saveConfig` (`stats_config` : `update` si `config?.id`, sinon `insert`) ; `handleConfigClick(step)` (ouvre le parcours et met `config` à `null`). |
| 16. Fonctions d'affichage | 773-898 | `renderAudienceGroup` (barres en %, pays ISO → nom), `recycleTopPost` (navigate state vers /creer, 804-827), `renderBucketGroup` (segments triés par engagement), `renderPostGroup` (3 posts max, icône de format, lien, bouton « Recycler »). |
| 17. Chargement / erreur | 900-901 | « Chargement des statistiques… » ; message d'erreur + « Réessayer » (relance `loadConfig` et `loadStats`). |
| 18. Parcours de configuration | 903-1048 | 3 étapes : site web (plateforme, GA4 oui/non, sources de trafic), pages de vente (ajout / suppression), modèle business (`BUSINESS_PRESETS`). Le dernier bouton appelle `saveConfig`, ferme et affiche « Configuration enregistrée ». |
| 19. En-tête + onglets | 1050-1076 | Titre « Mes statistiques », bouton « Configurer », 4 onglets : `overview` (« Mon bilan »), `input` (« Mes données »), `ai` (« Mon analyse »), `sources` (« Mes sources »). |
| 20. Onglet « Mon bilan » | 1078-1207 | `StatsPeriodSelector`, `StatsReading` (lien vers l'onglet données), volet « Tous les graphiques » (`StatsOverview`, `StatsCharts`, 1089-1093), volet « Derniers relevés » (1094-1206) : stats LinkedIn (1097-1122), audience (1126-1141), top / flop (1143-1160, le flop qui recoupe le top est masqué), « Ce qui marche pour toi » (1162-1204). |
| 21. Onglet « Mes sources » | 1209-1333 | Instagram (connexion inconnue → « Réessayer » ; connecté → « Remplir » et « 12 mois d'historique » ; sinon lien `/parametres/connexions` avec `memoriseRetour`) ; GA4 (choix de propriété, `Ga4SyncPanel` avec `blocked` calculé l. 1297, ou invitation) ; LinkedIn Stats (bouton ou invitation). |
| 22. Onglet « Mes données » | 1334-1347 | `StatsForm` dans un `fieldset disabled={ga4Busy}`. |
| 23. Onglet « Mon analyse » | 1349-1406 | Choix du mois, bouton d'analyse, texte de l'IA (`AiGeneratedMention`), « Créer un contenu qui applique cette reco » (navigate state vers /creer, 1385-1389), contenus du mois analysé (`renderPostGroup`). |
| 24. Import Excel | 1409 | `ExcelImportDialog` dans un `LocalErrorBoundary`, `onImportComplete={loadStats}`. |

**Découpage proposé** : la page garde l'enveloppe à clé, les états partagés, les effets 5 et 6, les valeurs calculées, `handleSave`, `handleAnalyze`, `saveConfig` et la mise en page des onglets : cible ~450 lignes. Les fonctions pures vont dans un nouveau dossier `src/features/stats/`, l'affichage dans `src/components/stats/` (déjà là), les appels dans des hooks de `src/hooks/`. L'export par défaut et la route ne changent pas : rien à toucher dans `App.tsx`.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/stats/stats-chart-data.ts` | Le corps de `chartData` (281-342) en `buildChartData(periodStats, from, to, trafficSources)` ; `buildMonthOptions(now)` (346-351) ; le choix de période après enregistrement (378-389) en `presetForSavedMonth(selectedMonth, now, currentPreset)` (rend le nouveau préréglage ou `null`). | Fonctions pures. Garder `null` pour « non renseigné » (jamais `0`) : c'est voulu (commentaire l. 278-279), Recharts saute le point. Les clés `traffic_<source>`, `followersIsEst`, `lostEstimated` sont lues par `StatsCharts.tsx` : ne pas les renommer. Le défaut `["search", "social", "pinterest", "instagram"]` est écrit deux fois (l. 134 et 333) : garder les deux tels quels. |
| `src/features/stats/instagram-patch.ts` | Construction du patch du mois en cours (429-458) en `instagramMonthPatch(m, existing)` → `{ patch, filled }` ; patch d'un mois d'historique (575-585) en `backfillMonthPatch(m, existing)` ; contenu du state de recyclage (808-825) en `recycleState(p)`. | Fonctions pures. Les 8 colonnes, les libellés de `filled` (affichés dans le toast) et la règle `followerGrowth30d >= 0` restent identiques. **Navigate state** : `recycleState` rend `{ sujet, existingContent, fromRecycle: true }`. /creer lit `sujet` (`use-creer-entry-init.ts` l. 51), `existingContent` (l. 58, via `buildCalendarExistingContent`) et `fromRecycle` (`src/features/creer/draft-conflict.ts` l. 38 et 53). Ne renommer aucune clé. |
| `src/components/stats/StatsOnboarding.tsx` | Le parcours de configuration (905-1046). | Reçoit `draftConfig`, `setDraftConfig`, `onboardingStep`, `setOnboardingStep`, `onFinish` (le contenu actuel du dernier bouton, l. 1031-1035, reste dans la page). Emporte `BUSINESS_ICONS`. Garder les `aria-label` (« Précise la plateforme », « Nom de la page de vente N », « URL de la page de vente N », « Supprimer cette page de vente »). |
| `src/components/stats/StatsPostGroup.tsx` | `renderPostGroup` (855-898) en composant `<StatsPostGroup title posts withRecycle onRecycle />`, et `renderBucketGroup` (833-853), `renderAudienceGroup` (775-802) en composants voisins (même fichier ou `StatsAudienceGroup.tsx`). | `renderPostGroup` sert **deux** onglets (1149-1154 et 1397-1401) : un seul composant, importé deux fois. `countryNames` (`Intl.DisplayNames`, l. 76) passe dans le composant d'audience (ou y est recréé avec `useMemo`). Le bouton « Recycler » appelle `onRecycle(p)` → la page fait `navigate("/creer", { state: recycleState(p) })`. |
| `src/components/stats/StatsSnapshotsPanel.tsx` | Le volet « Derniers relevés, audience et contenus » (1094-1206). | Reçoit `liStats`, `audience`, `livePosts`, `contentInsights`, `igConnected`, `analyzingContent`, `fetchingLive`, `onAnalyzeContent`, `onRecycle`. Le filtre du flop qui recoupe le top (l. 1153) suit tel quel. |
| `src/components/stats/StatsSourcesTab.tsx` | Le contenu de l'onglet `sources` (1210-1331). | Beaucoup de props (≈25 : états des 3 connexions, boutons, propriétés GA4, `Ga4SyncPanel` et son `blocked`). Ne pas les regrouper dans ce lot. Le calcul `blocked` (l. 1297) lit `manualFields.current.size` : il doit rester calculé **dans la page** et passer en valeur (une ref lue dans un enfant ne se relit qu'au rendu de l'enfant). Garder `memoriseRetour()` sur les 3 liens de connexion. |
| `src/components/stats/StatsAnalysisTab.tsx` | Le contenu de l'onglet `ai` (1350-1405). | Reçoit `selectedMonth`, `setSelectedMonth`, `monthOptions`, `allStats.length`, `isGenerating`, `aiAnalysis`, `aiAnalyzedAt`, `analysisMonthPosts`, `onAnalyze`, `onCreateFromReco`. Le navigate state de « Créer un contenu qui applique cette reco » (`{ sujet: … }`, l. 1385-1389) reste dans la page (passé en `onCreateFromReco`), texte du sujet à l'identique. |
| `src/hooks/use-ga4-property-picker.ts` | `ga4Properties`, `ga4PropLoading`, `ga4SelectedProp`, `ga4SavingProp` (105-108), `loadGa4Properties`, `saveGa4Property` (610-647). | Reçoit `user`, `workspaceId`, `refreshConnections`. Garder `invokeWithTimeout` et les délais de 30 s (étiquetage Sentry). |
| `src/hooks/use-stats-data.ts` | `mounted`, `config`, `configLoaded`, `configError`, `allStats`, `statsLoaded`, `statsError`, `loadConfig`, `loadStats` et l'effet de lancement (145-225). | **Le lot le plus délicat pour les données** : le rattachement des anciennes lignes (`update({ workspace_id: value })`) écrit en base, seulement quand `column === "workspace_id" && isOwnSpace`. Garder les listes de dépendances (`[user?.id, column, value, isOwnSpace, workspaceReady]`) et chaque `if (!mounted.current) return;` à sa place. `loadStats` pose aussi `compareA` / `compareB` (219-220) : rendre ces deux setters en paramètre ou renvoyer les lignes et laisser la page choisir, **sans changer le moment** où ils sont posés. `loadConfig` pose `setDraftConfig` et `setShowOnboarding` : mêmes précautions. |
| `src/hooks/use-stats-live-fetch.ts` | `fetchingLive`, `fetchingLiStats`, `backfilling`, `analyzingContent`, `fetchFromInstagram`, `fetchFromLinkedIn`, `backfillHistory`, `analyzeContent` (400-608, 649-695). | **Piège test (le plus fort)** : `src/test/ga4-other-source-preservation.test.ts` relit le **texte** de la page (`STATS_SOURCE`, défaut `src/pages/InstagramStats.tsx`), extrait `fetchFromLinkedIn` par son nom (premier argument de son `useCallback`) et l'exécute en injectant **par leur nom** : `user`, `workspaceId`, `currentMonthDate`, `allStats`, `setFetchingLiStats`, `invokeWithTimeout`, `toast`, `setLiStats`, `supabase`, `loadStats`. Garder `const fetchFromLinkedIn = useCallback(async () => {…}, […])` et ces noms exacts, et changer le chemin lu par le test **dans la même PR**. `setAudience`, `setLivePosts`, `setLiStats`, `setContentInsights`, `setSelectedMonth` restent des états de la page (l'effet 6 et l'affichage les lisent) : ils passent en paramètres. |
| `src/pages/InstagramStats.tsx` (reste) | Enveloppe à clé, états partagés, effets 5 et 6, valeurs calculées (appel des fonctions pures), `handleChange`, `handleSave`, `handleAnalyze`, `saveConfig`, `handleConfigClick`, `recycleTopPost` réduit à un `navigate`, chargement / erreur, mise en page des 4 onglets, import Excel. | L'enveloppe et sa clé restent ici (isolement entre comptes et espaces, voir `1724d8ed8`). `useWorkspaceFilter` reste la source de `column` / `value` (passés au hook de données). |

À ne **pas** corriger pendant le découpage (noté pour une PR à part, avec un cas de test qui change exprès) :
- **Configuration en double** : `handleConfigClick` met `config` à `null` (l. 770), puis `saveConfig` teste `config?.id` (l. 757) qui vaut donc toujours `null` → chaque « Configurer » terminé **insère** une nouvelle ligne `stats_config` au lieu de mettre à jour (`draftConfig.id` existe, mais `delete payload.id`, l. 756). `loadConfig` prend la plus récente, donc rien ne se voit, mais les lignes s'accumulent.
- **Faux succès de la configuration** : si `saveConfig` échoue, il affiche « Erreur de sauvegarde » et rend sans erreur ; le bouton (1031-1035) ferme quand même et affiche « Configuration enregistrée ». Et le parcours n'a pas de bouton pour sortir sans enregistrer (`config` est déjà à `null`).
- **« Les contenus du mois » coupés à 3** : l. 1399 passe `analysisMonthPosts.slice(0, 5)`, mais `renderPostGroup` refait `slice(0, 3)` (l. 867). Seuls 3 contenus s'affichent.
- **Écrasement des chiffres saisis à la main** : `fetchFromInstagram` remplace les 8 colonnes sans regarder si elles ont été saisies (contrairement à `backfillHistory`, `setIfEmpty`), et les 4 écritures directes (`fetchFromInstagram`, `fetchFromLinkedIn`, `backfillHistory`, `analyzeContent`) contournent la RPC `save_monthly_stats` (pas de ligne attendue, pas de `metric_provenance`), alors que la saisie manuelle et GA4 y passent. Le test `ga4-other-source-preservation` ne couvre que LinkedIn.
- **`user_id` différent** : `analyzeContent` écrit `user_id: user.id` (l. 676), les trois autres écritures gardent `existing.user_id || user.id`.
- **Analyse perdue** : `handleAnalyze` n'enregistre l'analyse que si le mois a déjà une ligne (`formId`, l. 735) ; sinon elle disparaît au rechargement, sans message. Elle analyse aussi `formData` (la saisie en cours, même non enregistrée, l. 726).
- **Appels sans délai** : `fetchFromInstagram` (l. 407), `fetchFromLinkedIn` (l. 504) et `backfillHistory` (l. 570) appellent `supabase.functions.invoke` directement, sans `invokeWithTimeout` (règle 7 de CLAUDE.md : pas de délai, pas d'étiquetage Sentry). Attention : changer `fetchFromLinkedIn` touche le test AST (il injecte déjà `invokeWithTimeout`).
- `saveGa4Property` appelle `refreshConnections` sans l'avoir dans ses dépendances (l. 647).
- Commentaires faux : l. 805 cite `RecycleDialog`, qui n'existe plus dans `src/` (grep) ; l. 829-830 décrivent `renderPostGroup` mais sont posés au-dessus de `renderBucketGroup`.
- 5 imports inutilisés (mission 1).
- Libellés hors règle « verbe + objet » de CLAUDE.md : « Réessayer » (l. 901 et 1218), « Actualiser » (l. 1176), « Relancer » (l. 1372), « Oui » / « Non », « Retour », « Suivant ».

Fait le 16/10/2026 (branches empilées `claude/zen-brown-1owrp8-stats-1` à `-6`, tests dans `src/test/stats-page-fixes.test.ts`) : configuration mise à jour au lieu d'être dupliquée (`saveConfig` reprend `cfg.id`) et plus de faux succès (le parcours reste ouvert si l'enregistrement échoue) ; « Les contenus du mois » affiche 5 contenus (`renderPostGroup` prend un `max`, 3 par défaut) ; analyse d'un mois sans ligne : avertissement « enregistre d'abord les chiffres… » (pas d'écriture créée, pour ne pas faire apparaître un mois vide) ; `fetchFromInstagram`, `fetchFromLinkedIn`, `backfillHistory` passent par `invokeWithTimeout` (60 s) ; `analyzeContent` garde `existing.user_id || user.id` ; commentaires `RecycleDialog` / `renderPostGroup` corrigés et 5 imports inutilisés retirés (1 409 lignes, référence du cliquet baissée). Restent volontairement : l'écrasement des chiffres saisis par `fetchFromInstagram` et le contournement de `save_monthly_stats` (décision produit), `refreshConnections` hors dépendances de `saveGa4Property`, les libellés, le parcours sans bouton de sortie.

**Tests qui le protègent aujourd'hui**

- `src/test/ga4-other-source-preservation.test.ts` : lecture du texte ; exécute `fetchFromLinkedIn` sur une ligne déjà modifiée par GA4 et vérifie que `ga4_users`, sa provenance, `reach` et `custom_data.ig` sont gardés. C'est le **seul** test qui exécute du code de la page.
- `src/test/app-navigation.test.tsx` (l. 66) : monte `/instagram/stats` mais vérifie seulement le lien actif du menu (« Mes statistiques »).
- Indirectement, les morceaux déjà sortis : `src/test/ga4-stats.test.tsx` (`Ga4SyncPanel`, `useGa4Stats`, `planGa4Update`), `src/test/stats-reading.test.tsx` (`StatsReading`, `instagramKPIs`, `monthsInRange`), `src/test/stats-helpers.test.ts` (`monthKey`, `monthLabel`, `fmt`…).
- Playwright : rien (grep de `instagram/stats` dans `e2e/` et `e2e-visite/` vide). Et ils ne tournent pas en CI.

**Aucun test ne rend `InstagramStats` à l'écran.** Le rattachement des anciennes lignes, la reconstitution des abonnés et des pertes dans `chartData`, le remplissage Instagram, l'historique, « ce qui marche pour toi », l'analyse IA, la configuration, la remise à zéro par la clé et les deux navigate states vers /creer ne sont figés nulle part.

**Tests à poser d'abord** (lot T, aucun code de la page touché)

1. `src/test/stats-page.test.tsx`, rendu réel (on simule `AuthContext`, `use-workspace-query`, `use-social-connections`, le client `supabase` avec une table en mémoire pour `monthly_stats` et `stats_config`, `invokeWithTimeout`, `stats-persistence`, et on espionne `navigate`). **Chargement** : espace propre avec une config et 3 relevés sans `workspace_id` dont un mois déjà présent dans l'espace → `update({ workspace_id })` sur les 2 autres seulement, config rattachée ; espace d'une autre personne (`isOwnSpace` faux) → **aucune** écriture ; erreur de lecture → message d'alerte et « Réessayer » relance les deux lectures.
2. **Remise à zéro par la clé** : passer de l'espace A à B vide l'audience, le top / flop, les stats LinkedIn et l'analyse (aucune fuite d'un espace à l'autre).
3. **`chartData`** (snapshot `toMatchSnapshot()` des données passées à `StatsCharts`, remplacé par un faux qui expose ses props) : mois sans relevé au milieu (→ `null`, pas `0`) ; abonnés reconstitués (`followersIsEst`) ; pertes saisies, pertes estimées (`lostEstimated`) ; `reach_paid` → portée organique ; trafic depuis `website_data.sources` et depuis les colonnes `traffic_*`.
4. **Remplir depuis Instagram** : corps envoyé, patch exact écrit (`update` si la ligne existe, `insert` sinon), `custom_data` gardé et complété, message « Reconnecte… », réponse sans chiffre → « Aucune métrique exploitable » et **aucune** écriture, `partial` → avertissement.
5. **Historique** : 12 appels avec `month` ; mois complet sauté ; un champ déjà rempli jamais écrasé ; décompte du toast.
6. **Analyse IA** : `history` sans le mois analysé ; `monthPosts` envoyés seulement si Instagram est connecté (10 max) ; `ai_analysis` écrit seulement avec `formId` ; délais 60 s.
7. **« Ce qui marche pour toi »** : délai 90 s, lecture de coach non bloquante (échec → les chiffres s'affichent quand même), `custom_data.ig_content_insights` écrit.
8. **Navigate states** (`toEqual` exact) : « Recycler » sur un top post → `{ sujet, existingContent, fromRecycle: true }` avec l'en-tête « POST DÉJÀ PUBLIÉ… RÉ-ANGLE » ; « Créer un contenu qui applique cette reco » → `{ sujet }`.
9. **Configuration** : les 3 étapes, le corps envoyé à `stats_config` ; figer **le comportement actuel** (insert après « Configurer ») pour que la correction de la PR à part soit un changement visible.
10. **Saisie** : un champ GA4 retouché part dans le patch même s'il n'a pas changé ; mois hors période → préréglage ajusté (les 4 cas) ; patch vide → aucun appel.
11. Rendre `ga4-other-source-preservation.test.ts` vérifiable sur **plusieurs fichiers** (il lit déjà `STATS_SOURCE` : ajouter une liste de chemins où chercher `fetchFromLinkedIn`), pour que le lot du hook n'ait qu'un chemin à ajouter.

**Pièges**

- **Ce n'est pas un générateur** : `engagement-insight` est **gratuit**, non décompté du quota (décision produit, commentaires l. 7 et 285 de `supabase/functions/engagement-insight/index.ts`). Ne pas ajouter `checkQuota` / `logUsage` en passant. Aucun appel de cette page ne passe par le quota.
- **Rattachement des anciennes lignes** : il écrit en base dès l'ouverture de la page. Une erreur de condition (`isOwnSpace`, `column`) rattacherait les relevés d'une personne à l'espace d'une autre. Le mode Binôme est coupé (`WORKSPACE_SHARING_ENABLED = false`), mais le garde-fou doit rester tel quel.
- **Ordre des effets** : l'effet 6 (instantanés) ne remplit un encart que s'il est vide ; il lit `allStats` après chaque `loadStats`. Après un « Remplir depuis Instagram », l'état est posé **avant** le rechargement, donc l'effet ne l'écrase pas. Déplacer l'effet dans un hook appelé avant les états casserait cet ordre.
- **Refs lues au rendu** : `manualFields` (une ref) est lu dans le `blocked` de `Ga4SyncPanel` (l. 1297) et vidé par l'effet 5 et `handleSave`. Une ref ne provoque pas de rendu : le calcul doit rester dans le même composant que les états qui le font rerendre.
- **`workspace_id` envoyé** : partout la règle est `workspaceId !== user.id ? workspaceId : undefined` (ou `null` pour `saveStatsPatch` et `Ga4SyncPanel`). Ne pas la « simplifier » : `undefined` n'envoie pas la colonne, `null` l'efface.
- **Clés lues ailleurs** : `custom_data.ig_audience` est lu par `src/components/stats/AudienceTrendChart.tsx` (l. 40) ; `ig_audience` et `ig_top_posts` sont aussi écrits par `supabase/functions/stats-monthly-snapshot/index.ts` (l. 120-124, instantané de fin de mois). Ne renommer aucune de ces clés, ni `li_stats` et `ig_content_insights`.
- **Navigate state** : les deux sorties vers /creer (`recycleTopPost`, « applique cette reco ») ne sont figées par aucun test aujourd'hui ; le test 8 est obligatoire avant le lot 1.
- **Mode démo** : la page ne lit ni `useDemoContext` ni `isDemoMode` (grep vide) : aucune donnée en dur n'est prévue pour Léa, la page interroge Supabase comme hors démo. Ne rien ajouter pendant le découpage ; si la démo doit montrer des stats, c'est une PR à part.
- **Imports par alias** : les nouveaux fichiers importent `@/integrations/supabase/client`, `@/lib/invoke-with-timeout`, `@/lib/stats-persistence` par l'alias `@/…`, pour que les `vi.mock` par chemin des tests s'appliquent aussi à eux. `knip` bloque les fichiers morts : chaque nouveau fichier doit être importé dans la même PR.

**Risque et ordre conseillé**

Niveau : **moyen**. Fichier calme (11 commits en 90 jours), un seul importeur, un seul test qui lit le texte. Mais presque rien n'est rendu en test, plusieurs fonctions **écrivent en base** sans passer par la RPC protégée, et le rattachement des anciennes lignes s'exécute à chaque ouverture. Ce qui a cassé récemment (`git log --since=2026-07-17`) : la préservation des valeurs GA4 (`53793f530`, `00e307b05`), l'état des connexions entre espaces et comptes (`1724d8ed8`), le retour après connexion (`1b3c32d1b`, `d62ae00da`).

Une PR par lot (pas de session Lovable ouverte sur /instagram/stats pendant ces PR) :
1. **Lot T** : `src/test/stats-page.test.tsx` (tests 1 à 10) + test 11. Aucun code touché. Vérifier chaque test contre une panne volontaire (condition `isOwnSpace` retirée, `null` → `0` dans `chartData`, `fromRecycle` retiré, `setIfEmpty` retiré).
2. **Lot 1** : `src/features/stats/stats-chart-data.ts` et `instagram-patch.ts` (fonctions pures) + leurs tests unitaires. Risque très faible.
3. **Lot 2** : `StatsPostGroup.tsx` (avec les groupes audience et segments), `StatsSnapshotsPanel.tsx`, `StatsAnalysisTab.tsx`. JSX à l'identique.
4. **Lot 3** : `StatsOnboarding.tsx` et `StatsSourcesTab.tsx`. La page devrait passer sous 800 lignes ici : sortir de la référence du cliquet.
5. **Lot 4** : `use-ga4-property-picker.ts`.
6. **Lot 5** : `use-stats-data.ts` (chargement + rattachement ; tests 1 et 2 obligatoires).
7. **Lot 6 (en dernier)** : `use-stats-live-fetch.ts` + `ga4-other-source-preservation.test.ts` repointé dans la même PR.
8. **Lot 7 (documentation)** : ce document. Puis les corrections listées plus haut, une PR chacune.

Vérifications à chaque PR :
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/stats-page.test.tsx src/test/ga4-other-source-preservation.test.ts src/test/ga4-stats.test.tsx src/test/stats-reading.test.tsx src/test/stats-helpers.test.ts src/test/app-navigation.test.tsx`, puis `npm test` ;
- `npm run knip` ;
- `node scripts/cliquet-dette.mjs` (le fichier doit maigrir, jamais grossir ; aucun nouveau fichier au-delà de 800 lignes ; les `any` déplacés ne doivent pas faire monter le total) ; après la fusion, `node scripts/cliquet-dette.mjs --update` (référence actuelle : 1 412 lignes, 93 `any`) ;
- **aucun snapshot du lot T n'a le droit de changer** : si `chartData` ou un navigate state change, c'est une régression ;
- dans le cloud, l'installation des dépendances échoue : la CI de la PR sert de vérification ;
- mettre à jour ce document dans la même PR.

### 22. `src/components/creer/formatRenderers/CarouselPhotoResult.tsx` — 1 518 lignes

**En une phrase :** c'est l'écran de résultat d'un carrousel photo ou mixte **avant** sa mise en forme : il affiche chaque slide avec sa photo et son texte modifiable, permet de réordonner, ajouter, supprimer une slide ou changer son type, de choisir l'image d'une slide (bibliothèque, banque d'images, photo d'actu libre de droit, image générée par l'IA ou Studio), de régler les couleurs, de rédiger la légende (Instagram en un bloc, LinkedIn en 4 champs), et remonte chaque retouche à /creer.

> Lignes vérifiées sur le fichier au 16/10/2026 (dernier commit : `fd02d9c0c`, #1585, chantier E « erreurs et crédits compréhensibles » : seul changement, `readableError` dans `handleLibraryPick`). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou texte affiché) est la référence fiable.

Repères de structure :
- **Un seul importeur qui l'affiche** : `src/components/creer/CreerStepResult.tsx` (import l. 10, rendu l. 568 dans `renderResult`, condition l. 565 : format `carousel`, `carousel_type` `photo` ou `mix`, et des photos OU au moins une slide avec `photo_directive`). `CreerStepResult` est lui-même rendu par `src/pages/CreerUnifie.tsx` (l. 1780) et `src/components/creer/LaunchSequenceResults.tsx` (l. 54, sans `onSlidesUpdate` ni visuels).
- **Imports du type seul** : `CarouselColors` (l. 51-55, exporté) est importé par `src/pages/CreerUnifie.tsx` (l. 62), `src/hooks/use-generate-visuals.ts` (l. 15) et `CreerStepResult.tsx` (l. 10).
- Il importe `SlideFramePreview` depuis `formatRenderers/CarouselResult.tsx` (l. 8) : les deux écrans de résultat carrousel sont liés.
- Le fichier contient **deux composants** : `VisualSlidesCarousel` (l. 85-216, non exporté, aperçu défilant des visuels) et `CarouselPhotoResult` (export par défaut, l. 227-1518).
- **Rien n'a encore été sorti.** Les sous-composants utilisés existent déjà ailleurs : `PhotoSwapDialog`, `NewsPhotoPickerDialog`, `PhotoLibraryPickerDialog`, `LinkedInCaptionEditor`, `AiGeneratedMention`.
- Référence du cliquet : 1 518 lignes, 26 `any` (`scripts/cliquet-dette.baseline.json`, l. 32-35).
- `scripts/impact-creation.mjs` (l. 83) range tout fichier dont le chemin commence par `src/components/creer/formatRenderers/Carousel` sous « Carrousels : écran de résultat ».
- Aucun test ne lit le **texte** de ce fichier (grep `readFileSync` / `?raw` vide) : le piège commun n° 3 ne s'applique pas.

**Constat à lire avant tout (vérifié dans le code) : une partie du fichier ne s'affiche plus jamais dans l'application.** Depuis le commit `502b740df` (11/09/2026, éditeur visuel dans l'app), `CreerStepResult` (l. 554-558) affiche `CarouselEditorConnected` dès qu'il y a des visuels **et** `onCarouselDocumentChange` ; or `CreerUnifie` passe toujours `onCarouselDocumentChange` (l. 1836), et `LaunchSequenceResults` ne passe jamais de visuels. `CarouselPhotoResult` n'est donc rendu qu'avec `visualSlides` vide. Conséquence : `VisualSlidesCarousel`, la bannière « Mettre à jour les visuels », `visualsStale` (toujours faux), `patchVisual` (sans effet), les deux effets de `renderedSig`, `visualBySlide` et l'aperçu `SlideFramePreview` par slide (environ 250 lignes en tout) ne tournent que dans les tests A4 et A5. Les supprimer est une **décision** (Laetitia), pas un déplacement : voir « Découpage », lot 0.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Socle | 1-81 | Imports ; `MAX_SLIDES = 20`, `MIN_SLIDES = 2` (44-45) ; `GEN_CHIPS` (49, les 4 ajustements d'image envoyés tels quels au serveur) ; type `CarouselColors` (exporté) ; `CarouselPhotoResultProps` (17 props). |
| 2. Aperçu défilant des visuels | 83-216 | `VisualSlidesCarousel` : `ResizeObserver` pour la largeur, slides de 280 px max (85 % sur mobile), `iframe` en `srcDoc` réduites, points de navigation. **Jamais affiché en production** (voir le constat). |
| 3. Légende : fonctions pures | 220-288 | `OVERLAY_STYLE_CLASS` (style du texte selon `overlay_style`) ; `composeFullText` (accroche + corps + CTA + hashtags en un bloc) ; `splitFullText` (le bloc redécoupé « au mieux », CTA toujours vide) ; `buildCaptionWithFallback` (légende vide → texte de la 1re slide). Déclarées **dans** le composant, mais sans rien lire de lui. |
| 4. État | 290-307 | `slides`, `caption`, `hashtagInput`, index de slide ciblée par chaque fenêtre (`swapSlideIdx`, `libraryPickSlideIdx`, `newsPickSlideIdx`, `deleteIdx`), `libraryImporting`, `genState` (proposition d'image par index de slide), `useNavigate`, `useWorkspaceId` (`castingWorkspaceId`). |
| 5. Visuels périmés | 309-357, 395-414 | `slidesSignature` (texte, photo, type, ordre + couleurs) ; `renderedSig` en état ; `visualsStale` remonté par `onStaleChange` (et remis à `false` au démontage, l. 350) ; `visualBySlide` ; `renderRequest` (un rendu terminé valide la signature) ; détection à la réouverture par `DOMParser` et `data-slide-text` (405-414). **Inactif en production.** |
| 6. Resynchronisation depuis /creer | 359-393 | `prevSignature` (numéro, `photo_index`, `cast_source` de chaque slide + légende) ; effet sur `[result]` qui recopie slides, légende et hashtags quand la signature change ; journal `[caption_missing]` une seule fois à l'ouverture. |
| 7. Contrôle qualité | 416-440, 724-729 | `computedQuality` (slides avec / sans texte, photos non posées) ; `qualityCheck` lu dans le résultat ; `scoreColor` (80 / 60). |
| 8. Retouches de slides | 442-517, 649-689 | `notify` (= `onSlidesUpdate`) ; `patchVisual` (texte reporté dans le HTML du visuel, inactif) ; `updateSlideText` (efface `big_number` et le gabarit `chiffre` si le chiffre disparaît du texte) ; `updateSlideField` ; `moveSlide` (renumérote) ; `convertSlideToText` (« Passer en slide texte ») ; `addSlide` (20 max) ; `deleteSlide` (2 min). |
| 9. Photos d'une slide | 519-558, 621-647 | `handleSwapPhoto` (ajoute la photo par `onAddPhoto`, vide `studio_image_receipt` / `studio_image_source`, garde `photo_library_id`) ; `handleLibraryPick` (photothèque → base64 par `userPhotoToBase64`, voile de chargement) ; `handleNewsPhotoPick` (photo d'actu `news_stock` + crédit CC BY ajouté au corps de la légende en un seul `notify`, toast « Crédit photo ajouté »). |
| 10. Image générée par l'IA | 560-619, 754-822 | `generateForSlide` : si `onOpenStudio` existe, ouvre le Studio (`index:<position>`) et s'arrête ; sinon appelle `carousel-slide-image` par `invokeWithTimeout` (200 s, `directive`, `workspace_id`, `adjustment`), gère `premium_required`, `limit_reached` (sauf `quota.reason === "error"`) et les erreurs ; `keepGeneratedImage` (« Garder cette image » → `cast_source: "generated"`) ; `renderGenerationBlock` (attente, proposition, « Régénérer · 1 crédit », puces `GEN_CHIPS`, erreur). |
| 11. Légende : modifications | 691-722 | `updateCaption` (champ par champ, LinkedIn), `updateFullText` (bloc unique, Instagram, redécoupé par `splitFullText`), `updateHashtags`. |
| 12. Couleurs | 731-752, 875-914 | `DEFAULT_COLORS` (charte, sinon palette neutre `#1C1C20` / `#6E6A66` / `#C9BFB2`, « à garder synchronisée avec carousel-visual/index.ts ») ; `effectiveColors`, `setColor` ; carte « Couleurs du carrousel » (3 sélecteurs, « Couleurs de la charte »). |
| 13. Casting (texte d'abord) | 824-873 | `isPhotoType`, `castingSlides`, `uncastCount` ; carte « Ton carrousel est écrit ✍️ » avec le compte d'images à choisir et « Créer les visuels » (désactivé tant qu'une image manque). |
| 14. Carte d'une slide | 916-1307 | En-tête (« SLIDE n / total » positionnel, rôle, menu de type 950-982 écrit en ligne trois fois, bouton Studio, monter / descendre / supprimer) ; zone photo (1027-1230 : slide « Image à choisir » 1038-1121 avec 5 boutons, sinon photo posée 1123-1229 avec badges de source et boutons de remplacement) ; `photo_layout`, `photo_description` ; champs de texte (overlay pour `photo_full` et l'ancien format, titre / corps sinon, 1242-1287) ; note ; aperçu `SlideFramePreview` (1293-1302, inactif). |
| 15. Bas de page | 1309-1413 | « Ajouter une slide » ; alerte « Aucune légende pour le moment » (règle différente selon le réseau) ; `LinkedInCaptionEditor` ou bloc « 📝 Légende du carrousel » ; barre de contrôle qualité (« Contrôle de la légende » si `scored_on === "caption_only"`, photos non utilisées). |
| 16. Visuels + fenêtres | 1415-1515 | Bannière « Tu as modifié des slides… » + `VisualSlidesCarousel` (inactifs) ; `PhotoSwapDialog` (recherche pré-remplie : `photo_query_en` > `photo_directive` > sujet) ; `NewsPhotoPickerDialog` ; `PhotoLibraryPickerDialog` (1 photo) + voile ; confirmation de suppression ; `AiGeneratedMention`. |

**Découpage proposé** : un dossier `src/components/creer/formatRenderers/CarouselPhoto/` pour l'affichage (nom en majuscule **exprès** : la règle de `impact-creation.mjs` l. 83 est sensible à la casse, `carousel-photo/` tomberait hors du classement carrousel), les fonctions pures dans `src/features/creer/carousel-photo/`, un hook dans `src/hooks/`. `CarouselPhotoResult.tsx` **reste au même chemin**, garde l'export par défaut, le type `CarouselColors` et les 17 props : rien à changer dans `CreerStepResult`, `CreerUnifie`, `use-generate-visuals` ni dans le test d'audit. Cible : ~450 lignes (sous le seuil de 800).

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/creer/carousel-photo/caption.ts` | `composeFullText`, `splitFullText`, `buildCaptionWithFallback` | Fonctions pures. Ne pas les fusionner avec les fonctions de légende de `CarouselResult.tsx` ni avec `src/lib/result-copy-text.ts` dans ce lot. Garder le CTA vide de `splitFullText` (c'est voulu, « best-effort »). |
| `src/features/creer/carousel-photo/slides.ts` | `MAX_SLIDES`, `MIN_SLIDES`, `slidesSignature` (sans `useCallback`), la retouche d'overlay avec purge de `big_number` (corps de `updateSlideText`, 479-495), `moveSlide`, `addSlide`, `deleteSlide`, `convertSlideToText`, le changement de type (950-982, une fonction au lieu de trois copies), `computedQuality` | Chaque fonction rend le nouveau tableau ; `setSlides` + `notify` restent dans le composant. Les deux tests de photo « slide photo » (`isPhotoSlide` l. 418 et 1030, avec le cas ancien format ; `isPhotoType` l. 826, **sans**) ne sont pas identiques : les déplacer tels quels, ne pas les unifier ici. |
| `src/components/creer/formatRenderers/CarouselPhoto/SlideGenerationBlock.tsx` + `src/hooks/use-carousel-slide-image.ts` | Bloc 757-822 + `GEN_CHIPS` ; hook : `genState`, `generateForSlide`, `keepGeneratedImage` | Le hook reçoit `slides`, `onOpenStudio`, `castingWorkspaceId`, `navigate`, `handleSwapPhoto`. Corps envoyé, délai 200 s, ordre des tests (`premium_required` → `limit_reached` → erreur) et textes des toasts **à l'identique**. Garder `invokeWithTimeout` (étiquetage Sentry, `src/lib/generation-telemetry.ts` connaît `carousel-slide-image`). |
| `CarouselPhoto/CarouselColorsCard.tsx` | 731-752 + 875-914 | Reçoit `colors`, `charterColors`, `onColorsChange`. Garder `aria-label={`Couleur ${label}`}` (lu par le test A4) et le commentaire « à garder synchronisée avec carousel-visual ». |
| `CarouselPhoto/CastingHeader.tsx` | 840-873 | Reçoit `uncastCount`, `onRegenerateVisuals`, `visualLoading`. |
| `CarouselPhoto/SlidePhotoZone.tsx` | L'IIFE 1027-1230 (slide à caster + photo posée) | ≈12 props (`slide`, `idx`, `photos`, `onAddPhoto`, `onOpenStudio`, `genState`, les 3 « ouvrir la fenêtre », `generateForSlide`, `convertSlideToText`, `renderGenerationBlock`). Garder les textes « Image à choisir » (lu par `e2e-visite/carousel-photo-fond-live.spec.ts` l. 165), « Ma bibliothèque », « Castée depuis ta bibliothèque »… Garder la règle « pas de bouton Générer quand `news_entity` » (deux endroits). |
| `CarouselPhoto/SlideCard.tsx` | 916-1307 sans la zone photo | Garder les `aria-label` « Texte de la slide n », « Titre de la slide n », « Monter / Descendre / Supprimer la slide » (lus par le test d'audit). Garder `key={idx}` dans ce lot (voir Pièges). |
| `CarouselPhoto/CaptionSection.tsx` et `CarouselPhoto/QualityBar.tsx` | 1321-1391 ; 1393-1413 (+ `scoreColor`) | `aria-label="Légende du carrousel"` gardé. L'alerte de légende vide a deux règles (Instagram : `fullText` ; LinkedIn : `body`) : les garder. |
| `CarouselPhotoResult.tsx` (reste) | Props, état, resynchronisation (mission 6), visuels périmés (mission 5) tant que le lot 0 n'est pas tranché, `handleSwapPhoto` / `handleLibraryPick` / `handleNewsPhotoPick`, légende, fenêtres, mise en page | Le composant reste propriétaire de `slides` et `caption` : un seul endroit appelle `notify`. |

Une PR par lot, du moins risqué au plus risqué :
0. **Décision d'abord (Laetitia)** : garder ou supprimer la partie « visuels » inactive (missions 2, 5, `patchVisual`, `SlideFramePreview`, bannière, `onVisualSlidesUpdate`). Si suppression : PR à part, **avant** le découpage, avec les tests A4 et A5 retirés ou réécrits dans la même PR (c'est un changement voulu). Si on garde : `VisualSlidesCarousel.tsx` devient un fichier du lot 2 et la mission 5 un hook `use-carousel-photo-stale.ts` au lot 5.
1. **Lot T** : tests ci-dessous. Aucun code touché.
2. **Lot 1** : `caption.ts` et `slides.ts` (fonctions pures + tests unitaires). Risque très faible.
3. **Lot 2** : `CastingHeader`, `CarouselColorsCard`, `QualityBar`, `CaptionSection` (affichage seul, valeurs en props).
4. **Lot 3** : `use-carousel-slide-image.ts` + `SlideGenerationBlock` (seul appel réseau du fichier).
5. **Lot 4** : `SlidePhotoZone` puis `SlideCard` (le gros du JSX ; beaucoup de props, ne pas les regrouper en objet).
6. **Lot 5 (en dernier)** : selon le lot 0, hook des visuels périmés ; puis mise à jour de `docs/creation-contenu/CARTE.md` (l. 32), de `impact-creation.mjs` (ajouter `src/features/creer/carousel-photo/` et `src/hooks/use-carousel-slide-image.ts` à « Carrousels : écran de résultat », + un cas dans `src/test/impact-creation.test.ts`) et de ce document.

**Tests qui le protègent aujourd'hui**

- `src/test/carousel-editability-audit.test.tsx` : 8 cas, dont **3 seulement** rendent `CarouselPhotoResult` : A4 (un changement de couleur garde l'alerte « périmé » après une retouche de texte), A5 (réouverture avec des visuels anciens → `onStaleChange(true)` et bannière), A6 (photo sans texte → champ vide modifiable). A1, A2, A3, A8 visent `CarouselResult` ; A7 vise `replaceSlideText`. A4 et A5 ne testent que la partie inactive en production.
- Indirectement : `src/test/use-generate-visuals.test.tsx` (refus d'une slide photo non castée **avant** l'appel serveur, côté lancement de la mise en forme), `src/test/carousel-studio.test.tsx` (le Studio), `supabase/functions/carousel-slide-image/prompt_test.ts` (le prompt de l'image).
- Les tests de /creer (`creer-*.test.tsx`) ne rendent pas ce composant en mode carrousel photo (grep `CarouselPhotoResult` / `photo_directive` vide).
- Playwright : seul `e2e-visite/carousel-photo-fond-live.spec.ts` lit un texte de cet écran (« Image à choisir », l. 165) ; `carousel-photo-live` et `carousel-mix-live` n'en lisent aucun. Ils ne tournent pas en CI (piège commun n° 4).

**Jamais testés aujourd'hui** : la resynchronisation depuis /creer, `buildCaptionWithFallback`, `splitFullText`, le crédit photo d'actu, la purge de `big_number`, réordonner / ajouter / supprimer / changer de type, « Passer en slide texte », `generateForSlide` (corps, délai, 3 cas d'erreur, ouverture du Studio), « Garder cette image », le compte du casting et le bouton « Créer les visuels », la recherche pré-remplie de `PhotoSwapDialog`, la barre de qualité.

**Tests à ajouter AVANT de découper**

Dans `src/test/carousel-photo-result.test.tsx`, rendu réel avec les mêmes mocks que le test d'audit (fenêtres remplacées par des faux qui **exposent** `onSelect` / `onConfirm` et `defaultQuery`, `invokeWithTimeout` simulé, `sonner` espionné, `navigate` espionné), et un `Harness` qui rejoue le vrai `onSlidesUpdate` de `CreerUnifie` (nouvelle référence de `result` à chaque retouche, l. 1855-1872).
1. **Retouches de slides** : texte d'overlay, titre, corps ; overlay qui perd son chiffre → `big_number` et `template: "chiffre"` retirés ; monter / descendre (renumérotation 1..n) ; ajouter (bloqué à 20) ; supprimer via la confirmation (bloqué à 2) ; changement de type × 3 ; « Passer en slide texte » (champs photo vidés). À chaque fois : le tableau exact reçu par `onSlidesUpdate` (`toEqual`).
2. **Photos** : swap (nouvel index, `studio_image_*` vidés, `photo_library_id`) ; photothèque (succès, échec → toast `readableError`) ; photo d'actu (crédit ajouté une seule fois, `cast_source: "news_stock"`, slides **et** légende dans le même appel) ; `defaultQuery` dans l'ordre `photo_query_en` > `photo_directive` > sujet ; pas de bouton Générer avec `news_entity`.
3. **Image IA** : avec `onOpenStudio` → appelé avec `index:<n>`, aucun appel réseau ; sans → corps exact, délai 200 000, ajustement par puce ; `premium_required` (toast + « Voir les plans » → `versTarifs`) ; `limit_reached` ; `limit_reached` avec `quota.reason: "error"` → traité comme une erreur ; image absente → message d'erreur ; « Garder cette image ».
4. **Légende** : Instagram (bloc → découpage, hashtags en dernière ligne) ; LinkedIn (4 champs, hashtags avec virgules) ; alerte de légende vide selon le réseau ; boutons « Régénérer la légende » (LinkedIn seulement) et « Relancer la génération ».
5. **Resynchronisation** : nouveau `result` avec photos différentes → l'écran suit ; casting automatique (`cast_source: "library_auto"`) posé par le parent → badge affiché ; nouveau `result` avec **seulement** des textes différents (voir Pièges) → figer le comportement actuel.
6. **Casting et qualité** : « Il reste 2 images à choisir », bouton « Créer les visuels » désactivé puis actif ; barre qualité (score, « Contrôle de la légende », « 1 photo non utilisée »).
7. **Couleurs** : sélecteur → `onColorsChange` avec les 3 couleurs ; « Couleurs de la charte » → `null` ; palette neutre sans charte.
Vérifier le test contre des pannes volontaires (purge `big_number` retirée, crédit ajouté deux fois, délai 200 → 120 s) : il doit rougir à chaque fois.

**Pièges**

- **Boucle /creer ↔ écran.** Chaque retouche appelle `onSlidesUpdate`, /creer remplace `result`, et l'effet l. 367-380 compare une signature. Déplacer `notify`, `setSlides` ou cet effet change l'ordre des rendus : garder l'effet et sa liste `[result]` dans le composant, à la même place.
- **Signature partielle (incohérence, PR à part).** La signature de resynchronisation ne contient que numéro, `photo_index`, `cast_source` et la légende, pas les textes. `CarouselResult.tsx` compare tout (`JSON.stringify([rawSlides, rawCaption])`, l. 297-309, corrigé par le test A3). Ici, un nouveau résultat qui ne change que les textes des slides, avec la même légende, n'est pas affiché. A3 ne couvre que `CarouselResult`.
- **Légende impossible à vider (probable, à confirmer par le test 5).** Vider toute la légende : /creer reçoit une légende vide, la signature change, `buildCaptionWithFallback` remet le texte de la 1re slide à l'écran **sans** prévenir /creer. L'écran montre un texte, le résultat enregistré n'en a pas.
- **Propositions d'image rangées par position.** `genState` est indexé par position (`idx`), comme `key={idx}` et `onOpenStudio(\`index:${idx}\`)`. Après monter / descendre / supprimer, une proposition en cours ou affichée reste attachée à la position, donc à une autre slide (bug probable, PR à part ; ne pas changer la clé pendant le découpage).
- **Quota et crédits.** Le contrôle `checkQuota` / `logUsage` est côté serveur (`carousel-slide-image`, catégorie `photo_retouch`, `logUsage` après succès). Le front n'utilise **pas** `handleQuotaError` ni `QuotaWallModal` : ses messages sont écrits en dur. Le bouton du toast Premium dit « Voir les plans » alors que CLAUDE.md demande « Passer à Premium ». Et le serveur refuse le plan gratuit (`premium_required`, l. 95-96) alors que `PLAN_LIMITS` donne 5 images au plan gratuit : incohérence produit à trancher, hors de ce fichier.
- **Espace de travail.** L'écran ne lit aucune table : seul `useWorkspaceId` sert à envoyer `workspace_id` (même quand c'est son propre espace, contrairement au brouillon rapide du calendrier). Le serveur s'en sert pour lire `brand_charter` et le profil. À l'identique.
- **Mode démo (à vérifier).** En démo, /creer ne passe pas `onOpenStudio` (l. 1842) mais passe `onAddPhoto` (l. 1873) : le bouton « Générer l'image · 1 crédit » appellerait donc vraiment `carousel-slide-image`. CLAUDE.md dit « aucun appel IA en démo ». À confirmer en démo, PR à part.
- **Effets aux listes incomplètes.** L. 393 (`[]`, voulu, commenté), l. 404 (`[visualLoading]` seul), l. 414 (sans `slides`). Les déplacer avec leur liste exacte ; ne pas « corriger » sur la foi d'eslint.
- **Autres incohérences notées (PR à part) :** `moveSlide` ne retire pas les numéros de page des visuels, contrairement à `CarouselResult` (A8) ; trois façons de dire « slide photo » (l. 418, 826, 1030) ; menu de type écrit trois fois ; libellés « Supprimer » / « Annuler » de la confirmation hors règle « verbe + objet » ; badge « Layout : » en anglais ; `LaunchSequenceResults` affiche cet écran sans `onSlidesUpdate` : les retouches d'un carrousel photo en séquence de lancement restent locales (à vérifier si ce cas existe).
- **Contrat `data-*`.** La détection l. 410-411 lit `data-slide-text` (`title`, `body`, `overlay`), déclaré dans `supabase/functions/_shared/carousel-dom-contract.ts`. Ne pas renommer.

**Risque et ordre conseillé**

Niveau : **moyen**. Un seul écran appelant, pas de test qui lit le texte du fichier, peu de code réseau (un appel). Mais seulement 3 cas de test rendent le composant, dont 2 sur la partie inactive : une retouche de slide perdue, un crédit photo oublié ou une légende mal remontée passeraient la CI aujourd'hui. Le fichier bouge moyennement : 14 commits depuis le 17/07/2026, surtout sur les photos et le casting (`2ea5e5316` #1451 photos d'ambiance, `3fd8e8105` #1067 récit continu, `55d47de7b` #1052 génération d'image, `13273ad76` et `8eee5eb47` Studio), la grille d'offres (`be094158f` #1174, `e52f7d674` #1185) et la qualité (`e80795a1b` #1410, `b5303a239` #961). Coordination : pas de session Lovable ouverte sur /creer pendant ces PR ; ne pas lancer le lot 4 en même temps qu'un chantier sur `CarouselResult.tsx` (import partagé de `SlideFramePreview`).

Vérifications à chaque PR :
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/carousel-photo-result.test.tsx src/test/carousel-editability-audit.test.tsx src/test/use-generate-visuals.test.tsx src/test/impact-creation.test.ts`, puis `npm test` ;
- `npm run knip` (chaque nouveau fichier importé dans la même PR) ;
- `node scripts/cliquet-dette.mjs` (le fichier doit maigrir ; aucun nouveau fichier au-delà de 800 lignes) ; après la fusion, `node scripts/cliquet-dette.mjs --update` (référence actuelle : 1 518 lignes, 26 `any`) ;
- `node scripts/impact-creation.mjs --base origin/main` : les nouveaux fichiers doivent apparaître sous « Carrousels : écran de résultat » ;
- dans le cloud, l'installation des dépendances échoue : la CI de la PR sert de vérification ;
- mettre à jour ce document (et CARTE.md au dernier lot) dans la même PR.

---

### 23. `src/hooks/use-onboarding.ts` — 918 lignes

**En une phrase :** c'est le « cerveau » du questionnaire d'accueil (/onboarding) : il retient l'écran en cours et les réponses (y compris après un rafraîchissement ou sur un autre appareil), préremplit depuis le profil, envoie et retrouve les captures d'écran, lance le pré-scraping du site, enregistre le profil, le plan et quelques bases de marque, puis, une fois le diagnostic vu, marque l'onboarding comme terminé et choisit où envoyer la personne.

> Lignes vérifiées sur le fichier au 16/10/2026 (dernier commit : `7042e5e08`, #1595, « Démarrage raccourci : 8 écrans de questions, un seul récapitulatif »). Les numéros bougent à chaque modification : le **repère** (nom de fonction, de constante ou de commentaire) est la référence fiable.

Repères de structure :
- **Un seul appelant réel** : `src/pages/Onboarding.tsx` (import l. 9, types l. 11, appel `useOnboarding()` l. 83). La page lit 26 des 31 clés rendues. Elle ne lit **pas** `setAnswers` ni `setBrandingAnswers`, et elle récupère `setBranding`, `saving` et `getPlaceholder` sans jamais s'en servir.
- **Imports de types seulement** : `Answers` + `UploadedFile` dans `src/components/onboarding/OnboardingPhase2Import.tsx` (l. 5), `Answers` dans `OnboardingPhase3Branding.tsx` (l. 9) et `OnboardingPhase2Import.test.tsx` (l. 5).
- **Un test exécute le vrai hook** : `src/test/onboarding-uploads-recovery.test.tsx` (l. 3, 13 cas, détaillés plus bas).
- Le fichier contient 3 fonctions de traduction hors du hook (l. 24-60), 3 types exportés (l. 64-98), une fonction d'aperçu signé (l. 100-110) et **un seul export exécutable**, `useOnboarding` (l. 113-918). Rien n'en a encore été sorti. Les morceaux déjà rangés ailleurs, que le hook importe : `src/lib/onboarding-steps.ts` (enchaînement des écrans, barre, temps restant), `onboarding-status.ts` (`resolveOnboardingStatus`), `onboarding-strategy-defaults.ts`, `product-or-service.ts`, `mark-welcome-seen.ts`.
- Référence du cliquet : 918 lignes, 15 `any` (`scripts/cliquet-dette.baseline.json`). Au classement du 14/10/2026 : rang 25 (923 lignes, 16 `any`, 7 corrections, score 41).
- `scripts/impact-creation.mjs` : **absent** (grep « onboarding » vide), comme dans `docs/creation-contenu/CARTE.md`. Ce n'est pas un générateur : aucun appel IA direct, donc pas de `checkQuota` / `logUsage` ici (le diagnostic IA, `deep-diagnostic`, est appelé par `DiagnosticLoading.tsx` l. 304).
- `scripts/verif-post-lovable.sh` (l. 63-64) exclut **tout chemin qui contient `use-onboarding`** de la recherche d'appels `supabase.functions.invoke(` sans enveloppe : c'est l'exception tolérée pour le pré-scraping (l. 434). Voir Pièges.

**Missions mélangées**

| Mission | Lignes (plages réelles) | Ce que ça fait |
|---|---|---|
| 1. Socle et traductions | 1-60 | Imports ; `mapOnboardingTimeToPlan` (24-33, `15min`… → `less_2h` / `2_5h` / `5_10h`), `mapObjectifToPlanGoal` (35-44, `system`… → `structure` / `visibility` / `clients`), `getStepName` (46-60, nom d'écran envoyé à PostHog). |
| 2. Types | 62-98 | `Answers` (17 champs, dont `visual_reference_links` facultatif), `BrandingAnswers` (gardé « pour compatibilité », l. 214), `UploadedFile`. |
| 3. Aperçu signé | 100-110 | `createOnboardingPreviewUrl` : lien signé 24 h dans le bucket privé `onboarding-uploads` ; un échec rend `undefined` sans bloquer. |
| 4. Contexte et états | 113-147 | `useAuth`, `useDemoContext`, `useWorkspaceFilter`, `useWorkspaceId`, `useProfileUserId`, `useWorkspace` (`ownWorkspace`), `useNavigate` ; `step` lu dans `lac_onboarding_step` (124-128) ; états : espace déjà brandé, accord de remplacement, brouillon relu, profil lu (par compte), `saving`, captures, `uploading`, `diagnosticData`. |
| 5. Captures : reprise après rafraîchissement | 149-192 | Relit `lac_onboarding_upload_ids:<id>` (3 max), puis `user_documents` (`user_id`, `context: "onboarding"`, `in id`) et les aperçus ; garde une capture même si sa ligne n'a pas pu être relue (« Capture importée ») ; annule si le compte change. Le second effet (188-192) réécrit la liste après chaque changement, une fois la reprise faite. |
| 6. Réponses de départ (et démo « Léa ») | 194-222 | `answers` : prénom et activité depuis `lac_prenom` / `lac_activite` (posés par `SignupForm.tsx` l. 56-57), ou valeurs de démo en dur ; `brandingAnswers` : démo depuis `demoData`, sinon vide. |
| 7. Brouillon local | 224-290 | Enregistrement différé de 500 ms de `lac_onboarding_step`, `_answers`, `_branding`, `_ts`, **seulement** après la relecture du brouillon **et** la lecture du profil du même compte (224-237) ; relecture au montage avec expiration à 7 jours (239-274) ; reprise du diagnostic déjà calculé depuis `lac_onboarding_diagnostic:<id>` à l'étape 11 (276-282) ; toast « On reprend où tu en étais » (284-290). |
| 8. Statut et préremplissage | 292-369 | Lit `profiles` (14 colonnes) par `profileUserId` et `resolveOnboardingStatus` ; déjà terminé → `/dashboard` ; étape ≥ 11 sans diagnostic local → tout remis à zéro (317-331) ; sinon préremplit depuis le profil ou `user_metadata` (prénom, activité) **si aucun brouillon local** (340-362). Pose toujours « profil lu » à la fin (364-366), ce qui débloque la mission 7. |
| 9. Espace déjà brandé | 371-391 | Lit `brand_profile` (`mission`, `positioning`) de l'espace **propriétaire** (`ownWorkspace.id`) ; rend son nom à `brandedSpaceName`, que la page utilise pour demander « remplacer ou garder ». |
| 10. Navigation entre écrans | 393-425 | `set`, `setBranding` ; `next` (écran suivant + événement PostHog `onboarding_step_completed`, **dans** la fonction de mise à jour de `setStep`) ; `prev` ; `progress`, `getTimeRemaining` ; touche Échap = retour, sauf à l'écran 0 et à partir de l'analyse (étape 10). |
| 11. Pré-scraping du site | 427-437 | `triggerPreScrape` : une seule fois par visite (`preScrapeTriggered`), URL validée par `isValidUrl`, appel **direct** `supabase.functions.invoke("pre-scrape-website")` sans attendre (le serveur identifie la personne par son jeton, pas par `userId` du corps). |
| 12. Captures : envoi et suppression | 440-535 | `sanitizeFileName` (441-451, définie dans le hook) ; `handleFileUpload` (453-518) : png / jpg / jpeg / webp, compression (`import("@/lib/image-compress")` dynamique), envoi sous `<id utilisateur>/onboarding/<horodatage>_<nom>`, ligne `user_documents`, aperçu, ajout de l'id dans `lac_onboarding_upload_ids:<id>` ; `removeFile` (520-535) : ligne puis fichier. |
| 13a. Sauvegarde : canaux et profil | 537-612 | `finishPromiseRef`, `completingRef` ; `performFinish` : canaux (sélection + souhaités + déduits des liens, `website` → `site`) ; `profiles` mis à jour ou créé **sans** valider l'onboarding (`onboarding_completed` reste ce qu'il était, `onboarding_step: 10`) ; liens Instagram / site / LinkedIn écrits **même vides** (commentaire 580-584) ; repli sans `product_or_service` sur l'erreur `42501` (592-598) ; `rememberProductOrService`. |
| 13b. Sauvegarde : plan | 614-644 | `user_plan_config` par `user.id` : objectif et temps traduits (mission 1), `level: "beginner"`, canaux ; ne révoque pas un onboarding déjà terminé. |
| 13c. Sauvegarde : bases de marque | 646-716 | `brand_charter.mood_board_urls` : fusion sans doublon des références visuelles (648-667) ; `brand_proposition.version_complete` si `brandingAnswers.positioning` (669-690) ; `brand_strategy` : pilier et facette depuis `ONBOARDING_GOAL_TO_PILLAR` / `ONBOARDING_BLOCKER_TO_INSIGHT` (692-715). Ces trois tables passent par `column` / `value` (`useWorkspaceFilter`) et mettent à jour **par id**. Erreurs de proposition et de stratégie : console seulement. |
| 13d. Promesse partagée | 727-735 | `handleFinish` : une seule sauvegarde par visite ; la promesse est oubliée seulement si elle échoue (la page l'appelle deux fois : `launchDiagnostic` et la reprise à l'étape 10). |
| 14. Démo : passer | 737-740 | `handleSkipDemo` → `/dashboard`. |
| 15. Fin d'onboarding | 742-872 | `handleDiagnosticComplete(goCreate)` : gardes (démo → `/welcome`, profil indisponible) ; `await handleFinish()` ; **écritures de complétion** `profiles` puis `user_plan_config` (`onboarding_completed: true`), 2 essais chacune, échec des **deux** → toast 10 s et rien d'autre (759-810) ; `branding_audits` + `profiles.diagnostic_data` (812-834, toast si échec, sans bloquer) ; PostHog `onboarding_completed` ; purge de 8 clés locales (843-850) ; destination : offre Premium en attente (`lac_pending_offer` ou `user_metadata.pending_offer`) → `/welcome?offer=outil`, `goCreate` → `/branding?from=onboarding&next=creer`, sinon `markWelcomeSeen` puis `/dashboard`. |
| 16. Texte d'exemple | 874-882 | `getPlaceholder` (jamais lu par la page). |
| 17. Ce que le hook rend | 884-917 | 31 clés : `step`, `setStep`, `answers`, `setAnswers`, `brandingAnswers`, `setBrandingAnswers`, `set`, `setBranding`, `next`, `prev`, `progress`, `saving`, `uploadedFiles`, `uploadsRestored`, `draftRestored`, `uploading`, `diagnosticData`, `setDiagnosticData`, `isDemoMode`, `demoData`, `handleFileUpload`, `removeFile`, `handleFinish`, `handleSkipDemo`, `brandedSpaceName`, `overwriteConfirmed`, `setOverwriteConfirmed`, `handleDiagnosticComplete`, `getPlaceholder`, `getTimeRemaining`, `triggerPreScrape`. |

**Découpage proposé** : un dossier `src/features/onboarding/` (à côté de `src/features/calendar/` et `src/features/creer/`) pour le code sans React, et des hooks `src/hooks/onboarding/use-onboarding-….ts`. `src/hooks/use-onboarding.ts` **reste au même chemin**, garde le nom `useOnboarding`, réexporte les 3 types et rend les mêmes 31 clés : rien à toucher dans `Onboarding.tsx`, les deux composants et les tests. Il garde aussi `triggerPreScrape` (voir Pièges, exclusion de `verif-post-lovable.sh`), la navigation entre écrans (mission 10), `handleFinish`, la fin d'onboarding (navigations et purge) et l'objet rendu. Cible : ~300 lignes.

| Nouveau fichier | Ce qu'on y déplace (à l'identique) | Dépendances / pièges |
|---|---|---|
| `src/features/onboarding/types.ts` | `Answers`, `BrandingAnswers`, `UploadedFile` | Le hook réexporte (`export type { … } from`) : les 4 importeurs de types ne changent pas. Garder l'import de type `CharterReferenceLink`. |
| `src/features/onboarding/mappers.ts` | `mapOnboardingTimeToPlan`, `mapObjectifToPlanGoal`, `getStepName`, `sanitizeFileName` (sortie du corps du hook, elle ne lit rien du hook) | Fonctions pures. Ne pas les fusionner avec `onboarding-steps.ts` ni corriger `getStepName` ici (voir Pièges). |
| `src/features/onboarding/draft-storage.ts` | Les noms des clés locales (`lac_onboarding_step`, `_answers`, `_branding`, `_ts`, `lac_onboarding_upload_ids:<id>`, `lac_onboarding_diagnostic:<id>`) et les trois purges écrites à la main (249-252, 320-323, 843-850) sous forme de fonctions | **Ne renommer aucune clé** : elles sont lues ou effacées ailleurs (voir Pièges). Les 3 purges ne sont **pas** identiques (la 3e efface aussi `lac_prenom`, `lac_activite` et les 2 clés par compte) : une fonction par purge, pas une seule « harmonisée ». |
| `src/hooks/onboarding/use-branded-space-warning.ts` | États `brandedSpaceName`, `overwriteConfirmed` + effet 371-391 | Petit et isolé. Garder `ownWorkspace` (espace propriétaire) et non l'espace actif : c'est voulu (commentaire 371-376). |
| `src/hooks/onboarding/use-onboarding-uploads.ts` | `createOnboardingPreviewUrl`, états `uploadedFiles` / `uploadsRestoredForUser` / `uploading`, `uploadsRestored`, effets 149-192, `handleFileUpload`, `removeFile` | Reçoit `user` et `isDemoMode`. Le chemin de stockage reste `${user.id}/onboarding/…` et la lecture `user_documents` reste par `user_id` (ce sont des captures de la personne, pas de l'espace) : ne pas les passer à `useWorkspaceFilter` en passant. `uploadedFiles` doit ressortir (lu par `handleDiagnosticComplete` pour PostHog). |
| `src/hooks/onboarding/use-onboarding-draft.ts` | `step`, `answers`, `brandingAnswers`, `draftRestored`, `restoredFromSave`, `diagnosticData` + effets 224-290 | **Le plus délicat des hooks.** L'enregistrement attend `profileReadCompleteForUser`, posé par la mission 8 : l'état reste dans `use-onboarding.ts` et passe en paramètre. Garder les deux listes de dépendances telles quelles, avec leurs commentaires `eslint-disable`. `useState(isDemoMode)` et les initialiseurs qui lisent `localStorage` doivent rester des initialiseurs (lus au 1er rendu seulement). |
| `src/hooks/onboarding/use-onboarding-status-check.ts` | `prefillDone` + effet 292-369 | Reçoit `setStep`, `setAnswers`, `setProfileReadCompleteForUser`, `step`, `navigate`. Lit `step` **capturé au montage** (dépendances sans `step`, voulu) : ne pas l'ajouter aux dépendances. |
| `src/features/onboarding/save-onboarding.ts` | Corps de `performFinish` (546-716) en `saveOnboardingAnswers({ answers, brandingAnswers, user, profileUserId, workspaceId, column, value })` → `boolean` | Les toasts, l'ordre des écritures (profil → plan → charte → proposition → stratégie) et les 3 façons différentes de calculer `workspace_id` restent **à l'identique** (voir Pièges). `setSaving` et `finishPromiseRef` restent dans le hook. |
| `src/features/onboarding/complete-onboarding.ts` | Écritures de complétion (767-810) en `writeOnboardingCompletion(profileUserId, userId)` → `{ profileError, configError }` ; enregistrement du diagnostic (812-834) en `saveInitialDiagnostic(…)` | Les navigations, la purge locale, `completingRef` et `finishPromiseRef` **restent dans le hook** (ils décident du retour en arrière en cas d'échec). |

**Ordre des lots, du moins risqué au plus risqué** (une PR chacun, déplacement à l'identique d'abord, pas de session Lovable ouverte sur /onboarding pendant ces PR) :
1. **Lot T** : les tests ci-dessous. Aucun code touché. Verts avant tout déplacement.
2. **Lot 1** : `types.ts` + `mappers.ts` (fonctions pures, le hook réexporte les types).
3. **Lot 2** : `use-branded-space-warning.ts`.
4. **Lot 3** : `use-onboarding-uploads.ts` (+ `draft-storage.ts` pour les 2 clés par compte s'il est prêt).
5. **Lot 4** : `save-onboarding.ts` (fonction async sans état React, mais elle écrit 5 tables).
6. **Lot 5** : `use-onboarding-draft.ts` + `use-onboarding-status-check.ts` **ensemble** (ils se passent `profileReadCompleteForUser`), et le reste de `draft-storage.ts`.
7. **Lot 6 (en dernier)** : `complete-onboarding.ts`. C'est la porte de toute l'application : tant que ni `profiles` ni `user_plan_config` ne disent `onboarding_completed: true`, `ProtectedRoute` renvoie vers /onboarding.
8. **Lot 7 (documentation)** : ce document, et `scripts/verif-post-lovable.sh` s'il faut resserrer l'exclusion.

**Tests à poser d'abord**

Ce qui protège le fichier aujourd'hui :
- `src/test/onboarding-uploads-recovery.test.tsx` (vrai hook, 13 cas) : brouillon pas écrit avant la lecture du profil (préremplissage par `user_metadata`) ; relecture des réponses avant de reprendre l'analyse (étape 10) ; Échap sans effet pendant l'analyse ; diagnostic réaffiché à l'étape 11 ; écrans 7 et 9 sautés par `next` / `prev` ; captures retrouvées (filtres `user_id`, `context`, `in id`), gardées si l'aperçu échoue, pas reportées sur un autre compte ; `handleFinish` n'écrit pas `onboarding_completed: true`, `handleDiagnosticComplete` l'écrit puis purge et va sur `/dashboard` ; relance d'un onboarding déjà terminé sans révocation ; complétion à 0 ligne ou profil non enregistré → pas de navigation, nouvel essai possible.
- `src/components/onboarding/OnboardingPhase2Import.test.tsx` (5 cas) : côté écran des liens seulement (dont l'URL transmise à `onLeave` = `triggerPreScrape`).
- `src/test/storage-cleanup.test.ts` : la purge à la déconnexion efface les 6 clés du brouillon (côté `src/lib/storage-cleanup.ts`, pas ce hook).
- Indirectement : `onboarding-status.test.ts`, `onboarding-strategy-defaults.test.ts`, `product-or-service.test.ts`, `protected-route.test.tsx`.
- Playwright : `e2e-visite/onboarding-diagnostic.spec.ts` (T5, pose un brouillon puis mesure l'arrivée du chargement) ; il ne tourne pas en CI (« Pièges communs », point 4). Aucun test ne lit le **texte** du fichier (le piège commun n° 3 ne s'applique pas).

Jamais testés (vérifié par grep dans `src/test`) : le contenu exact des écritures de `performFinish` (canaux, `site`, liens vidés, plan traduit, charte, proposition, stratégie) ; le repli `42501` ; l'envoi d'une capture (formats refusés, plafond de 3, chemin, ligne `user_documents`) ; `removeFile` ; l'expiration à 7 jours ; la remise à zéro « étape ≥ 11 sans diagnostic » ; le préremplissage depuis `profiles` et le cas « brouillon local présent » ; l'avertissement d'espace déjà brandé ; `triggerPreScrape` (une seule fois, URL invalide) ; les 3 destinations de fin (`/welcome?offer=outil`, `/branding?from=onboarding&next=creer`, `/dashboard` + `markWelcomeSeen`) ; `branding_audits` ; le mode démo ; l'événement PostHog de `next`.

À écrire **avant** de découper, dans `src/test/`, en rendu du vrai hook avec les mêmes mocks que `onboarding-uploads-recovery.test.tsx` (le faux client y enregistre déjà chaque écriture dans `m.writes`) :
1. `onboarding-save.test.tsx` : figer avec `toMatchSnapshot()` **toutes** les écritures de `handleFinish` (table, opération, données, filtres) pour : profil neuf / existant ; canaux `["none"]` + lien Instagram + site (→ `instagram`, `site`) ; liens effacés → `null` ; `@pseudo` → `pseudo` ; références visuelles avec et sans charte existante (pas de doublon) ; `brandingAnswers.positioning` rempli ; objectif + blocage → pilier et facette ; espace ≠ compte (`workspace_id` posé) ; erreur `42501` → 2e écriture sans `product_or_service`.
2. `onboarding-uploads.test.tsx` : `.pdf` refusé avec toast ; 4 fichiers → 3 envoyés ; nom accentué → `sanitizeFileName` ; chemin `qa-a/onboarding/<horodatage>_…` ; échec d'insertion `user_documents` → toast, `uploading` revient à `false` ; `removeFile` (ligne puis fichier ; échec de suppression → la capture reste).
3. `onboarding-draft.test.tsx` (horloge simulée) : brouillon daté de 8 jours → 4 clés effacées (**figer le comportement actuel de `step`**, voir Pièges) ; étape 11 sans diagnostic local → retour à 0 ; préremplissage depuis `profiles` (`instagram_username` → `@…`) ; pas de préremplissage si `lac_onboarding_answers` existe ; toast de reprise une seule fois.
4. `onboarding-complete.test.tsx` : les 3 destinations ; `markWelcomeSeen` appelé seulement vers `/dashboard` ; `updateUser({ data: { pending_offer: null } })` ; `branding_audits` avec `diagnosticData` (et toast si échec, navigation quand même) ; un seul des deux échecs de complétion → on continue ; les 8 clés purgées ; statut `done` au montage → `/dashboard`.
5. `onboarding-demo-and-misc.test.tsx` : démo → réponses de Léa, pas de lecture `localStorage` ni de `supabase` ; `handleSkipDemo` ; `handleDiagnosticComplete` en démo → `/welcome` ; espace brandé → `brandedSpaceName` = nom de l'espace propriétaire ; `triggerPreScrape` appelé deux fois → un seul appel, URL invalide → aucun.
6. Un test « contrat » : `Object.keys(result.current).sort()` vaut exactement les 31 clés listées plus haut.

**Pièges**

- **Exclusion trop large dans `verif-post-lovable.sh`** (l. 64, `grep -v "use-onboarding"`) : elle masque tout fichier dont le chemin contient ce mot, y compris `use-onboarding-missions.ts` et les futurs `use-onboarding-*.ts`. Garder `triggerPreScrape` dans `use-onboarding.ts` ; tout nouveau fichier qui appellerait `supabase.functions.invoke(` serait silencieusement toléré. Resserrer le motif (chemin exact) dans le lot 7.
- **Clés locales lues ailleurs** (ne pas renommer) : `lac_prenom` / `lac_activite` écrites par `SignupForm.tsx` ; `lac_onboarding_answers` écrite **directement** par `OnboardingPhase2Import.tsx` (l. 36 et 49, avant de partir connecter Instagram / LinkedIn) ; `lac_onboarding_diagnostic:<id>` et `lac_onboarding_step` écrites par `Onboarding.tsx` (l. 221-222) ; `lac_onboarding_step` lue par `use-guide-recommendation.ts` (l. 98) ; effacements dans `storage-cleanup.ts`, `AdminResetTool.tsx`, `SettingsPage.tsx`, `use-reset-branding.ts` ; `lac_pending_offer` partagée avec `SignupForm.tsx` et `WelcomePage.tsx`.
- **Ordre des effets** : relecture du brouillon (239-274) avant le contrôle de statut (292-369), et l'enregistrement (224-237) bloqué tant que les deux n'ont pas fini. En sortant ces effets dans des hooks, les appeler **dans le même ordre**, à la même place. Le test « attend le profil avant d'écrire un brouillon vide » est le filet.
- **Navigation après démontage** : `handleDiagnosticComplete` enchaîne plusieurs `await` puis `navigate`. Le garder dans le hook avec `completingRef` / `finishPromiseRef` remis à `null` sur les mêmes chemins d'échec (756, 807-808), sinon un deuxième clic n'est plus possible après une panne.
- **Workspace** : 3 calculs différents de `workspace_id` à garder tels quels pendant le déplacement : `brand_charter` (`workspaceId && workspaceId !== user.id ? workspaceId : null`), `brand_proposition` / `brand_strategy` / `branding_audits` (`workspaceId !== profileUserId ? workspaceId : undefined`). `profiles` et `brand_*` passent par `profileUserId`, `user_plan_config` et les captures par `user.id`. Le mode Binôme est coupé (`WORKSPACE_SHARING_ENABLED = false`) : ne pas « réparer » ces écarts (CLAUDE.md).
- **Mode démo** : données en dur (l. 197-221), aucune lecture `localStorage` ni `supabase` attendue. `performFinish` teste `profileUserId` **avant** `isDemoMode` (l. 541-542) ; en démo, `useProfileUserId` rend `DEMO_FAKE_UUID`, donc pas de souci aujourd'hui, mais ne pas inverser ni déplacer ces gardes.
- **`supabase-js` ne lève pas ses erreurs** : chaque `error` est lu à la main (commentaire 762-766). Une fonction sortie qui oublierait de rendre l'erreur transformerait un échec en faux succès (« succès menteur », #891).
- **PostHog dans `setStep`** (l. 401-409) : l'événement part depuis la fonction de mise à jour. Garder tel quel au déplacement.

Bugs ou incohérences repérés en lisant (une PR à part chacun, **après** le découpage, avec un cas de test qui change exprès) :
1. **Brouillon expiré à moitié effacé** : `step` est lu dans `lac_onboarding_step` au premier rendu (124-128), avant le contrôle des 7 jours. Le contrôle (248-253) efface les 4 clés mais ne remet pas `step` à 0 ; l'enregistrement suivant réécrit l'ancienne étape. La personne reprend donc à l'écran 6, par exemple, avec des réponses vidées (seuls le prénom de `lac_prenom` et ce que le profil permet de préremplir reviennent). Seules les étapes 1, 2, 4, 5, 6 et 7 sont validées par la page : à partir de l'écran 6, on peut lancer le diagnostic sans prénom ni activité.
2. **Remise à zéro incomplète** (317-331) : `brandingAnswers`, `visual_reference_links` et `lac_onboarding_upload_ids:<id>` ne sont pas remis à zéro.
3. **Envoi de captures** : le plafond `3 - uploadedFiles.length` compte aussi les fichiers refusés pour leur format ; un échec d'insertion `user_documents` (`throw`, l. 492) arrête la boucle et laisse le fichier déjà envoyé orphelin dans le bucket.
4. **Code mort probable** : `brandingAnswers` n'est jamais rempli hors démo (aucun écran n'appelle `setBranding`), donc le bloc `brand_proposition` (673-690) ne s'exécute qu'avec un vieux brouillon local. `setBranding`, `saving`, `getPlaceholder`, `setAnswers`, `setBrandingAnswers` sont rendus mais jamais lus. `knip` ne voit pas les clés d'objet : à trancher à la main, pas pendant le découpage.
5. **`as any` inutile** l. 877 : `ActivityProfile` déclare déjà `post_examples` (`src/lib/activity-examples.ts` l. 40). De plus, les textes d'exemple de `getPlaceholder` visent un seul persona (« femmes entrepreneures »), contraire à la règle d'or 6 ; sans effet aujourd'hui puisque la fonction n'est pas lue.
6. **Erreurs muettes** : `brand_proposition` et `brand_strategy` n'écrivent qu'en console (681, 688, 706, 713), contrairement au profil et au plan. Décision à prendre, pas un déplacement.
7. Le corps du pré-scraping envoie `userId` (l. 435), que `pre-scrape-website` ignore (il prend l'identité du jeton, l. 15) : sans danger, à nettoyer.

**Vérifications à chaque PR**
- `npx tsc --noEmit -p tsconfig.app.json` ;
- `npx vitest run src/test/onboarding-uploads-recovery.test.tsx src/test/onboarding-*.test.tsx src/components/onboarding/OnboardingPhase2Import.test.tsx src/test/storage-cleanup.test.ts`, puis `npm test` ;
- `npm run knip` (chaque nouveau fichier importé par le hook dans la même PR) ;
- `node scripts/cliquet-dette.mjs` (le hook doit maigrir, jamais gagner un `any`) ; après la fusion, `node scripts/cliquet-dette.mjs --update` (référence actuelle : 918 lignes, 15 `any`) ;
- `bash scripts/verif-post-lovable.sh`, section 4 : aucun nouvel appel `supabase.functions.invoke(` caché par l'exclusion ;
- **aucun snapshot du lot T n'a le droit de changer** : si une écriture change, c'est une régression, on corrige le code ;
- dans le cloud, l'installation des dépendances échoue : la CI de la PR sert de vérification ; mettre à jour ce document dans la même PR.

## 3. Par où commencer

Chaque fiche donne l'ordre **à l'intérieur** d'un fichier. Entre les fichiers,
l'ordre conseillé va du plus sûr au plus risqué, et évite les chantiers en
cours :

| Ordre | Fichier | Pourquoi à ce moment-là |
|---|---|---|
| 0 ✅ | `scripts/impact-creation.mjs` (fait le 14/10/2026, #1479) | Avant tout découpage d'un module partagé : faire calculer la zone (rouge / orange / verte) sur le premier segment du nom, sinon le rapport de CI annonce « zone verte » pour `redac-gate/numbers` (voir « Pièges communs »). |
| 1 ✅ | `_shared/format-briefs.ts` (fiche 10, terminée le 14/10/2026 : 1 273 → 18 lignes) | Risque faible : un seul appelant serveur (creative-flow), des fonctions pures. Bon premier essai de la méthode. |
| 2 ✅ | `_shared/correction-pass.ts` (fiche 9, terminée le 14/10/2026 : 1 234 → 39 lignes) | Le plus fort taux de corrections ; les prompts de correction ne sont figés nulle part : poser les snapshots d'abord. |
| 3 ✅ | `creative-flow/index.ts` (fiche 3, terminée le 14/10/2026 : 1 687 → ~440 lignes, lot F compris) | Suite logique du lot 3 du 13/10, mêmes tests de contrat déjà en place. |
| 4 ✅ | `_shared/redac-gate.ts` (fiche 7, terminée le 14/10/2026 : 2 093 → 35 lignes) | Zone orange (9 fonctions) : après correction-pass, dont il dépend. |
| 5 ✅ | `carousel-ai/index.ts` (fiche 2, terminée le 14/10/2026 : 2 792 → 483 lignes) | Très modifié ; un contrat du handler à poser d'abord, comme pour creative-flow. |
| 6 ✅ | Studio visuel, serveur puis page (fiches 5 et 4) — serveur terminé le 14/10/2026 (fiche 5), page terminée le 15/10/2026 (fiche 4 : 2 059 → 684 lignes) | Indépendant de la création de contenu : peut avancer en parallèle des lignes 1 à 5. |
| 7 | `carousel-visual/index.ts` (fiche 6) | Après la fusion du chantier en cours sur le contrat `data-*`. |
| 8 | `src/pages/CreerUnifie.tsx` (fiche 1) | Le plus risqué : commencer par le lot A (tests seuls), puis l'affichage pur, et garder l'arrivée depuis le calendrier pour la fin. Pas de session Lovable ouverte sur /creer pendant ces PR. |
| 9 ✅ | `cron-health/index.ts` (fiche 18, terminée le 15/10/2026 : 959 → 88 lignes) | Risque faible : lecture seule, aucune utilisatrice touchée ; mais une régression prive Laetitia de ses alertes sans prévenir, d'où le contrat du handler d'abord. |
| 10 ✅ | `export-carousel-hybrid-pptx.ts` (fiche 15, terminée le 15/10/2026 : 1 767 → 98 lignes) | Calme (3 corrections) ; ne pas croiser avec une PR qui renomme un attribut `data-*`. |
| 11 ✅ | `BrandingReview.tsx` (fiche 14, terminée le 15/10/2026 : 1 411 → 184 lignes) | Indépendant de la création de contenu ; écrit dans 7 tables : tests d'écriture d'abord. |
| 12 ✅ | `ReelMontage.tsx` (fiche 16, terminée le 15/10/2026 : 918 → 156 lignes) | Un seul parent (`ReelResult.tsx`) ; le rendu MP4 en dernier. |
| 13 ✅ | `deep-diagnostic/index.ts` (fiche 12, découpage terminé le 15/10/2026 : 1 084 → 195 lignes ; lot 7 de comportement à part) | 12 corrections sur 20 commits : contrat du handler et snapshots des prompts avant tout. |
| 14 | `use-content-generator.ts`, `CreerStepResult.tsx`, `CalendarPostDialog.tsx` (fiches 17, 11, 13) | **Après la fin de la fiche 1** (lot J de `CreerUnifie`) : ces trois fichiers sont branchés sur /creer, et `CalendarPostDialog` porte le lien calendrier → /creer. |

Règles valables pour chaque PR de découpage :
- un lot = une PR, code déplacé à l'identique, le fichier d'origine réexporte ;
- les tests du lot sont posés dans une PR **précédente** et sont verts avant
  et après le déplacement ;
- `npm test`, `npm run test:edges` et `npx tsc --noEmit -p tsconfig.app.json`
  verts ; seuls les snapshots du fichier visé ont le droit de changer ;
- après la fusion, `node scripts/cliquet-dette.mjs --update` pour verrouiller
  les lignes gagnées ;
- mettre à jour `docs/creation-contenu/CARTE.md` et ce document dans la même PR.

## 4. Le cliquet anti-dette (lot G1)

En attendant les découpages, les gros fichiers ne doivent plus grossir.

- **Référence** : `scripts/cliquet-dette.baseline.json` : pour chaque fichier
  de plus de 800 lignes du périmètre ci-dessus (47 au 14/10/2026), sa taille et
  son nombre de `as any` / `: any` (1 199 au total).
- **En CI** (job `build-and-test`, juste après knip) :
  `node scripts/cliquet-dette.mjs` échoue si un fichier de la référence grossit
  ou gagne un `any`, ou si un nouveau fichier dépasse 800 lignes. Le message dit
  quoi faire.
- **Que faire si la CI est rouge** :
  1. de préférence, mettre le code ajouté dans un fichier à part, importé par le
     gros fichier (un fichier = une mission) ;
  2. seulement si la hausse est voulue (ou si le fichier a juste été renommé
     ou déplacé) : `node scripts/cliquet-dette.mjs --update --accepter-hausse`,
     puis committer le `.json` avec le code. La hausse se voit dans le diff.
- **Un fichier a maigri** : `node scripts/cliquet-dette.mjs --update` fait
  baisser la référence. Cette commande ne fait **jamais** monter un chiffre.
- **Après un chantier Lovable** : `bash scripts/verif-post-lovable.sh`,
  section 8.
- Tests : `src/test/cliquet-dette.test.ts`.
