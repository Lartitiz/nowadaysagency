import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeError, reportErrorBlock, type DescribedError } from "@/lib/describe-error";

interface Props {
  /** L'erreur brute (traduite ici). */
  error: unknown;
  /** Écran d'origine, pour la trace (ex. « instagram.coaching.questions »). */
  where: string;
  onRetry?: () => void;
  /** Texte si l'erreur est vide. */
  fallback?: string;
  /** Deuxième bouton facultatif (ex. « Revenir à mes réponses »). */
  secondary?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * Bloc d'erreur commun : phrase simple + « Réessayer » (si ça a un sens).
 * Un quota atteint n'a pas de bouton « Réessayer » : on le dit, c'est tout.
 */
export default function ErrorWithRetry({ error, where, onRetry, fallback, secondary, className }: Props) {
  const d: DescribedError = describeError(error, { fallback });
  useEffect(() => { reportErrorBlock(where, d.kind); }, [where, d.kind]);
  return (
    <div role="alert" data-error-kind={d.kind} className={className ?? "rounded-xl border border-destructive/30 p-4 space-y-3 text-center"}>
      <p className="text-sm text-foreground leading-relaxed">{d.message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {d.retryable && onRetry && (
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        )}
        {secondary && (
          <Button type="button" variant="ghost" size="sm" onClick={secondary.onClick}>{secondary.label}</Button>
        )}
      </div>
    </div>
  );
}
