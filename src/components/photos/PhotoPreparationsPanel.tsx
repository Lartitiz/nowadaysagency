import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPhotoWorkflows, type PhotoWorkflowRow } from "@/lib/photo-workflows";

/** Saved recipes, not a second copy of the photo library. */
export function PhotoPreparationsPanel({ workspaceId, onResume }: {
  workspaceId: string; onResume: (row: PhotoWorkflowRow) => void;
}) {
  const [rows, setRows] = useState<PhotoWorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setRows([]);
    listPhotoWorkflows(workspaceId, "preparation").then(data => {
      if (!cancelled) setRows(data);
    }).catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, attempt]);
  if (loading) return <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des préparations…</p>;
  if (error) return <div role="alert" className="rounded-xl border p-6 space-y-3"><p>Impossible de retrouver tes préparations pour le moment.</p><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Réessayer</Button></div>;
  return <section className="max-w-3xl space-y-5">
    <div><h2 className="font-display text-2xl">Reprendre là où tu en étais</h2><p className="mt-2 text-sm text-muted-foreground">Tes réglages, tes formats et les versions déjà enregistrées sont conservés.</p></div>
    {rows.length ? <ul className="divide-y rounded-xl border bg-card px-4">{rows.map(row => <li key={row.id}>
      <button type="button" onClick={() => onResume(row)} className="flex min-h-20 w-full items-center gap-4 py-4 text-left hover:text-primary">
        <FolderOpen className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block break-words font-medium">{row.name}</span><span className="text-xs text-muted-foreground">Préparation enregistrée</span></span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
      </button>
    </li>)}</ul> : <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Aucune préparation enregistrée. Choisis une photo dans Mes photos, puis prépare son format ou son décor.</p>}
  </section>;
}
