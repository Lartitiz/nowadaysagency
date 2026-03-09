import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MicButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onClick: () => void;
  size?: "sm" | "lg";
  error?: string | null;
}

export default function MicButton({ isListening, isSupported, onClick, size = "lg", error }: MicButtonProps) {
  if (!isSupported) return null;

  const iconSize = size === "sm" ? 16 : 18;
  const padding = size === "sm" ? "p-2" : "p-2.5";
  const hasError = !!error && !isListening;

  const IconComponent = hasError ? MicOff : Mic;

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={`${padding} rounded-lg border transition-all duration-200 cursor-pointer ${
              isListening
                ? "bg-primary border-primary text-white animate-pulse ring-2 ring-primary/30 ring-offset-2"
                : hasError
                  ? "bg-rose-pale border-destructive/50 text-destructive hover:bg-destructive/10"
                  : "bg-rose-pale border-border text-primary hover:bg-primary/10 hover:border-primary/30"
            }`}
            aria-label={isListening ? "Arrêter la dictée" : "Dicter"}
          >
            <IconComponent size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isListening ? "Cliquer pour arrêter" : "Dicter (cliquer pour parler)"}
        </TooltipContent>
      </Tooltip>
      {isListening && (
        <span className="text-xs text-destructive font-medium animate-pulse">Parle...</span>
      )}
      {hasError && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}
