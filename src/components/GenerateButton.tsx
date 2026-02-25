import { useUserPlan, type AiCategory } from "@/hooks/use-user-plan";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface GenerateButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
  category?: AiCategory;
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "contenus",
  audit: "audits",
  dm_comment: "DM / commentaires",
  bio_profile: "bios / profils",
  suggestion: "suggestions",
  import: "imports",
  adaptation: "adaptations",
};

export default function GenerateButton({ onClick, loading, disabled, label = "Générer", className, category = "content" }: GenerateButtonProps) {
  const { plan, canGenerate, remainingGenerations, remainingTotal, usage } = useUserPlan();
  const { user } = useAuth();
  const { toast } = useToast();

  const remaining = remainingGenerations(category);
  const catLimit = usage[category]?.limit ?? 0;
  const isLow = catLimit > 0 && remaining > 0 && remaining <= Math.ceil(catLimit * 0.2);

  const handleBuyPack = (credits: number, price: string) => {
    const email = user?.email || "";
    const text = encodeURIComponent(
      `Bonjour Laetitia, je voudrais acheter un pack de ${credits} crédits (${price}). Mon email : ${email}`
    );
    window.open(`https://wa.me/33614133921?text=${text}`, "_blank");
  };

  const handleClick = () => {
    if (!canGenerate(category)) {
      const catLabel = CATEGORY_LABELS[category] || category;
      const catUsage = usage[category];
      const notAvailable = catUsage && catUsage.limit === 0;

      toast({
        title: notAvailable ? "Fonctionnalité premium" : "Tes crédits du mois sont utilisés",
        description: (
          <div className="space-y-2">
            <p>
              {notAvailable
                ? `Les ${catLabel} sont disponibles à partir du plan Outil.`
                : `Tes ${catUsage?.limit} ${catLabel} du mois sont passé·es. Ça veut dire que tu bosses ta com', et ça c'est cool. Ils reviennent le 1er du mois.`}
            </p>
            {!notAvailable && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button onClick={() => handleBuyPack(20, "4,90€")} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full hover:bg-primary/20 transition-colors">
                  ⚡ +20 · 4,90€
                </button>
                <button onClick={() => handleBuyPack(50, "9,90€")} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full hover:bg-primary/20 transition-colors">
                  ⚡ +50 · 9,90€
                </button>
                <button onClick={() => handleBuyPack(100, "14,90€")} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full hover:bg-primary/20 transition-colors">
                  ⚡ +100 · 14,90€
                </button>
              </div>
            )}
            <Link to={notAvailable ? "/pricing" : "/abonnement"} className="text-primary font-medium hover:underline text-xs">
              {notAvailable ? "Voir les plans →" : "Gérer mes crédits →"}
            </Link>
          </div>
        ),
        variant: "default",
      });
      return;
    }
    onClick();
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        onClick={handleClick}
        disabled={loading || disabled}
        className={className || "rounded-full gap-2"}
      >
        <Sparkles className="h-4 w-4" />
        {loading ? "Génération..." : label}
        {plan === "free" && catLimit > 0 && (
          <span className="text-xs opacity-80 ml-1">
            ({remaining}/{catLimit})
          </span>
        )}
      </Button>
      {isLow && (
        <span className="text-xs text-muted-foreground">
          💡 Il te reste {remaining} {CATEGORY_LABELS[category] || category} ce mois
        </span>
      )}
    </div>
  );
}
