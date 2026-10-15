// Harnais de test UNIQUEMENT (fiche 12, lot T) — jamais importé par du code de prod.
// Fait tourner le vrai handler de deep-diagnostic (handleDeepDiagnostic,
// exporté au lot 0) sur une base en mémoire :
// - un faux PostgREST qui sert des tables remplies et applique les filtres
//   `eq.` réellement envoyés (workspace_members, scrape_cache, quota…) ;
// - la capture de chaque insertion par table (diagnostic_results,
//   audit_recommendations) et des crédits (RPC record_ai_usage) ;
// - la capture du corps envoyé à /functions/v1/diagnostic-enrichment ;
// - une file de réponses de Claude (une par appel) et la capture de chaque
//   requête envoyée à Claude, images remplacées par un repère ;
// - toute autre URL (site de la personne, Instagram…) répond 404 et est notée.
// Le journal des requêtes remplace les dates par <date> : le snapshot reste
// stable d'un jour à l'autre.

export const TEST_SUPABASE_URL = "https://fake-supabase.test";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export interface FauxMonde {
  /** Utilisatrice authentifiée (une par test : limite de 20 requêtes/min par compte). */
  userId: string | null;
  /** Lignes servies par table (filtrées par les `eq.` reçus). */
  tables?: Record<string, Row[]>;
  /** Réponses successives de Claude : input de l'outil `rendre_diagnostic`, ou "echec" (400). */
  claude?: Array<Row | "echec">;
  /** Fichiers du stockage (bucket/chemin → octets), pour les captures d'onboarding. */
  fichiers?: Record<string, Uint8Array>;
}

export interface FauxFetch {
  requetes: string[];
  claude: Row[];
  enrichissement: Row[];
  insertions: Record<string, Row[]>;
  credits: Row[];
  restore(): void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const DATE_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})/g;

/** Requête Claude lisible : images remplacées par un repère (type + taille du base64). */
// deno-lint-ignore no-explicit-any
function sansImages(body: any) {
  return JSON.parse(JSON.stringify(body), (_k, v) =>
    v && typeof v === "object" && v.type === "base64" && typeof v.data === "string"
      ? { type: "base64", media_type: v.media_type, data: `<image ${v.data.length} car.>` }
      : v);
}

const PARAMS_RESERVES = new Set(["select", "order", "limit", "offset", "columns"]);

