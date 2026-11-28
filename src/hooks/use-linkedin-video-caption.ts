import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { tryParseAiJson } from "@/lib/parse-ai-json";
import { applyLinkedInVideoCaption, hasLinkedInVideoCaption, videoScriptSummary } from "@/features/creer/linkedin-video-caption";

interface Params {
  result: any;
  setResult: (updater: (prev: any) => any) => void;
  generating: boolean;
  /** Vidéo LinkedIn : parcours du reel avec le drapeau LinkedIn. */
  active: boolean;
  ideaText: string;
  newsContext?: string | null;
  answers?: Record<string, string> | null;
  editorialAngle: string | null;
  objective: string | null;
  workspaceId: string;
  session: { user?: { id?: string } } | null;
}

/**
 * Légende LinkedIn d'une vidéo (28/11/2026). Jumeau de
 * use-linkedin-carousel-caption : dès qu'un script de vidéo LinkedIn arrive
 * sans légende LinkedIn, on la demande une fois à linkedin-ai. Un échec laisse
 * la marque absente : l'étape « Légende » propose alors de réessayer.
 */
export function useLinkedInVideoCaption({ result, setResult, generating, active, ideaText, newsContext, answers, editorialAngle, objective, workspaceId, session }: Params) {
  const [captionLoading, setCaptionLoading] = useState(false);
  // Texte du script déjà traité : une seule demande par script, même si l'objet change.
  const askedFor = useRef<string | null>(null);
  const inFlight = useRef(false);

  const generate = useCallback(async () => {
    const r: any = result?.raw;
    if (!active || !r || inFlight.current) return;
    const script = videoScriptSummary(r);
    if (!script) return;
    inFlight.current = true;
    askedFor.current = script;
    setCaptionLoading(true);
    try {
      const { data, error: fnError } = await invokeWithTimeout("linkedin-ai", {
        body: {
          action: "caption-for-carousel",
          media_kind: "video",
          subject: ideaText,
          ...(newsContext?.trim() ? { news_context: newsContext.trim().slice(0, 3800) } : {}),
          ...(answers && Object.values(answers).some((v) => typeof v === "string" && v.trim()) ? { deepening_answers: answers } : {}),
          slides_summary: script,
          editorial_angle: editorialAngle || null,
          objective: objective || null,
          workspace_id: workspaceId !== session?.user?.id ? workspaceId : undefined,
        },
      }, 110000);
      if (fnError) throw new Error(fnError.message || "Erreur génération légende");
      if (data?.error) {
        if (handleQuotaError(data)) return;
        throw new Error(data.message || data.error);
      }
      const rawContent = data?.content ?? data;
      const parsed = typeof rawContent === "string" ? tryParseAiJson<any>(rawContent, "linkedin-video-legende") : rawContent;
      if (!parsed || typeof parsed !== "object") throw new Error("Légende illisible");
      if (!applyLinkedInVideoCaption(r, parsed)) throw new Error("Légende vide");
      setResult((prev: any) => {
        // Le script a changé pendant l'attente : cette légende n'est plus la sienne.
        if (!prev?.raw || videoScriptSummary(prev.raw) !== script) return prev;
        const next = applyLinkedInVideoCaption(prev.raw, parsed);
        return next ? { ...prev, raw: next } : prev;
      });
    } catch (e: any) {
      console.error("[linkedin-caption-for-video] failed:", e);
      toast.error(e?.message || "Impossible d'écrire la légende LinkedIn");
    } finally {
      inFlight.current = false;
      setCaptionLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, active, ideaText, newsContext, answers, editorialAngle, objective, workspaceId, session?.user?.id]);

  useEffect(() => {
    if (!active || generating || captionLoading) return;
    const r: any = result?.raw;
    if (!r || hasLinkedInVideoCaption(r)) return;
    const script = videoScriptSummary(r);
    if (!script || askedFor.current === script) return;
    void generate();
  }, [result, active, generating, captionLoading, generate]);

  const regenerateCaption = useCallback(() => { askedFor.current = null; void generate(); }, [generate]);

  return { captionLoading, regenerateCaption };
}
