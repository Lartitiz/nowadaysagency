// Shared Anthropic API helper for edge functions

/**
 * Règle de marque : JAMAIS de tiret cadratin (—) en sortie. Le modèle en produit
 * malgré l'instruction (incises) ; ce nettoyage déterministe le garantit.
 * Remplace tiret cadratin (—) et demi-cadratin (–) par une virgule.
 * Ne touche PAS le trait d'union "-" (donc "30-45 mots", puces "- ", dates intacts).
 */
export function sanitizeDashes(text: string): string {
  if (!text) return text;
  return text
    .replace(/ *[—–] */g, ", ") // tiret (entouré ou non d'espaces) -> virgule
    .replace(/,\s*,/g, ",");    // évite ",," si deux tirets se suivaient
}

/** Applique sanitizeDashes à toutes les strings d'une valeur JSON (sortie structurée). */
export function sanitizeDashesDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeDashes(value) as unknown as T;
  if (Array.isArray(value)) return value.map(sanitizeDashesDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeDashesDeep(v);
    return out as unknown as T;
  }
  return value;
}

export type AnthropicModel =
  | "claude-opus-4-8"
  | "claude-sonnet-4-6"
  | "claude-sonnet-5"
  | "claude-haiku-4-5";

export function getDefaultModel(): AnthropicModel {
  return (Deno.env.get("AI_MODEL_DEFAULT") as AnthropicModel) || "claude-sonnet-4-6";
}

/**
 * Tier « Sonnet » configurable (même patron que `AI_MODEL_QUESTIONS`). Permet de
 * re-benchmarker Sonnet 5 en heure creuse via un simple secret Lovable
 * `AI_MODEL_SONNET=claude-sonnet-5` (rollback instantané en le retirant). Défaut =
 * Sonnet 4.6 → AUCUN changement de comportement tant que le secret n'est pas posé.
 * Point de vérité unique : `getModelForAction` remappe toute sortie Sonnet 4.6 ici,
 * + les 3 littéraux Sonnet hors MODEL_MAP (carrousel visuel, passe de correction Max,
 * photo-dump). ⚠️ Sonnet 5 REJETTE `temperature` (400, cf MODELS_REJECTING_SAMPLING)
 * ET active le thinking ADAPTATIF quand le champ est omis (cf MODELS_THINKING_ON).
 */
export const SONNET_MODEL: AnthropicModel =
  (Deno.env.get("AI_MODEL_SONNET") as AnthropicModel) || "claude-sonnet-4-6";

/**
 * Opus 4.8 (et 4.7) REJETTENT les paramètres d'échantillonnage (temperature,
 * top_p, top_k) → erreur 400. Sonnet 4.6 et Haiku 4.5 les acceptent encore.
 * On retire donc `temperature` du corps de requête pour ces modèles ; ils
 * utilisent leur échantillonnage par défaut (comportement attendu et seul valide).
 */
const MODELS_REJECTING_SAMPLING = new Set<string>([
  "claude-opus-4-8",
  "claude-opus-4-7",
  // Sonnet 5 rejette lui aussi temperature/top_p/top_k (valeur non-défaut → 400).
  "claude-sonnet-5",
]);

export function supportsTemperature(model: string): boolean {
  return !MODELS_REJECTING_SAMPLING.has(model);
}

/**
 * Certains modèles activent le thinking ADAPTATIF quand le champ `thinking` est OMIS
 * (Sonnet 5 : omission ⇒ adaptatif ON ; ≠ Sonnet 4.6 / Opus 4.8 où omission ⇒ off).
 * Comme ce code n'envoie jamais `thinking`, on force `disabled` pour ces modèles afin
 * de préserver le comportement historique (sortie directe, sans latence ni blocs de
 * réflexion non gérés par le parsing JSON). N'affecte que Sonnet 5 → no-op tant que
 * `AI_MODEL_SONNET` n'est pas basculé.
 */
const MODELS_THINKING_ON_WHEN_OMITTED = new Set<string>([
  "claude-sonnet-5",
]);

export function forcesDisabledThinking(model: string): boolean {
  return MODELS_THINKING_ON_WHEN_OMITTED.has(model);
}

/**
 * Ces mêmes modèles (Opus 4.8/4.7) REFUSENT aussi un « prefill » : un tableau de
 * messages se terminant par un tour `assistant` → erreur 400. En chat normal le
 * dernier message est `user`, mais un renvoi/état particulier peut laisser un tour
 * assistant final. On le retire de façon déterministe pour ces modèles.
 */
