import { setFlowWorkspaceId } from "@/hooks/use-flow-persistence";
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
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

export type WorkspaceRole = "owner" | "manager" | "editor" | "viewer";

const isWorkspaceRole = (role: unknown): role is WorkspaceRole =>
  role === "owner" || role === "manager" || role === "editor" || role === "viewer";

// UUID nul : format valide (les colonnes workspace_id/user_id sont typées uuid,
// un id du genre "demo-workspace" ferait 400 "invalid input syntax for type uuid"
// sur tout hook qui n'a pas encore son propre garde-fou isDemoMode) mais qui ne
// correspond à aucune ligne réelle.
export const DEMO_FAKE_UUID = "00000000-0000-0000-0000-000000000000";

// Espace fictif utilisé en mode démo — aucun appel réseau déclenché par ce
// contexte ; sert aussi de filtre "sans danger" pour les hooks qui lisent
// activeWorkspace.id sans être eux-mêmes conscients du mode démo.
const DEMO_WORKSPACE: Workspace = {
  id: DEMO_FAKE_UUID,
  name: "Espace démo",
  slug: "demo",
  avatar_url: null,
  plan: "binome",
};

export interface WorkspaceContextType {
  activeWorkspace: Workspace | null;
  /** L'espace dont l'utilisateur·ice est `owner` (le sien propre), s'il existe.
   *  À utiliser pour « revenir à mon espace » / défaut, JAMAIS `workspaces[0]`
   *  qui est arbitraire (un·e admin est membre d'espaces clients). */
  ownWorkspace: Workspace | null;
  workspaces: Workspace[];
  /** Null tant que les droits du contexte demandé ne sont pas confirmés. */
  activeRole: WorkspaceRole | null;
  /** Résout à true si le changement d'espace a réussi — les appelants ne doivent naviguer que dans ce cas. */
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  /** Espace en cours de vérification. L'espace actif reste le dernier contexte cohérent jusqu'au succès. */
  switchingWorkspaceId: string | null;
  isMultiWorkspace: boolean;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const LS_KEY = "active_workspace_id";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  // Draft helpers are also read by the home page before opening /creer.
  setFlowWorkspaceId(activeWorkspace?.id || null);
  const [ownWorkspace, setOwnWorkspace] = useState<Workspace | null>(null);
  const [activeRole, setActiveRole] = useState<WorkspaceRole>("owner");
  const [loading, setLoading] = useState(true);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  // Une même génération couvre le chargement initial et les changements : toute
  // réponse d'une génération précédente est ignorée, y compris A → B → C → A.
  const contextRequestId = useRef(0);
  const queryClient = useQueryClient();

