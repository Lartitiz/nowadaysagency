import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuotaExhaustedCardProps {
  category: string;
  renewalMessage?: string;
  plan: string;
  onRetry?: () => void;
}

export default function QuotaExhaustedCard({
  category,
  renewalMessage,
  plan,
  onRetry,
}: QuotaExhaustedCardProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-[#FFD6E8] bg-gradient-to-br from-[#FFF4F8] to-white p-6 sm:p-8 max-w-lg mx-auto mb-6">
      {/* Icon */}
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 rounded-full bg-[#FB3D80]/10 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-[#FB3D80]" />
        </div>
      </div>

      {/* Title */}
      <h3 className="font-display text-lg sm:text-xl font-bold text-foreground text-center">
        Tes crédits {category} du mois sont utilisés
      </h3>

      {/* Encouragement */}
      <p className="text-sm text-muted-foreground text-center mt-2">
        C'est bon signe : ça veut dire que tu travailles ta com' ! 💪
      </p>

      {/* Renewal */}
      <p className="text-sm text-foreground/70 text-center mt-3">
        {renewalMessage || "Ils se renouvellent le 1er du mois prochain."}
      </p>

      {/* Separator */}
      <hr className="my-5 border-[#FFD6E8]/60" />

      {/* Suggestions */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">En attendant, tu peux :</p>
        <p className="text-sm text-muted-foreground">
          → Continuer à travailler ton branding et ton calendrier éditorial
        </p>
        <p className="text-sm text-muted-foreground">
          → Préparer tes données pour ton prochain audit
        </p>
        <p className="text-sm text-muted-foreground">
          → Explorer les espaces par canal pour organiser ta stratégie
        </p>
      </div>

      {/* CTA or renewal info */}
      {plan === "free" ? (
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/mon-plan")}
            className="inline-flex items-center gap-2 rounded-full bg-[#FB3D80] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#e0326f] transition-colors"
          >
            Passer au Premium — 300 crédits/mois ✨
          </button>
          <p className="text-xs text-muted-foreground mt-2">
            À partir de 39€/mois, sans engagement
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center mt-5">
          Tes crédits se renouvellent automatiquement.
        </p>
      )}

      {onRetry && (
        <div className="text-center mt-4">
          <button
            onClick={onRetry}
            className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}
