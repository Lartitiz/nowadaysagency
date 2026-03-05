/**
 * Streaming SSE helper pour Anthropic API.
 * Réutilisé par creative-flow, coaching-module, et tout module qui veut streamer.
 * Pattern copié depuis chat-guide/index.ts (déjà en production).
 */

export async function streamAnthropicSSE(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string | any[] }>,
  temperature: number,
  maxTokens: number,
): Promise<ReadableStream> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  return response.body!;
}

/**
 * Transforme un stream Anthropic en stream SSE pour le client.
 * Envoie des events { type: "delta", text: "..." } puis { type: "done", full: "..." }
 */
export function createClientSSEStream(
  anthropicStream: ReadableStream,
  corsHeaders: Record<string, string>,
  onDone?: (fullText: string) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = anthropicStream.getReader();
  let fullText = "";
  let buffer = "";

  const outputStream = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Send final event
            if (onDone) {
              try { await onDone(fullText); } catch (e) { console.error("onDone error:", e); }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", full: fullText })}\n\n`));
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (!line.startsWith("data: ")) continue;
            if (line === "data: [DONE]") continue;

            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                const text = event.delta.text;
                fullText += text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`));
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(outputStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
