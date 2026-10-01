import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { userPhotoToBase64, type UserPhotoRow } from "@/lib/photo-storage";
import { studioRequest, type StudioState } from "@/features/visual-studio/api";
import { persistStudioPhoto, readTicket } from "./bridge";
import { carouselStudioStore } from "./store";

export function useCarouselStudioReturn(id: string | null, userId: string, workspaceId: string, sessionId: string | null, isCurrent: () => boolean) {
  const navigate = useNavigate();
  const ticket = readTicket(id, userId, workspaceId);
  const valid = ticket?.sessionId === sessionId ? ticket : null;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function returnToCarousel(version?: StudioState["versions"][number]) {
    if (!valid || lock.current || !isCurrent()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const store = carouselStudioStore(userId, workspaceId, valid.isOwnSpace);
      let raw: any;
      if (version) {
        if (version.status !== "ready") throw new Error("Cette image n’est pas encore prête.");
        const receipt = version.library_photo_id ? { photo_id: version.library_photo_id } : await studioRequest<{ photo_id: string }>({ action: "save", workspace_id: workspaceId, session_id: sessionId, version_id: version.id });
        if (!isCurrent()) return;
        const { data, error: photoError } = await supabase.from("user_photos").select("*").eq("id", receipt.photo_id).eq("workspace_id", workspaceId).single();
        if (photoError || !data) throw new Error("L’image reste dans le Studio. Réessaie son enregistrement.");
        const photo = await userPhotoToBase64(data as unknown as UserPhotoRow);
        if (!isCurrent()) return;
        const source = photo.base64.startsWith("data:") ? photo.base64 : `data:${photo.mimeType};base64,${photo.base64}`;
        // No signed URL is embedded in the durable carousel HTML.
        const guardedStore = { ...store, update: async (...args: Parameters<typeof store.update>) => {
          if (!isCurrent()) throw new Error("L’espace de travail a changé. Reviens dans l’espace du carrousel.");
          return store.update(...args);
        } };
        raw = await persistStudioPhoto(guardedStore, valid, source, receipt.photo_id, version.id);
      } else {
        const row = await store.read(valid.ideaId);
        if (!row) throw new Error("Ce carrousel n’est plus accessible dans cet espace.");
        raw = row.content_data;
      }
      if (!isCurrent()) return;
      const { data: idea, error: ideaError } = await supabase.from("saved_ideas").select("titre,canal").eq("id", valid.ideaId).single();
      if (ideaError) throw ideaError;
      if (!isCurrent()) return;
      navigate(`/creer?${new URLSearchParams({ idea_id: valid.ideaId, canal: idea.canal || "instagram" })}`, {
        state: { ideaId: valid.ideaId, sujet: idea.titre, carouselStudioResume: true, resumeIdea: { raw, format: "carousel" } },
      });
    } catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : "Le retour a échoué. Ton image reste dans le Studio."); }
    finally { lock.current = false; if (isCurrent()) setBusy(false); }
  }
  return { ticket: valid, busy, error, returnToCarousel };
}