  // Fetch workspaces
  useEffect(() => {
    const requestId = ++contextRequestId.current;
    setSwitchingWorkspaceId(null);

    // Mode démo : espace fictif, aucun appel réseau. Sans ce court-circuit,
    // `user` (basculé sur le faux "demo-user" par AuthContext) fait échouer
    // silencieusement le fetch ci-dessous — l'espace réel précédemment chargé
    // reste alors actif en mémoire, et tous les modules qui filtrent par
    // `activeWorkspace.id` continuent de lire les vraies données du workspace
    // de l'utilisateur·ice connecté·e pendant la démo.
    if (isDemoMode) {
      setWorkspaces([DEMO_WORKSPACE]);
      setActiveWorkspace(DEMO_WORKSPACE);
      setOwnWorkspace(DEMO_WORKSPACE);
      setActiveRole("owner");
      setLoading(false);
      return;
    }

    if (!user?.id) {
      setWorkspaces([]);
      setActiveWorkspace(null);
      setOwnWorkspace(null);
      setLoading(false);
      return;
    }

    // Un changement de compte ne doit jamais laisser visibles l'espace ou le
    // rôle du compte précédent pendant la nouvelle lecture (ni après son échec).
    setWorkspaces([]);
    setActiveWorkspace(null);
    setOwnWorkspace(null);

    let cancelled = false;
    const isStale = () => cancelled || requestId !== contextRequestId.current;

    const fetchMemberships = () =>
      supabase
        .from("workspace_members")
        .select("role, workspaces:workspace_id(id, name, slug, avatar_url, plan)")
        .eq("user_id", user!.id);

    const buildLoaded = (rows: any[]): (Workspace & { _role: string })[] => {
      const out: (Workspace & { _role: string })[] = [];
      for (const row of rows) {
        const ws = row.workspaces as any;
        if (ws) out.push({ ...ws, _role: row.role });
      }
      return out;
    };

    async function load(isRetry = false) {
      setLoading(true);

      const { data, error } = await fetchMemberships();

      if (isStale()) return;

      if (error || !data) {
        console.error("Failed to load workspaces:", {
          message: error?.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });

        // Un seul retry après un court délai : couvre le cas d'une requête tirée
        // juste avant qu'un refresh de token en cours ne se termine (course au
        // montage). Si ça échoue encore, on arrête de boucler et on prévient.
        if (!isRetry) {
          await new Promise((r) => setTimeout(r, 1000));
          if (isStale()) return;
          return load(true);
        }

        setLoading(false);
        toast.error("Impossible de charger tes espaces de travail.", {
          description: "Vérifie ta connexion et réessaie.",
          action: { label: "Réessayer", onClick: () => load() },
        });
        return;
      }

      let loaded = buildLoaded(data);

      // SELF-HEAL (bug « Camille » 26/07) : un·e utilisateur·ice authentifié·e
      // doit TOUJOURS avoir son espace `owner`. S'il manque (échec partiel du
      // bootstrap au signup, ou suppression ultérieure de la ligne
      // `workspace_members`), on le recrée via le RPC idempotent
      // `ensure_owner_workspace` au lieu de rester bloqué·e à vie
      // (activeWorkspace=null → section Membres absente, /photos inerte…), puis
      // on relit une fois. Le RPC est auth.uid()-only → aucune escalade.
      if (!loaded.some((w) => w._role === "owner")) {
        console.warn(
          "[workspace] Aucun espace owner pour cet utilisateur — auto-réparation via ensure_owner_workspace…",
        );
        const { error: healErr } = await supabase.rpc("ensure_owner_workspace" as any);
        if (isStale()) return;
        if (healErr) {
          console.error("[workspace] auto-réparation échouée:", healErr);
        } else {
          const retry = await fetchMemberships();
          if (isStale()) return;
          if (!retry.error && retry.data) loaded = buildLoaded(retry.data);
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
        setActiveRole(isWorkspaceRole(_role) ? _role : "viewer");
        localStorage.setItem(LS_KEY, ws.id);
      } else {
        setActiveWorkspace(null);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isDemoMode]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const requestId = ++contextRequestId.current;

      // Mode démo : un seul espace fictif, jamais d'appel réseau.
      if (isDemoMode) return workspaceId === DEMO_WORKSPACE.id;

      if (!user?.id) {
        toast.error("Connecte-toi pour changer d'espace.");
        return false;
      }

      // Revenir au dernier contexte confirmé annule aussi une demande plus
      // ancienne encore en vol, sans refaire une lecture réseau inutile.
      if (workspaceId === activeWorkspace?.id) {
        setSwitchingWorkspaceId(null);
        setLoading(false);
        return true;
      }

      setSwitchingWorkspaceId(workspaceId);
      setLoading(true);

      let found = workspaces.find((w) => w.id === workspaceId);
      let role: WorkspaceRole | null = null;

      if (!found) {
        const { data: memberCheck, error: memberError } = await supabase
          .from("workspace_members")
          .select("role, workspaces:workspace_id(id, name, slug, avatar_url, plan)")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (requestId !== contextRequestId.current) return false;

        if (memberError || !memberCheck || !isWorkspaceRole(memberCheck.role)) {
          setSwitchingWorkspaceId(null);
          setLoading(false);
          if (memberError) {
            console.error("Failed to verify workspace membership:", memberError);
            toast.error("Impossible de vérifier tes droits sur cet espace.", {
              description: "Vérifie ta connexion et réessaie.",
            });
          } else {
            toast.error("Tu n'as pas accès à cet espace.");
          }
          return false;
        }

        const ws = memberCheck.workspaces as any;
        if (!ws) {
          setSwitchingWorkspaceId(null);
          setLoading(false);
          toast.error("Tu n'as pas accès à cet espace.");
          return false;
        }

        found = ws as Workspace;
        role = memberCheck.role;
      } else {
        const { data: roleData, error: roleError } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (requestId !== contextRequestId.current) return false;

        if (roleError || !roleData || !isWorkspaceRole(roleData.role)) {
          setSwitchingWorkspaceId(null);
          setLoading(false);
          if (roleError) console.error("Failed to load workspace role:", roleError);
          toast.error("Impossible de vérifier tes droits sur cet espace.", {
            description: "L'espace actuel reste ouvert. Vérifie ta connexion et réessaie.",
          });
          return false;
        }

        role = roleData.role;
      }

      if (!found) {
        setSwitchingWorkspaceId(null);
        setLoading(false);
        toast.error("Espace introuvable.");
        return false;
      }

      if (requestId !== contextRequestId.current || !role) return false;

      // Publier le contexte complet seulement quand espace ET rôle sont
      // confirmés. React groupe ces mises à jour dans le même rendu.
      setActiveWorkspace(found);
      setActiveRole(role);
      setWorkspaces((previous) => {
        if (previous.some((workspace) => workspace.id === workspaceId)) return previous;
        return [...previous, found!];
      });
      localStorage.setItem(LS_KEY, workspaceId);
      queryClient.invalidateQueries();
      setSwitchingWorkspaceId(null);
      setLoading(false);
      return true;
    },
    [activeWorkspace?.id, workspaces, user?.id, queryClient, isDemoMode],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        activeWorkspace,
        ownWorkspace,
        workspaces,
        // Aucun consommateur ne doit hériter des droits du dernier espace
        // pendant que le prochain rôle est encore inconnu.
        activeRole: loading ? null : activeRole,
        switchWorkspace,
        switchingWorkspaceId,
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
