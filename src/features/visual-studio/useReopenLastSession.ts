// Revenir au Studio (/photos/studio sans session) rouvre la dernière session
// non archivée de l'espace, là où on l'avait laissée. « Commencer une nouvelle
// session » ajoute `?new=1` pour ouvrir une discussion vide. On n'ouvre rien
// d'autre si une photo, un retour de carrousel ou une demande en cours de
// frappe sont déjà là.
import { useEffect, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { draftKey, listStudioSessions, readDraft } from "@/features/visual-studio/api";

export function shouldReopenLastSession(params: URLSearchParams, pendingDraft: string) {
  if (params.get("session") || params.get("photo") || params.get("new")) return false;
  if (params.get("carousel_return") || params.get("tab") === "video") return false;
  return !pendingDraft.trim();
}

export function useReopenLastSession({
  params,
  userId,
  workspaceId,
  navigate,
  studioPath,
}: {
  params: URLSearchParams;
  userId: string;
  workspaceId: string;
  navigate: NavigateFunction;
  studioPath: (id?: string) => string;
}) {
  const wanted = shouldReopenLastSession(params, readDraft(draftKey(userId, workspaceId, "new")));
  const [checking, setChecking] = useState(wanted);
  useEffect(() => {
    if (!wanted) { setChecking(false); return; }
    let alive = true;
    setChecking(true);
    listStudioSessions(workspaceId)
      .then(({ active }) => {
        if (alive && active[0]) navigate(studioPath(active[0].id), { replace: true });
      })
      .catch(() => { /* Sans la liste, on reste sur une discussion vide. */ })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, workspaceId]);
  return checking;
}
