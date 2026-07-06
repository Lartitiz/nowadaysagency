/**
 * Streaming SSE helper pour Anthropic API.
 * Réutilisé par creative-flow, coaching-module, et tout module qui veut streamer.
 * Pattern copié depuis chat-guide/index.ts (déjà en production).
 */

import { sanitizeDashes, supportsTemperature, stripTrailingAssistant, type AnthropicUsage } from "./anthropic.ts";

export async function streamAnthropicSSE(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string | any[] }>,
  temperature: number,
  maxTokens: number,
): Promise<ReadableStream> {
  // Opus 4.8/4.7 rejettent temperature (paramètre d'échantillonnage) ET un prefill
  // (dernier tour assistant) → erreur 400. On retire les deux pour ces modèles, comme
  // le fait le helper non-streaming. Sonnet/Haiku gardent leur comportement habituel.
  const sampled = supportsTemperature(model);
  const finalMessages = sampled ? messages : stripTrailingAssistant(messages as any);
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
      messages: finalMessages,
      ...(sampled ? { temperature } : {}),
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
  onDone?: (fullText: string, usage?: AnthropicUsage) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = anthropicStream.getReader();
  let fullText = "";
  let buffer = "";
  // Usage remonté par le stream Anthropic : input_tokens + modèle dans
  // `message_start`, output_tokens (cumulé) dans les `message_delta`.
  let inputTokens = 0;
  let outputTokens = 0;
  let usageModel = "";

  const outputStream = new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Send final event. On nettoie les tirets cadratin sur le texte
            // ASSEMBLÉ (le contenu sauvegardé/affiché final est garanti sans —).
            const cleanFull = sanitizeDashes(fullText);
            const usage: AnthropicUsage = {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
              model: usageModel,
            };
            if (onDone) {
              try { await onDone(cleanFull, usage); } catch (e) { console.error("onDone error:", e); }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", full: cleanFull })}\n\n`));
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
              } else if (event.type === "message_start") {
                inputTokens = event.message?.usage?.input_tokens ?? 0;
                usageModel = event.message?.model ?? "";
              } else if (event.type === "message_delta" && event.usage?.output_tokens != null) {
                outputTokens = event.usage.output_tokens; // cumulé : on garde la dernière valeur
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

/**
 * Callback de progression passé au handler : émet un event SSE
 * `{ type: "status", stage, ...data }` que le client peut afficher
 * (vraies étapes de génération au lieu d'une barre simulée).
 * En mode non-SSE le handler reçoit un no-op — toujours sûr à appeler.
 */
export type StatusEmitter = (stage: string, data?: Record<string, unknown>) => void;

/**
 * Wrap an existing async handler (that returns a normal JSON Response) into
 * an SSE response that emits heartbeats every `intervalMs` ms while the
 * handler is running. When the handler resolves, the JSON body is parsed and
 * re-emitted as a single `done` event whose `full` field is the JSON string.
 * The handler receives a StatusEmitter to surface real progress stages.
 *
 * Goal: keep long-running edge functions alive through proxies/CDNs that
 * close idle connections after ~60s, WITHOUT changing any generation logic.
 */
export function runWithHeartbeatSSE(
  corsHeaders: Record<string, string>,
  work: (emitStatus: StatusEmitter) => Promise<Response>,
  intervalMs = 10000,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try { controller.enqueue(chunk); } catch { /* controller closed */ }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat", t: Date.now() })}\n\n`));
      }, intervalMs);

      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", stage: "generating" })}\n\n`));

      const emitStatus: StatusEmitter = (stage, data) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "status", stage, ...(data || {}) })}\n\n`));
      };

      try {
        const response = await work(emitStatus);
        clearInterval(heartbeat);

        let bodyText = "";
        try { bodyText = await response.text(); } catch { bodyText = ""; }

        if (!response.ok) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: bodyText || `HTTP ${response.status}` })}\n\n`));
          safeClose();
          return;
        }

        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", full: bodyText })}\n\n`));
        safeClose();
      } catch (err) {
        clearInterval(heartbeat);
        safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: String((err as any)?.message || err) })}\n\n`));
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
