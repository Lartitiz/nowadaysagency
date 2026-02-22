import { useUserPlan } from "@/hooks/use-user-plan";
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
}

export default function GenerateButton({ onClick, loading, disabled, label = "Générer", className }: GenerateButtonProps) {
  const { plan, canGenerate, remainingGenerations } = useUserPlan();
  const { toast } = useToast();

  const handleClick = () => {
    if (!canGenerate()) {
      toast({
        title: "Limite atteinte",
        description: (
          <div className="space-y-2">
            <p>Tu as utilisé tes 3 générations gratuites ce mois-ci.</p>
            <Link to="/parametres" className="text-primary font-medium hover:underline">
              Passer au plan Outil →
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
    <Button
      onClick={handleClick}
      disabled={loading || disabled}
      className={className || "rounded-full gap-2"}
    >
      <Sparkles className="h-4 w-4" />
      {loading ? "Génération..." : label}
      {plan === "free" && (
        <span className="text-xs opacity-80 ml-1">
          ({remainingGenerations()}/3)
        </span>
      )}
    </Button>
  );
}
