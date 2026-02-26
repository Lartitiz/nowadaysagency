// Shared Anthropic API helper for edge functions

export type AnthropicModel = "claude-opus-4-6" | "claude-sonnet-4-5-20250929";

export function getDefaultModel(): AnthropicModel {
  return (Deno.env.get("AI_MODEL_DEFAULT") as AnthropicModel) || "claude-sonnet-4-5-20250929";
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | any[];
}

export interface AnthropicOptions {
  model: AnthropicModel;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  max_tokens?: number;
}

// Modèle par type d'action — Sonnet pour le contenu courant, Opus pour les tâches complexes
const MODEL_MAP: Record<string, AnthropicModel> = {
  // Opus : tâches complexes qui nécessitent un raisonnement profond
  "audit": "claude-opus-4-6",
  "coaching": "claude-opus-4-6",
  "coaching_light": "claude-sonnet-4-5-20250929",
  "strategy": "claude-opus-4-6",
  "branding_audit": "claude-opus-4-6",
  "assistant_chat": "claude-opus-4-6",

  // Sonnet : contenu courant, génération rapide
  "content": "claude-sonnet-4-5-20250929",
  "bio": "claude-sonnet-4-5-20250929",
  "caption": "claude-sonnet-4-5-20250929",
  "carousel": "claude-sonnet-4-5-20250929",
  "reels": "claude-sonnet-4-5-20250929",
  "stories": "claude-sonnet-4-5-20250929",
  "dm_comment": "claude-sonnet-4-5-20250929",
  "highlights": "claude-sonnet-4-5-20250929",
  "linkedin_post": "claude-sonnet-4-5-20250929",
  "pinterest": "claude-sonnet-4-5-20250929",
  "website": "claude-sonnet-4-5-20250929",
  "suggestion": "claude-sonnet-4-5-20250929",
  "adaptation": "claude-sonnet-4-5-20250929",
  "text_action": "claude-sonnet-4-5-20250929",
  "niche": "claude-sonnet-4-5-20250929",
  "persona": "claude-sonnet-4-5-20250929",
  "proposition": "claude-sonnet-4-5-20250929",
  "import": "claude-sonnet-4-5-20250929",
  "storytelling": "claude-sonnet-4-5-20250929",
  "launch": "claude-sonnet-4-5-20250929",
  "offer": "claude-sonnet-4-5-20250929",
  "scoring": "claude-sonnet-4-5-20250929",
  "voice": "claude-sonnet-4-5-20250929",
};

export function getModelForAction(action: string): AnthropicModel {
  return MODEL_MAP[action] || getDefaultModel();
}

const MAX_RETRIES = 2;
const RETRY_DELAYS = [3000, 6000]; // ms

export async function callAnthropic(options: AnthropicOptions): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const body: any = {
    model: options.model,
    messages: options.messages,
    max_tokens: options.max_tokens || 4096,
  };

  if (options.system) {
    body.system = options.system;
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 6000;
      console.log(`Anthropic retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = await response.json();
      return data.content?.[0]?.text || "";
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

    // Retryable: 429 (rate limit) and 529 (overloaded)
    if ((response.status === 429 || response.status === 529) && attempt < MAX_RETRIES) {
      lastError = new AnthropicError(
        response.status === 429
          ? "Trop de requêtes, réessai en cours..."
          : "L'IA est surchargée, réessai en cours...",
        response.status
      );
      continue;
    }

    // Non-retryable or last attempt
    if (response.status === 429) {
      throw new AnthropicError("Trop de requêtes. Réessaie dans un moment.", 429);
    }
    if (response.status === 529) {
      throw new AnthropicError("L'IA est temporairement surchargée. Réessaie dans quelques minutes.", 529);
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
  max_tokens = 4096
): Promise<string> {
  return callAnthropic({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature,
    max_tokens,
  });
}
