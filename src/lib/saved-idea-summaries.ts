import { supabase } from '@/integrations/supabase/client';

// Le panneau « Mes idées à placer » n'affiche qu'un titre, un format et un
// libellé. Charger `content_data` (carrousels avec leur HTML, images…) pour
// toute la liste faisait dépasser le délai de la base (HTTP 500) sur les
// grands espaces : la liste ne lit plus que des colonnes légères, et le
// contenu complet est lu, idée par idée, au moment de l'ouvrir ou de la placer.

export const IDEA_SUMMARY_COLUMNS =
  'id, titre, format, objectif, notes, status, canal, source_module, planned_date, calendar_post_id, updated_at, angle, series_id, episode_number';

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

/** Liste légère + identifiants des idées qui ont déjà un contenu (sans le transférer). */
export async function readIdeaSummaries(scope: Scope, columns = IDEA_SUMMARY_COLUMNS, signal?: AbortSignal): Promise<{ data: IdeaSummaryRow[] | null; error: unknown }> {
  const [list, withDraft, withData] = await Promise.all([
    scoped(columns, scope, signal).order('created_at', { ascending: false }),
    scoped('id', scope, signal).not('content_draft', 'is', null).neq('content_draft', ''),
    // IS NOT NULL seul : comparer content_data à '{}' oblige la base à relire
    // tout le contenu (7,8 s mesurées en ligne pour ~79 Mo, limite 8 s).
    // Aucun code n'écrit de content_data vide.
    scoped('id', scope, signal).not('content_data', 'is', null),
  ]);
  const error = list.error || withDraft.error || withData.error;
  if (error) return { data: null, error };
  const filled = new Set<string>([...(withDraft.data || []), ...(withData.data || [])].map((row: { id: string }) => row.id));
  return { data: (list.data || []).map((row: Omit<IdeaSummaryRow, 'has_content'>) => ({ ...row, has_content: filled.has(row.id) })), error: null };
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

export interface IdeaPreview {
  /** Extrait léger de content_data (mêmes clés, textes tronqués, sans images). */
  preview_data: unknown;
  /** Début de content_draft. */
  draft_head: string | null;
}

/**
 * Aperçus des cartes de « Mes idées », calculés par la base (fonction
 * `saved_idea_previews`). Un échec n'empêche pas la liste : on renvoie ce
 * qu'on a pu lire, les cartes concernées s'affichent sans extrait.
 */
export async function readIdeaPreviews(ids: string[]): Promise<Map<string, IdeaPreview>> {
  const previews = new Map<string, IdeaPreview>();
  const chunks: string[][] = [];
  // Par 10 : la base relit le contenu de chaque idée (jusqu'à ~8 Mo l'une).
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  await Promise.all(chunks.map(async chunk => {
    try {
      const { data, error } = await supabase.rpc('saved_idea_previews' as any, { p_ids: chunk });
      if (error) return;
      for (const row of (data as any[]) || []) previews.set(row.id, { preview_data: row.preview ?? null, draft_head: row.draft_head ?? null });
    } catch { /* aperçu facultatif */ }
  }));
  return previews;
}