export function stripTrailingAssistant(messages: AnthropicMessage[]): AnthropicMessage[] {
  let end = messages.length;
  while (end > 0 && messages[end - 1].role === "assistant") end--;
  return end === messages.length ? messages : messages.slice(0, end);
}

function prepareMessages(model: string, messages: AnthropicMessage[]): AnthropicMessage[] {
  return supportsTemperature(model) ? messages : stripTrailingAssistant(messages);
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | any[];
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface AnthropicOptions {
  model: AnthropicModel;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  max_tokens?: number;
  /**
   * Plafond (ms) PAR TENTATIVE pour l'appel HTTP à Anthropic. Sans ça, un `fetch`
   * qui traîne (API surchargée, socket bloquée) peut pendre indéfiniment et,
   * cumulé au backoff de retry, produire des latences de plus d'une minute.
   * undefined = pas d'abort (comportement historique conservé pour tous les
   * appelants). À ne renseigner QUE sur des appels courts et bornés (ex. la
   * génération de questions en Haiku) pour transformer un blocage en retry rapide.
   */
  abortTimeoutMs?: number;
  /**
   * Désactive `sanitizeDashes` sur la sortie de CET appel. À réserver aux edges
   * de RENDU qui recopient du texte utilisateur verbatim (carousel-visual…) :
   * l'anti-tic « — → virgule » y réécrivait les tirets présents dans le texte
   * source des slides (vu en prod : « » — moi, en 2021 » rendu « », moi, en
   * 2021 »), et cassait le repli d'édition live par correspondance de texte.
   * Les textes GÉNÉRÉS restent assainis par défaut (comportement historique).
   */
  keepDashes?: boolean;
  /**
   * Sortie structurée : force le modèle à répondre via ce tool (`tool_choice`).
   * L'API garantit alors un `input` conforme au schéma — ça élimine toute la
   * classe d'échecs « réponse IA illisible » du parsing texte (guillemets non
   * échappés dans une string, sauts de ligne bruts, prose autour du JSON).
   * `callAnthropic` renvoie alors `JSON.stringify(input)` : les appelants
   * existants gardent leur flux (string → tryParseAiJson) mais le parse ne
   * peut plus échouer.
   */
  tool?: AnthropicTool;
}

// Modèle par type d'action — Sonnet pour le contenu courant, Opus pour les tâches complexes
const MODEL_MAP: Record<string, AnthropicModel> = {
  // Opus : tâches complexes qui nécessitent un raisonnement profond
  "audit": "claude-sonnet-4-6",
  "coaching": "claude-opus-4-8",
  "coaching_light": "claude-sonnet-4-6",
  "strategy": "claude-opus-4-8",
  "branding_audit": "claude-opus-4-8",
  "assistant_chat": "claude-opus-4-8",

  // Sonnet : contenu courant, génération rapide
  "content": "claude-sonnet-4-6",
  "bio": "claude-sonnet-4-6",
  "caption": "claude-sonnet-4-6",
  "carousel": "claude-sonnet-4-6",
  "reels": "claude-sonnet-4-6",
  "stories": "claude-sonnet-4-6",
  "dm_comment": "claude-sonnet-4-6",
  "highlights": "claude-sonnet-4-6",
  "linkedin_post": "claude-sonnet-4-6",
  "pinterest": "claude-sonnet-4-6",
  "website": "claude-sonnet-4-6",
  "suggestion": "claude-sonnet-4-6",
  "adaptation": "claude-sonnet-4-6",
  "text_action": "claude-sonnet-4-6",
  "niche": "claude-sonnet-4-6",
  "persona": "claude-sonnet-4-6",
  "proposition": "claude-sonnet-4-6",
  "import": "claude-sonnet-4-6",
  "storytelling": "claude-sonnet-4-6",
  "launch": "claude-sonnet-4-6",
  "offer": "claude-sonnet-4-6",
  "scoring": "claude-sonnet-4-6",
  "voice": "claude-sonnet-4-6",

  // Haiku : tâches courtes et structurées (génération de questions, classification)
  // Override possible via env AI_MODEL_QUESTIONS pour revenir à Sonnet en cas de souci.
  "questions": (Deno.env.get("AI_MODEL_QUESTIONS") as AnthropicModel) || "claude-haiku-4-5",
};

export function getModelForAction(action: string): AnthropicModel {
  const model = MODEL_MAP[action] || getDefaultModel();
  // Point de bascule unique du tier Sonnet : toute action mappée sur Sonnet 4.6 suit
  // `AI_MODEL_SONNET` (défaut 4.6 = no-op). Couvre content/caption/carousel/reels/
  // stories/linkedin_post/… d'un seul geste, sans éditer les 20 littéraux du MODEL_MAP.
  return model === "claude-sonnet-4-6" ? SONNET_MODEL : model;
}

/**
 * Sélectionne Opus si l'utilisatrice a fourni du contenu personnel riche,
 * Sonnet sinon. Le contenu personnel nécessite un meilleur raisonnement
 * pour être intégré naturellement dans le contenu généré.
 */
export function getModelForRichContent(
  action: string,
  hasRichPersonalContent: boolean
): AnthropicModel {
  if (hasRichPersonalContent) {
    return "claude-opus-4-8";
  }
  return getModelForAction(action);
}

const MAX_RETRIES = 2;
const RETRY_DELAYS = [3000, 6000]; // ms

/**
 * Tokens réellement consommés par un appel Anthropic (remontés par l'API dans
 * `usage`). `model` reflète le modèle EFFECTIVEMENT utilisé (donc Sonnet en cas
 * de fallback Opus→Sonnet), pour que le calcul de coût admin pondère juste.
 */
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  model: string;
}

