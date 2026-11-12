/**
 * Échec d'une création d'image qui RESTE à l'écran (12/11/2026).
 *
 * Un toast disparaît au bout de quelques secondes : pendant les 60 à 90 s
 * d'une mise en scène, l'utilisatrice regarde souvent ailleurs et ne savait
 * pas que ça avait raté. Ce bloc garde le message et propose de relancer
 * la même demande en un clic.
 */
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  message: string;
  onRetry: () => void;
  disabled?: boolean;
}

export default function GenerationFailedNotice({ message, onRetry, disabled }: Props) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
        <div className="text-xs space-y-0.5">
          <p className="font-medium text-foreground">La mise en scène n'a pas abouti</p>
          <p className="text-muted-foreground">{message}</p>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={disabled} className="self-start sm:self-center">
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        Réessayer la mise en scène
      </Button>
    </div>
  );
}
