import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { savePhotos } from "@/hooks/use-flow-persistence";
import { AURIANA_DEMO_SUBJECT, AURIANA_DEMO_FLOW } from "@/lib/demo-auriana-data";

type CarouselSubMode = "text" | "photo" | "mix" | "pure_photo" | "user_slides";

interface FormatNextOptions {
  carouselSubMode?: CarouselSubMode;
  photos?: any[];
  photoDescription?: string;
  photoMode?: boolean;
  overrideSubject?: string;
  linkedinCarousel?: boolean;
  photoDump?: boolean;
  textFirstMix?: boolean;
  slideLength?: "auto" | "short" | "classic";
}

interface UseFormatNextParams {
  loadingQuestions: boolean;
  generating: boolean;
  structureLoading: boolean;
  isDemoMode: boolean;
  demoData: any;
  ideaText: string;
  editorialAngle: string | null;
  existingCalendarContent: string | null;
  aurianaDemoActive: boolean;
  carouselSubMode: CarouselSubMode | null;
  uploadedPhotos: any[];
  photoDescription: string;
  photoMode: boolean;
  newsjackingContext: string | null;
  isLinkedInCarousel: boolean;
  objective: string | null;
  session: { user: { id?: string } };
  workspaceId: string;
  photoDumpDoneRef: React.MutableRefObject<boolean>;
  setSlideLength: (length: "auto" | "short" | "classic") => void;
  setExplicitTextFirstMix: (value: boolean) => void;
  setPhotoDumpEnabled: (value: boolean) => void;
  setSelectedFormat: (format: string | null) => void;
  setEditorialAngle: (angle: string | null) => void;
  setPinterestData: (data: any) => void;
  setCarouselSubMode: (mode: CarouselSubMode) => void;
  setUploadedPhotos: (photos: any[]) => void;
  setPhotoDescription: (desc: string) => void;
  setPhotoMode: (mode: boolean) => void;
  setStep: (step: any) => void;
  setDemoGenerating: (value: boolean) => void;
  setResult: (result: any) => void;
  setInspirationImageBase64: (value: string | null) => void;
  setInspirationImagePreview: (value: string | null) => void;
  setInspirationAnalysis: (value: any) => void;
  setInspirationProposals: (value: any[]) => void;
  setInspirationLoading: (value: boolean) => void;
  setQuestions: (questions: any) => void;
  resetGenerator: () => void;
  generateQuestions: (args: any) => Promise<any>;
  handleLaunchSequence: (format: string, angle: string) => Promise<void>;
}

/**
 * Étape "format" → "questions" (ou raccourcis directs vers d'autres étapes
 * selon le format choisi : "mes slides", inspiration Pinterest, lancement).
 * Prépare tout l'état que `doGenerate` lira ensuite — la relation entre les
 * deux passe par du state React committé, pas par un appel direct : à
 * traiter avec précaution si ce state venait à changer de forme.
 *
 * Retourne `{ handleFormatNext }`.
 */
