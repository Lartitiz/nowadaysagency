// Harnais de test UNIQUEMENT (fiche 18, lot T) — jamais importé par du code de prod.
// Fait tourner le vrai handler de cron-health sur une base en mémoire :
// - un faux PostgREST qui sert des tables remplies et applique les filtres
//   réellement envoyés (eq., gte., lt., in.()), la pagination offset/limit,
//   le `count` exact (HEAD + Content-Range) et le RPC cron_jobs_health ;
// - de fausses API Photoroom (/v1/account) et Stripe (/v1/events, /v1/subscriptions) ;
// - une horloge figée (Date.now() et new Date() sans argument), pour que le
//   JSON entier, `generated_at` compris, se fige en snapshot.
// Chaque requête est notée (table, colonnes, filtres, pagination) : le snapshot
// de cette liste attrape une lecture oubliée ou doublée lors d'un découpage.

export const TEST_SUPABASE_URL = "https://fake-supabase.test";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
/** Une table : ses lignes, ou une erreur PostgREST (status + corps). Une fonction choisit selon les colonnes demandées. */
export type FausseTable =
  | Row[]
  | { status: number; body: unknown }
  | ((select: string) => Row[] | { status: number; body: unknown });

export interface FauxMonde {
  tables: Record<string, FausseTable>;
  /** Résultat du RPC cron_jobs_health (tableau), ou une erreur. */
  cronJobs?: Row[] | { status: number; body: unknown };
  photoroom?: { status: number; body: unknown };
  stripeEvents?: { status: number; body: unknown };
  stripeSubscriptions?: { status: number; body: unknown };
}

export interface FauxFetch {
  /** Requêtes reçues, dans l'ordre d'arrivée (lisibles, sans en-têtes). */
  requetes: string[];
  restore(): void;
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function valeurFiltre(brute: string): string {
  return brute.length >= 2 && brute.startsWith('"') && brute.endsWith('"') ? brute.slice(1, -1) : brute;
}

/** Applique un filtre PostgREST `op.valeur` à une ligne. Lance si l'opérateur est inconnu. */
function garde(row: Row, col: string, filtre: string): boolean {
  const dot = filtre.indexOf(".");
  const op = filtre.slice(0, dot);
  const val = filtre.slice(dot + 1);
  const v = row[col];
  switch (op) {
    case "eq":
      return v !== null && v !== undefined && String(v) === val;
    case "gte":
      return v !== null && v !== undefined && String(v) >= val;
    case "lt":
      return v !== null && v !== undefined && String(v) < val;
    case "in": {
      const liste = val.replace(/^\(|\)$/g, "").split(",").map(valeurFiltre);
      return v !== null && v !== undefined && liste.includes(String(v));
    }
    default:
      throw new Error(`faux PostgREST : opérateur non géré « ${op} » (${col}=${filtre})`);
  }
}

// Les versions de postgrest-js ne citent pas toutes les valeurs de `in.()` de la
// même façon : on note la forme sans guillemets, pour un snapshot stable.
function normaliser(filtre: string): string {
  if (!filtre.startsWith("in.(")) return filtre;
  return `in.(${filtre.slice(4, -1).split(",").map(valeurFiltre).join(",")})`;
}

const PARAMS_RESERVES = new Set(["select", "offset", "limit", "order"]);

function projeter(row: Row, select: string): Row {
  if (!select || select === "*") return { ...row };
  const out: Row = {};
  for (const c of select.split(",").map((s) => s.trim()).filter(Boolean)) {
    // Alias PostgREST « nom:colonne->chemin » : la ligne de test porte déjà la valeur sous « nom ».
    const nom = c.includes(":") ? c.split(":")[0] : c;
    out[nom] = row[nom] ?? null;
  }
  return out;
}

export function installerFauxFetch(monde: FauxMonde): FauxFetch {
  const originalFetch = globalThis.fetch;
  const requetes: string[] = [];

  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input?.url ?? String(input));
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (url.origin === "https://image-api.photoroom.com") {
      requetes.push(`photoroom ${method} ${url.pathname}`);
      const r = monde.photoroom ?? { status: 500, body: { detail: "photoroom non simulé" } };
      return jsonResponse(r.body, r.status);
    }

    if (url.origin === "https://api.stripe.com") {
      requetes.push(`stripe ${method} ${url.pathname}${url.search}`);
      const r = url.pathname === "/v1/events"
        ? monde.stripeEvents
        : url.pathname === "/v1/subscriptions"
        ? monde.stripeSubscriptions
        : undefined;
      const rep = r ?? { status: 500, body: { error: { message: "stripe non simulé" } } };
      return jsonResponse(rep.body, rep.status);
    }

