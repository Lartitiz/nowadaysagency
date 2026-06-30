// Importe un fichier (PPTX d'un carrousel) dans le Canva connecté de l'utilisateur
// et renvoie l'URL d'édition du design créé.
// Flux : refresh token si besoin -> POST /url-imports -> polling du job ->
// get design -> urls.edit_url.
import { getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, AuthError, getServiceClient } from "../_shared/auth.ts";

const CANVA_API = "https://api.canva.com/rest/v1";
// Le jeton d'accès Canva est court (~4 h). On rafraîchit s'il expire dans < 10 min.
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Rafraîchit le jeton d'accès Canva via le refresh_token (rotation possible).
async function refreshCanvaTokenIfNeeded(supabase: any, conn: any): Promise<string> {
  const expiresAtMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  if (expiresAtMs - Date.now() > REFRESH_THRESHOLD_MS) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token; // pas de refresh dispo : on tente l'actuel

  const clientId = Deno.env.get("CANVA_CLIENT_ID")!;
  const clientSecret = Deno.env.get("CANVA_CLIENT_SECRET")!;
  const basic = btoa(`${clientId}:${clientSecret}`);
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", conn.refresh_token);
  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: form.toString(),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) {
    console.warn("Canva refresh failed:", j);
    return conn.access_token;
  }
  const newExpires = new Date(Date.now() + Number(j.expires_in || 4 * 3600) * 1000).toISOString();
  await supabase
    .from("social_connections")
    .update({
      access_token: j.access_token,
      refresh_token: j.refresh_token || conn.refresh_token,
      token_expires_at: newExpires,
    })
    .eq("id", conn.id);
  return j.access_token as string;
}

// Attend la fin du job d'import et renvoie l'id du design créé.
async function pollImport(jobId: string, token: string, maxMs = 60000): Promise<string> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${CANVA_API}/url-imports/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    const status = j?.job?.status;
    if (status === "success") {
      const r = j?.job?.result;
      // Selon les versions de l'API : result.designs[] ou result.design.
      const designId =
        r?.designs?.[0]?.id || r?.design?.id || r?.design_id || r?.designs?.[0]?.design_id;
      if (!designId) {
        console.error("Canva import success sans design id:", JSON.stringify(j).slice(0, 500));
        throw new Error("Import Canva terminé mais aucun design renvoyé.");
      }
      return designId;
    }
    if (status === "failed") {
      throw new Error(j?.job?.error?.message || "L'import Canva a échoué.");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("L'import Canva a expiré (trop long).");
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId } = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    // On accepte soit le fichier en base64 (déposé côté serveur, robuste aux RLS),
    // soit une URL https déjà publique (rétro-compat).
    const fileBase64: string | undefined = typeof body?.file_base64 === "string" ? body.file_base64 : undefined;
    const fileUrlIn: string | undefined = typeof body?.file_url === "string" ? body.file_url : undefined;
    const title: string = (body?.title || "Carrousel Nowadays").toString().slice(0, 120);
    const workspaceId: string | null = body?.workspace_id ?? null;

    if (!fileBase64 && !(fileUrlIn && /^https:\/\//.test(fileUrlIn))) {
      return json({ error: "Fichier (base64) ou URL https requis." }, 400, corsHeaders);
    }

    // Lecture de la connexion Canva (service-role, jamais exposée au client).
    const supabase = getServiceClient();
    const filterCol = workspaceId ? "workspace_id" : "user_id";
    const filterVal = workspaceId || userId;
    let q = supabase
      .from("social_connections")
      .select("*")
      .eq("platform", "canva")
      .eq(filterCol, filterVal);
    if (workspaceId) q = q.eq("user_id", userId);
    else q = q.is("workspace_id", null);
    const { data: conn, error: connErr } = await q.maybeSingle();

    if (connErr || !conn) {
      return json({ error: "not_connected", message: "Aucun compte Canva connecté." }, 400, corsHeaders);
    }

    const token = await refreshCanvaTokenIfNeeded(supabase, conn);

    // Si le fichier arrive en base64, on le dépose côté serveur (service-role :
    // pas de RLS, et on crée le bucket public au besoin) puis on importe par URL.
    const BUCKET = "canva-import";
    let fileUrl = fileUrlIn || "";
    let uploadedPath: string | null = null;
    if (fileBase64) {
      const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      // Crée le bucket s'il n'existe pas (no-op s'il existe). PRIVÉ : Canva
      // télécharge via une URL signée (cf. plus bas), le bucket n'a pas besoin
      // d'être public — et le créer en public ré-annulerait le durcissement
      // storage (migration LOT A qui repasse canva-import en privé).
      await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});
      const path = `${userId}/canva-${Date.now()}-${Math.random().toString(36).slice(2)}.pptx`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        upsert: true,
      });
      if (upErr) {
        console.error("Canva upload (service-role) error:", upErr);
        return json({ error: "Dépôt du fichier échoué : " + upErr.message }, 500, corsHeaders);
      }
      uploadedPath = path;
      // URL SIGNÉE (valable 10 min) plutôt que publique : Canva peut télécharger le
      // fichier que le bucket soit public ou non (le bucket n'était en fait pas public).
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 600);
      if (signErr || !signed?.signedUrl) {
        console.error("Canva signed-url error:", signErr);
        return json({ error: "Génération de l'URL du fichier échouée." }, 500, corsHeaders);
      }
      fileUrl = signed.signedUrl;
    }

    // 1. Lance l'import depuis l'URL publique du PPTX.
    const importRes = await fetch(`${CANVA_API}/url-imports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, url: fileUrl }),
    });
    const importJson = await importRes.json();
    if (!importRes.ok || !importJson?.job?.id) {
      console.error("Canva url-imports error:", importJson);
      return json(
        { error: importJson?.message || importJson?.error || "Échec du lancement de l'import Canva." },
        502,
        corsHeaders,
      );
    }

    // 2. Attend la fin du job.
    const designId = await pollImport(importJson.job.id, token);

    // Le fichier a été récupéré par Canva pendant le job → on peut le supprimer.
    if (uploadedPath) {
      await supabase.storage.from("canva-import").remove([uploadedPath]).catch(() => {});
    }

    // 3. Récupère l'URL d'édition du design.
    const designRes = await fetch(`${CANVA_API}/designs/${designId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const designJson = await designRes.json();
    const editUrl = designJson?.design?.urls?.edit_url;
    if (!editUrl) {
      console.error("Canva get-design error:", designJson);
      return json({ error: "Design importé mais URL d'édition introuvable." }, 502, corsHeaders);
    }

    return json({ success: true, designId, editUrl }, 200, corsHeaders);
  } catch (e: any) {
    if (e instanceof AuthError) {
      return json({ error: e.message }, e.status, corsHeaders);
    }
    console.error("social-canva-import error:", e);
    return json({ error: e?.message || "Erreur interne lors de l'import Canva." }, 500, corsHeaders);
  }
});
