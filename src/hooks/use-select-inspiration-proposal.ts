import { generatePinterestVisual, generatePinterestPhotoBrief } from "@/features/creer/pinterest-generation";

interface UseSelectInspirationProposalParams {
  pinterestVisualGenerating: boolean;
  inspirationImageBase64: string | null;
  pinterestData: { link?: string; boardId?: string; boardName?: string } | null;
  workspaceId: string;
  session: { user: { id?: string } };
  clearQuotaExhausted: () => void;
  markQuotaExhausted: (e: any) => void;
  setChosenProposal: (proposal: any) => void;
  setStep: (step: any) => void;
  setResult: (result: any) => void;
  setSelectedFormat: (format: string | null) => void;
  setIdeaText: (text: string) => void;
  setPinterestPinHtml: (html: string | null) => void;
  setPinterestVisualGenerating: (generating: boolean) => void;
  setPhotoBriefOverlayHtml: (html: string | null) => void;
  setPhotoBriefResult: (result: any) => void;
}

/**
 * Sélection d'une proposition Pinterest (flux "inspiration" — image de
 * référence importée puis proposition IA choisie), en alternative au format
 * pinterest_visual/pinterest_photo choisi directement au step "format".
 * Deux chemins selon `proposal.recommended_output` : visuel de référence
 * (pinterest-visual) ou brief photo + overlay (pinterest-photo-brief).
 *
 * Retourne `{ handleSelectInspirationProposal }`.
 */
export function useSelectInspirationProposal({
  pinterestVisualGenerating,
  inspirationImageBase64,
  pinterestData,
  workspaceId,
  session,
  clearQuotaExhausted,
  markQuotaExhausted,
  setChosenProposal,
  setStep,
  setResult,
  setSelectedFormat,
  setIdeaText,
  setPinterestPinHtml,
  setPinterestVisualGenerating,
  setPhotoBriefOverlayHtml,
  setPhotoBriefResult,
}: UseSelectInspirationProposalParams) {
  const handleSelectInspirationProposal = async (proposal: any) => {
    if (pinterestVisualGenerating) return; // garde anti double-clic (évite une 2e génération facturée)
    clearQuotaExhausted(); // appels directs (hors generate()) : ne pas hériter d'un ancien état quota
    setChosenProposal(proposal);

    if (proposal.recommended_output === "visual") {
      // CHEMIN A : génération visuelle (pinterest-visual avec référence)
      await generatePinterestVisual({
        subject: proposal.subject,
        pinType: proposal.pin_type,
        referenceImageBase64: inspirationImageBase64,
        alwaysSendReferenceImage: true,
        timeoutMs: 180000,
        errorFallbackMessage: "Erreur lors de la génération du visuel",
        pinterestData,
        workspaceId,
        session,
        markQuotaExhausted,
        setStep,
        setResult,
        setPinterestVisualGenerating,
        setPinterestPinHtml,
        beforeSetResult: () => setSelectedFormat("pinterest_visual"),
        afterSetResult: () => setIdeaText(proposal.subject),
      });

    } else {
      // CHEMIN B : brief photo + overlay
      await generatePinterestPhotoBrief({
        subject: proposal.subject,
        pinType: proposal.pin_type,
        briefHint: proposal.brief,
        referenceImageBase64: inspirationImageBase64,
        alwaysSendReferenceImage: true,
        timeoutMs: 180000,
        pinterestData,
        workspaceId,
        session,
        markQuotaExhausted,
        setStep,
        setResult,
        setPinterestVisualGenerating,
        setPhotoBriefOverlayHtml,
        setPhotoBriefResult,
        beforeSetResult: () => setSelectedFormat("pinterest_photo"),
        afterSetResult: () => setIdeaText(proposal.subject),
      });
    }
  };

  return { handleSelectInspirationProposal };
}
