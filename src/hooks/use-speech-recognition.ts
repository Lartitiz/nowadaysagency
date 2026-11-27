import { useState, useRef, useCallback, useEffect } from "react";
import { cleanDictation } from "@/lib/clean-dictation";
import { realMicIfBrowserListensToSilentOne } from "@/lib/real-microphone";

// Types Web Speech API (webkitSpeechRecognition) absents des libs DOM de TypeScript —
// déclarés localement, propriétés limitées à ce que ce hook consomme.
interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  toggle: () => void;
  error: string | null;
}

const SILENCE_TIMEOUT_MS = 8000;

const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());

export function useSpeechRecognition(onResult: (text: string) => void): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Flux du vrai micro, ouvert seulement quand le navigateur écoutait un micro fantôme. */
  const streamRef = useRef<MediaStream | null>(null);
  /** Change à chaque clic : une vérification revenue après un nouveau clic est jetée. */
  const sessionRef = useRef(0);
  /** Mots entendus mais pas encore validés par le moteur, rendus à l'arrêt au lieu d'être perdus. */
  const pendingRef = useRef("");

  const releaseStream = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

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
      // Premier essai sur un navigateur qui écoute le micro fantôme de Teams ou Zoom : le dire,
      // au lieu de laisser croire qu'il faut parler plus fort. Le clic suivant bascule tout seul.
      void realMicIfBrowserListensToSilentOne().then((stream) => {
        if (!stream) return;
        stopStream(stream);
        setError("Ton navigateur écoutait un micro muet (Teams ou Zoom). Reclique : j'écoute le bon micro.");
      });
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current++;
      clearSilenceTimer();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      releaseStream();
    };
  }, [clearSilenceTimer, releaseStream]);

  const toggle = useCallback(() => {
    if (!isSupported) return;
    setError(null);
    const session = ++sessionRef.current;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      clearSilenceTimer();
      return;
    }

    let ended = false;

    const build = () => {
      const recognition = new SpeechRecognition();
      recognition.lang = "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Reset silence timer on any result (including interim)
        startSilenceTimer();

        let finalTranscript = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += t;
          } else {
            interim += t;
          }
        }
        pendingRef.current = interim;
        // Le moteur transcrit fidèlement les hésitations (« Euh. »), et pour
        // /creer ce texte devient le SUJET, donc le titre affiché du contenu
        // (bilan hebdo 24/08). Nettoyage déterministe et volontairement étroit
        // ici, à l'unique porte d'entrée de la dictée : tous les champs dictés
        // en profitent, aucun n'a à y penser. Un fragment qui n'était QUE de
        // l'hésitation revient vide — on n'appelle alors pas onResult, sinon
        // les consommateurs ajouteraient une espace pour rien.
        const cleaned = cleanDictation(finalTranscript);
        if (cleaned) {
          onResultRef.current(cleaned);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        clearSilenceTimer();
        setIsListening(false);
        if (event.error === "not-allowed") {
          setError("Autorise le micro dans les paramètres de ton navigateur.");
        } else if (event.error === "no-speech") {
          // Silently ignore no-speech
        } else if (event.error === "audio-capture") {
          setError("Aucun micro trouvé. Branche-en un ou vérifie celui choisi dans ton navigateur.");
        } else if (event.error === "network") {
          setError("La dictée a besoin d'internet et n'a pas pu joindre son service. Réessaie.");
        } else {
          console.error("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        ended = true;
        clearSilenceTimer();
        setIsListening(false);
        releaseStream();
        // Des mots entendus mais jamais validés (arrêt en pleine phrase) : on les rend.
        const rest = cleanDictation(pendingRef.current);
        pendingRef.current = "";
        if (rest) onResultRef.current(rest);
      };

      return recognition;
    };

    const recognition = build();
    recognitionRef.current = recognition;
    pendingRef.current = "";

    try {
      recognition.start();
      setIsListening(true);
      startSilenceTimer();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
      setError("La dictée vocale n'a pas pu démarrer.");
      return;
    }

    // La dictée écoute le micro choisi dans le navigateur. Si c'est le micro fantôme de Teams
    // ou de Zoom (muet hors appel), on la relance aussitôt sur le vrai micro. Cas normal : la
    // vérification rend null et rien ne change.
    void realMicIfBrowserListensToSilentOne().then((stream) => {
      if (!stream) return;
      if (ended || sessionRef.current !== session || recognitionRef.current !== recognition) {
        stopStream(stream);
        return;
      }
      const restart = () => {
        if (sessionRef.current !== session) {
          stopStream(stream);
          return;
        }
        ended = false;
        const next = build();
        try {
          next.start(stream.getAudioTracks()[0]);
          recognitionRef.current = next;
          streamRef.current = stream;
          setIsListening(true);
          startSilenceTimer();
        } catch (e) {
          console.error("Failed to restart speech recognition on the real microphone:", e);
          stopStream(stream);
          clearSilenceTimer();
          setIsListening(false);
          setError("Ton navigateur écoute un micro muet (Teams ou Zoom). Choisis ton vrai micro dans ses réglages.");
        }
      };
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = restart;
      pendingRef.current = "";
      try {
        recognition.abort();
      } catch {
        restart();
      }
    });
  }, [isListening, isSupported, clearSilenceTimer, startSilenceTimer, releaseStream]);

  return { isListening, isSupported, toggle, error };
}
