import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserPlan } from "@/hooks/use-user-plan";

type Feature =
  | "branding" | "persona" | "audit_basic" | "generation_limited" | "community_read"
  | "generation_unlimited" | "import_stats" | "prospection" | "comments_generator"
  | "dm_generator" | "audit_unlimited" | "offer_workshop" | "lives" | "community_write"
  | "contacts_strategiques" | "routine_engagement" | "editorial_line" | "calendar"
  | "coaching" | "studio_space" | "laetitia_validation" | "studio_lives" | "direct_channel" | "binome";

const UPGRADE_MESSAGES: Partial<Record<Feature, string>> = {
  prospection: "Le mini-CRM de prospection est disponible avec le plan Outil.",
  dm_generator: "Le générateur de DM personnalisés est disponible avec le plan Outil.",
  comments_generator: "Le générateur de commentaires stratégiques est disponible avec le plan Outil.",
  import_stats: "L'import de tes stats est disponible avec le plan Outil.",
  generation_unlimited: "Tu as utilisé tes 3 générations gratuites ce mois-ci.",
  audit_unlimited: "Tu as déjà fait ton audit gratuit ce mois-ci.",
  lives: "Les lives mensuels sont réservés aux abonnées.",
  community_write: "Poster dans la communauté est réservé aux abonnées.",
  offer_workshop: "L'atelier positionnement offre est disponible avec le plan Outil.",
  contacts_strategiques: "Les contacts stratégiques sont disponibles avec le plan Outil.",
  routine_engagement: "La routine d'engagement est disponible avec le plan Outil.",
  editorial_line: "La ligne éditoriale est disponible avec le plan Outil.",
  calendar: "Le calendrier éditorial est disponible avec le plan Outil.",
  coaching: "Les coachings individuels sont réservés au Now Studio.",
  studio_space: "L'espace privé est réservé aux membres du Now Studio.",
  laetitia_validation: "La validation par Laetitia est réservée au Now Studio.",
  studio_lives: "Les lives exclusifs sont réservés au Now Studio.",
  direct_channel: "Le canal direct est réservé au Now Studio.",
  binome: "Le binôme est réservé au Now Studio.",
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

  const message = UPGRADE_MESSAGES[feature] || "Cette fonctionnalité est disponible avec un plan supérieur.";
  const isStudioFeature = ["coaching", "studio_space", "laetitia_validation", "studio_lives", "direct_channel", "binome"].includes(feature);

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-display text-lg font-bold text-foreground mb-2">
        Fonctionnalité {isStudioFeature ? "Now Studio" : "premium"}
      </h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
        {message}
      </p>
      <Button asChild className="rounded-full">
        <Link to="/parametres">
          {isStudioFeature ? "Découvrir le Now Studio →" : "Voir les plans →"}
        </Link>
      </Button>
    </div>
  );
}
