import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<typeof Textarea>;

interface TextareaWithVoiceProps extends TextareaProps {
  /** Called with the new full value (existing + dictated text) */
  onValueChange?: (value: string) => void;
}

const TextareaWithVoice = React.forwardRef<HTMLTextAreaElement, TextareaWithVoiceProps>(
  ({ className, value, onChange, onValueChange, ...props }, ref) => {
    const handleResult = React.useCallback(
      (text: string) => {
        const current = typeof value === "string" ? value : "";
        const separator = current && !current.endsWith(" ") ? " " : "";
        const newValue = current + separator + text;
        if (onValueChange) {
          onValueChange(newValue);
        }
        if (onChange) {
          const fakeEvent = {
            target: { value: newValue },
            currentTarget: { value: newValue },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          onChange(fakeEvent);
        }
      },
      [value, onChange, onValueChange]
    );

    const { isListening, isSupported, toggle, error } = useSpeechRecognition(handleResult);

    return (
      <div className="relative w-full">
        <Textarea ref={ref} value={value} onChange={onChange} className={cn("pr-10", className)} {...props} />
        {isSupported && (
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "absolute right-2 top-2 p-1 rounded-md transition-all",
              isListening ? "animate-pulse" : "opacity-40 hover:opacity-80"
            )}
            aria-label={isListening ? "Arrêter la dictée" : "Dicter"}
          >
            <span className="text-lg" style={{ filter: isListening ? "none" : "grayscale(1)" }}>🎙️</span>
          </button>
        )}
        {isListening && (
          <p className="mt-1 text-xs text-destructive font-medium animate-pulse flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" /> Écoute en cours...
          </p>
        )}
        {error && !isListening && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);

TextareaWithVoice.displayName = "TextareaWithVoice";

export { TextareaWithVoice };
