import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { checkRateLimit, rateLimitResponse } from "./rate-limiter.ts";
import { isDemoUser } from "./guard-demo.ts";

/**
 * Bloc CORS+auth (+ rate-limit + garde démo) recopié quasi à l'identique en
 * tête d'une cinquantaine d'edge functions (mesure jscpd du 18/08 : bloc
 * quasi identique entre persona-ai / strategy-ai / storytelling-ai).
 *
 * `authenticateEdgeUser` remplace : lecture du header Authorization,
 * création du client Supabase scopé (anon key + header), `auth.getUser()`,
 * les deux réponses 401, puis optionnellement la garde compte de démo
 * (`isDemoUser`) et le rate-limiting (`checkRateLimit`) qui suivent souvent
 * ce bloc dans les fichiers d'origine.
 *
 * Comportement par défaut = la famille la plus répandue observée dans le
 * code existant (persona-ai, strategy-ai, storytelling-ai, niche-ai,
 * proposition-ai, audit-instagram-ai, extract-offer-from-url,
 * generate-content, branding-mirror, linkedin-ai, linkedin-audit-ai,
 * offer-coaching, voice-analysis) : messages "Authentification requise" /
 * "Authentification invalide", garde démo à "Demo mode: this feature is
 * simulated" (403). Une autre famille de fonctions (newsjacking-*, coach-chat,
 * inspire-ai...) utilise "Non autorisé" partout et exige un préfixe
 * "Bearer " — non couverte ici pour l'instant (options prévues :
 * `missingMessage`/`invalidMessage`/`requireBearerPrefix` si on migre ce
 * second groupe plus tard).
 *
 * Ne PAS utiliser pour les fonctions qui ont déjà une logique d'auth
 * différente (ex: rôle admin en plus, `authenticateRequest` de auth.ts avec
 * message "Non autorisé" déjà en place) — préserver leur comportement HTTP
 * existant prime sur l'unification.
 */

export interface EdgeAuthOptions {
  /** Exige un header au format "Bearer <token>" plutôt qu'un simple header non vide. Défaut: false. */
  requireBearerPrefix?: boolean;
  /** Message (et statut 401) renvoyé quand le header est absent/malformé. */
  missingMessage?: string;
  /** Message (et statut 401) renvoyé quand supabase.auth.getUser() échoue. */
  invalidMessage?: string;
  /** Active le rate-limiter en mémoire (rate-limiter.ts), paramètres par défaut. Défaut: false. */
  rateLimit?: boolean;
  /** Active la garde compte de démo (guard-demo.ts). Défaut: false. */
  demoGuard?: boolean | { message?: string };
  /**
   * Quand les deux gardes sont actives, laquelle passe en premier — DOIT
   * correspondre à l'ordre du fichier d'origine pour préserver le
   * comportement exact (le premier check qui échoue détermine la réponse).
   * Défaut: "demo-first".
   */
  guardOrder?: "demo-first" | "rate-first";
}

export interface EdgeAuthResult {
  userId: string;
  // deno-lint-ignore no-explicit-any
  supabase: any;
}

const DEFAULT_MISSING_MESSAGE = "Authentification requise";
const DEFAULT_INVALID_MESSAGE = "Authentification invalide";
const DEFAULT_DEMO_MESSAGE = "Demo mode: this feature is simulated";

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Authentifie l'appelant et applique, si demandé, les gardes rate-limit /
 * démo qui suivent habituellement. Renvoie soit la `Response` à retourner
 * immédiatement (échec d'auth ou garde déclenchée), soit `{ userId, supabase }`
 * en cas de succès — au call site :
 *
 * ```ts
 * const auth = await authenticateEdgeUser(req, corsHeaders, { rateLimit: true, demoGuard: true });
 * if (auth instanceof Response) return auth;
 * const { userId, supabase } = auth;
 * ```
 */
export async function authenticateEdgeUser(
  req: Request,
  corsHeaders: Record<string, string>,
  options: EdgeAuthOptions = {},
): Promise<EdgeAuthResult | Response> {
  const {
    requireBearerPrefix = false,
    missingMessage = DEFAULT_MISSING_MESSAGE,
    invalidMessage = DEFAULT_INVALID_MESSAGE,
    rateLimit = false,
    demoGuard = false,
    guardOrder = "demo-first",
  } = options;

  const authHeader = req.headers.get("Authorization");
  const headerPresent = requireBearerPrefix
    ? !!authHeader?.startsWith("Bearer ")
    : !!authHeader;

  if (!headerPresent) {
    return jsonResponse({ error: missingMessage }, 401, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader! } } },
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return jsonResponse({ error: invalidMessage }, 401, corsHeaders);
  }

  const userId = user.id;

  const runDemoGuard = (): Response | null => {
    if (!demoGuard) return null;
    if (!isDemoUser(userId)) return null;
    const message = (typeof demoGuard === "object" && demoGuard.message) ||
      DEFAULT_DEMO_MESSAGE;
    return jsonResponse({ error: message }, 403, corsHeaders);
  };

  const runRateLimit = (): Response | null => {
    if (!rateLimit) return null;
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfterMs!, corsHeaders);
    }
    return null;
  };

  const guards = guardOrder === "rate-first"
    ? [runRateLimit, runDemoGuard]
    : [runDemoGuard, runRateLimit];

  for (const guard of guards) {
    const res = guard();
    if (res) return res;
  }

  return { userId, supabase };
}
