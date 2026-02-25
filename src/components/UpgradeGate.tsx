import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserPlan } from "@/hooks/use-user-plan";

type Feature =
  | "branding" | "persona" | "audit_basic" | "generation_limited" | "community_read"
  | "generation_unlimited" | "import_stats" | "prospection" | "comments_generator"
  | "dm_generator" | "audit_unlimited" | "offer_workshop" | "lives" | "community_write"
  | "contacts_strategiques" | "routine_engagement" | "editorial_line" | "calendar"
  | "coaching" | "studio_space" | "laetitia_validation" | "studio_lives" | "direct_channel" | "binome";

const UPGRADE_MESSAGES: Partial<Record<Feature, string>> = {
  prospection: "Le mini-CRM de prospection fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  dm_generator: "Le générateur de DM personnalisés fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  comments_generator: "Le générateur de commentaires stratégiques fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  import_stats: "L'import de tes stats fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  generation_unlimited: "Tu as utilisé tes 3 générations gratuites du mois. Elles reviennent le 1er du mois.",
  audit_unlimited: "Tu as déjà fait ton audit gratuit du mois. Il revient le 1er du mois.",
  lives: "Les lives mensuels font partie de l'abonnement.",
  community_write: "Poster dans la communauté fait partie de l'abonnement.",
  offer_workshop: "L'atelier positionnement offre fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  contacts_strategiques: "Les contacts stratégiques font partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  routine_engagement: "La routine d'engagement fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  editorial_line: "La ligne éditoriale fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  calendar: "Le calendrier éditorial fait partie du plan Outil. Tu peux jeter un œil à ce que ça inclut.",
  coaching: "Les sessions visio individuelles font partie de l'accompagnement Binôme.",
  studio_space: "L'espace accompagnement fait partie de l'accompagnement Binôme.",
  laetitia_validation: "La validation par Laetitia fait partie de l'accompagnement Binôme.",
  studio_lives: "Les lives exclusifs font partie de l'accompagnement Binôme.",
  direct_channel: "Le canal direct fait partie de l'accompagnement Binôme.",
  binome: "Le binôme fait partie de l'accompagnement Binôme.",
};

interface UpgradeGateProps {
  feature: Feature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function UpgradeGate({ feature, children, fallback }: UpgradeGateProps) {
  const { canUseFeature, loading } = useUserPlan();

  if (loading) return <>{children}</>;

  if (canUseFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  const message = UPGRADE_MESSAGES[feature] || "Cette fonctionnalité fait partie d'un plan supérieur. Tu peux voir ce que chaque plan inclut.";
  const isStudioFeature = ["coaching", "studio_space", "laetitia_validation", "studio_lives", "direct_channel", "binome"].includes(feature);

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-display text-lg font-bold text-foreground mb-2">
        {isStudioFeature ? "Disponible avec l'accompagnement Binôme" : "Disponible avec le plan Outil"}
      </h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
        {message}
      </p>
      <Button asChild className="rounded-full">
        <Link to="/parametres">
          {isStudioFeature ? "Découvrir l'accompagnement →" : "Voir ce que ça inclut →"}
        </Link>
      </Button>
    </div>
  );
}
