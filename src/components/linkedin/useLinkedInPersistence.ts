import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceFilter } from '@/hooks/use-workspace-query';

type Row = Record<string, any> & { id: string };
type Table = 'linkedin_experiences' | 'linkedin_recommendations' | 'linkedin_profile' | 'engagement_weekly_linkedin' | 'linkedin_comment_strategy';

/** Full server snapshot for CAS; mutations contain only this screen's editable fields. */
export function useLinkedInPersistence(table: Table, week?: string) {
  const { column, value } = useWorkspaceFilter();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const snapshot = useRef<Row[] | null>(null);
  const lock = useRef(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const call = useCallback(async (expected?: Row[], patches?: Row[]) => {
    const { data, error } = await (supabase.rpc as any)('linkedin_save_state', {
      p_table: table, p_workspace_id: column === 'workspace_id' ? value : null,
      p_week: week ?? null, p_expected: expected ?? null, p_rows: patches ?? null,
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.rows) || data.rows.some((r: Row) => !r.id)) throw new Error('Sauvegarde non confirmée');
    if (patches && (data.rows.length !== patches.length || patches.some(p => !data.rows.some((r: Row) => r.id === p.id)))) throw new Error('Sauvegarde incomplète');
    return data.rows as Row[];
  }, [table, column, value, week]);
  const reload = useCallback(async () => {
    const token = ++request.current;
    snapshot.current = null;
    setError(false);
    try {
      const result = await call();
      if (!active.current || request.current !== token) return;
      snapshot.current = result;
      setRows(result);
    } catch {
      if (active.current && request.current === token) setError(true);
    }
  }, [call, active]);
  useEffect(() => { void reload(); }, [reload]);
  const save = async (patches: Row[]) => {
    if (!active.current || lock.current || !snapshot.current) throw new Error('Enregistrement indisponible');
    lock.current = true;
    setBusy(true);
    setSaveError("");
    try {
      const result = await call(snapshot.current, patches);
      if (!active.current) return null;
      snapshot.current = result;
      return result;
    } catch (error: any) {
      if (active.current) setSaveError(error?.code === '40001'
        ? 'Ces données ont changé dans une autre page. Copie tes modifications, puis recharge la page pour les comparer avant de réenregistrer.'
        : error?.code === '42501' ? 'Tu ne peux pas modifier ces données avec ton accès actuel.'
        : 'L’enregistrement n’est pas confirmé. Tes modifications restent affichées ; réessaie avant de quitter la page.');
      throw error;
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { rows, error, reload, save, busy, saveError, active, snapshot };
}

/**
 * Copies loaded rows into the screen's local state and reports when that is done.
 * Keep the screen loading until it returns true: between `rows` arriving and a plain
 * hydration effect running, the form is interactive with its blank initial state, and a
 * click on "Enregistrer" there would overwrite the loaded rows with that blank state.
 */
export function useHydratedRows(rows: Row[] | null, hydrate: (rows: Row[]) => void) {
  const [hydrated, setHydrated] = useState<Row[] | null>(null);
  // `hydrate` is a fresh closure each render: rerun only when a new server snapshot arrives.
  useEffect(() => { if (rows) { hydrate(rows); setHydrated(rows); } }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows !== null && hydrated === rows;
}
