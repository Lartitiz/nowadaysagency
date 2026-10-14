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

**Avancement (14/10/2026)** : lot T fait (`_shared/format-briefs_snapshot_test.ts`, 104 cas + liste des exports). Lot 1 fait : `common.ts`, `carousel.ts`, `pinterest.ts`, `newsletter.ts`, `caption.ts`, `photo-caption.ts`, `position.ts` déplacés à l'identique, sommaire en `export *` (sans `common.ts`, qui reste interne), frontières dans `_shared/format-briefs/boundaries_test.ts`. `format-briefs.ts` : 1 273 → 976 lignes. Lot 2 fait : `linkedin.ts` (`linkedinBrief`, avec ses imports `copywriting-prompts.ts` et `VOIX_ORALE_LINKEDIN`) ; 976 → 941 lignes. Lot 3 fait : `reel.ts` (`ReelBriefParams`, `reelBrief`) ; `angle-families_test.ts` lit `reel_structures` dans `format-briefs/reel.ts` ; 941 → 430 lignes. Lot 4 fait : `stories.ts` (`StoriesBriefParams`, `storiesAddressLines`, `getStoriesVenteInstructions` non exporté, `storiesBrief`) ; `angle-families_test.ts` lit ses 3 listes stories dans `format-briefs/stories.ts` ; `format-briefs.ts` n'est plus qu'un sommaire de 18 lignes. Reste : lot 5 (`SOCLE_CHEMINS` et `origines` de `socle.ts`, table par format dans `impact-creation.mjs`).

---

## 3. Par où commencer

Chaque fiche donne l'ordre **à l'intérieur** d'un fichier. Entre les fichiers,
l'ordre conseillé va du plus sûr au plus risqué, et évite les chantiers en
cours :

| Ordre | Fichier | Pourquoi à ce moment-là |
|---|---|---|
| 0 | `scripts/impact-creation.mjs` | Avant tout découpage d'un module partagé : faire calculer la zone (rouge / orange / verte) sur le premier segment du nom, sinon le rapport de CI annonce « zone verte » pour `redac-gate/numbers` (voir « Pièges communs »). |
| 1 | `_shared/format-briefs.ts` (fiche 10) | Risque faible : un seul appelant serveur (creative-flow), des fonctions pures. Bon premier essai de la méthode. |
| 2 | `_shared/correction-pass.ts` (fiche 9) | Le plus fort taux de corrections ; les prompts de correction ne sont figés nulle part : poser les snapshots d'abord. |
| 3 | `creative-flow/index.ts` (fiche 3) | Suite logique du lot 3 du 13/10, mêmes tests de contrat déjà en place. |
| 4 | `_shared/redac-gate.ts` (fiche 7) | Zone orange (9 fonctions) : après correction-pass, dont il dépend. |
| 5 | `carousel-ai/index.ts` (fiche 2) | Très modifié ; un contrat du handler à poser d'abord, comme pour creative-flow. |
| 6 | Studio visuel, serveur puis page (fiches 5 et 4) | Indépendant de la création de contenu : peut avancer en parallèle des lignes 1 à 5. |
| 7 | `carousel-visual/index.ts` (fiche 6) | Après la fusion du chantier en cours sur le contrat `data-*`. |
| 8 | `src/pages/CreerUnifie.tsx` (fiche 1) | Le plus risqué : commencer par le lot A (tests seuls), puis l'affichage pur, et garder l'arrivée depuis le calendrier pour la fin. Pas de session Lovable ouverte sur /creer pendant ces PR. |

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
