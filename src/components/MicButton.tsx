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

  const emojiSize = size === "sm" ? "text-[18px]" : "text-[22px]";

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={`p-1.5 rounded-lg transition-all ${
              isListening
                ? "animate-pulse"
                : "opacity-50 hover:opacity-80 cursor-pointer"
            }`}
            aria-label={isListening ? "Arrêter la dictée" : "Dicter"}
          >
            <span className={`${emojiSize} ${isListening ? "grayscale-0" : "grayscale"}`} style={{ filter: isListening ? "none" : "grayscale(1)" }}>
              🎙️
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isListening ? "Arrêter" : "Dicter"}
        </TooltipContent>
      </Tooltip>
      {isListening && (
        <span className="text-xs text-destructive font-medium animate-pulse">Parle...</span>
      )}
      {error && !isListening && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}
