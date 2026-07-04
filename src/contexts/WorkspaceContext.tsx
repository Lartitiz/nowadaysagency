import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pickActiveWorkspace } from "@/lib/workspace-select";

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  avatar_url: string | null;
  plan: string;
}

export interface WorkspaceContextType {
  activeWorkspace: Workspace | null;
  /** L'espace dont l'utilisateur·ice est `owner` (le sien propre), s'il existe.
   *  À utiliser pour « revenir à mon espace » / défaut, JAMAIS `workspaces[0]`
   *  qui est arbitraire (un·e admin est membre d'espaces clients). */
  ownWorkspace: Workspace | null;
  workspaces: Workspace[];
  activeRole: "owner" | "manager" | "editor" | "viewer";
  /** Résout à true si le changement d'espace a réussi — les appelants ne doivent naviguer que dans ce cas. */
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  isMultiWorkspace: boolean;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const LS_KEY = "active_workspace_id";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [ownWorkspace, setOwnWorkspace] = useState<Workspace | null>(null);
  const [activeRole, setActiveRole] = useState<"owner" | "manager" | "editor" | "viewer">("owner");
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Fetch workspaces
  useEffect(() => {
    if (!user?.id) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setOwnWorkspace(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("workspace_members")
        .select("role, workspaces:workspace_id(id, name, slug, avatar_url, plan)")
        .eq("user_id", user!.id);

      if (cancelled) return;

      if (error || !data) {
        console.error("Failed to load workspaces:", error);
        setLoading(false);
        return;
      }

      const loaded: (Workspace & { _role: string })[] = [];
      for (const row of data) {
        const ws = row.workspaces as any;
        if (ws) {
          loaded.push({ ...ws, _role: row.role });
        }
      }

      setWorkspaces(loaded.map(({ _role, ...ws }) => ws));

      // L'espace « propre » = celui dont on est `owner`. Sert de défaut et de
      // cible pour « revenir à mon espace ».
      const ownEntry = loaded.find((w) => w._role === "owner");
      setOwnWorkspace(ownEntry ? (({ _role, ...ws }) => ws)(ownEntry) : null);

      // Espace actif : choix persisté > espace propre (owner) > premier. Cf bug QA.
      const selected = pickActiveWorkspace(loaded, localStorage.getItem(LS_KEY));

      if (selected) {
        const { _role, ...ws } = selected;
        setActiveWorkspace(ws);
        setActiveRole(_role as any);
        localStorage.setItem(LS_KEY, ws.id);
      } else {
        setActiveWorkspace(null);
      }

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      let found = workspaces.find((w) => w.id === workspaceId);

      if (!found && user?.id) {
        const { data: memberCheck } = await supabase
          .from("workspace_members")
          .select("role, workspaces:workspace_id(id, name, slug, avatar_url, plan)")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!memberCheck) {
          toast.error("Tu n'as pas accès à cet espace.");
          return false;
        }

        const ws = memberCheck.workspaces as any;
        if (ws) {
          found = ws as Workspace;
          setActiveRole(memberCheck.role as any);
          setWorkspaces(prev => {
            if (prev.some(w => w.id === workspaceId)) return prev;
            return [...prev, found!];
          });
        }
      }

      if (!found) {
        toast.error("Espace introuvable.");
        return false;
      }

      setActiveWorkspace(found);
      localStorage.setItem(LS_KEY, workspaceId);
      queryClient.invalidateQueries();

      if (user?.id) {
        const { data: roleData } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (roleData?.role) setActiveRole(roleData.role as any);
      }
      return true;
    },
    [workspaces, user?.id, queryClient],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        ownWorkspace,
        workspaces,
        activeRole,
        switchWorkspace,
        isMultiWorkspace: workspaces.length > 1,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
