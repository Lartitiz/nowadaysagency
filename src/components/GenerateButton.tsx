import { useUserPlan, type AiCategory } from "@/hooks/use-user-plan";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
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
  const { toast } = useToast();

  const remaining = remainingGenerations(category);
  const catLimit = usage[category]?.limit ?? 0;
  const isLow = catLimit > 0 && remaining > 0 && remaining <= Math.ceil(catLimit * 0.2);

  const handleClick = () => {
    if (!canGenerate(category)) {
      const catLabel = CATEGORY_LABELS[category] || category;
      const catUsage = usage[category];
      const notAvailable = catUsage && catUsage.limit === 0;

      toast({
        title: notAvailable ? "Fonctionnalité premium" : "Limite atteinte",
        description: (
          <div className="space-y-2">
            <p>
              {notAvailable
                ? `Les ${catLabel} sont disponibles à partir du plan Outil.`
                : `Tu as utilisé tes ${catUsage?.limit} ${catLabel} ce mois-ci.`}
            </p>
            <Link to="/pricing" className="text-primary font-medium hover:underline">
              Voir les plans →
            </Link>
          </div>
        ),
        variant: "destructive",
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
        <span className="text-xs text-destructive/80">
          ⚠️ Plus que {remaining} {CATEGORY_LABELS[category] || category} ce mois
        </span>
      )}
    </div>
  );
}
