import { Link } from "react-router-dom";
import { Instagram, Linkedin, type LucideIcon } from "lucide-react";
import { memoriseRetour } from "@/lib/retour-apres-detour";
import { useSocialConnections, type SocialPlatform } from "@/hooks/use-social-connections";

const COPY: Record<string, { icon: LucideIcon; label: string; benefit: string }> = {
  instagram: {
    icon: Instagram,
    label: "Instagram",
    benefit: "publier tes posts en 1 clic et récupérer tes vraies stats automatiquement",
  },
  linkedin: {
    icon: Linkedin,
    label: "LinkedIn",
    benefit: "publier tes posts en 1 clic, sans copier-coller",
  },
};

/**
 * Encart « moment froid » : sur un hub réseau, invite à connecter le compte
 * quand il ne l'est pas. Ne s'affiche jamais si le compte est déjà connecté
 * (ni pendant le chargement, pour éviter un flash anxiogène « déconnecté ?! »).
 *
 * `platform` accepte AUSSI une liste : les réseaux non connectés sont alors
 * réunis dans UN seul encart compact. Le calendrier empilait deux bandeaux
 * pleine largeur, qui à eux seuls remplissaient le premier écran au doigt —
 * aucune case de calendrier n'était visible à l'arrivée (regard du 17/08).
 */
export default function HubConnectBanner({
  platform,
  benefit,
}: {
  platform: SocialPlatform | SocialPlatform[];
  benefit?: string;
}) {
  const { isConnected, loading } = useSocialConnections();
  if (loading) return null;

  const demandes = (Array.isArray(platform) ? platform : [platform]).filter((p) => COPY[p]);
  const manquants = demandes.filter((p) => !isConnected(p));
  if (manquants.length === 0) return null;

  const cadre =
    "mb-6 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap";
  const cta =
    "shrink-0 inline-flex items-center rounded-pill bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors";

  // Un seul réseau manquant : le message long, qui dit le bénéfice précis.
  if (manquants.length === 1) {
    const copy = COPY[manquants[0]];
    const Icon = copy.icon;
    return (
      <div className={cadre}>
        <div className="flex items-start gap-2.5 text-sm text-foreground min-w-0">
          <Icon className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
          <span>
            Connecte ton compte <strong>{copy.label}</strong> pour {benefit || copy.benefit}.
          </span>
        </div>
        <Link
          to="/parametres/connexions"
          // Une fois connectée, on la ramène sur ce hub plutôt que de la laisser
          // dans les paramètres.
          onClick={() => memoriseRetour()}
          className={cta}
        >
          Connecter {copy.label}
        </Link>
      </div>
    );
  }

  // Plusieurs réseaux manquants : un seul encart, une seule porte. Le bénéfice
  // commun (« publier en 1 clic ») suffit ; le détail vit dans les paramètres.
  const noms = manquants.map((p) => COPY[p].label);
  const listeNoms = noms.length === 2 ? `${noms[0]} et ${noms[1]}` : noms.join(", ");

  return (
    <div className={cadre}>
      <div className="flex items-start gap-2.5 text-sm text-foreground min-w-0">
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {manquants.map((p) => {
            const Icon = COPY[p].icon;
            return (
              <Icon key={p} className="h-[18px] w-[18px] text-primary" strokeWidth={1.75} />
            );
          })}
        </span>
        <span>
          Connecte <strong>{listeNoms}</strong> pour {benefit || "publier tes posts en 1 clic, sans copier-coller"}.
        </span>
      </div>
      <Link to="/parametres/connexions" onClick={() => memoriseRetour()} className={cta}>
        Connecter mes comptes
      </Link>
    </div>
  );
}
