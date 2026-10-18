// Fenêtre « Mes sessions Studio » : sessions actives et archivées de l'espace,
// archivage, restauration, nouvelle session. Fiche 4 de
// docs/robustesse/gros-fichiers.md, lot 2 : JSX déplacé à l'identique depuis
// src/pages/VisualStudioPage.tsx. L'archivage reste dans la page (le bandeau
// « session archivée » l'utilise aussi).
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { listStudioSessions } from "@/features/visual-studio/api";

export function StudioSessionsDialog({
  open,
  onOpenChange,
  workspaceName,
  sessions,
  roleWritable,
  sessionAction,
  onArchive,
  onOpenSession,
  onNewSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  sessions: UseQueryResult<Awaited<ReturnType<typeof listStudioSessions>>, Error>;
  roleWritable: boolean;
  sessionAction: string | null;
  onArchive: (id: string, revision: number, archive: boolean) => Promise<void> | void;
  onOpenSession: (id: string) => void;
  onNewSession: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mes sessions Studio</DialogTitle>
          <DialogDescription>
            Les échanges et versions de{" "}
            {workspaceName}. Chaque image créée est rangée toute seule dans Mes photos.
          </DialogDescription>
        </DialogHeader>
        {sessions.isLoading
          ? <p>Chargement…</p>
          : sessions.error
          ? (
            <div role="alert">
              {sessions.error.message}
              <Button variant="ghost" onClick={() => void sessions.refetch()}>
                Réessayer
              </Button>
            </div>
          )
          : sessions.data && (sessions.data.active.length || sessions.data.archived.length)
          ? (
            <div className="max-h-[55vh] overflow-y-auto space-y-2">
              {sessions.data.active.map((s) => (
                <div key={s.id} className="flex gap-2">
                  <Button variant="outline" className="min-w-0 flex-1 justify-start overflow-hidden text-ellipsis"
                    onClick={() => { onOpenChange(false); onOpenSession(s.id); }}>
                    {s.name}
                  </Button>
                  {roleWritable && (
                    <Button type="button" variant="ghost" disabled={!!sessionAction}
                      aria-label={`Archiver ${s.name}`}
                      onClick={() => void onArchive(s.id, s.revision, true)}>
                      Archiver
                    </Button>
                  )}
                </div>
              ))}
              {!!sessions.data.archived.length && (
                <h3 className="pt-3 text-sm font-medium">Sessions archivées</h3>
              )}
              {sessions.data.archived.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {roleWritable && (
                    <Button type="button" variant="outline" disabled={!!sessionAction}
                      aria-label={`Restaurer ${s.name}`}
                      onClick={() => void onArchive(s.id, s.revision, false)}>
                      Restaurer
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )
          : <p>Pas encore de session dans cet espace.</p>}
        <Button
          onClick={() => {
            onOpenChange(false);
            onNewSession();
          }}
        >
          Commencer une nouvelle session
        </Button>
      </DialogContent>
    </Dialog>
  );
}
