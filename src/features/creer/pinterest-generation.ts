import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";

/**
 * Génération Pinterest partagée entre les deux points d'entrée du flux /creer :
 * - format choisi directement (`useDoGenerate`, timeout 120 s, image de
 *   référence envoyée seulement si présente) ;
 * - proposition du flux inspiration (`useSelectInspirationProposal`,
 *   timeout 180 s, image de référence toujours envoyée, `beforeSetResult`/
 *   `afterSetResult` pour caler le format et le sujet autour du résultat).
 * Même squelette pour les deux edges : setStep("result") + reset du HTML +
 * loader, appel `invokeWithTimeout`, commit du résultat, quota/toast en
 * erreur, loader coupé en finally.
 */

interface PinterestGenerationContext {
  pinterestData: { link?: string; boardId?: string; boardName?: string } | null;
  workspaceId: string;
  session: { user: { id?: string } };
  markQuotaExhausted: (e: any) => void;
  setStep: (step: any) => void;
  setResult: (result: any) => void;
  setPinterestVisualGenerating: (value: boolean) => void;
}

interface PinterestEdgeCallParams extends PinterestGenerationContext {
  subject: string;
  pinType: string;
  /** Base64 de l'image de référence importée (flux inspiration), sinon null. */
  referenceImageBase64: string | null;
  /**
   * Flux inspiration : `reference_image_base64` est toujours dans le body
   * (même null). Flux direct : le champ est omis quand il n'y a pas d'image.
   */
  alwaysSendReferenceImage: boolean;
  timeoutMs: number;
  /** Appelé juste avant setResult (ex. setSelectedFormat côté inspiration). */
  beforeSetResult?: () => void;
  /** Appelé juste après setResult (ex. setIdeaText côté inspiration). */
  afterSetResult?: () => void;
}

function referenceImageField(params: Pick<PinterestEdgeCallParams, "referenceImageBase64" | "alwaysSendReferenceImage">) {
  if (params.alwaysSendReferenceImage) return { reference_image_base64: params.referenceImageBase64 };
  return params.referenceImageBase64 ? { reference_image_base64: params.referenceImageBase64 } : {};
}

async function runPinterestEdge({
  edgeName,
  body,
  timeoutMs,
  errorFallbackMessage,
  resetHtml,
  onResult,
  ctx,
}: {
  edgeName: "pinterest-visual" | "pinterest-photo-brief";
  body: Record<string, unknown>;
  timeoutMs: number;
  errorFallbackMessage: string;
  resetHtml: () => void;
  onResult: (r: any) => void;
  ctx: PinterestGenerationContext;
}) {
  ctx.setStep("result");
  resetHtml();
  ctx.setPinterestVisualGenerating(true);
  try {
    const { data, error: fnError } = await invokeWithTimeout(edgeName, { body }, timeoutMs);
    if (fnError) throw fnError;
    if (data?.error) throw new Error(data.error);
    onResult(data?.result);
  } catch (e: any) {
    if (handleQuotaError(e)) ctx.markQuotaExhausted(e); // step="result" sans résultat : dire quota, pas « Session expirée »
    else toast.error(e?.message || errorFallbackMessage);
  } finally {
    ctx.setPinterestVisualGenerating(false);
  }
}

export interface GeneratePinterestVisualParams extends PinterestEdgeCallParams {
  /** Les deux appelants n'affichent pas le même message d'échec — préservé tel quel. */
  errorFallbackMessage: string;
  setPinterestPinHtml: (html: string | null) => void;
}

/** Épingle visuelle Pinterest (edge `pinterest-visual`). */
export async function generatePinterestVisual(params: GeneratePinterestVisualParams) {
  const {
    subject,
    pinType,
    timeoutMs,
    errorFallbackMessage,
    setPinterestPinHtml,
    beforeSetResult,
    afterSetResult,
    ...ctx
  } = params;
  await runPinterestEdge({
    edgeName: "pinterest-visual",
    body: {
      subject,
      pin_type: pinType,
      ...referenceImageField(params),
      pinterest_link: ctx.pinterestData?.link,
      pinterest_board: ctx.pinterestData?.boardName,
      workspace_id: ctx.workspaceId !== ctx.session.user.id ? ctx.workspaceId : undefined,
    },
    timeoutMs,
    errorFallbackMessage,
    resetHtml: () => setPinterestPinHtml(null),
    onResult: (r) => {
      setPinterestPinHtml(r?.pin_html || null);
      beforeSetResult?.();
      ctx.setResult({
        type: "pinterest_visual" as any,
        raw: {
          pin_html: r?.pin_html,
          title: r?.title,
          description: r?.description,
          pin_data: r?.pin_data,
        },
      });
      afterSetResult?.();
    },
    ctx,
  });
}

export interface GeneratePinterestPhotoBriefParams extends PinterestEdgeCallParams {
  briefHint: string;
  setPhotoBriefOverlayHtml: (html: string | null) => void;
  setPhotoBriefResult: (result: any) => void;
}

/** Brief photo Pinterest + overlay (edge `pinterest-photo-brief`). */
export async function generatePinterestPhotoBrief(params: GeneratePinterestPhotoBriefParams) {
  const {
    subject,
    pinType,
    briefHint,
    timeoutMs,
    setPhotoBriefOverlayHtml,
    setPhotoBriefResult,
    beforeSetResult,
    afterSetResult,
    ...ctx
  } = params;
  await runPinterestEdge({
    edgeName: "pinterest-photo-brief",
    body: {
      subject,
      ...referenceImageField(params),
      pin_type: pinType,
      brief_hint: briefHint,
      pinterest_link: ctx.pinterestData?.link,
      pinterest_board: ctx.pinterestData?.boardName,
      workspace_id: ctx.workspaceId !== ctx.session.user.id ? ctx.workspaceId : undefined,
    },
    timeoutMs,
    errorFallbackMessage: "Erreur lors de la génération du brief",
    resetHtml: () => setPhotoBriefOverlayHtml(null),
    onResult: (r) => {
      setPhotoBriefOverlayHtml(r?.overlay_html || null);
      setPhotoBriefResult(r);
      beforeSetResult?.();
      ctx.setResult({
        type: "pinterest_photo" as any,
        raw: {
          overlay_html: r?.overlay_html,
          photo_brief: r?.photo_brief,
          title: r?.title,
          description: r?.description,
        },
      });
      afterSetResult?.();
    },
    ctx,
  });
}