export function installerFauxFetch(monde: FauxMonde): FauxFetch {
  const originalFetch = globalThis.fetch;
  const requetes: string[] = [];
  const claude: Row[] = [];
  const enrichissement: Row[] = [];
  const insertions: Record<string, Row[]> = {};
  const credits: Row[] = [];
  const reponses = [...(monde.claude ?? [])];
  let idInsere = 0;

  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input?.url ?? String(input));
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const corps = init?.body ? (() => { try { return JSON.parse(String(init.body)); } catch { return init.body; } })() : null;

    if (url.href.startsWith("https://api.anthropic.com/v1/messages")) {
      requetes.push("claude POST /v1/messages");
      claude.push(sansImages(corps));
      const r = reponses.shift();
      if (r === undefined) throw new Error("faux Claude : appel non prévu par le test");
      if (r === "echec") return json({ error: { message: "simulated failure" } }, 400);
      return json({
        content: [{ type: "tool_use", name: "rendre_diagnostic", input: r }],
        stop_reason: "tool_use",
        usage: { input_tokens: 100, output_tokens: 50 },
      });
    }

    if (url.origin !== TEST_SUPABASE_URL) {
      requetes.push(`externe ${method} ${url.origin}${url.pathname}`);
      return new Response("introuvable", { status: 404 });
    }

    const path = url.pathname;
    if (path.startsWith("/storage/v1/object/")) {
      const cle = decodeURIComponent(path.replace(/^\/storage\/v1\/object\/(authenticated\/)?/, ""));
      requetes.push(`stockage ${method} ${cle}`);
      const octets = monde.fichiers?.[cle];
      if (!octets) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
      return new Response(octets, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }
    if (path === "/auth/v1/user") {
      requetes.push("auth GET /user");
      if (!monde.userId) return json({ msg: "invalid JWT" }, 401);
      return json({ id: monde.userId, email: "test@example.com", aud: "authenticated", role: "authenticated" });
    }
    if (path === "/functions/v1/diagnostic-enrichment") {
      requetes.push(`edge ${method} diagnostic-enrichment`);
      enrichissement.push(corps);
      return json({ ok: true });
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const nom = path.slice("/rest/v1/rpc/".length);
      requetes.push(`rpc ${nom}`);
      if (nom === "has_role") return json(false);
      if (nom === "record_ai_usage") {
        credits.push({ user_id: corps.p_user_id, workspace_id: corps.p_workspace_id, category: corps.p_category,
          action_type: corps.p_action, model_used: corps.p_model });
        return json("usage-receipt");
      }
      if (nom === "consume_bonus_credit") return json(null);
      throw new Error(`faux PostgREST : RPC non gérée ${nom}`);
    }

    const m = path.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (!m) throw new Error(`faux PostgREST : chemin non géré ${method} ${path}`);
    const table = m[1];
    const filtres = [...url.searchParams.entries()].filter(([k]) => !PARAMS_RESERVES.has(k));
    const select = url.searchParams.get("select");
    requetes.push(`${method} ${table}${select ? ` select=${select}` : ""}${
      filtres.map(([k, v]) => ` ${k}=${v}`).join("")}`.replace(DATE_RE, "<date>"));

    const accept = String(init?.headers instanceof Headers ? init.headers.get("Accept") : init?.headers?.Accept ?? init?.headers?.accept ?? "");
    const objet = accept.includes("vnd.pgrst.object");

    if (method === "POST") {
      const lignes = Array.isArray(corps) ? corps : [corps];
      (insertions[table] ??= []).push(...lignes);
      const rendues = lignes.map((l: Row) => ({ id: `${table}-${++idInsere}`, ...l }));
      return objet ? json(rendues[0], 201) : json(rendues, 201);
    }

    const lignes = (monde.tables?.[table] ?? []).filter((row) =>
      filtres.every(([col, f]) => {
        if (f.startsWith("eq.")) return String(row[col]) === f.slice(3);
        if (f === "is.null") return row[col] === null || row[col] === undefined;
        return true; // gte./in. : non utilisés pour trier les lignes des tests
      }));
    const limite = Number(url.searchParams.get("limit") ?? Infinity);
    const servies = lignes.slice(0, limite);
    if (objet) {
      if (servies.length !== 1) {
        return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${servies.length} rows`, hint: null }, 406);
      }
      return json(servies[0]);
    }
    return json(servies);
  }) as typeof fetch;

  return {
    requetes, claude, enrichissement, insertions, credits,
    restore() { globalThis.fetch = originalFetch; },
  };
}

export function requeteDiagnostic(corps: unknown, authentifiee = true): Request {
  return new Request(`${TEST_SUPABASE_URL}/functions/v1/deep-diagnostic`, {
    method: "POST",
    headers: { ...(authentifiee ? { Authorization: "Bearer test-token" } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
}

/**
 * Fonctions internes d'index.ts (non exportées avant le lot 1 de la fiche 12),
 * chargées pour les tests sans toucher au code de prod : même réécriture que
 * captureStdServeHandler (serve() neutralisé, imports relatifs rendus
 * absolus), plus une ligne `export { … }` ajoutée à la fin. Après le lot 1,
 * les tests importeront ces fonctions depuis leurs nouveaux fichiers.
 */
export async function chargerInternes(): Promise<{
  robustJsonParse: (raw: string) => Row;
  isDegenerateDiagnostic: (result: Row) => boolean;
  stripMarkupFromSummary: (result: Row) => Row;
  buildFallbackDiagnostic: (profile: unknown, freeformAnswers: unknown, sourcesUsed: string[]) => Row;
  DIAGNOSTIC_TOOL: Row;
}> {
  const moduleUrl = new URL("./index.ts", import.meta.url).href;
  const source = await Deno.readTextFile(new URL(moduleUrl));
  const STD_SERVE_IMPORT = /import\s*\{\s*serve\s*\}\s*from\s*["']https:\/\/deno\.land\/std@[^"']+\/http\/server\.ts["'];?/;
  if (!STD_SERVE_IMPORT.test(source)) throw new Error("chargerInternes : import serve() de std/http introuvable");
  const rewritten = source
    .replace(STD_SERVE_IMPORT, "const serve = (_h: unknown) => {};")
    .replace(
      /(\bfrom\s*|\bimport\s*\(\s*|^import\s*)(["'])(\.{1,2}\/[^"']+)\2/gm,
      (_m, prefix, quote, spec) => `${prefix}${quote}${new URL(spec, moduleUrl).href}${quote}`,
    ) + "\nexport { robustJsonParse, isDegenerateDiagnostic, stripMarkupFromSummary, buildFallbackDiagnostic, DIAGNOSTIC_TOOL };\n";
  const bytes = new TextEncoder().encode(rewritten);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return await import(`data:application/typescript;base64,${btoa(binary)}`);
}
