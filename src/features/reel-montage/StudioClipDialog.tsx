// Boîte de dialogue du Studio vidéo ouverte sur un passage du reel (choisir ou
// créer un clip). Sortie de ReelMontage.tsx à l'identique (fiche 16 de
// docs/robustesse/gros-fichiers.md, lot 2). Ne pas changer la forme de
// `draftKey` : un brouillon Studio en cours serait perdu.
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudioVideoPanel } from "@/features/studio-video/StudioVideoPanel";
import type { StudioVideoJob } from "@/features/studio-video/api";
import type { Section } from "./types";

interface StudioClipDialogProps {
  studioTarget: { index: number; create: boolean } | null;
  setStudioTarget: (target: { index: number; create: boolean } | null) => void;
  spoken: Section[];
  workspaceId?: string;
  subject?: string;
  sectionTexts: string[];
  setPendingCutaway: (pending: { index: number; job: StudioVideoJob }) => void;
}

export function StudioClipDialog({ studioTarget, setStudioTarget, spoken, workspaceId, subject, sectionTexts, setPendingCutaway }: StudioClipDialogProps) {
  const { user } = useAuth();
  return (
    <Dialog open={!!studioTarget} onOpenChange={open => { if (!open) setStudioTarget(null); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Studio vidéo · passage {studioTarget ? studioTarget.index + 1 : ""}</DialogTitle>
          <DialogDescription>Le Reel reste ouvert. Le clip créé sera aussi conservé dans le Studio.
            {studioTarget?.create && spoken[studioTarget.index]?.texte_parle &&
              <span className="block mt-2">Phrase à illustrer : « {spoken[studioTarget.index].texte_parle} »</span>}
          </DialogDescription></DialogHeader>
        {studioTarget && workspaceId && <StudioVideoPanel workspaceId={workspaceId} writable={studioTarget.create}
          draftKey={user ? `studio-video:${user.id}:${workspaceId}:reel:${JSON.stringify([subject, sectionTexts, studioTarget.index])}` : undefined}
          showComposer={studioTarget.create} initialPrompt={studioTarget.create && spoken[studioTarget.index]?.texte_parle
            ? `Plan de coupe sans texte à l'écran : montrer concrètement l'idée « ${spoken[studioTarget.index].texte_parle.slice(0, 680)} ». Le plan doit pouvoir se placer sous la voix du Reel.`
            : ""}
          onPickClip={job => { setPendingCutaway({ index: studioTarget.index, job }); setStudioTarget(null); }} />}
      </DialogContent>
    </Dialog>
  );
}
