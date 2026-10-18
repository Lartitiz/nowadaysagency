// « Refaire cette slide » (chantier AA, 18/10/2026) : ce que l'appli donne à
// l'éditeur (CarouselEditorConnected) pour refaire une slide : l'appel à
// carousel-ai (type slide_redo, 1 crédit débité par le serveur après le dessin),
// les crédits restants et la lecture des photos. L'éditeur lui-même ne lit ni
// le compte ni l'espace de travail : ses tests le rendent sans l'appli.
import { useMemo } from "react";
import { invokeWithHeartbeat } from "@/lib/invoke-with-heartbeat";
import { handleQuotaError } from "@/lib/quota-error-handler";
import { downscalePhotosForVision } from "@/lib/image-vision";
import { isFairUsePlan } from "@/lib/plan-limits";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useAuth } from "@/contexts/AuthContext";
import type { SlideRedoApi } from "@/components/creer/CarouselEditorParts/slide-redo";

const FAILED = "La nouvelle slide n'a pas pu être faite. Rien n'a été débité : réessaie.";

async function toDataUrl(src: string): Promise<string | null> {
  if (src.startsWith("data:image/")) return src;
  const res = await fetch(src);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function useSlideRedoApi(): SlideRedoApi {
  const workspaceId = useWorkspaceId();
  const { user } = useAuth();
  const plan = useUserPlan();
  const total = plan.usage?.total;
  const left = plan.loading || !total || isFairUsePlan(plan.plan, total.limit) ? null : plan.remainingWithBonus();
  const remainingLabel = left === null || !Number.isFinite(left) ? null : `Il te reste ${left} crédit${left > 1 ? "s" : ""} ce mois-ci.`;
  const refresh = plan.refresh;
  return useMemo<SlideRedoApi>(() => ({
    remainingLabel,
    loadPhoto: async (src) => {
      const url = await toDataUrl(src);
      if (!url) return null;
      const [small] = (await downscalePhotosForVision([{ base64: url, mimeType: undefined as string | undefined }], { onUnreadable: () => {} })) || [];
      return small ? { base64: small.base64, mimeType: small.mimeType } : null;
    },
    request: async (body) => {
      const { data, error } = await invokeWithHeartbeat("carousel-ai", {
        body: { ...body, ...(workspaceId && workspaceId !== user?.id ? { workspace_id: workspaceId } : {}) },
      }, 300000);
      if (data?.error === "limit_reached" || data?.quota) {
        handleQuotaError({ data });
        return { data: null, error: "Tes crédits sont épuisés pour ce mois-ci : rien n'a été débité." };
      }
      if (error || data?.error || !data?.slide_html) return { data: null, error: (typeof data?.error === "string" && data.error) || error?.message || FAILED };
      refresh?.();
      return { data, error: null };
    },
  }), [remainingLabel, workspaceId, user?.id, refresh]);
}
