import { useState, useRef, useCallback } from "react";

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  toggle: () => void;
  error: string | null;
}

export function useSpeechRecognition(onResult: (text: string) => void): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const SpeechRecognition = typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

  const isSupported = !!SpeechRecognition;

  const toggle = useCallback(() => {
    if (!isSupported) return;
    setError(null);

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    // Create a fresh instance each time to avoid InvalidStateError
    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
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
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      setError("La dictée vocale n'a pas pu démarrer.");
    }
  }, [isListening, isSupported]);

  return { isListening, isSupported, toggle, error };
}
