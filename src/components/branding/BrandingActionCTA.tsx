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
    { label: "Écrire un post storytelling", route: "/creer" },
    { label: "Créer un carousel Mon Parcours", route: "/creer?format=carousel" },
    { label: "Générer une accroche newsletter", route: "/creer" },
  ],
  persona: [
    { label: "Écrire un post qui parle à ma cible", route: "/creer" },
    { label: "Générer un DM de prospection", route: "/instagram/routine" },
    { label: "Revoir ma bio Instagram", route: "/instagram/profil/bio" },
  ],
  value_proposition: [
    { label: "Générer ma bio Instagram", route: "/instagram/profil/bio" },
    { label: "Générer ma bio LinkedIn", route: "/linkedin/profil" },
    { label: "Écrire un post offre", route: "/creer" },
  ],
  tone_style: [
    { label: "Tester mon ton sur un post", route: "/creer" },
    { label: "Reformuler un texte dans mon style", route: "/creer" },
    { label: "Voir mon guide de voix", route: null },
  ],
  content_strategy: [
    { label: "Planifier ma semaine de contenu", route: "/calendrier" },
    { label: "Générer des idées de posts", route: "/creer" },
    { label: "Créer mon premier post", route: "/creer" },
  ],
  offers: [
    { label: "Écrire un post pour présenter mon offre", route: "/creer" },
    { label: "Créer un carousel offre", route: "/creer" },
    { label: "Planifier un lancement", route: "/calendrier" },
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
