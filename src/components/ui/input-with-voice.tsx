import * as React from "react";
import { Input } from "@/components/ui/input";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";
import MicButton from "@/components/MicButton";

type InputProps = React.ComponentProps<typeof Input>;

interface InputWithVoiceProps extends InputProps {
  onValueChange?: (value: string) => void;
}

const InputWithVoice = React.forwardRef<HTMLInputElement, InputWithVoiceProps>(
  ({ className, value, onChange, onValueChange, type = "text", ...props }, ref) => {
    // Only show mic for text-like inputs
    const showMic = !type || type === "text" || type === "search" || type === "url";

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
          } as React.ChangeEvent<HTMLInputElement>;
          onChange(fakeEvent);
        }
      },
      [value, onChange, onValueChange]
    );

    const { isListening, isSupported, toggle, error } = useSpeechRecognition(handleResult);

    if (!showMic || !isSupported) {
      return <Input ref={ref} type={type} value={value} onChange={onChange} className={className} {...props} />;
    }

    return (
      <div className="relative w-full">
        <Input ref={ref} type={type} value={value} onChange={onChange} className={cn("pr-10", className)} {...props} />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <MicButton isListening={isListening} isSupported={isSupported} onClick={toggle} size="sm" error={error} />
        </div>
        {isListening && (
          <p className="mt-1 text-xs text-destructive font-medium animate-pulse flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" /> Écoute en cours...
          </p>
        )}
      </div>
    );
  }
);

InputWithVoice.displayName = "InputWithVoice";

export { InputWithVoice };
