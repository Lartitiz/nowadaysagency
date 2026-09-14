import { supabase } from "@/integrations/supabase/client";
import { resumeCrosspost } from "@/lib/crosspost-content";

export interface ContentEdit { path: string[]; before: any; value: any; anchors?: { path: string[]; id: any }[] }
export interface ContentReceipt { saved: true; content: any; row: any }
export type SaveContentEdit = (edit: ContentEdit) => Promise<ContentReceipt>;

export function previewContent(content: any, draft?: string | null, format?: string): any {
  let parsed = content ?? draft;
  if (typeof parsed === "string") {
    try {
      const json = JSON.parse(parsed);
      if (json != null && (typeof json === "object" || typeof json === "string")) parsed = json;
    } catch { /* Plain historical text. */ }
  }
  return resumeCrosspost(parsed, format)?.raw ?? parsed;
}

export function contentEdit(data: any, path: string[], value: any): ContentEdit {
  const anchors: { path: string[]; id: any }[] = [];
  let node = data;
  path.forEach((key, index) => {
    if (Array.isArray(node) && node[key]?.id != null) anchors.push({ path: path.slice(0, index + 1), id: node[key].id });
    node = node?.[key];
  });
  return { path, before: node, value, anchors };

}

function equal(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
}

function applyEdit(data: any, edit: ContentEdit) {
  for (const anchor of edit.anchors ?? []) {
    if (!equal(anchor.path.reduce((node, key) => node?.[key], data)?.id, anchor.id)) {
      throw new Error("L’ordre des éléments a changé. Rouvre la fiche avant de réessayer ; ta saisie est conservée.");
    }
  }
  const current = edit.path.reduce((node, key) => node?.[key], data);
  if (!equal(current, edit.before) && !equal(current, edit.value)) {
    throw new Error("Ce champ a changé ailleurs. Ferme puis rouvre le contenu avant de réessayer ; ta saisie est conservée ici.");
  }
  if (!edit.path.length) return edit.value;
  const updated = structuredClone(data);
  let node = updated;
  for (const key of edit.path.slice(0, -1)) {
    if (node?.[key] == null) throw new Error("La structure du contenu a changé. Rouvre la fiche avant de réessayer.");
    node = node[key];
  }
  node[edit.path.at(-1)!] = edit.value;
  return updated;
}

export interface PreviewTarget {
  table: "saved_ideas" | "calendar_posts";
  id: string;
  scope: { column: string; value: string };
  format?: string;
}
export async function readPreviewRow(target: PreviewTarget): Promise<any> {
  if (!target.scope.value || !target.id) throw new Error("Aucun contenu sélectionné.");
  let query = supabase.from(target.table as any).select("*").eq("id", target.id).eq(target.scope.column, target.scope.value);
  if (target.scope.column === "user_id") query = query.is("workspace_id", null);
  const { data, error } = await query.single();
  if (error) throw error;
  if (!data || (data as any).id !== target.id) throw new Error("Contenu introuvable ou accès refusé.");
  return data;
}

// Serialize edits to the same row, even across a close/reopen. Different rows remain independent.
const queues = new Map<string, Promise<unknown>>();
export function savePreviewEdit(target: PreviewTarget, edit: ContentEdit): Promise<ContentReceipt> {
  const key = JSON.stringify([target.table, target.scope, target.id]);
  const run = async (): Promise<ContentReceipt> => {
    const source = await readPreviewRow(target);
    const original = target.table === "calendar_posts" ? source.story_sequence_detail : source.content_data;
    const content = previewContent(original, source.content_draft, target.format);
    const updated = applyEdit(content, edit);
    const field = target.table === "calendar_posts" ? "story_sequence_detail" : source.content_data != null || typeof updated === "object" ? "content_data" : "content_draft";
    let query = supabase.from(target.table as any).update({ [field]: updated, updated_at: new Date().toISOString() } as any)
      .eq("id", target.id).eq(target.scope.column, target.scope.value);
    if (target.scope.column === "user_id") query = query.is("workspace_id", null);
    // Compare the actual source columns, not only updated_at (legacy writers may not bump it).
    for (const name of target.table === "saved_ideas" ? ["content_data", "content_draft"] : ["story_sequence_detail"]) {
      query = source[name] == null ? query.is(name, null) : query.eq(name, name !== "content_draft" ? JSON.stringify(source[name]) : source[name]);
    }
    const { data: receipt, error: saveError } = await query.select("*").single();
    if (saveError) throw saveError;
    if (!receipt || (receipt as any).id !== target.id || !equal((receipt as any)[field], updated)) {
      throw new Error("Enregistrement non confirmé. Réessaie ; ta saisie est conservée.");
    }
    return { saved: true, row: receipt, content: previewContent((receipt as any)[target.table === "calendar_posts" ? "story_sequence_detail" : "content_data"], (receipt as any).content_draft, target.format) };
  };
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, pending);
  void pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => undefined);
  return pending;
}
