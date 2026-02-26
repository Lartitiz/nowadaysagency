import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  toggle: () => void;
  error: string | null;
}

const SILENCE_TIMEOUT_MS = 8000;

export function useSpeechRecognition(onResult: (text: string) => void): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SpeechRecognition = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  const isSupported = !!SpeechRecognition;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setError("Aucune voix détectée, réessaie en parlant plus fort.");
      setIsListening(false);
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, [clearSilenceTimer]);

  const toggle = useCallback(() => {
    if (!isSupported) return;
    setError(null);

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      clearSilenceTimer();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      // Reset silence timer on any result (including interim)
      startSilenceTimer();

      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        }
      }
      if (finalTranscript) {
        onResultRef.current(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      clearSilenceTimer();
      setIsListening(false);
      if (event.error === "not-allowed") {
        setError("Autorise le micro dans les paramètres de ton navigateur.");
      } else if (event.error === "no-speech") {
        // Silently ignore no-speech
      } else {
        console.error("Speech recognition error:", event.error);
      }
    };

    recognition.onend = () => {
      clearSilenceTimer();
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
      startSilenceTimer();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      setError("La dictée vocale n'a pas pu démarrer.");
    }
  }, [isListening, isSupported, clearSilenceTimer, startSilenceTimer]);

  return { isListening, isSupported, toggle, error };
}