export function useFormatNext({
  loadingQuestions,
  generating,
  structureLoading,
  isDemoMode,
  demoData,
  ideaText,
  editorialAngle,
  existingCalendarContent,
  aurianaDemoActive,
  carouselSubMode,
  uploadedPhotos,
  photoDescription,
  photoMode,
  newsjackingContext,
  isLinkedInCarousel,
  objective,
  session,
  workspaceId,
  photoDumpDoneRef,
  setSlideLength,
  setExplicitTextFirstMix,
  setPhotoDumpEnabled,
  setSelectedFormat,
  setEditorialAngle,
  setPinterestData,
  setCarouselSubMode,
  setUploadedPhotos,
  setPhotoDescription,
  setPhotoMode,
  setStep,
  setDemoGenerating,
  setResult,
  setInspirationImageBase64,
  setInspirationImagePreview,
  setInspirationAnalysis,
  setInspirationProposals,
  setInspirationLoading,
  setQuestions,
  resetGenerator,
  generateQuestions,
  handleLaunchSequence,
}: UseFormatNextParams) {
  const handleFormatNext = async (format: string, angle?: string, options?: FormatNextOptions) => {
    if (loadingQuestions || generating || structureLoading) return; // garde anti double-clic (évite une 2e génération facturée)
    const { carouselSubMode: sub, photos, photoDescription: desc, photoMode: pm, overrideSubject, linkedinCarousel: linkedinCarLocal, photoDump, textFirstMix } = options || {};
    // Toujours resynchroniser (undefined = sous-mode sans choix de longueur,
    // ex. pure_photo — on repasse en "auto" pour ne pas traîner un vieux choix).
    setSlideLength(options?.slideLength ?? "auto");
    // Lot 4 : mémorise le choix explicite « J'écris d'abord » du mixte hors
    // newsjacking (source de vérité de isTextFirstMix avec le contexte actu).
    setExplicitTextFirstMix(!!textFirstMix);
    if (photoDump !== undefined) setPhotoDumpEnabled(photoDump);
    // Nouveau passage par l'étape format = nouveau parcours → le dump peut se re-résoudre.
    photoDumpDoneRef.current = false;

    // Auriana demo account: let the flow continue through all steps (no bypass)

    // Demo mode: si le sujet correspond au pré-fill, afficher instantanément le résultat pré-généré.
    // Sinon, laisser le flow normal continuer vers la vraie génération IA.
    if (isDemoMode) {
      const demo = (demoData as any)?.carousel_photo_demo;
      const isPrefilledSubject = demo && ideaText === demo.subject;
      if (isPrefilledSubject && demo?.result) {
        setSelectedFormat(format);
        setEditorialAngle(angle || null);
        if (sub) setCarouselSubMode(sub);
        if (photos) { setUploadedPhotos(photos); if (photos.length > 0) savePhotos(photos); }
        if (desc) setPhotoDescription(desc);
        if (pm !== undefined) setPhotoMode(pm);
        setStep("result");
        setDemoGenerating(true);
        setTimeout(() => {
          setResult({ type: "carousel", raw: demo.result, ...demo.result });
          setDemoGenerating(false);
        }, 2500);
        return;
      }
      // Sinon : ne PAS return, laisser le flow normal continuer (vraie génération IA)
    }

    setSelectedFormat(format);
    // « L'IA choisit l'angle » à l'étape format ne doit pas effacer un angle
    // hérité du coach d'idées : lui seul porte le choix éditorial déjà validé.
    const inheritedAngle = angle || editorialAngle || null;
    setEditorialAngle(inheritedAngle);
    if (format !== "pinterest" && format !== "pinterest_visual") setPinterestData(null);
    if (sub) setCarouselSubMode(sub);
    if (photos) { setUploadedPhotos(photos); if (photos.length > 0) savePhotos(photos); }
    if (desc) setPhotoDescription(desc);
    if (pm !== undefined) setPhotoMode(pm);

    // « Mes slides » : AUCUN appel IA ici — ni proposition de structure, ni
    // questions d'approfondissement, ni express_full. On va directement à
    // l'écran de saisie du texte slide par slide.
    if (format === "carousel" && sub === "user_slides") {
      setStep("user_slides");
      return;
    }

    // Pinterest Inspiration: store image and trigger analysis instead of questions
    if (format === "pinterest_inspiration" && photos && photos.length > 0) {
      const imgBase64 = photos[0].base64;
      if (!imgBase64) {
        toast.error("Image invalide. Réessaie avec une autre capture d'écran.");
        return;
      }
      // Validate image size — cap at ~4MB base64 (≈3MB raw) for reliable API processing
      const base64Size = imgBase64.length;
      if (base64Size > 5_500_000) {
        toast.error("Image trop lourde. Essaie avec une capture d'écran plus petite ou recadrée.");
        return;
      }
      setInspirationImageBase64(imgBase64);
      setInspirationImagePreview(photos[0].preview || photos[0].base64 || null);
      // Launch analysis
      setStep("inspiration_proposals");
      setInspirationAnalysis(null);
      setInspirationProposals([]);
      setInspirationLoading(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-inspiration", {
          body: {
            image_base64: imgBase64,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 180000); // 180s — Claude Opus + vision est lente
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const analysis = data?.result?.analysis || null;
        const proposals = data?.result?.proposals || [];
        if (!analysis && proposals.length === 0) {
          throw new Error("L'IA n'a pas pu analyser cette image. Essaie avec une capture plus nette.");
        }
        setInspirationAnalysis(analysis);
        setInspirationProposals(proposals);
      } catch (e: any) {
        if (handleQuotaError(e)) { setStep("format"); return; }
        const msg = e?.message || "Erreur lors de l'analyse";
        const isTimeout = msg.includes("timeout") || msg.includes("Timeout") || msg.includes("dépassé");
        toast.error(isTimeout
          ? "L'analyse a pris trop de temps. Essaie avec une image plus légère ou réessaie."
          : msg
        );
        setStep("format");
      } finally {
        setInspirationLoading(false);
      }
      return;
    }

    const subjectToUse = overrideSubject || ideaText;
    const enrichedSubject = existingCalendarContent
      ? subjectToUse + "\n\n[Contenu existant à approfondir]\n" + existingCalendarContent
      : subjectToUse;

    if (angle === "lancement") {
      setStep("result");
      await handleLaunchSequence(format, angle);
      return;
    }

    resetGenerator();
    setStep("questions");

    // Auriana demo: inject pre-built questions ONLY if user follows the scripted scenario
    // (carrousel texte, sujet pré-rempli, aucune photo). Sinon → vraie génération IA.
    const isAurianaScript = aurianaDemoActive
      && ideaText === AURIANA_DEMO_SUBJECT
      && (sub || carouselSubMode) === "text"
      && (!photos || photos.length === 0)
      && uploadedPhotos.length === 0;
    if (isAurianaScript) {
      setQuestions(AURIANA_DEMO_FLOW.questions);
      return;
    }

    const photosForQuestions = (photos && photos.length > 0 ? photos : uploadedPhotos);
    const descForQuestions = desc || photoDescription;
    const subModeForQuestions = sub || carouselSubMode;
    const photoModeForQuestions = pm !== undefined ? pm : photoMode;

    // Fallback subject: si l'utilisateur n'a pas tapé de sujet (flow photo),
    // on injecte la description ou un placeholder pour ne jamais envoyer "" à l'IA.
    const safeSubject = enrichedSubject?.trim()
      ? enrichedSubject
      : (descForQuestions?.trim()
          || (photosForQuestions && photosForQuestions.length > 0
                ? "Carrousel basé sur les photos uploadées"
                : ""));

    // Channel: calculé depuis les arguments locaux (pas le state, qui n'est pas
    // encore commit après setSelectedFormat / setIsLinkedInCarousel).
    const channelForQuestions = (format === "linkedin" || linkedinCarLocal || isLinkedInCarousel)
      ? "linkedin"
      : undefined;

    await generateQuestions({
      format,
      subject: safeSubject,
      editorialAngle: inheritedAngle || undefined,
      objective: objective || undefined,
      channel: channelForQuestions,
      photos: photosForQuestions && photosForQuestions.length > 0
        ? photosForQuestions.map((p: any) => ({ base64: p.base64, context: p.context, mimeType: p.mimeType }))
        : undefined,
      photoDescription: descForQuestions || undefined,
      carouselSubMode: subModeForQuestions || undefined,
      photoMode: photoModeForQuestions || undefined,
      newsContext: newsjackingContext || undefined,
    });
  };

  return { handleFormatNext };
}
