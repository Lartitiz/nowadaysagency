import { Link } from "react-router-dom";
import { memoriseRetour } from "@/lib/retour-apres-connexion";
import { useSocialConnections, type SocialPlatform } from "@/hooks/use-social-connections";

const COPY: Record<string, { emoji: string; label: string; benefit: string }> = {
  instagram: {
    emoji: "📸",
    label: "Instagram",
    benefit: "publier tes posts en 1 clic et récupérer tes vraies stats automatiquement",
  },
  linkedin: {
    emoji: "💼",
    label: "LinkedIn",
    benefit: "publier tes posts en 1 clic, sans copier-coller",
  },
};

/**
 * Encart « moment froid » : sur un hub réseau, invite à connecter le compte
 * quand il ne l'est pas. Ne s'affiche jamais si le compte est déjà connecté
 * (ni pendant le chargement, pour éviter un flash anxiogène « déconnecté ?! »).
 */
export default function HubConnectBanner({ platform, benefit }: { platform: SocialPlatform; benefit?: string }) {
  const { isConnected, loading } = useSocialConnections();
  const copy = COPY[platform];
  if (!copy) return null;
  if (loading || isConnected(platform)) return null;

  return (
    <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-2.5 text-sm text-foreground min-w-0">
        <span className="text-lg leading-none shrink-0" aria-hidden="true">{copy.emoji}</span>
        <span>
          Connecte ton compte <strong>{copy.label}</strong> pour {benefit || copy.benefit}.
        </span>
      </div>
      <Link
        to="/parametres/connexions"
        // Une fois connectée, on la ramène sur ce hub plutôt que de la laisser
        // dans les paramètres.
        onClick={() => memoriseRetour()}
        className="shrink-0 inline-flex items-center rounded-pill bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Connecter {copy.label}
      </Link>
    </div>
  );
}
