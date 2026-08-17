import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { downscalePhotosForVision } from "@/lib/image-vision";
import { runPhotoDump, PremiumRequiredError } from "@/lib/photo-dump";
import { usePhotoWishlistMutations } from "@/hooks/use-photo-wishlist";
import { savePhotos } from "@/hooks/use-flow-persistence";
import { AURIANA_DEMO_SUBJECT, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";
import { pickNonEmpty } from "@/features/creer/photo-source";
import type { UserPhotoRow } from "@/lib/photo-storage";
import type { ReelHook } from "@/components/creer/HookSelectionStep";
import type { SlideProposal, StructureProposal } from "@/components/creer/StructureReviewStep";
import type { Question } from "@/hooks/use-content-generator";

type CarouselSubMode = "text" | "photo" | "mix" | "pure_photo" | "user_slides" | null;

interface UseDoGenerateParams {
  selectedFormat: string | null;
  generating: boolean;
  structureLoading: boolean;
  streaming: boolean;
  photoDumpResolving: boolean;
  selectedReelHook: ReelHook | null;
  isTextFirstMix: boolean;
  textFirstCatalogRows: UserPhotoRow[];
  textFirstCatalog: any[];
  questions: Question[];
  aurianaDemoActive: boolean;
  ideaText: string;
  carouselSubMode: CarouselSubMode;
  uploadedPhotos: any[];
  isDemoMode: boolean;
  demoData: any;
  existingCalendarContent: string | null;
  objective: string | null;
  editorialAngle: string | null;
  workspaceId: string;
  session: { user: { id?: string } };
  photoMode: boolean;
  photoDescription: string;
  newsjackingContext: string | null;
  pinterestData: { link?: string; boardId?: string; boardName?: string } | null;
  chosenProposal: any;
  inspirationImageBase64: string | null;
  photoDumpEnabled: boolean;
  photoDumpDoneRef: React.MutableRefObject<boolean>;
  textFirstRowsSnapshotRef: React.MutableRefObject<UserPhotoRow[]>;
  generatedWithPhotos: any[];
  structureProposal: StructureProposal | null;
  lastConfirmedStructure: SlideProposal[] | null;
  lastNarrativeThread: string | null;
  slideCountChoice: number | undefined;
  isLinkedInCarousel: boolean;
  qualityMax: boolean;
  libraryPhotosForCasting: UserPhotoRow[] | undefined;
  clearQuotaExhausted: () => void;
  markQuotaExhausted: (e: any) => void;
  setDemoGenerating: (value: boolean) => void;
  setStep: (step: any) => void;
  setResult: (result: any) => void;
  setSavedId: (id: string | null) => void;
  setVisualSlides: (slides: any) => void;
  setCarouselColors: (colors: any) => void;
  setPinterestPinHtml: (html: string | null) => void;
  setPhotoBriefOverlayHtml: (html: string | null) => void;
  setPhotoBriefResult: (result: any) => void;
  generateStream: (args: any) => Promise<any>;
  streamReset: () => void;
  setPinterestVisualGenerating: (value: boolean) => void;
  setPhotoDumpResolving: (value: boolean) => void;
  setPhotoDumpProgress: (progress: any) => void;
  setUploadedPhotos: (photos: any[]) => void;
  setGeneratedWithPhotos: (photos: any[]) => void;
  setStructureLoading: (value: boolean) => void;
  setStructureProposal: (proposal: any) => void;
  generate: (args: any) => Promise<any>;
  handleConfirmStructure: (confirmedSlides: SlideProposal[], proposalOverride?: StructureProposal) => Promise<void>;
}

/**
 * Cœur de la génération de contenu — 6 sous-flux quasi indépendants selon le
 * format/sous-mode choisi : formats texte en streaming, épingle Pinterest
 * visuelle, brief photo Pinterest, photo dump (pure_photo), proposition de
 * structure carrousel photo (délègue à `handleConfirmStructure`),
 * régénération carrousel (structure déjà confirmée), et le chemin direct par
 * défaut. Ne s'enchaîne PAS directement avec `handleGenerateVisuals` :
 * les deux communiquent via le state `result` commité, lu par l'effet
 * d'auto-génération des visuels ailleurs dans le composant.
 *
 * Retourne `{ doGenerate }`.
 */
export function useDoGenerate({
  selectedFormat,
  generating,
  structureLoading,
  streaming,
  photoDumpResolving,
  selectedReelHook,
  isTextFirstMix,
  textFirstCatalogRows,
  textFirstCatalog,
  questions,
  aurianaDemoActive,
  ideaText,
  carouselSubMode,
  uploadedPhotos,
  isDemoMode,
  demoData,
  existingCalendarContent,
  objective,
  editorialAngle,
  workspaceId,
  session,
  photoMode,
  photoDescription,
  newsjackingContext,
  pinterestData,
  chosenProposal,
  inspirationImageBase64,
  photoDumpEnabled,
  photoDumpDoneRef,
  textFirstRowsSnapshotRef,
  generatedWithPhotos,
  structureProposal,
  lastConfirmedStructure,
  lastNarrativeThread,
  slideCountChoice,
  isLinkedInCarousel,
  qualityMax,
  libraryPhotosForCasting,
  clearQuotaExhausted,
  markQuotaExhausted,
  setDemoGenerating,
  setStep,
  setResult,
  setSavedId,
  setVisualSlides,
  setCarouselColors,
  setPinterestPinHtml,
  setPhotoBriefOverlayHtml,
  setPhotoBriefResult,
  generateStream,
  streamReset,
  setPinterestVisualGenerating,
  setPhotoDumpResolving,
  setPhotoDumpProgress,
  setUploadedPhotos,
  setGeneratedWithPhotos,
  setStructureLoading,
  setStructureProposal,
  generate,
  handleConfirmStructure,
}: UseDoGenerateParams) {
  const navigate = useNavigate();
  const { addDirective: addWishlistDirective } = usePhotoWishlistMutations();

  const doGenerate = async (ansInput: Record<string, string>, reelHookOverride?: ReelHook | null) => {
    if (!selectedFormat) return;
    // Hook choisi à l'étape hook_selection : l'override prime (setState async),
    // le state prend le relais pour « Régénérer » (même angle réécrit).
    const reelHook = reelHookOverride !== undefined ? reelHookOverride : selectedReelHook;
    if (generating || structureLoading || streaming || photoDumpResolving) return; // garde anti double-clic / réentrance (évite une 2e génération facturée)
    // Régime texte d'abord : on fige les lignes bibliothèque correspondant au catalogue
    // envoyé, pour résoudre library_photo_index au retour même si la biblio a bougé.
    if (isTextFirstMix) textFirstRowsSnapshotRef.current = textFirstCatalogRows;
    // Les chemins directs (structure carrousel, Pinterest) ne passent pas par
    // generate()/generateStream() qui effacent l'état quota — on l'efface ici
    // pour qu'un ancien « crédits utilisés » ne masque pas une nouvelle tentative.
    clearQuotaExhausted();

    // Les réponses arrivent indexées par ID de question (`q_0`, `q_1`…) car l'IA
    // ne renvoie pas d'`id`. On les ré-indexe par LE TEXTE de la question pour que
    // le moteur de génération reçoive "vraie question → réponse" (et non "q_0 → réponse",
    // qui faisait perdre tout le cadrage des questions au modèle qui rédige).
    // Fallback sur l'ID si une réponse n'a pas de question connue (briefs rechargés).
    const ans: Record<string, string> = (() => {
      const textById = new Map(questions.map((q) => [q.id, q.question]));
      const out: Record<string, string> = {};
      for (const [id, v] of Object.entries(ansInput)) {
        if (!v || !v.trim()) continue;
        out[textById.get(id) || id] = v;
      }
      return out;
    })();

    // Auriana demo account: instant pre-built result ONLY if user followed the scripted path
    // (carrousel texte sur sujet pré-rempli, sans photos). Sinon → vraie génération IA.
    const isAurianaScript = aurianaDemoActive
      && ideaText === AURIANA_DEMO_SUBJECT
      && carouselSubMode === "text"
      && uploadedPhotos.length === 0;
    if (isAurianaScript) {
      setDemoGenerating(true);
      setStep("result");
      const { type: _t, ...demoRest } = AURIANA_DEMO_FLOW.result;
      setTimeout(() => {
        setResult({ type: "carousel" as const, raw: AURIANA_DEMO_FLOW.result, ...demoRest });
        setDemoGenerating(false);
      }, 2500);
      return;
    }

    // Demo mode: simulate generation with pre-built result
    if (isDemoMode) {
      const demo = (demoData as any)?.carousel_photo_demo;
      const isPrefilledSubject = demo && ideaText === demo.subject;

      // Si le sujet correspond au pré-fill → résultat pré-généré (rapide, zéro risque)
      if (isPrefilledSubject && demo?.result) {
        setDemoGenerating(true);
        setStep("result");
        setTimeout(() => {
          setResult({ type: "carousel", raw: demo.result, ...demo.result });
          setDemoGenerating(false);
        }, 2500);
        return;
      }

      // Si le sujet est personnalisé → laisser la génération IA se faire normalement
      // (nécessite une session Supabase active — fonctionne si l'admin est connecté en arrière-plan)
    }
    // Reset post-generation state on new generation
    setSavedId(null);
    setVisualSlides([]);
    setCarouselColors(null);
    setPinterestPinHtml(null);
    setPhotoBriefOverlayHtml(null);
    setPhotoBriefResult(null);
    const enrichedSubject = existingCalendarContent
      ? ideaText + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : ideaText;

    // Newsjacking : ne PAS injecter le bloc actu dans le subject (cap creative-flow.context = 8000).
    // Il voyage dans le champ dédié `newsContext` qui a son propre cap côté edge.

    // Formats texte : utiliser le streaming SSE
    const textFormats = ["post", "linkedin", "newsletter", "pinterest"];
    const isTextFormat = textFormats.includes(selectedFormat);

    if (isTextFormat) {
      streamReset();
      try {
        const generated = await generateStream({
          format: selectedFormat as "post" | "linkedin" | "newsletter" | "pinterest",
          subject: enrichedSubject,
          objective: objective || undefined,
          editorialAngle: editorialAngle || undefined,
          answers: ans,
          workspaceId: workspaceId !== session.user.id ? workspaceId : undefined,
          photoMode: photoMode || undefined,
          photos: photoMode && uploadedPhotos.length > 0 && uploadedPhotos[0]?.base64
            ? uploadedPhotos.slice(0, 10).map((p) => ({
                base64: p.base64,
                mimeType: (p as any).mimeType || "image/jpeg",
                context: p.context,
              }))
            : undefined,
          photoDescription: photoMode ? photoDescription : undefined,
          deepResearch: !!newsjackingContext,
          newsContext: newsjackingContext || undefined,
          pinterestLink: selectedFormat === "pinterest" ? pinterestData?.link : undefined,
          pinterestBoard: selectedFormat === "pinterest" ? pinterestData?.boardName : undefined,
        });

        // generateStream already handles quota errors silently and returns null.
        // If null + not streaming → likely an error or empty result we should surface.
        if (!generated && !streaming) {
          // Demo mode fallback parity with the previous inline behavior
          if (isDemoMode) {
            toast("La génération en direct nécessite un compte connecté. Le résultat pré-généré est disponible avec le sujet par défaut.");
            setStep("format");
            return;
          }
          // Échec (429 « Trop de requêtes », réseau, quota…) : on RESTE à l'étape
          // résultat — son état vide affiche `quotaExhausted` (Voir les plans) ou
          // `error` (🔄 Réessayer) inline, en plus du toast de l'effet global.
          // Un setStep("format") ici renvoyait l'utilisatrice à l'étape 2 sans
          // explication visible (le toast de 4 s était le seul indice).
          return;
        }
      } catch (e: any) {
        // Defensive — generateStream catches its own errors, but keep parity.
        if (handleQuotaError(e)) {
          markQuotaExhausted(e); // step="result" sans résultat : dire quota, pas « Session expirée »
          return;
        }
        if (isDemoMode) {
          toast("La génération en direct nécessite un compte connecté. Le résultat pré-généré est disponible avec le sujet par défaut.");
          setStep("format");
          return;
        }
        toast.error(e?.message || "Erreur lors de la génération");
        return;
      }
      return;
    }

    // Épingle visuelle Pinterest : appel direct (comme carousel mais une seule slide)
    if (selectedFormat === "pinterest_visual") {
      setStep("result");
      setPinterestPinHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const pinType = chosenProposal?.pin_type || editorialAngle || "infographie";
        const { data, error: fnError } = await invokeWithTimeout("pinterest-visual", {
          body: {
            subject: enrichedSubject,
            pin_type: pinType,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            ...(inspirationImageBase64 ? { reference_image_base64: inspirationImageBase64 } : {}),
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 120000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPinterestPinHtml(r?.pin_html || null);
        setResult({
          type: "pinterest_visual" as any,
          raw: {
            pin_html: r?.pin_html,
            title: r?.title,
            description: r?.description,
            pin_data: r?.pin_data,
          },
        });
      } catch (e: any) {
        if (handleQuotaError(e)) markQuotaExhausted(e); // step="result" sans résultat : dire quota, pas « Session expirée »
        else toast.error(e?.message || "Erreur lors de la génération du visuel Pinterest");
      } finally {
        setPinterestVisualGenerating(false);
      }
      return;
    }

    // Brief photo Pinterest : appel direct
    if (selectedFormat === "pinterest_photo") {
      setStep("result");
      setPhotoBriefOverlayHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-photo-brief", {
          body: {
            subject: enrichedSubject,
            ...(inspirationImageBase64 ? { reference_image_base64: inspirationImageBase64 } : {}),
            pin_type: chosenProposal?.pin_type || "photo_lifestyle",
            brief_hint: chosenProposal?.brief || "",
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 120000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPhotoBriefOverlayHtml(r?.overlay_html || null);
        setPhotoBriefResult(r);
        setResult({
          type: "pinterest_photo" as any,
          raw: {
            overlay_html: r?.overlay_html,
            photo_brief: r?.photo_brief,
            title: r?.title,
            description: r?.description,
          },
        });
      } catch (e: any) {
        if (handleQuotaError(e)) markQuotaExhausted(e); // step="result" sans résultat : dire quota, pas « Session expirée »
        else toast.error(e?.message || "Erreur lors de la génération du brief");
      } finally {
        setPinterestVisualGenerating(false);
      }
      return;
    }

    // ── Photo dump (lot 3) : compléter la séquence pure_photo avant carousel-ai ──
    // Toggle ON : photo-dump-plan compose l'arc narratif, puis chaque slide est
    // résolue (bibliothèque → Photoroom → mise en scène → wishlist). Les images
    // résolues remplacent les photos attachées du flux normal, ordre du plan.
    let purePhotoResolved: any[] | null = null;
    let dumpNarrative: string | null = null;
    if (selectedFormat === "carousel" && carouselSubMode === "pure_photo" && photoDumpEnabled && !photoDumpDoneRef.current && !isDemoMode) {
      setStep("result");
      setPhotoDumpResolving(true);
      setPhotoDumpProgress(null);
      try {
        const attachedIds = uploadedPhotos
          .map((p: any) => p.userPhotoId)
          .filter((id: any): id is string => typeof id === "string");
        const dumpSujet = (ideaText.trim() || photoDescription.trim() || "Séquence photo spontanée").slice(0, 600);
        const out = await runPhotoDump({
          sujet: dumpSujet,
          attachedPhotoIds: attachedIds.slice(0, 10),
          workspaceId: workspaceId !== session.user.id ? workspaceId : undefined,
          libraryRows: (libraryPhotosForCasting || []) as UserPhotoRow[],
          onProgress: (thread, items) => setPhotoDumpProgress({ narrativeThread: thread, items }),
          onWishlist: (beat) => addWishlistDirective(beat),
        });
        if (out && out.photos.length > 0) {
          purePhotoResolved = out.photos;
          dumpNarrative = out.narrativeThread || null;
          photoDumpDoneRef.current = true;
          setUploadedPhotos(out.photos);
          setGeneratedWithPhotos(out.photos);
          savePhotos(out.photos);
        }
        // out === null (plan indisponible) ou 0 photo résolue → flux normal
        // avec les photos attachées telles quelles, sans bloquer la création.
      } catch (e: any) {
        if (e instanceof PremiumRequiredError) {
          toast.error("La mise en scène est réservée au plan Premium", {
            description: "Passe en Premium pour compléter tes photo dumps.",
            action: { label: "Voir les plans", onClick: () => navigate("/abonnement") },
          });
          setPhotoDumpResolving(false);
          setPhotoDumpProgress(null);
          setStep("format");
          return;
        }
        // Échec inattendu : le dump est un bonus, on continue avec les photos attachées.
        console.warn("[photo-dump] résolution KO, flux normal:", e?.message || e);
      } finally {
        setPhotoDumpResolving(false);
        setPhotoDumpProgress(null);
      }
    }

    // Un photo dump n'a PAS besoin que carousel-ai VOIE les images : chaque photo
    // est une slide 1:1 sans texte par-dessus (« Photos brutes » = seule la
    // légende est écrite). Lui envoyer les base64 déclenchait une analyse vision
    // Sonnet qui dépassait le timeout de la passerelle (504 → « CORS » côté
    // navigateur, vu au re-test live du 11/07). On lui passe seulement le fil
    // narratif + les beats en TEXTE : légende écrite sans vision, sans timeout.
    // Le rendu garde les vraies photos via l'état (uploadedPhotos).
    let pureDumpDescription: string | null = null;
    if (carouselSubMode === "pure_photo") {
      const beats = (purePhotoResolved ?? uploadedPhotos)
        .map((p: any) => (typeof p.context === "string" ? p.context.trim() : ""))
        .filter((c: string) => c.length > 0);
      const parts = [dumpNarrative?.trim(), beats.join(" · ")].filter(Boolean);
      pureDumpDescription = parts.length > 0 ? parts.join(" ; ").slice(0, 1200) : (photoDescription || null);
    }

    // Formats structurés : appel classique (pas de streaming)
    // Carrousel « photo » (photos en fond + texte par-dessus) : proposer la
    // structure d'abord (sauf si déjà validée) — l'assignation photo→slide y est
    // le seul levier avant génération.
    // Carrousel « mix » : PLUS d'écran structure. On génère directement ; tout
    // (réordonner, ajouter/supprimer une slide, changer son type, swapper la
    // photo, éditer le texte) se règle ensuite sur l'écran résultat, sur le vrai
    // carrousel qu'on voit (CarouselPhotoResult), au lieu d'un plan abstrait.
    // Les carrousels texte vont directement à la génération (pas de structure_review)
    // pure_photo : pas de structure review non plus — le nombre de slides est forcé
    // au nombre de photos uploadées dans le post-process (effet plus bas).
    const usesStructureReview = carouselSubMode === "photo";
    if (selectedFormat === "carousel" && usesStructureReview && !structureProposal && !lastConfirmedStructure) {
      setStructureLoading(true);
      try {
        const structureBody: any = {
          type: "structure_proposal",
          subject: enrichedSubject,
          carousel_type: carouselSubMode || undefined,
          objective: objective || undefined,
          // Longueur : envoyé SEULEMENT si choisie explicitement (puces
          // « Longueur ») — sinon l'edge applique ses cibles adaptatives.
          ...(slideCountChoice ? { slide_count: slideCountChoice } : {}),
          editorial_angle: editorialAngle || undefined,
          deepening_answers: Object.keys(ans).length > 0 ? ans : undefined,
          workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          photo_description: photoDescription || undefined,
          ...(newsjackingContext ? { news_context: newsjackingContext.slice(0, 3800) } : {}),
        };
        // Mode photo : envoyer les photos pour analyse visuelle.
        // Version allégée (~1024px) pour l'analyse uniquement — le rendu/export
        // garde le plein format via uploadedPhotos / generatedWithPhotos.
        if (carouselSubMode === "photo" && uploadedPhotos.length > 0) {
          structureBody.photos = await downscalePhotosForVision(
            uploadedPhotos.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType }))
          );
          // Snapshot pour handleGenerateVisuals (résiste aux resets de state UI)
          setGeneratedWithPhotos(uploadedPhotos);
        }
        const structureTimeout = carouselSubMode === "photo" && uploadedPhotos.length > 0 ? 60000 : 30000;
        const { data, error: fnError } = await invokeWithTimeout("carousel-ai", {
          body: structureBody,
        }, structureTimeout);
        if (fnError) throw fnError;
        // Photos sans rapport avec le sujet : erreur actionnable de l'edge
        // (rien débité). Pas de repli en génération directe — elle verrait les
        // mêmes photos et re-refuserait, en payant un appel de plus.
        if (data?.error === "photo_mismatch") {
          toast.error(data.message, { duration: 12000 });
          setStep("format");
          return;
        }
        if (data?.error) throw new Error(data.message || data.error);
        if (data?.result) {
          // Plus d'écran de review en mode photo (comme le mode mix) : on
          // auto-valide la proposition de l'IA et on enchaîne direct sur la
          // génération. L'utilisatrice ajuste ensuite sur le VRAI carrousel
          // (réordonner, swapper une photo, éditer le texte) plutôt que sur un
          // plan abstrait. L'analyse vision + la répartition des photos + le
          // garde photo_mismatch ci-dessus sont conservés.
          setStructureProposal(data.result);
          // Coupe le loader "structure" avant d'enchaîner : sinon il cohabiterait
          // avec le loader de génération sur l'écran result (double loader).
          setStructureLoading(false);
          await handleConfirmStructure(data.result.slides, data.result);
        } else {
          throw new Error("Structure non reçue");
        }
      } catch (e: any) {
        if (isDemoMode) {
          toast("La génération en direct nécessite un compte connecté. Le résultat pré-généré est disponible avec le sujet par défaut.");
          setStep("format");
          return;
        }
        if (handleQuotaError(e)) {
          // Quota tombé sur la proposition de structure : step est déjà "result"
          // → sans marquage, l'écran derrière le mur quota dirait « Session expirée ».
          markQuotaExhausted(e);
        } else {
          toast.error("Erreur lors de la proposition de structure. Génération directe...");
          await generate({
            format: selectedFormat as any,
            subject: enrichedSubject,
            objective: objective || undefined,
            editorialAngle: editorialAngle || undefined,
            answers: Object.keys(ans).length > 0 ? ans : undefined,
            channel: isLinkedInCarousel ? "linkedin" : undefined,
            slideCount: slideCountChoice,
            ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription } : {}),
            ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context, mimeType: p.mimeType, userPhotoId: p.userPhotoId })) : undefined, photoDescription } : {}),
            ...(qualityMax ? { qualityMax: true } : {}),
            ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
          });
        }
      } finally {
        setStructureLoading(false);
      }
      return;
    }

    // Régénération carrousel : réutiliser la dernière structure confirmée
    if (selectedFormat === "carousel" && lastConfirmedStructure) {
      setStep("result");
      // Même repli que les visuels : après une génération, uploadedPhotos peut avoir
      // été reset (re-render, onglet) alors que le snapshot tient encore les photos.
      const regenPhotos = pickNonEmpty(uploadedPhotos, generatedWithPhotos);
      await generate({
        format: "carousel",
        subject: enrichedSubject,
        objective: objective || undefined,
        editorialAngle: editorialAngle || undefined,
        answers: Object.keys(ans).length > 0 ? ans : undefined,
        channel: isLinkedInCarousel ? "linkedin" : undefined,
        slideCount: slideCountChoice,
        confirmedStructure: lastConfirmedStructure,
        ...(lastNarrativeThread ? { narrativeThread: lastNarrativeThread } : {}),
        ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: regenPhotos.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription } : {}),
        ...(carouselSubMode === "mix"
        ? (isTextFirstMix
            ? { carouselType: "mix", textFirst: true, ...(textFirstCatalog.length > 0 ? { photoCatalog: textFirstCatalog } : {}) }
            : { carouselType: "mix", photos: regenPhotos.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription })
        : {}),
        // pure_photo : les photos résolues par le dump priment (setState async → variable locale)
        ...(carouselSubMode === "pure_photo" ? { carouselType: "photo", carouselSubMode: "pure_photo", photoDescription: pureDumpDescription ?? photoDescription } : {}),
        ...(photoMode ? { photoMode: true, photos: regenPhotos.length > 0 ? regenPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context, mimeType: p.mimeType, userPhotoId: p.userPhotoId })) : undefined, photoDescription } : {}),
        ...(qualityMax ? { qualityMax: true } : {}),
        ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
      });
      return;
    }

    // Sécurité : s'assurer qu'on est bien sur l'étape result avant de lancer la génération
    setStep("result");

    await generate({
      format: selectedFormat as any,
      subject: enrichedSubject,
      objective: objective || undefined,
      editorialAngle: editorialAngle || undefined,
      answers: Object.keys(ans).length > 0 ? ans : undefined,
      channel: isLinkedInCarousel ? "linkedin" : undefined,
      slideCount: slideCountChoice,
      ...(selectedFormat === "reel" && reelHook ? { selectedHook: reelHook } : {}),
      ...(carouselSubMode === "photo" ? { carouselType: "photo", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription } : {}),
      ...(carouselSubMode === "mix"
        ? (isTextFirstMix
            ? { carouselType: "mix", textFirst: true, ...(textFirstCatalog.length > 0 ? { photoCatalog: textFirstCatalog } : {}) }
            : { carouselType: "mix", photos: uploadedPhotos.map(p => ({ base64: p.base64, context: p.context, mimeType: p.mimeType })), photoDescription })
        : {}),
      // pure_photo : les photos résolues par le dump priment (setState async → variable locale)
      ...(carouselSubMode === "pure_photo" ? { carouselType: "photo", carouselSubMode: "pure_photo", photoDescription: pureDumpDescription ?? photoDescription } : {}),
      ...(photoMode ? { photoMode: true, photos: uploadedPhotos.length > 0 ? uploadedPhotos.slice(0, 10).map((p) => ({ base64: p.base64, context: p.context, mimeType: p.mimeType, userPhotoId: p.userPhotoId })) : undefined, photoDescription } : {}),
      ...(qualityMax ? { qualityMax: true } : {}),
      ...(newsjackingContext ? { newsContext: newsjackingContext } : {}),
    });
  };

  return { doGenerate };
}
