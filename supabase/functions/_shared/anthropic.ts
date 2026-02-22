// Shared Anthropic API helper for edge functions

export type AnthropicModel = "claude-opus-4-6" | "claude-sonnet-4-5-20250929";

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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Anthropic API error:", response.status, errorText);

    if (response.status === 429) {
      throw new AnthropicError("Trop de requêtes, réessaie dans un moment.", 429);
    }
    if (response.status === 402 || response.status === 400) {
      const parsed = JSON.parse(errorText).error?.message || errorText;
      throw new AnthropicError(`Erreur API Anthropic: ${parsed}`, response.status);
    }
    throw new AnthropicError(`Erreur API Anthropic: ${response.status}`, response.status);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
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
