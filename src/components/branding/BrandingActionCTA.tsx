import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface ActionDef {
  label: string;
  route: string | null;
}

const ACTIONS: Record<string, ActionDef[]> = {
  story: [
    { label: "Écrire un post storytelling", route: "/studio/discover" },
    { label: "Créer un carousel Mon Parcours", route: "/studio/discover" },
    { label: "Générer une accroche newsletter", route: "/studio/discover" },
  ],
  persona: [
    { label: "Écrire un post qui parle à ma cible", route: "/studio/discover" },
    { label: "Générer un DM de prospection", route: "/espaces/instagram/prospection" },
    { label: "Revoir ma bio Instagram", route: "/espaces/instagram/bio" },
  ],
  value_proposition: [
    { label: "Générer ma bio Instagram", route: "/espaces/instagram/bio" },
    { label: "Générer ma bio LinkedIn", route: "/espaces/linkedin" },
    { label: "Écrire un post offre", route: "/studio/discover" },
  ],
  tone_style: [
    { label: "Tester mon ton sur un post", route: "/studio/discover" },
    { label: "Reformuler un texte dans mon style", route: "/studio/discover" },
    { label: "Voir mon guide de voix", route: null },
  ],
  content_strategy: [
    { label: "Planifier ma semaine de contenu", route: "/calendrier" },
    { label: "Générer des idées de posts", route: "/studio/discover" },
    { label: "Créer mon premier post", route: "/studio/discover" },
  ],
};

interface BrandingActionCTAProps {
  section: string;
}

export default function BrandingActionCTA({ section }: BrandingActionCTAProps) {
  const navigate = useNavigate();
  const actions = ACTIONS[section] || ACTIONS.story;

  const handleClick = (action: ActionDef) => {
    if (!action.route) {
      toast("Bientôt disponible !", { description: "Cette fonctionnalité arrive très vite 🚀" });
      return;
    }
    navigate(action.route);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/10 p-5 sm:p-6 mt-8 animate-fade-in">
      <p className="font-display text-base font-bold text-foreground mb-1">
        ✨ Ta section est complète ! Et maintenant ?
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Passe à l'action et utilise ton branding dans tes contenus.
      </p>
      <div className="flex flex-col gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className="justify-between gap-2 text-left h-auto py-2.5 px-4"
            onClick={() => handleClick(action)}
          >
            <span className="text-sm">{action.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </div>
  );
}
