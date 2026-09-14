import { useEffect, useReducer, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceReady } from "@/hooks/use-workspace-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PinterestTable = "pinterest_profile" | "pinterest_keywords" | "pinterest_boards" | "pinterest_routine" | "pinterest_pins";
export type PinterestRow = { id: string; [key: string]: any };
type Entry = { rows: PinterestRow[]; expected: PinterestRow[]; dirty: boolean; loaded: boolean; loading: boolean; saving: boolean; error: string; ui: Record<string, any>; request?: number; pending?: Promise<boolean> };

/** Drafts live only in this mounted editor, keyed by account, exact scope and month.
 * A failed read never becomes an empty snapshot; a failed save keeps the draft.
 * RPC receipts update their original entry, even after navigation, never another scope.
 */
export function usePinterestEditor(table: PinterestTable, defaults: Record<string, any> | null = null, month: string | null = null) {
  const { user } = useAuth();
  const filter = useWorkspaceFilter();
  const ready = useWorkspaceReady();
  const { activeRole } = useWorkspace();
  const workspaceId = filter.column === "workspace_id" ? filter.value : null;
  const key = JSON.stringify([user?.id, workspaceId, table, month]);
  const cache = useRef(new Map<string, Entry>());
  const account = useRef(user?.id);
  if (account.current !== user?.id) { cache.current.clear(); account.current = user?.id; }
  if (!cache.current.has(key)) cache.current.set(key, { rows: defaults ? [{ id: crypto.randomUUID(), ...defaults }] : [], expected: [], dirty: false, loaded: false, loading: true, saving: false, error: "", ui: {} });
  const entry = cache.current.get(key)!;
  const [, redraw] = useReducer(x => x + 1, 0);
  const current = useRef({ key, visit: 0, mounted: true });
  if (current.current.key !== key) current.current = { key, visit: current.current.visit + 1, mounted: true };
  const visit = current.current.visit;
  const isCurrent = () => current.current.mounted && current.current.key === key && current.current.visit === visit;
  const refresh = () => { if (isCurrent()) redraw(); };
  const canWrite = !!user?.id && ready && (!workspaceId || activeRole === "owner" || activeRole === "manager");
  const scoped = (query: any) => {
    const own = query.eq("user_id", user?.id);
    return workspaceId ? own.eq("workspace_id", workspaceId) : own.is("workspace_id", null);
  };
  const load = async () => {
    if (!ready || !user?.id) return;
    const request = (entry.request || 0) + 1; entry.request = request;
    const isLatest = () => isCurrent() && entry.request === request;
    entry.loading = true; entry.error = ""; refresh();
    // A save started in A must settle before a new visit to A reads its snapshot.
    if (entry.pending) await entry.pending;
    try {
      let query = scoped(supabase.from(table).select("*"));
      if (month) query = query.eq("current_month", month);
      const { data, error } = await query.order(table === "pinterest_boards" ? "sort_order" : "created_at", { ascending: table !== "pinterest_pins" });
      if (!isLatest()) return;
      if (error || !Array.isArray(data)) throw error || new Error("Réponse de lecture incomplète");
      if (defaults && data.length > 1) throw new Error("Plusieurs fiches existent. Elles sont conservées ; la sauvegarde est suspendue.");
      if (!entry.dirty) {
        entry.expected = data;
        entry.rows = data.length || !defaults ? data : [{ id: entry.rows[0]?.id || crypto.randomUUID(), ...defaults }];
      }
      entry.loaded = true;
    } catch (error) {
      if (isLatest()) { entry.loaded = false; entry.error = error instanceof Error ? error.message : "Impossible de charger les données Pinterest. Réessaie."; }
    } finally { if (isLatest()) { entry.loading = false; refresh(); } }
  };
  useEffect(() => { current.current.mounted = true; void load(); return () => { current.current.mounted = false; }; }, [key, ready]); // exact scope, never owner fallback
  const setRows = (next: PinterestRow[] | ((rows: PinterestRow[]) => PinterestRow[])) => {
    if (!isCurrent() || entry.saving) return;
    entry.rows = typeof next === "function" ? next(entry.rows) : next;
    entry.dirty = true; refresh();
  };
  const save = async (next = entry.rows, success = "✅ Sauvegardé !") => {
    if (!isCurrent() || !canWrite || !entry.loaded || entry.loading || entry.saving) return false;
    entry.rows = next; entry.dirty = true; entry.saving = true; entry.error = ""; refresh();
    const operation = (async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("save_pinterest_editor", {
          p_table: table, p_workspace_id: workspaceId, p_month: month, p_expected: entry.expected, p_rows: next,
        });
        if (error) throw error;
        if (!Array.isArray(data) || data.length !== next.length || next.some(row => !data.some(saved => saved.id === row.id))) throw new Error("La sauvegarde n’a pas confirmé toutes les lignes. Ton brouillon est conservé.");
        entry.expected = data; entry.rows = data; entry.dirty = false;
        if (isCurrent() && success) toast.success(success);
        return true;
      } catch (error) {
        entry.error = typeof (error as any)?.message === "string" ? (error as any).message : "Sauvegarde impossible. Ton brouillon est conservé.";
        if (isCurrent()) toast.error("Sauvegarde impossible", { description: entry.error });
        return false;
      } finally { entry.saving = false; entry.pending = undefined; refresh(); }
    })();
    entry.pending = operation;
    return operation;
  };
  return { rows: entry.rows, confirmedRows: entry.expected, setRows, save, load, scoped, workspaceId, isCurrent, key: `${key}:${visit}`, canWrite, disabled: !canWrite || !entry.loaded || entry.loading || entry.saving, loading: entry.loading || !ready, saving: entry.saving, error: entry.error, dirty: entry.dirty, ui: entry.ui, refresh };
}

/** UI drafts (pin brief and generated alternatives) share the editor's exact scope. */
export function usePinterestUi<T>(editor: ReturnType<typeof usePinterestEditor>, name: string, initial: T): [T, (next: T | ((value: T) => T)) => void] {
  const value = name in editor.ui ? editor.ui[name] as T : initial;
  return [value, (next) => {
    if (!editor.isCurrent()) return;
    editor.ui[name] = typeof next === "function" ? (next as (value: T) => T)(name in editor.ui ? editor.ui[name] : initial) : next;
    editor.refresh();
  }];
}
