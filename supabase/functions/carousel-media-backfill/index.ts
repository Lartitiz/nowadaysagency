// Étape 3 du chantier images : convertit les contenus existants dont les
// photos sont collées en base64 (brouillons de carrousel, idées, posts du
// calendrier). Réservé à l'admin, lancé depuis /admin/tools.
// Chaque appel traite quelques lignes (budget ~40 s) et renvoie le curseur
// `next` ; dryRun compte sans rien envoyer ni modifier.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { collectDataImages, externalizeVerified, MEDIA_BUCKET, type MediaStorage } from "../_shared/carousel-media.ts";

const ADMIN_EMAIL = "laetitia@nowadaysagency.com";
const BUDGET_MS = 40_000;
const COLUMNS: Record<string, string[]> = {
  saved_ideas: ["content_data", "content_draft"],
  calendar_posts: ["story_sequence_detail"],
};

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, cors);
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await asUser.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401, cors);
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (user.email !== ADMIN_EMAIL) {
      const { data: role } = await service.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!role) return json({ error: "Forbidden" }, 403, cors);
    }

    const body = await req.json().catch(() => ({}));
    const table = String(body.table || "saved_ideas");
    const columns = COLUMNS[table];
    if (!columns) return json({ error: "table_not_allowed" }, 400, cors);
    const dryRun = body.dryRun !== false;
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 20);
    const after = typeof body.after === "string" && body.after ? body.after : null;

    const storage: MediaStorage = {
      upload: (path, bytes, contentType) =>
        service.storage.from(MEDIA_BUCKET).upload(path, new Blob([bytes], { type: contentType }), { contentType, upsert: false, cacheControl: "31536000" }) as any,
      publicUrl: (path) => service.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
    };

    const { data: candidates, error: candError } = await service.rpc("carousel_media_candidates", { p_table: table, p_after: after, p_limit: limit });
    if (candError) throw candError;
    const ids: string[] = (candidates || []).map((c: { id: string }) => c.id);

    const started = Date.now();
    const report = { table, dryRun, processed: 0, converted: 0, unchanged: 0, conflicts: 0, images: 0, bytesBefore: 0, bytesAfter: 0, failed: [] as { id: string; reasons: string[] }[], next: after as string | null, done: false };
    for (const id of ids) {
      if (Date.now() - started > BUDGET_MS) break;
      const { data: row, error } = await service.from(table).select(["id", "user_id", "updated_at", ...columns].join(",")).eq("id", id).maybeSingle();
      report.next = id;
      report.processed++;
      if (error || !row) { report.failed.push({ id, reasons: [error?.message || "ligne introuvable"] }); continue; }
      const values: Record<string, unknown> = {};
      const reasons: string[] = [];
      let before = 0, sizeAfter = 0, images = 0;
      for (const column of columns) {
        const original = (row as any)[column];
        if (original == null) continue;
        const found = collectDataImages(original).size;
        if (!found) continue;
        const size = JSON.stringify(original).length;
        before += size;
        images += found;
        if (dryRun) continue;
        const result = await externalizeVerified(original, (row as any).user_id, storage);
        if (result.failures.length) { reasons.push(...result.failures.map((f) => `${column} : ${f}`)); continue; }
        values[column] = result.value;
        sizeAfter += JSON.stringify(result.value).length;
      }
      if (!images) { report.unchanged++; continue; }
      report.images += images;
      report.bytesBefore += before;
      if (dryRun) { report.converted++; continue; }
      // Tout ou rien par ligne : une image non vérifiée laisse la ligne intacte.
      if (reasons.length) { report.failed.push({ id, reasons }); continue; }
      const { data: applied, error: applyError } = await service.rpc("apply_carousel_media_backfill", {
        p_table: table, p_id: id, p_expected: (row as any).updated_at, p_values: values,
      });
      if (applyError) { report.failed.push({ id, reasons: [applyError.message] }); continue; }
      if (!applied) { report.conflicts++; continue; }
      report.converted++;
      report.bytesAfter += sizeAfter;
    }
    report.done = report.processed === ids.length && ids.length < limit;
    console.log("[carousel-media-backfill]", JSON.stringify({ ...report, failed: report.failed.length }));
    return json(report, 200, cors);
  } catch (error) {
    console.error("[carousel-media-backfill] error", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, cors);
  }
});