/**
 * Réceptacle optionnel passé par l'appelant : le wrapper le remplit avec le
 * usage réel. On le mute (plutôt que de changer le type de retour) pour ne pas
 * casser les ~50 appelants existants de callAnthropic/callAnthropicSimple.
 */
export type UsageSink = Partial<AnthropicUsage>;

/** Extrait input/output tokens d'une réponse API Anthropic non-stream. */
export function extractUsage(data: any, model: string): AnthropicUsage {
  const input = data?.usage?.input_tokens ?? 0;
  const output = data?.usage?.output_tokens ?? 0;
  return { input_tokens: input, output_tokens: output, total_tokens: input + output, model };
}

export interface AnthropicResult {
  text: string;
  stop_reason: string | null;
  usage?: AnthropicUsage;
}

export async function callAnthropicWithMeta(options: AnthropicOptions): Promise<AnthropicResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const body: any = {
    model: options.model,
    messages: prepareMessages(options.model, options.messages),
    max_tokens: options.max_tokens || 4096,
  };

  // Sonnet 5 : thinking adaptatif ON si omis → on force `disabled` (comportement historique).
  if (forcesDisabledThinking(options.model)) {
    body.thinking = { type: "disabled" };
  }

  if (options.system) {
    body.system = [
      {
        type: "text",
        text: options.system,
        cache_control: { type: "ephemeral" }
      }
    ];
  }

  // Opus 4.8/4.7 rejettent `temperature` (400) — on ne l'envoie que si le modèle l'accepte.
  if (options.temperature !== undefined && supportsTemperature(options.model)) {
    body.temperature = options.temperature;
  }

  let lastError: Error | null = null;

  console.log(JSON.stringify({
    type: "ai_call_debug_meta",
    model: options.model,
    max_tokens: body.max_tokens,
    timestamp: new Date().toISOString(),
  }));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 6000;
      console.log(`AnthropicWithMeta retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        text: sanitizeDashes(data.content?.[0]?.text || ""),
        stop_reason: data.stop_reason || null,
        usage: extractUsage(data, options.model),
      };
    }

    const errorText = await response.text();
    console.error(JSON.stringify({
      type: "ai_error_meta",
      model: options.model,
      error: `Anthropic API error: ${response.status}`,
      status: response.status,
      attempt: attempt + 1,
      timestamp: new Date().toISOString(),
    }));

    // Retryable: 429, 500, 529
    if ((response.status === 429 || response.status === 500 || response.status === 529) && attempt < MAX_RETRIES) {
      lastError = new AnthropicError(
        response.status === 429
          ? "Trop de requêtes, réessai en cours..."
          : response.status === 500
          ? "Erreur serveur IA, réessai en cours..."
          : "L'IA est surchargée, réessai en cours...",
        response.status
      );
      continue;
    }

    // Fallback Opus → Sonnet
    if ((response.status === 529 || response.status === 500) && options.model === "claude-opus-4-8") {
      console.log("Opus overloaded after retries (meta) — falling back to Sonnet...");
      const fallbackBody = { ...body, model: "claude-sonnet-4-6" };
      const fallbackRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify(fallbackBody),
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        return {
          text: sanitizeDashes(data.content?.[0]?.text || ""),
          stop_reason: data.stop_reason || null,
          usage: extractUsage(data, "claude-sonnet-4-6"),
        };
      }
      await fallbackRes.text();
    }

    // Non-retryable or last attempt
    if (response.status === 429) {
      throw new AnthropicError("Trop de requêtes. Réessaie dans un moment.", 429);
    }
    if (response.status === 529 || response.status === 500) {
      throw new AnthropicError("L'IA est temporairement indisponible. Réessaie dans quelques minutes.", response.status);
    }
    if (response.status === 402 || response.status === 400) {
      let msg = errorText;
      try { msg = JSON.parse(errorText).error?.message || errorText; } catch {}
      throw new AnthropicError(`Erreur API: ${msg}`, response.status);
    }
    throw new AnthropicError(`Erreur API Anthropic: ${response.status}`, response.status);
  }

  throw lastError || new Error("Erreur inattendue lors de l'appel à l'IA");
}

/**
 * Valide la réponse brute de l'API avant de renvoyer le texte aux consommateurs
 * de `callAnthropic`. Lève une erreur explicite et RÉESSAYABLE dans deux cas de
 * défaut net, AVANT que l'edge n'appelle logUsage (donc sans facturer un échec) :
 *  - troncature (`stop_reason === "max_tokens"`) → JSON/carrousel amputé qui, sinon,
 *    passe pour un succès ou casse silencieusement au parse côté front.
 *  - réponse vide → aucun texte exploitable.
 * NB : `callAnthropicWithMeta` n'utilise PAS ce garde — il expose `stop_reason`
 * pour les appelants qui gèrent la troncature eux-mêmes (ex. branding-coaching
 * relance avec un max_tokens plus haut).
 */
function extractValidatedText(data: any, keepDashes = false): string {
  if (data?.stop_reason === "max_tokens") {
    throw new AnthropicError(
      "La génération a été coupée car trop longue. Réessaie.",
      422
    );
  }
  const raw = data?.content?.[0]?.text || "";
  const text = keepDashes ? raw : sanitizeDashes(raw);
  if (!text.trim()) {
    throw new AnthropicError(
      "L'IA a renvoyé une réponse vide. Réessaie.",
      502
    );
  }
  return text;
}

/**
 * Pendant d'`extractValidatedText` pour la sortie structurée (tool forcé) :
 * même garde troncature, puis extrait l'`input` du bloc tool_use et le
 * re-sérialise — le JSON renvoyé à l'appelant est donc valide par construction.
 */
export function extractValidatedToolInput(data: any, toolName: string, keepDashes = false): string {
  if (data?.stop_reason === "max_tokens") {
    throw new AnthropicError(
      "La génération a été coupée car trop longue. Réessaie.",
      422
    );
  }
  const block = Array.isArray(data?.content)
    ? data.content.find((b: any) => b?.type === "tool_use" && b?.name === toolName)
    : undefined;
  if (!block || block.input === undefined || block.input === null) {
    throw new AnthropicError(
      "L'IA a renvoyé une réponse vide. Réessaie.",
      502
    );
  }
  return JSON.stringify(keepDashes ? block.input : sanitizeDashesDeep(block.input));
}

export async function callAnthropic(options: AnthropicOptions, usageOut?: UsageSink): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const body: any = {
    model: options.model,
    messages: prepareMessages(options.model, options.messages),
    max_tokens: options.max_tokens || 4096,
  };

  // Sonnet 5 : thinking adaptatif ON si omis → on force `disabled` (comportement historique).
  if (forcesDisabledThinking(options.model)) {
    body.thinking = { type: "disabled" };
  }

  if (options.tool) {
    body.tools = [options.tool];
    body.tool_choice = { type: "tool", name: options.tool.name };
  }

  if (options.system) {
    body.system = [
      {
        type: "text",
        text: options.system,
        cache_control: { type: "ephemeral" }
      }
    ];
  }

  // Opus 4.8/4.7 rejettent `temperature` (400) — on ne l'envoie que si le modèle l'accepte.
  if (options.temperature !== undefined && supportsTemperature(options.model)) {
    body.temperature = options.temperature;
  }

  let lastError: Error | null = null;

  console.log(JSON.stringify({
    type: "ai_call_debug",
    model: options.model,
    system_length: options.system?.length || 0,
    messages_count: options.messages.length,
    user_content_length: typeof options.messages[0]?.content === "string" ? options.messages[0].content.length : 0,
    timestamp: new Date().toISOString(),
  }));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 6000;
      console.log(`Anthropic retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    // Abort optionnel par tentative : borne le temps d'attente d'un fetch qui
    // traîne et le convertit en retry (plutôt qu'un blocage de >1 min).
    const ac = options.abortTimeoutMs ? new AbortController() : null;
    const abortTimer = ac
      ? setTimeout(() => ac.abort(), options.abortTimeoutMs)
      : null;

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify(body),
        signal: ac?.signal,
      });
    } catch (err) {
      if (abortTimer) clearTimeout(abortTimer);
      // Timeout (abort) ou erreur réseau : retryable tant qu'il reste des tentatives.
      const isAbort = (err as any)?.name === "AbortError";
      console.error(JSON.stringify({
        type: "ai_error",
        model: options.model,
        error: isAbort ? `Anthropic fetch timeout après ${options.abortTimeoutMs}ms` : `Anthropic fetch error: ${(err as any)?.message}`,
        attempt: attempt + 1,
        timestamp: new Date().toISOString(),
      }));
      if (attempt < MAX_RETRIES) {
        lastError = new AnthropicError(
          isAbort ? "L'IA met trop de temps, réessai en cours..." : "Connexion à l'IA interrompue, réessai en cours...",
          isAbort ? 504 : 503
        );
        continue;
      }
      throw new AnthropicError(
        isAbort ? "L'IA met trop de temps à répondre. Réessaie dans un instant." : "Connexion à l'IA perdue. Réessaie dans un instant.",
        isAbort ? 504 : 503
      );
    }
    if (abortTimer) clearTimeout(abortTimer);

    if (response.ok) {
      const data = await response.json();
      if (usageOut) Object.assign(usageOut, extractUsage(data, options.model));
      return options.tool ? extractValidatedToolInput(data, options.tool.name, options.keepDashes) : extractValidatedText(data, options.keepDashes);
    }

    const errorText = await response.text();
    console.error(JSON.stringify({
      type: "ai_error",
      model: options.model,
      error: `Anthropic API error: ${response.status}`,
      status: response.status,
      attempt: attempt + 1,
      timestamp: new Date().toISOString(),
    }));

    // Retryable: 429 (rate limit), 500 (server error) and 529 (overloaded)
    if ((response.status === 429 || response.status === 500 || response.status === 529) && attempt < MAX_RETRIES) {
      lastError = new AnthropicError(
        response.status === 429
          ? "Trop de requêtes, réessai en cours..."
          : response.status === 500
          ? "Erreur serveur IA, réessai en cours..."
          : "L'IA est surchargée, réessai en cours...",
        response.status
      );
      continue;
    }

    // Fallback: if Opus is overloaded (500/529) after all retries, try Sonnet
    if ((response.status === 529 || response.status === 500) && options.model === "claude-opus-4-8") {
      console.log("Opus overloaded after retries — falling back to Sonnet...");
      const fallbackBody = { ...body, model: "claude-sonnet-4-6" };
      const fallbackRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
        body: JSON.stringify(fallbackBody),
      });
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        if (usageOut) Object.assign(usageOut, extractUsage(data, "claude-sonnet-4-6"));
        return options.tool ? extractValidatedToolInput(data, options.tool.name, options.keepDashes) : extractValidatedText(data, options.keepDashes);
      }
      await fallbackRes.text(); // consume body
    }

    // Non-retryable or last attempt
    if (response.status === 429) {
      throw new AnthropicError("Trop de requêtes. Réessaie dans un moment.", 429);
    }
    if (response.status === 529 || response.status === 500) {
      throw new AnthropicError("L'IA est temporairement indisponible. Réessaie dans quelques minutes.", response.status);
    }
    if (response.status === 402 || response.status === 400) {
      let msg = errorText;
      try { msg = JSON.parse(errorText).error?.message || errorText; } catch {}
      throw new AnthropicError(`Erreur API: ${msg}`, response.status);
    }
    throw new AnthropicError(`Erreur API Anthropic: ${response.status}`, response.status);
  }

  throw lastError || new Error("Erreur inattendue lors de l'appel à l'IA");
}

export class AnthropicError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Convenience: convert OpenAI-style system+user to Anthropic format
export async function callAnthropicSimple(
  model: AnthropicModel,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.8,
  max_tokens = 4096,
  usageOut?: UsageSink,
  abortTimeoutMs?: number
): Promise<string> {
  return callAnthropic({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature,
    max_tokens,
    abortTimeoutMs,
  }, usageOut);
}
