import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";

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
      setStep("result");
      setPinterestPinHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-visual", {
          body: {
            subject: proposal.subject,
            pin_type: proposal.pin_type,
            reference_image_base64: inspirationImageBase64,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 180000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPinterestPinHtml(r?.pin_html || null);
        setSelectedFormat("pinterest_visual");
        setResult({
          type: "pinterest_visual" as any,
          raw: {
            pin_html: r?.pin_html,
            title: r?.title,
            description: r?.description,
            pin_data: r?.pin_data,
          },
        });
        setIdeaText(proposal.subject);
      } catch (e: any) {
        if (handleQuotaError(e)) markQuotaExhausted(e); // step="result" sans résultat : dire quota, pas « Session expirée »
        else toast.error(e?.message || "Erreur lors de la génération du visuel");
      } finally {
        setPinterestVisualGenerating(false);
      }

    } else {
      // CHEMIN B : brief photo + overlay
      setStep("result");
      setPhotoBriefOverlayHtml(null);
      setPinterestVisualGenerating(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("pinterest-photo-brief", {
          body: {
            subject: proposal.subject,
            reference_image_base64: inspirationImageBase64,
            pin_type: proposal.pin_type,
            brief_hint: proposal.brief,
            pinterest_link: pinterestData?.link,
            pinterest_board: pinterestData?.boardName,
            workspace_id: workspaceId !== session.user.id ? workspaceId : undefined,
          },
        }, 180000);
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        setPhotoBriefOverlayHtml(r?.overlay_html || null);
        setPhotoBriefResult(r);
        setSelectedFormat("pinterest_photo");
        setResult({
          type: "pinterest_photo" as any,
          raw: {
            overlay_html: r?.overlay_html,
            photo_brief: r?.photo_brief,
            title: r?.title,
            description: r?.description,
          },
        });
        setIdeaText(proposal.subject);
      } catch (e: any) {
        if (handleQuotaError(e)) markQuotaExhausted(e); // step="result" sans résultat : dire quota, pas « Session expirée »
        else toast.error(e?.message || "Erreur lors de la génération du brief");
      } finally {
        setPinterestVisualGenerating(false);
      }
    }
  };

  return { handleSelectInspirationProposal };
}
