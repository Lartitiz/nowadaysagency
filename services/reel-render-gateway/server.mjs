// Relais de rendu des reels HyperFrames (Google Cloud Run, projet nowadays-reels-1113).
//
// L'edge function `reel-render` (mode « sans voix ») envoie ici la page HTML du
// montage avec le jeton de session de la cliente. Le relais :
//   1. vérifie le jeton auprès de Supabase (clé publique anon, aucun secret) ;
//   2. limite le nombre de rendus par cliente (anti-emballement des coûts) ;
//   3. pose la page + les sons (assets/) dans un dossier et lance le rendu
//      distribué HyperFrames (workflow Cloud Workflows → service hyperframes-render) ;
//   4. renvoie l'avancement, puis un lien signé (2 h) vers le MP4 fini.
// L'edge recopie ensuite ce MP4 dans le bucket `calendar-media` (action archive).
//
// Déploiement : voir README.md (gcloud run deploy --source).

import http from "node:http";
import { mkdtemp, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { renderToCloudRun, getRenderProgress } from "@hyperframes/gcp-cloud-run/sdk";

const env = (name, fallback) => process.env[name] ?? fallback;
const PROJECT_ID = env("GCP_PROJECT", "nowadays-reels-1113");
const LOCATION = env("GCP_REGION", "europe-west1");
const BUCKET = env("RENDER_BUCKET", "hyperframes-render-nowadays-reels-1113");
const WORKFLOW_ID = env("RENDER_WORKFLOW", "hyperframes-render");
const SERVICE_URL = env("RENDER_SERVICE_URL", "https://hyperframes-render-ckfxjwuljq-ew.a.run.app");
const SUPABASE_URL = env("SUPABASE_URL", "https://fhdyflgojppwgrscmtdp.supabase.co");
const SUPABASE_ANON_KEY = env("SUPABASE_ANON_KEY", "");
const MAX_HTML_BYTES = 400_000;
const MAX_DURATION_S = 65;
const MAX_RENDERS_PER_HOUR = Number(env("MAX_RENDERS_PER_HOUR", "12"));
const MAX_RENDERS_PER_DAY = Number(env("MAX_RENDERS_PER_DAY", "40"));
const SIGNED_URL_MS = 2 * 60 * 60 * 1000;
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), "assets");

const storage = new Storage();

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** Identifiant de la cliente, ou null si le jeton n'est pas une session valide. */
async function userFromToken(authorization) {
  const token = /^Bearer\s+(.+)$/i.exec(authorization || "")?.[1];
  if (!token || !SUPABASE_ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === "string" && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null;
}

const renderPrefix = (userId) => `renders/u-${userId}-`;

/** Nombre de rendus lancés par la cliente depuis `sinceMs` (lus dans le bucket, sans base). */
async function countRecentRenders(userId, sinceMs) {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: renderPrefix(userId), autoPaginate: true });
  const ids = new Set();
  for (const f of files) {
    const m = /^renders\/u-[0-9a-f-]{36}-(\d+)-/.exec(f.name);
    if (m && Number(m[1]) >= sinceMs) ids.add(f.name.split("/")[1]);
  }
  return ids.size;
}

async function handleRender(req, res, userId) {
  const body = await readJson(req, MAX_HTML_BYTES + 10_000);
  const html = typeof body.html === "string" ? body.html : "";
  const duration = Number(body.duration);
  if (!html || Buffer.byteLength(html) > MAX_HTML_BYTES) return send(res, 400, { error: "invalid_html" });
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_S) return send(res, 400, { error: "invalid_duration" });

  const now = Date.now();
  const [lastHour, lastDay] = await Promise.all([
    countRecentRenders(userId, now - 3600_000),
    countRecentRenders(userId, now - 86400_000),
  ]);
  if (lastHour >= MAX_RENDERS_PER_HOUR || lastDay >= MAX_RENDERS_PER_DAY) {
    return send(res, 429, { error: "rate_limited" });
  }

  const dir = await mkdtemp(join(tmpdir(), "reel-"));
  try {
    await writeFile(join(dir, "index.html"), html, "utf8");
    await cp(ASSETS_DIR, join(dir, "assets"), { recursive: true });
    const renderId = `u-${userId}-${now}-${randomUUID().slice(0, 8)}`;
    // 4 morceaux au plus = 4 machines du service (au-delà : refus 429 « Rate exceeded »).
    const frames = Math.ceil(duration * 30);
    const handle = await renderToCloudRun({
      projectDir: dir,
      config: { fps: 30, width: 1080, height: 1920, format: "mp4", maxParallelChunks: 4, chunkSize: Math.max(120, Math.ceil(frames / 4)) },
      bucketName: BUCKET,
      projectId: PROJECT_ID,
      location: LOCATION,
      workflowId: WORKFLOW_ID,
      serviceUrl: SERVICE_URL,
      renderId,
    });
    const execution = handle.executionName.split("/").pop();
    console.log(JSON.stringify({ event: "reel_render_submitted", renderId, execution, duration }));
    return send(res, 200, { id: `${renderId}.${execution}` });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleStatus(req, res, userId, id) {
  const m = /^(u-([0-9a-f-]{36})-\d+-[0-9a-f]{8})\.([A-Za-z0-9_-]{1,100})$/.exec(id || "");
  if (!m) return send(res, 400, { error: "invalid_id" });
  if (m[2] !== userId) return send(res, 404, { error: "not_found" });
  const [, renderId, , execution] = m;
  const executionName = `projects/${PROJECT_ID}/locations/${LOCATION}/workflows/${WORKFLOW_ID}/executions/${execution}`;
  const progress = await getRenderProgress({ executionName, vcpu: 4, memoryGib: 8 });
  if (progress.status === "running" || progress.status === "unknown") {
    return send(res, 200, { status: "running", progress: progress.overallProgress ?? 0 });
  }
  if (progress.status !== "succeeded" || !progress.outputFile) {
    console.error(JSON.stringify({ event: "reel_render_failed", renderId, status: progress.status, errors: progress.errors?.slice(0, 3) }));
    return send(res, 200, { status: "error", message: "Le montage a échoué. Réessaie dans un instant." });
  }
  const key = progress.outputFile.gcsUri.replace(`gs://${BUCKET}/`, "");
  if (!key.startsWith(`renders/${renderId}/`)) return send(res, 404, { error: "not_found" });
  const [url] = await storage.bucket(BUCKET).file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + SIGNED_URL_MS,
  });
  console.log(JSON.stringify({ event: "reel_render_done", renderId, cost: progress.costs?.displayCost ?? null }));
  return send(res, 200, { status: "done", url });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
    const userId = await userFromToken(req.headers.authorization);
    if (!userId) return send(res, 401, { error: "unauthorized" });
    if (req.method === "POST" && url.pathname === "/render") return await handleRender(req, res, userId);
    if (req.method === "GET" && url.pathname === "/status") return await handleStatus(req, res, userId, url.searchParams.get("id"));
    return send(res, 404, { error: "not_found" });
  } catch (error) {
    console.error(JSON.stringify({ event: "reel_gateway_error", message: String(error?.message || error).slice(0, 500) }));
    return send(res, error?.status || 500, { error: "internal" });
  }
});

server.listen(Number(env("PORT", "8080")), () => console.log("reel-render-gateway prêt"));
