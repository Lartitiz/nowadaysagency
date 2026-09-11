import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { listPhotoWorkflows, type PhotoWorkflowRow } from "@/lib/photo-workflows";
import { cleanDirection, type PhotoDirection } from "@/lib/photo-composition";

/** Optional shared directions for the existing staging and seasonal entry points. */
export function PhotoDirectionPicker({ disabled, onChoose }: {
  disabled?: boolean; onChoose: (direction: PhotoDirection) => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id;
  const [rows, setRows] = useState<PhotoWorkflowRow[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false; setRows([]); setError(false);
    if (workspaceId) void listPhotoWorkflows(workspaceId, "direction").then(data => {
      if (!cancelled) setRows(data);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [workspaceId]);
  if (error) return <p className="text-xs text-muted-foreground">Les directions enregistrées sont momentanément indisponibles.</p>;
  if (!rows.length) return null;
  return <label className="block text-xs space-y-1">Réutiliser ma direction visuelle
    <select className="block w-full min-h-10 rounded-md border bg-background px-2" value="" disabled={disabled}
      onChange={e => { const row = rows.find(r => r.id === e.target.value); if (row) onChoose(cleanDirection(row.data)); }}>
      <option value="">Choisir une direction enregistrée…</option>
      {rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </select>
  </label>;
}
