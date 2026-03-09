import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";
import MicButton from "@/components/MicButton";

type TextareaProps = React.ComponentProps<typeof Textarea>;

interface TextareaWithVoiceProps extends TextareaProps {
  /** Called with the new full value (existing + dictated text) */
  onValueChange?: (value: string) => void;
  /** Show a one-time tooltip next to the mic button */
  showVoiceTip?: boolean;
}

const TextareaWithVoice = React.forwardRef<HTMLTextAreaElement, TextareaWithVoiceProps>(
  ({ className, value, onChange, onValueChange, showVoiceTip, ...props }, ref) => {
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

    const [tipDismissed, setTipDismissed] = React.useState(() => {
      try { return localStorage.getItem("lac_voice_tip_seen") === "1"; } catch { return false; }
    });

    const dismissTip = () => {
      setTipDismissed(true);
      try { localStorage.setItem("lac_voice_tip_seen", "1"); } catch {}
    };

    return (
      <div className="relative w-full">
        <Textarea ref={ref} value={value} onChange={onChange} className={cn("pr-10", className)} {...props} />
        {isSupported && (
          <div className="absolute right-2 top-2">
            <MicButton isListening={isListening} isSupported={isSupported} onClick={toggle} size="sm" error={error} />
          </div>
        )}
        {showVoiceTip && isSupported && !tipDismissed && !isListening && (
          <div className="absolute right-10 top-2 flex items-center gap-1 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm animate-fade-in z-10">
            <span className="text-xs text-muted-foreground whitespace-nowrap">🎙️ Tu peux dicter ta réponse !</span>
            <button
              type="button"
              onClick={dismissTip}
              className="text-muted-foreground hover:text-foreground ml-1 text-xs leading-none"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        )}
        {isListening && (
          <p className="mt-1 text-xs text-destructive font-medium animate-pulse flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" /> Écoute en cours...
          </p>
        )}
      </div>
    );
  }
);

TextareaWithVoice.displayName = "TextareaWithVoice";

export { TextareaWithVoice };
