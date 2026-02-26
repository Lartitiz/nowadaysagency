import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserPlan } from "@/hooks/use-user-plan";

type Feature =
  | "branding" | "persona" | "audit_basic" | "generation_limited" | "community_read"
  | "generation_unlimited" | "import_stats" | "prospection" | "comments_generator"
  | "dm_generator" | "audit_unlimited" | "offer_workshop" | "lives" | "community_write"
  | "contacts_strategiques" | "routine_engagement" | "editorial_line" | "calendar"
  | "coaching" | "studio_space" | "laetitia_validation" | "studio_lives" | "direct_channel" | "binome"
  | "whatsapp" | "assistant_chat";

const UPGRADE_MESSAGES: Partial<Record<Feature, string>> = {
  generation_unlimited: "Tu as utilisé tes crédits IA ce mois-ci. Ils se renouvellent le 1er du mois, ou tu peux passer au Premium pour 300 crédits/mois.",
  audit_unlimited: "Tu as utilisé tes audits IA ce mois-ci. Ils se renouvellent le 1er du mois, ou tu peux passer au Premium pour des audits illimités.",
  community_write: "Tu peux lire les échanges de la communauté. Pour poster et commenter, passe au Premium.",
  lives: "Les lives mensuels et replays sont accessibles avec le plan Premium.",
  coaching: "Les sessions visio individuelles font partie de l'accompagnement Binôme.",
  studio_space: "L'espace accompagnement fait partie de l'accompagnement Binôme.",
  laetitia_validation: "La validation par Laetitia fait partie de l'accompagnement Binôme.",
  studio_lives: "Les lives exclusifs font partie de l'accompagnement Binôme.",
  direct_channel: "Le canal direct fait partie de l'accompagnement Binôme.",
  binome: "Le binôme fait partie de l'accompagnement Binôme.",
  whatsapp: "Le support WhatsApp fait partie de l'accompagnement Binôme.",
  assistant_chat: "L'assistant chat fait partie de l'accompagnement Binôme.",
};

const STUDIO_FEATURES = ["coaching", "studio_space", "laetitia_validation", "studio_lives", "direct_channel", "binome", "whatsapp", "assistant_chat"];

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

  const message = UPGRADE_MESSAGES[feature] || "Tu as atteint ta limite de crédits IA ce mois. Passe au Premium pour 300 crédits/mois.";
  const isStudioFeature = STUDIO_FEATURES.includes(feature);

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-display text-lg font-bold text-foreground mb-2">
        {isStudioFeature ? "Disponible avec l'accompagnement Binôme" : "Crédits IA épuisés"}
      </h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
        {message}
      </p>
      <Button asChild className="rounded-full">
        <Link to="/parametres">
          {isStudioFeature ? "Découvrir l'accompagnement →" : "Voir les options →"}
        </Link>
      </Button>
    </div>
  );
}