    if (url.origin === TEST_SUPABASE_URL) {
      if (url.pathname === "/rest/v1/rpc/cron_jobs_health") {
        requetes.push(`rpc cron_jobs_health`);
        const r = monde.cronJobs ?? [];
        return Array.isArray(r) ? jsonResponse(r) : jsonResponse(r.body, r.status);
      }
      const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (!m) throw new Error(`faux PostgREST : chemin non géré ${method} ${url.pathname}`);
      const table = m[1];
      const select = url.searchParams.get("select") ?? "*";
      const filtres = [...url.searchParams.entries()]
        .filter(([k]) => !PARAMS_RESERVES.has(k))
        .sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw === null ? Infinity : Number(limitRaw);
      const prefer = String(
        (init?.headers instanceof Headers ? init.headers.get("Prefer") : init?.headers?.Prefer ?? init?.headers?.prefer) ?? "",
      );
      const pagination = limitRaw === null ? "" : ` [${offset}+${limit}]`;
      const comptage = /count=exact/.test(prefer) ? " (count)" : "";
      requetes.push(
        `${method} ${table} ${select}${filtres.map(([k, v]) => ` ${k}=${normaliser(v)}`).join("")}${pagination}${comptage}`,
      );

      const def = monde.tables[table];
      if (def === undefined) throw new Error(`faux PostgREST : table non déclarée « ${table} »`);
      const resolu = typeof def === "function" ? def(select) : def;
      if (!Array.isArray(resolu)) return jsonResponse(resolu.body, resolu.status);

      const lignes = resolu.filter((row) => filtres.every(([col, f]) => garde(row, col, f)));
      if (method === "HEAD") {
        return new Response(null, {
          status: 200,
          headers: { "Content-Range": `*/${lignes.length}` },
        });
      }
      const page = lignes.slice(offset, offset + limit).map((r) => projeter(r, select));
      const fin = page.length ? offset + page.length - 1 : offset;
      return jsonResponse(page, 200, { "Content-Range": `${offset}-${fin}/*` });
    }

    throw new Error(`fetch inattendu dans le test cron-health : ${method} ${url.href}`);
  }) as typeof fetch;

  return {
    requetes,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** Fige Date.now() et `new Date()` (sans argument) ; les autres usages de Date restent réels. */
export function figerHeure(iso: string): () => void {
  const RealDate = Date;
  const t = RealDate.parse(iso);
  class DateFigee extends RealDate {
    // deno-lint-ignore no-explicit-any
    constructor(...args: any[]) {
      // deno-lint-ignore no-explicit-any
      if (args.length === 0) super(t);
      // deno-lint-ignore no-explicit-any
      else super(...(args as [any]));
    }
    static override now() {
      return t;
    }
  }
  // deno-lint-ignore no-explicit-any
  (globalThis as any).Date = DateFigee;
  return () => {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).Date = RealDate;
  };
}

const ENV_GERES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_STATS_SECRET",
  "PHOTOROOM_API_KEY",
  "STRIPE_SECRET_KEY",
  "HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD",
  "HIGGSFIELD_IMAGE_ENABLED",
  "HIGGSFIELD_DATA_USE_REVIEWED",
] as const;

export const CRON_SECRET_TEST = "secret-cron-test";

/**
 * Pose les variables d'environnement de l'edge (toutes présentes par défaut ;
 * `null` en retire une) et rend une fonction qui remet l'état d'avant.
 */
export function poserEnv(overrides: Partial<Record<(typeof ENV_GERES)[number], string | null>> = {}): () => void {
  const avant = new Map(ENV_GERES.map((k) => [k, Deno.env.get(k)]));
  const valeurs: Record<string, string | null> = {
    SUPABASE_URL: TEST_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    CRON_STATS_SECRET: CRON_SECRET_TEST,
    PHOTOROOM_API_KEY: "test-photoroom-key",
    STRIPE_SECRET_KEY: "sk_test_fake",
    HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD: "50",
    HIGGSFIELD_IMAGE_ENABLED: "true",
    HIGGSFIELD_DATA_USE_REVIEWED: "true",
    ...overrides,
  };
  for (const [k, v] of Object.entries(valeurs)) {
    if (v === null) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  return () => {
    for (const [k, v] of avant) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  };
}

export function requeteCron(body: unknown, secret: string | null = CRON_SECRET_TEST): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-cron-secret"] = secret;
  return new Request("http://localhost/cron-health", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
