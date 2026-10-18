import { supabase } from "@/integrations/supabase/client";
import type { IdeaToCreate } from "@/lib/idea-create-link";

const COLUMNS = "id, titre, angle, format, canal, objectif, source_module";

/** Idées de Mes idées encore sans contenu : celles du diagnostic d'abord (les
 * plus anciennes), puis les autres idées gardées (les plus récentes). */
export async function fetchIdeasToDevelop(column: string, value: string): Promise<IdeaToCreate[]> {
  const base = () => (supabase.from("saved_ideas") as any).select(COLUMNS).eq(column, value);
  const [diag, others] = await Promise.all([
    base().eq("source_module", "diagnostic").eq("status", "to_explore")
      .is("calendar_post_id", null).is("content_data", null)
      .order("created_at", { ascending: true }).limit(5),
    base().eq("status", "to_explore")
      .is("calendar_post_id", null).is("content_data", null).is("content_draft", null)
      .order("created_at", { ascending: false }).limit(12),
  ]);
  const seen = new Set<string>();
  const keep = (rows: IdeaToCreate[] | null, fromOthers: boolean) => (rows || []).filter((r) => {
    if (!r?.titre?.trim() || seen.has(r.id)) return false;
    if (fromOthers && (r.source_module === "diagnostic" || r.format === "actu")) return false;
    seen.add(r.id);
    return true;
  });
  return [...keep(diag?.data, false), ...keep(others?.data, true)];
}
