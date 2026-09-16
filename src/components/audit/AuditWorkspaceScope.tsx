import { type ComponentType, useLayoutEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileOwner, useWorkspaceFilter, useWorkspaceReady } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";

/** Account data belongs to the verified owner; the audit itself belongs to its workspace. */
export function AuditWorkspaceScope({ page: Page }: { page: ComponentType }) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  const owner = useProfileOwner();
  if (owner.error) return <div><AppHeader /><main id="main-content" className="mx-auto max-w-3xl p-6"><p role="alert">Impossible de vérifier le propriétaire de cet espace.</p><Button onClick={() => void owner.reload()} className="mt-4">Réessayer</Button></main></div>;
  if (!ready || owner.loading || !owner.userId || !user) return <p role="status" className="p-8">Chargement de l’espace…</p>;
  return <Page key={`${user.id}:${column}:${value}:${owner.userId}`} />;
}

export function useAuditVisit() {
  const owner = useProfileOwner();
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return { ownerUserId: owner.userId, active };
}
