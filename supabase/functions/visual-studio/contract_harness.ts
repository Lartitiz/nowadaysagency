// Harnais des tests de contrat du Studio (lot 0 de la fiche 5,
// docs/robustesse/gros-fichiers.md) : prompts_snapshot_test.ts et
// handler_contract_test.ts.
//
// Même principe que la `fixture()` de index_test.ts (vraies requêtes dans
// handleStudioRequest, `fetch` simulé pour Supabase REST/Storage, Anthropic et
// les fournisseurs d'images), avec en plus :
//   - des lignes filtrées comme le ferait PostgREST (id, status, revision) ;
//   - le journal ordonné des requêtes (méthode + chemin + colonnes lues) ;
//   - un plan d'abonnement réglable (admin, gratuit, Premium) pour le quota ;
//   - des réponses de Claude en file (une par appel).
// Ce fichier n'est pas un test (pas de suffixe _test) : `deno test` ne le
// lance pas seul. Il n'est importé que par des tests.

import { handleStudioRequest } from "./index.ts";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const SPACE = id(2);
export const SESSION = id(3);
export const PROPOSAL = id(4);
const HOST = "studio.test";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export type FixtureOptions = {
  /** Identifiant de l'utilisatrice : un par fichier de test (limite de 120 requêtes/min par compte). */
  actor: string;
  role?: string;
  /** "admin" = has_role vrai (quota illimité). Sinon plan d'abonnement réel. */
  plan?: "admin" | "free" | "outil";
  /** Nombre d'images (photo_retouch) déjà consommées ce mois. */
  imagesUsed?: number;
  /** Session absente en base (action create). */
  noSession?: boolean;
  /** Chemins de stockage introuvables (404). */
  missing?: string[];
  /** Images de la planche d'ambiance de la charte (brand_charter.moodboard_images). */
  moodboard?: Row[];
};

