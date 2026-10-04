import { supabase } from '@/integrations/supabase/client';

// Le panneau « Mes idées à placer » n'affiche qu'un titre, un format et un
// libellé. Charger `content_data` (carrousels avec leur HTML, images…) pour
// toute la liste faisait dépasser le délai de la base (HTTP 500) sur les
// grands espaces : la liste ne lit plus que des colonnes légères, et le
// contenu complet est lu, idée par idée, au moment de l'ouvrir ou de la placer.
// `has_content`, `preview` et `preview_draft` sont calculés par la base à
// chaque enregistrement du contenu (trigger saved_ideas_fill_preview).

export const IDEA_SUMMARY_COLUMNS =
  'id, titre, format, objectif, notes, status, canal, source_module, planned_date, calendar_post_id, updated_at, angle, series_id, episode_number, has_content';

export interface IdeaSummaryRow {
  id: string;
  titre: string;
  format: string | null;
  objectif: string | null;
  notes: string | null;
  status: string;
  canal: string | null;
  source_module: string | null;
  planned_date: string | null;
  calendar_post_id: string | null;
  updated_at?: string | null;
  angle?: string | null;
  series_id?: string | null;
  episode_number?: number | null;
  /** Vrai si l'idée porte déjà un contenu (brouillon ou données structurées). */
  has_content: boolean;
  /** Absents tant que l'idée n'a pas été lue en entier (cf. loadFullIdea). */
  content_draft?: string | null;
  content_data?: unknown;
}

type Scope = { column: string; value: string };

function scoped(columns: string, { column, value }: Scope, signal?: AbortSignal) {
  let query = (supabase.from('saved_ideas') as any).select(columns).eq(column, value);
  if (column === 'user_id') query = query.is('workspace_id', null);
  return signal ? query.abortSignal(signal) : query;
}

/** Liste légère, sans aucun contenu : une seule lecture, quelques Ko. */
export async function readIdeaSummaries(scope: Scope, columns = IDEA_SUMMARY_COLUMNS, signal?: AbortSignal): Promise<{ data: IdeaSummaryRow[] | null; error: unknown }> {
  const { data, error } = await scoped(columns, scope, signal).order('created_at', { ascending: false });
  if (error) return { data: null, error };
  return { data: (data || []).map((row: IdeaSummaryRow) => ({ ...row, has_content: !!row.has_content })), error: null };
}

/** Lit une idée complète (contenu compris) juste avant de l'ouvrir ou de la placer. */
export async function loadFullIdea<T extends { id: string }>(idea: T): Promise<T & { content_draft: string | null; content_data: unknown; updated_at?: string | null }> {
  const { data, error } = await (supabase.from('saved_ideas') as any).select('*').eq('id', idea.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Cette idée n’existe plus. Rafraîchis la liste.');
  return { ...idea, ...data };
}

/** Une idée de la liste légère n'a pas encore son contenu. */
export function needsFullIdea(idea: { content_data?: unknown; content_draft?: unknown }): boolean {
  return idea.content_data === undefined && idea.content_draft === undefined;
}

