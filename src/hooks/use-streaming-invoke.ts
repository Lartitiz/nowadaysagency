import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseStreamingInvokeReturn {
  /** Le contenu accumulé au fur et à mesure du streaming */
  content: string;
  /** true tant que le streaming est en cours */
  streaming: boolean;
  /** true quand le streaming est terminé et le résultat complet */
  done: boolean;
  /** Erreur éventuelle */
  error: string | null;
  /** Lance le streaming */
  invoke: (functionName: string, body: any) => Promise<string>;
  /** Reset l'état */
  reset: () => void;
}

export function useStreamingInvoke(): UseStreamingInvokeReturn {
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setContent("");
    setStreaming(false);
    setDone(false);
    setError(null);
  }, []);

  const invoke = useCallback(async (functionName: string, body: any): Promise<string> => {
    reset();
    setStreaming(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Non authentifié");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const controller = new AbortController();
      abortRef.current = controller;

      // Timeout de 60s pour le streaming (plus long que le non-streaming car on reçoit des tokens)
      const timeout = setTimeout(() => controller.abort(), 60000);

      const resp = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok || !resp.body) {
        // Fallback: edge function returned JSON error (not streaming)
        let errorMsg = "Erreur de génération";
        try {
          const json = await resp.json();
          if (json.error === "limit_reached" || json.message?.includes("ce mois")) {
            const err = new Error(json.message || json.error);
            (err as any)._isQuota = true;
            (err as any).data = json;
            throw err;
          }
          if (json.error) {
            errorMsg = json.message || json.error;
          } else {
            // Not an error — it's valid non-streaming content
            const text = json.content || json.raw || JSON.stringify(json);
            setContent(text);
            setDone(true);
            setStreaming(false);
            return text;
          }
        } catch (parseErr) {
          if ((parseErr as any)?._isQuota) throw parseErr;
          // json parse failed — keep errorMsg as is
        }
        throw new Error(errorMsg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullText = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = textBuffer.indexOf("\n")) !== -1) {
          const line = textBuffer.slice(0, newlineIdx).trim();
          textBuffer = textBuffer.slice(newlineIdx + 1);

          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "delta" && event.text) {
              fullText += event.text;
              setContent(fullText);
            }

            if (event.type === "done") {
              const finalText = event.full || fullText;
              setContent(finalText);
              setDone(true);
            }

            if (event.type === "error") {
              throw new Error(event.error);
            }
          } catch (parseErr) {
            // Ignore partial JSON
          }
        }
      }

      setStreaming(false);
      setDone(true);
      return fullText;
    } catch (err: any) {
      const msg = err?.name === "AbortError"
        ? "La génération a pris trop de temps. Réessaie."
        : err?.message || "Erreur de génération";
      setError(msg);
      setStreaming(false);
      return "";
    }
  }, [reset]);

  return { content, streaming, done, error, invoke, reset };
}
