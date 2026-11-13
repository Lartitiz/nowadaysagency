import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deletePhotoWorkflow, listPhotoWorkflows, type PhotoWorkflowRow } from "@/lib/photo-workflows";

/** Saved recipes, not a second copy of the photo library. */
export function PhotoPreparationsPanel({ workspaceId, onResume }: {
  workspaceId: string; onResume: (row: PhotoWorkflowRow) => void;
}) {
  const [rows, setRows] = useState<PhotoWorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [toDelete, setToDelete] = useState<PhotoWorkflowRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setRows([]);
    listPhotoWorkflows(workspaceId, "preparation").then(data => {
      if (!cancelled) setRows(data);
    }).catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, attempt]);
  const confirmDelete = async () => {
    const row = toDelete; if (!row) return;
    setDeleting(true);
    try {
      await deletePhotoWorkflow(row.id, workspaceId);
      setRows(list => list.filter(r => r.id !== row.id));
      toast.success("Préparation supprimée. Tes photos enregistrées restent dans Mes photos.");
      setToDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La suppression a échoué. Réessaie dans un instant.");
    } finally { setDeleting(false); }
  };
  if (loading) return <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des préparations…</p>;
  if (error) return <div role="alert" className="rounded-xl border p-6 space-y-3"><p>Impossible de retrouver tes préparations pour le moment.</p><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Réessayer</Button></div>;
  return <section className="max-w-3xl space-y-5">
    <div><h2 className="font-display text-2xl">Reprendre là où tu en étais</h2><p className="mt-2 text-sm text-muted-foreground">Tes réglages, tes formats et les versions déjà enregistrées sont conservés.</p></div>
    {rows.length ? <ul className="divide-y rounded-xl border bg-card px-4">{rows.map(row => <li key={row.id} className="flex items-center gap-2">
      <button type="button" onClick={() => onResume(row)} className="flex min-h-20 min-w-0 flex-1 items-center gap-4 py-4 text-left hover:text-primary">
        <FolderOpen className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block break-words font-medium">{row.name}</span><span className="text-xs text-muted-foreground">Préparation enregistrée</span></span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
      </button>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Supprimer la préparation ${row.name}`} title="Supprimer la préparation" onClick={() => setToDelete(row)}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>)}</ul> : <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Aucune préparation enregistrée. Choisis une photo dans Mes photos, puis prépare son format ou son décor.</p>}
    <AlertDialog open={!!toDelete} onOpenChange={open => { if (!open && !deleting) setToDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette préparation ?</AlertDialogTitle>
          <AlertDialogDescription>
            Tu ne pourras plus reprendre ses réglages. Les photos déjà enregistrées dans Mes photos et les brouillons de ton calendrier restent en place.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={e => { e.preventDefault(); void confirmDelete(); }}>
            {deleting ? "Suppression…" : "Supprimer la préparation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