export function studioFixture(opts: FixtureOptions) {
  const saved = globalThis.fetch;
  const envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "PHOTOROOM_API_KEY",
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "HIGGSFIELD_API_KEY", "HIGGSFIELD_SOUL2_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED",
    "HIGGSFIELD_IMAGE_ENABLED"];
  const env = envKeys.map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", `https://${HOST}`);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("PHOTOROOM_API_KEY", "test-only");
  Deno.env.set("ANTHROPIC_API_KEY", "test-only");
  Deno.env.set("OPENAI_API_KEY", "test-only");
  Deno.env.delete("HIGGSFIELD_API_KEY");
  Deno.env.delete("HIGGSFIELD_IMAGE_ENABLED");
  Deno.env.set("HIGGSFIELD_SOUL2_ENABLED", "true");
  Deno.env.set("HIGGSFIELD_DATA_USE_REVIEWED", "true");

  const actor = opts.actor;
  const role = opts.role ?? "owner";
  const plan = opts.plan ?? "admin";
  const missing = new Set(opts.missing ?? []);
  let sessionExists = !opts.noSession;
  const requests: string[] = [];
  const payloads: Row[] = [];
  const rpcBodies: Record<string, Row[]> = {};
  const memories: Row[] = [];
  const compositions: Row[] = [];
  const photos: Row[] = [];
  const intents: Row[] = [];
  const failingRpc = new Map<string, string>();
  let lastIntent: Row = { operation: "advise", summary: "Une illustration adaptée à ton offre." };

  const session: Row = {
    id: SESSION, workspace_id: SPACE, user_id: actor, source_photo_id: id(5), references: [], brief: "",
    source_metadata: {}, source_ready: true, composition: null, source_path: "original", name: "Photo",
    archived_at: null, revision: 0, messages: [],
    proposal: { id: PROPOSAL, operation: "background", summary: "Fond crème", background_prompt: "cream", cost: 1 },
  };
  const version: Row = {
    id: PROPOSAL, session_id: SESSION, workspace_id: SPACE, user_id: actor, result_path: `${SPACE}/${SESSION}/version`,
    created_at: "2026-10-14T08:00:00.000Z", status: "ready", proposal: session.proposal,
  };
  const versions: Row[] = [version];

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const noRow = () => json({ code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested, multiple (or no) rows returned" }, 406);
  // PostgREST : une ligne attendue (single / maybeSingle hors GET) ou un tableau.
  const rows = (list: Row[], headers: Headers) =>
    (headers.get("Accept") || "").includes("vnd.pgrst.object") ? (list.length === 1 ? json(list[0]) : noRow()) : json(list);
  const eq = (url: URL, key: string) => url.searchParams.get(key)?.replace(/^eq\./, "");
  const matches = (url: URL, row: Row) =>
    ["id", "status", "revision"].every((key) => eq(url, key) === undefined || String(row[key]) === eq(url, key));

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const select = url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/rest/v1/rpc/")
      ? url.searchParams.get("select") : null;
    requests.push(`${method} ${url.host === HOST ? "" : url.host}${decodeURIComponent(url.pathname)}${select ? ` [${select}]` : ""}`);
    const body = () => JSON.parse(String(init?.body ?? "null"));
    const path = url.pathname;

    if (path === "/auth/v1/user") return json({ id: actor, aud: "authenticated", role: "authenticated" });
    if (path === "/rest/v1/workspace_members") {
      return select === "user_id" ? json([{ user_id: actor }]) : rows([{ role }], headers);
    }
    if (path === "/rest/v1/visual_studio_sessions") {
      if (method === "POST") {
        Object.assign(session, { references: [], messages: [], proposal: null, revision: 0, archived_at: null, composition: null, brief: "" }, body());
        sessionExists = true;
        return json(null, 201);
      }
      if (!sessionExists) return rows([], headers);
      if (method === "PATCH") {
        if (!matches(url, session)) return rows([], headers);
        Object.assign(session, body());
      }
      return rows([session], headers);
    }
    if (path === "/rest/v1/visual_studio_versions") {
      const found = versions.filter((v) => matches(url, v));
      if (method === "PATCH") found.forEach((v) => Object.assign(v, body()));
      return rows(found, headers);
    }
    if (path === "/rest/v1/visual_studio_compositions") {
      const selected = eq(url, "id");
      return rows(selected ? compositions.filter((c) => c.id === selected) : compositions, headers);
    }
    if (path === "/rest/v1/studio_brand_memory") {
      const selected = eq(url, "id");
      return rows(selected ? memories.filter((m) => m.id === selected) : memories, headers);
    }
    if (path === "/rest/v1/brand_charter" && select === "moodboard_images") {
      return rows([{ moodboard_images: opts.moodboard ?? null }], headers);
    }
    if (path.startsWith("/rest/v1/brand_")) return json({ mission: "Ateliers artisanaux" });
    if (path === "/rest/v1/user_photos") {
      const one = eq(url, "id");
      const many = url.searchParams.get("id")?.match(/^in\.\((.*)\)$/)?.[1].split(",");
      return rows(photos.filter((p) => (!one || p.id === one) && (!many || many.includes(p.id))), headers);
    }
    // Quota (plan-limiter) quand le compte n'est pas admin.
    if (path === "/rest/v1/subscriptions") return rows(plan === "outil" ? [{ plan: "outil", status: "active", source: "manual" }] : [], headers);
    if (path === "/rest/v1/workspaces") return rows([{ plan: "free" }], headers);
    if (path === "/rest/v1/coaching_programs") return rows([], headers);
    if (path === "/rest/v1/profiles") return rows([{ bonus_credits: 0 }], headers);
    if (path === "/rest/v1/ai_usage") return json(Array.from({ length: opts.imagesUsed ?? 0 }, () => ({ category: "photo_retouch" })));

    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      const args = body();
      (rpcBodies[name] ??= []).push(args);
      if (failingRpc.has(name)) return json({ message: failingRpc.get(name) }, 400);
      if (name === "has_role") return json(plan === "admin");
      if (name === "studio_reserve_interpretation") return json(true);
      if (name === "studio_set_session_archived") {
        Object.assign(session, { archived_at: args.p_archive ? "2026-10-14T09:00:00.000Z" : null, revision: session.revision + 1, proposal: null });
        return json(session);
      }
      if (name === "studio_save_composition") {
        if (args.p_revision !== session.revision) return json({ message: "studio_conflict" }, 409);
        compositions.unshift({ id: id(700 + compositions.length), session_id: SESSION, workspace_id: SPACE, user_id: actor,
          design: args.p_design, title: args.p_design.title, background_path: args.p_background_path, created_at: "2026-10-14T09:00:00.000Z" });
        Object.assign(session, { composition: { design: args.p_design, background_path: args.p_background_path }, revision: session.revision + 1 });
        return json(session);
      }
      if (name === "studio_confirm_generation") {
        const claimed = { id: args.p_proposal, session_id: SESSION, workspace_id: SPACE, user_id: actor, status: "processing",
          result_path: `${SPACE}/${SESSION}/${args.p_proposal}`, created_at: "2026-10-14T09:00:00.000Z", proposal: session.proposal };
        versions.push(claimed);
        return json({ claimed: true, version: claimed });
      }
      if (name === "studio_complete_generation") {
        versions.filter((v) => v.id === args.p_version).forEach((v) => v.status = "ready");
        return json(true);
      }
      if (name === "studio_save_library") return json(id(900));
      if (name === "studio_write_memory") {
        memories.push({ id: args.p_id, kind: args.p_kind, name: args.p_name, note: args.p_note, revision: args.p_revision + 1, references: args.p_references });
        return json(null);
      }
    }

    if (path.startsWith("/storage/v1/object/sign/")) {
      return json({ signedURL: `/object/sign/${decodeURIComponent(path.slice("/storage/v1/object/sign/".length))}?token=t` });
    }
    if (path.startsWith("/storage/v1/render/image/authenticated/")) {
      return new Response(new Blob(["resized"], { type: "image/webp" }));
    }
    if (path.startsWith("/storage/v1/object/")) {
      const objectPath = decodeURIComponent(path.slice("/storage/v1/object/".length)).split("/").slice(1).join("/");
      if (method === "POST" || method === "PUT") return json({ Key: objectPath });
      if (missing.has(objectPath)) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
      return new Response(new Blob(["source"], { type: "image/jpeg" }));
    }

    if (url.host === "api.anthropic.com") {
      const sent = body();
      payloads.push(sent);
      const intent = intents.length ? intents.shift()! : lastIntent;
      lastIntent = intent;
      return json({ content: [{ type: "tool_use", name: sent.tools?.[0]?.name || "prepare_photo_request", input: intent }], stop_reason: "tool_use" });
    }
    if (url.host === "image-api.photoroom.com") return new Response(new Blob(["photoroom"], { type: "image/jpeg" }));
    if (url.host === "api.openai.com") return json({ data: [{ b64_json: btoa("openai") }] });
    throw new Error(`Requête réseau inattendue : ${method} ${url.href}`);
  };

  return {
    actor, session, version, versions, memories, compositions, photos, requests, payloads, rpcBodies,
    /** Réponses de Claude, consommées dans l'ordre ; la dernière est répétée ensuite. */
    setIntents: (...list: Row[]) => {
      intents.splice(0, intents.length, ...list);
      lastIntent = list.at(-1) ?? lastIntent;
    },
    /** La fonction SQL `name` renvoie une erreur portant ce message. */
    failRpc: (name: string, message: string) => failingRpc.set(name, message),
    send: async (body: Row) => {
      const res = await handleStudioRequest(new Request(`https://${HOST}/functions/v1/visual-studio`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test" }, body: JSON.stringify(body),
      }));
      const text = await res.text();
      let data: Row | null = null;
      try { data = JSON.parse(text); } catch { data = { texte: text }; }
      return { status: res.status, data: data! };
    },
    restore: () => {
      globalThis.fetch = saved;
      for (const [k, v] of env) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    },
  };
}
export type StudioFixture = ReturnType<typeof studioFixture>;

/**
 * Rend un document stable : identifiants aléatoires numérotés dans l'ordre
 * d'apparition (<uuid-1>…), dates remplacées par <date>. Les identifiants
 * du harnais (00000000-0000-4000-8000-…) restent lisibles.
 */
export function stable(text: string) {
  const seen = new Map<string, string>();
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (uuid) => {
      if (uuid.startsWith("00000000-0000-4000-8000-")) return `id(${Number(uuid.slice(24))})`;
      if (!seen.has(uuid)) seen.set(uuid, `<uuid-${seen.size + 1}>`);
      return seen.get(uuid)!;
    })
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, "<date>");
}
