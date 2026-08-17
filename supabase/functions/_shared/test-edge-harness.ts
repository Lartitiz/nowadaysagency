// Harnais de test UNIQUEMENT — jamais importé par du code de prod.
// Permet d'exercer un vrai edge Deno.serve(handler) dans `deno test` sans DB
// ni appel réseau réel : on capte le handler et on mocke fetch() pour
// Supabase (REST/RPC/Auth générique) et l'API Anthropic.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/<fn>/index_test.ts
// (flags EXACTS de la CI, script npm test:edges — PAS --allow-all : un test
// qui a besoin de plus que ça, ex. un vrai socket, plante en CI. Voir le
// piège documenté dans creative-flow/index_test.ts.)

export const TEST_SUPABASE_URL = "https://fake-supabase.test";

// deno-lint-ignore no-explicit-any
type Handler = (req: Request) => any;

/**
 * Capte le handler passé à `Deno.serve(handler)` au lieu d'ouvrir un vrai
 * socket. Ne fonctionne QUE pour les edges qui appellent `Deno.serve`
 * directement (pas le `serve()` de std/http, qui écoute vraiment — voir
 * creative-flow/index_test.ts pour ce cas).
 */
export async function captureServeHandler(modulePath: string): Promise<Handler> {
  const originalServe = Deno.serve;
  let captured: Handler | null = null;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (...args: any[]) => {
    const arg = args[0];
    captured = typeof arg === "function" ? arg : (args[1] ?? arg?.fetch ?? arg?.handler);
    return {
      finished: Promise.resolve(),
      shutdown: () => Promise.resolve(),
      ref() {},
      unref() {},
      addr: { transport: "tcp", hostname: "localhost", port: 0 },
      // deno-lint-ignore no-explicit-any
    } as any;
  };
  try {
    await import(modulePath);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = originalServe;
  }
  if (!captured) {
    throw new Error(`captureServeHandler: aucun Deno.serve() capté pour ${modulePath}`);
  }
  return captured;
}

export interface FetchMockConfig {
  /** Simule la réponse de l'API Anthropic (POST https://api.anthropic.com/v1/messages). */
  anthropic: () => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
}

export interface FetchMockHandle {
  /** Toutes les requêtes POST reçues sur /rest/v1/ai_usage (= tentatives de logUsage). */
  aiUsageInserts: Record<string, unknown>[];
  /** Nombre d'appels faits à l'API Anthropic. */
  anthropicCallCount: number;
  restore(): void;
}

/**
 * Installe un faux `fetch` global :
 * - `${TEST_SUPABASE_URL}/auth/v1/user` → utilisateur de test authentifié
 * - `${TEST_SUPABASE_URL}/rest/v1/rpc/has_role` → false (pas admin)
 * - `${TEST_SUPABASE_URL}/rest/v1/ai_usage` POST → capté dans `aiUsageInserts`
 *   (c'est LE signal qu'on veut observer : logUsage a été appelé ou non)
 * - toute autre table `${TEST_SUPABASE_URL}/rest/v1/*` → réponse vide générique
 *   (tableau JSON `[]` — postgrest-js déballe lui-même .single()/.maybeSingle()
 *   côté client : 0 ligne -> data null quel que soit le header Accept envoyé
 *   par le SDK sur un GET, pas besoin d'émuler le wire format PostgREST exact).
 *   Suffisant car aucun des call sites testés ici ne branche sur `error`.
 * - `https://api.anthropic.com/v1/messages` → délègue à `config.anthropic()`
 * - tout le reste (imports https, requêtes localhost) → fetch réel, en passthrough.
 */
export function installFetchMock(config: FetchMockConfig): FetchMockHandle {
  const originalFetch = globalThis.fetch;
  const aiUsageInserts: Record<string, unknown>[] = [];
  let anthropicCallCount = 0;

  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);

    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      anthropicCallCount++;
      const { status, body } = await config.anthropic();
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.startsWith(TEST_SUPABASE_URL)) {
      const path = url.slice(TEST_SUPABASE_URL.length).split("?")[0];
      const method = (init?.method || "GET").toUpperCase();

      if (path === "/auth/v1/user") {
        return new Response(
          JSON.stringify({ id: "test-user-id", email: "test@example.com", aud: "authenticated", role: "authenticated" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (path === "/rest/v1/rpc/has_role") {
        return new Response(JSON.stringify(false), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (path === "/rest/v1/rpc/consume_bonus_credit") {
        return new Response(JSON.stringify(null), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (path === "/rest/v1/ai_usage" && method === "POST") {
        const row = init?.body ? JSON.parse(init.body as string) : {};
        aiUsageInserts.push(row);
        return new Response(JSON.stringify([row]), { status: 201, headers: { "Content-Type": "application/json" } });
      }

      // Table générique : tableau vide. postgrest-js déballe .single()/.maybeSingle()
      // côté client (0 ligne -> null), pas besoin d'émuler l'Accept header PostgREST.
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  return {
    aiUsageInserts,
    get anthropicCallCount() {
      return anthropicCallCount;
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** Env vars factices communes aux edges testées. Valeurs sans signification, jamais atteintes réellement (fetch mocké). */
export function setTestEnv() {
  Deno.env.set("SUPABASE_URL", TEST_SUPABASE_URL);
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  Deno.env.set("ANTHROPIC_API_KEY", "test-anthropic-key");
}

export function authedRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Réponse Anthropic "tool_use" réussie, prête pour extractValidatedToolInput. */
export function anthropicToolSuccess(toolName: string, input: unknown) {
  return {
    status: 200,
    body: {
      content: [{ type: "tool_use", name: toolName, input }],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

/** Réponse Anthropic texte réussie (callAnthropic sans tool). */
export function anthropicTextSuccess(text: string) {
  return {
    status: 200,
    body: {
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

/** Échec NON-retryable (400) : callAnthropic(ToolSimple) lève immédiatement, sans délai de retry. */
export function anthropicFailure() {
  return {
    status: 400,
    body: { error: { message: "simulated failure" } },
  };
}
