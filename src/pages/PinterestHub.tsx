import { UserRound, PanelsTopLeft, Search, Pin } from "lucide-react";
import { PresenceLayout, PresenceScope, PresenceCreate, PresenceCard, PresenceLink } from "@/components/hub/PresenceLayout";

export default function PinterestHub() { return <PresenceScope page={PinterestSpace} />; }

function PinterestSpace() {
  return <PresenceLayout label="Pinterest" title="Des idées qui mènent vers toi." description="Organise tes tableaux et prépare des épingles utiles, avec le bon lien.">
    <PresenceCreate channel="pinterest" label="Créer pour Pinterest" description="Prépare un visuel et le texte de ta prochaine épingle." />
    <div className="grid gap-4 sm:grid-cols-2">
      <PresenceCard title="Mon profil" description="Nom, description, photo et lien vers ton site." icon={UserRound} to="/pinterest/compte" />
      <PresenceCard title="Mes tableaux" description="Des thèmes clairs pour organiser tes épingles." icon={PanelsTopLeft} to="/pinterest/tableaux" />
      <PresenceCard title="Mes mots-clés" description="Les mots à réutiliser dans tes tableaux et tes épingles." icon={Search} to="/pinterest/mots-cles" />
      <PresenceCard title="Mes épingles" description="Retrouve tes titres, descriptions, tableaux et liens enregistrés." icon={Pin} to="/pinterest/epingles" />
    </div>
    <nav aria-label="Organisation Pinterest" className="my-6 flex flex-wrap gap-x-6 gap-y-1">
      <PresenceLink to="/pinterest/routine">Ma routine Pinterest</PresenceLink>
      <PresenceLink to="/calendrier?canal=pinterest">Mon calendrier</PresenceLink>
    </nav>
  </PresenceLayout>;
}
