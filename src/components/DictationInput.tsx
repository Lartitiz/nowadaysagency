import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface DictationInputProps {
  onTranscribed: (text: string) => void;
  placeholder?: string;
}

export default function DictationInput({ onTranscribed, placeholder }: DictationInputProps) {
  const [text, setText] = useState("");

  const { isListening, isSupported, toggle, error } = useSpeechRecognition((transcript) => {
    setText((prev) => prev + (prev ? " " : "") + transcript);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="relative">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder || "Parle ou tape ton contenu brut ici..."}
          className="min-h-[180px] text-sm pr-16"
        />

        {/* Big mic button */}
        {isSupported && (
          <button
            onClick={toggle}
            className={cn(
              "absolute top-3 right-3 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md",
              isListening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            title={isListening ? "Arrêter la dictée" : "Commencer la dictée"}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}

        {isListening && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-destructive font-medium">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            Écoute en cours...
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        💡 L'IA va transformer ta dictée en post structuré. Parle naturellement, sans te soucier de la forme.
      </p>

      <Button
        onClick={() => onTranscribed(text)}
        disabled={!text.trim()}
        className="w-full rounded-full gap-2"
        size="lg"
      >
        <Sparkles className="h-4 w-4" />
        ✨ Transformer en post
      </Button>
    </div>
  );
}
