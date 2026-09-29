import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import type { SupabaseClient } from "@supabase/supabase-js";
// Additive tables: explicit boundary until hosted generated types are refreshed.
const db: SupabaseClient = supabase;
export interface StudioProposal {
  id: string;
  person_reference?: {
    mode: "sheet" | "scene";
    name: string;
    stable_traits: string;
    variable_details: string;
    views: string[];
  };
  operation: "background" | "create" | "edit" | "product";
  format?: "square" | "portrait" | "landscape";
  preserve?: string[];
  change?: string[];
  exact_text?: string[];
  warning?: string | null;
  references?: StudioReference[];
  reference_snapshot?: StudioReference[];
  viewed_reference_id?: string | null;
  input_path?: string | null;
  summary: string;
  background_prompt: string;
  viewed_version_id: string | null;
  cost: number;
  shots?: {
    id: string;
    summary: string;
    image_prompt: string;
    format: string;
  }[];
  series_id?: string;
  series_index?: number;
  series_size?: number;
  provider?: string;
  model?: string;
  rules_version?: string;
  brand_context?: StudioBrandContext;
  composition?: StudioComposition;
}
export interface StudioBrandContext {
  captured_at: string;
  charter: Record<string, unknown> | null;
  identity: Record<string, unknown> | null;
  proposition: Record<string, unknown> | null;
  strategy: Record<string, unknown> | null;
  memory: { id: string; kind: string; name: string; note: string; revision: number }[];
}
export interface StudioComposition {
  logo_data_url?: string | null;
  title: string;
  body: string;
  footer: string;
  format: "square" | "portrait" | "story";
  layout?: "image_top" | "image_full";
  background: string;
  foreground: string;
  accent: string;
  font: string;
  align: "left" | "center";
}
export interface StudioMessage {
  reference_ids?: string[];
  reference_snapshot?: Array<Pick<StudioReference, "id" | "name" | "role"> & { url?: string | null }>;
  composition?: StudioComposition;
  existing_tool?: "mockup" | "before_after" | "preparation";
  preparation?: { exposure?: number; contrast?: number; format?: "post" | "square" | "story" | "cover" | "banner" };
  viewed_version_id?: string | null;
  viewed_reference_id?: string | null;
  id?: string;
  role: "user" | "assistant";
  text: string;
  operation?: string;
  suggestions?: string[];
  suggested_photo_ids?: string[];
  suggested_memory_ids?: string[];
}
export interface StudioReference {
  id: string;
  photo_id: string | null;
  memory_id?: string;
  version_id?: string;
  name: string;
  role:
    | "subject"
    | "product"
    | "person"
    | "casting"
    | "style"
    | "composition"
    | "logo";
  url: string;
}
export interface StudioSession {
  id: string;
  workspace_id: string;
  name: string;
  source_photo_id: string | null;
  source_url: string | null;
  references?: StudioReference[];
  brief?: string;
  composition?:
    | { design: StudioComposition; background_url: string | null }
    | null;
  revision: number;
  messages: StudioMessage[];
  proposal: StudioProposal | null;
  updated_at: string;
  archived_at: string | null;
}
export interface StudioVersion {
  id: string;
  status: "processing" | "ready" | "failed" | "uncertain";
  proposal: StudioProposal;
  url: string | null;
  library_photo_id: string | null;
  error_message: string | null;
  created_at: string;
}
export interface StudioMemory {
  id: string;
  kind: "preference" | "direction" | "casting";
  name: string;
  note: string;
  revision: number;
  references: StudioReference[];
}
export interface StudioState {
  composition_history?: StudioCompositionEntry[];
  memory?: StudioMemory[];
  charter_references?: { index: number; name: string; url: string }[];
  session: StudioSession;
  versions: StudioVersion[];
  writable: boolean;
  generative_allowed?: boolean;
  suggested_photos?: { id: string; name: string; url: string }[];
  quota: {
    allowed: boolean;
    plan: string;
    message?: string;
    remaining?: number;
    remaining_total?: number;
  };
}
export interface StudioCompositionEntry {
  id: string;
  title: string;
  created_at: string;
}
export class StudioRequestError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function studioRequest<T = StudioState>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await invokeWithTimeout(
    "visual-studio",
    { body: { ...body, studio_version: 4 } },
    60_000,
  );
  if (error || data?.error) {
    // invokeWithTimeout already reads the HTTP response into data. Its error
    // is normalized, so reading error.context loses business retry codes.
    let detail = data && typeof data === "object" ? data : null;
    const context = error?.originalError?.context;
    if (!detail && context) {
      try {
        detail = await context.clone().json();
      } catch {
        /* Preserve the transport error when the response is unavailable. */
      }
    }
    const message = detail?.message || detail?.error || error?.message;
    throw new StudioRequestError(
      typeof message === "string"
        ? message
        : "Le Studio est indisponible. Réessaie.",
      typeof detail?.code === "string" ? detail.code : undefined,
    );
  }
  return data as T;
}
export async function listStudioSessions(workspaceId: string) {
  const base = () => db.from("visual_studio_sessions")
    .select("id,name,updated_at,archived_at,revision")
    .eq("workspace_id", workspaceId).eq("source_ready", true)
    .order("updated_at", { ascending: false }).limit(50);
  const [active, archived] = await Promise.all([
    base().is("archived_at", null),
    base().not("archived_at", "is", null),
  ]);
  if (active.error || archived.error) {
    throw new Error("Les sessions sont momentanément indisponibles.");
  }
  type Listed = Pick<StudioSession, "id" | "name" | "updated_at" | "archived_at" | "revision">;
  return { active: active.data as Listed[], archived: archived.data as Listed[] };
}
export async function listOlderStudioCompositions(
  workspaceId: string,
  sessionId: string,
  offset: number,
): Promise<{ items: StudioCompositionEntry[]; hasMore: boolean }> {
  const pageSize = 20;
  const { data, error } = await db.from("visual_studio_compositions")
    .select("id,title,created_at")
    .eq("workspace_id", workspaceId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize);
  if (error) throw new Error("Les anciennes compositions sont momentanément indisponibles.");
  const rows = (data || []) as StudioCompositionEntry[];
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}
export function draftKey(
  userId: string,
  workspaceId: string,
  sessionId: string,
) {
  return `visual-studio:draft:${userId}:${workspaceId}:${sessionId}`;
}
export function readDraft(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
export function writeDraft(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The visible draft remains editable if local storage is unavailable. */
  }
}
