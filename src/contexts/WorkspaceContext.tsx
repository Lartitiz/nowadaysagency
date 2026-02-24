import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  avatar_url: string | null;
  plan: string;
}

export interface WorkspaceContextType {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  activeRole: "owner" | "manager" | "editor" | "viewer";
  switchWorkspace: (workspaceId: string) => void;
  isMultiWorkspace: boolean;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const LS_KEY = "active_workspace_id";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [activeRole, setActiveRole] = useState<"owner" | "manager" | "editor" | "viewer">("owner");
  const [loading, setLoading] = useState(true);

  // Fetch workspaces
  useEffect(() => {
    if (!user?.id) {
      setWorkspaces([]);
      setActiveWorkspace(null);
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

      // Determine active workspace
      const savedId = localStorage.getItem(LS_KEY);
      const saved = loaded.find((w) => w.id === savedId);
      const selected = saved || loaded[0] || null;

      if (selected) {
        const { _role, ...ws } = loaded.find((w) => w.id === selected.id)!;
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
    (workspaceId: string) => {
      const found = workspaces.find((w) => w.id === workspaceId);
      if (!found) return;
      setActiveWorkspace(found);
      localStorage.setItem(LS_KEY, workspaceId);

      // Re-fetch role
      if (!user?.id) return;
      supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.role) setActiveRole(data.role as any);
        });
    },
    [workspaces, user?.id],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
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
