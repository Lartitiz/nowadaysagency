// « Reprendre » un brouillon rangé dans Mes idées (creer-draft-idea.ts) : avant
// d'ouvrir /creer, on remet ce brouillon dans l'onglet (étape, réponses, photos)
// puis la page démarre dessus, exactement comme après un rechargement.
// Le contenu déjà ouvert dans l'onglet passe d'abord par les mêmes règles que
// partout ailleurs : rangé dans Mes idées sans fenêtre quand c'est possible,
// sinon « Tu as déjà un contenu en cours ».
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { clearFlowState, loadFlowState, loadPhotos, loadPhotosLocal, saveFlowState, savePhotos, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";
import { computeDraftConflict } from "@/features/creer/draft-conflict";
import { draftLinkedToIdea, draftMatchesSavedIdea } from "@/features/creer/draft-saved-check";
import { draftToStore } from "@/hooks/use-silent-draft-switch";
import { waitForPendingDraftWrites, writeCreerDraft } from "@/hooks/use-creer-draft-idea";
import { supabase } from "@/integrations/supabase/client";
import DraftConflictDialog from "@/components/creer/DraftConflictDialog";
import type { CreerDraftSnapshot } from "@/features/creer/creer-draft-idea";

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`photo indisponible (${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("photo illisible"));
    reader.readAsDataURL(blob);
  });
}

/** Remet le brouillon de la fiche dans l'onglet. Lève si une photo manque. */
export async function restoreCreerDraft(draft: CreerDraftSnapshot, ideaId: string, workspaceId: string) {
  const photos = await Promise.all(draft.photos.map(async (p) => {
    const { url, ...meta } = p;
    if (!url) return { ...meta }; // photo de la photothèque : relue depuis le serveur
    const base64 = await toDataUrl(url);
    return { ...meta, base64, preview: base64 };
  }));
  clearFlowState();
  saveFlowState({ ...(draft.flow as any), workspaceId, creationId: crypto.randomUUID(), editingIdeaId: ideaId, result: null, editContent: "", visualSlides: [] });
  await savePhotos(photos);
}

export default function DraftResumeGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const workspaceId = useWorkspaceId();
  const state = (location.state as any) || {};
  const resume: CreerDraftSnapshot | null = state.resumeDraft && typeof state.ideaId === "string" ? state.resumeDraft : null;
  const [conflict, setConflict] = useState<ReturnType<typeof computeDraftConflict>>(null);
  const started = useRef(false);

  const open = async () => {
    if (!resume) return;
    try {
      await restoreCreerDraft(resume, state.ideaId, workspaceId);
    } catch (error) {
      console.warn("[draft-resume] brouillon non rouvert", error);
      toast.error("Une photo de ce brouillon n’a pas pu être rechargée. Réessaie dans un instant.");
      navigate("/idees", { replace: true });
      return;
    }
    navigate("/creer", { replace: true, state: null });
  };
  const keepCurrent = () => navigate("/creer", { replace: true, state: null });

  useEffect(() => {
    if (!resume || started.current || !session?.user?.id || !workspaceId) return;
    started.current = true;
    setFlowWorkspaceId(workspaceId);
    (async () => {
      const candidate = loadFlowState();
      const existing = candidate?.workspaceId && candidate.workspaceId !== workspaceId ? null : candidate;
      const found = computeDraftConflict({
        existingFlowState: existing, photoCount: loadPhotos().length, aurianaDemoActive: false, isFreshStart: false,
        paramSujet: "", paramIdeaId: null, paramAuto: false, paramFormat: null, paramCanal: null, locState: state,
      });
      if (!found) {
        // Rien d'autre en cours, ou ce brouillon est déjà celui de l'onglet.
        if (existing?.editingIdeaId === state.ideaId) return keepCurrent();
        return open();
      }
      if (found.replaceSilently) return open();
      let safe = false;
      if (draftToStore(found)) {
        await waitForPendingDraftWrites();
        const ideaId = found.draft.editingIdeaId ?? loadFlowState()?.editingIdeaId ?? null;
        const saved = await writeCreerDraft({
          userId: session.user.id, workspaceId, flowState: { ...found.flow, editingIdeaId: ideaId }, photos: await loadPhotosLocal(), ideaId,
        }).catch(() => null);
        safe = !!saved;
      } else if (draftLinkedToIdea(found.draft)) {
        const { data } = await supabase.from("saved_ideas").select("content_data").eq("id", found.draft.editingIdeaId).maybeSingle();
        safe = await draftMatchesSavedIdea(found.draft, data?.content_data).catch(() => false);
      }
      if (safe) {
        toast("Ton contenu précédent est enregistré dans Mes idées.", { id: "draft-switch-saved" });
        return open();
      }
      setConflict(found);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, session?.user?.id, workspaceId]);

  if (!resume) return <>{children}</>;
  if (conflict) {
    return <DraftConflictDialog open {...conflict} onResume={keepCurrent} onStartNew={() => void open()} />;
  }
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">Ouverture de ton brouillon…</p>
    </div>
  );
}
