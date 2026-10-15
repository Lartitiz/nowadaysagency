import { RefreshCw } from "lucide-react";

/**
 * Étape résultat sans résultat ni génération en cours (sorti de CreerUnifie.tsx
 * le 15/10/2026, à l'identique, plus le cas « création interrompue »).
 * - Quota épuisé : dire la vérité (les crédits), pas « Session expirée », et pas
 *   de Réessayer qui ne peut que re-échouer.
 * - Création interrompue par un rechargement (LinkedIn, newsletter, carrousel :
 *   le texte n'arrive qu'à la fin) : le dire et proposer de relancer.
 */
export default function ResultEmptyState({ quotaExhausted, error, interrupted, onPricing, onRetry, onReset }: {
  quotaExhausted: string | null;
  error: string | null;
  interrupted: boolean;
  onPricing: () => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  const showInterrupted = interrupted && !error;
  return (
    <div className="py-12 text-center space-y-4 animate-fade-in">
      {quotaExhausted ? (
        <p className="text-sm font-medium text-foreground">{quotaExhausted}</p>
      ) : showInterrupted ? (
        <div className="space-y-1" data-testid="creation-interrompue">
          <p className="text-sm font-medium text-foreground">Ta création a été interrompue par le rechargement de la page.</p>
          <p className="text-sm text-muted-foreground">Relance-la : elle repart de ton idée et de tes réponses.</p>
        </div>
      ) : error ? (
        <p className="text-destructive font-medium">{error}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Session expirée ou contenu indisponible.</p>
      )}
      <div className="flex gap-3 justify-center">
        {quotaExhausted ? (
          <button
            onClick={onPricing}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            Voir les plans →
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> {showInterrupted ? "Relancer la création" : "Réessayer"}
          </button>
        )}
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition"
        >
          ← Recommencer
        </button>
      </div>
    </div>
  );
}
