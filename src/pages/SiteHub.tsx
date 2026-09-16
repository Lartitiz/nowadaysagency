import { FilePenLine, PencilLine, ScanEye, UserRound, Quote, PanelsTopLeft } from "lucide-react";
import { PresenceLayout, PresenceScope, PresenceCard, PresenceChoices, PresenceLink } from "@/components/hub/PresenceLayout";
import SiteContext from "@/components/hub/SiteContext";

export default function SiteHub() { return <PresenceScope page={SiteSpace} />; }

function SiteSpace() {
  return <PresenceLayout label="Améliorer mon site" title="Des pages qui expliquent ton offre." description="Rédige ou améliore tes textes, puis intègre-les dans ton outil de site web.">
    <p className="mb-6 rounded-xl border border-border bg-rose-pale/40 px-5 py-4 text-sm text-foreground">Textes et audit : ton site reste dans ton outil habituel.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <PresenceChoices title="Rédiger une page" description="Choisis la page que tu veux préparer ou reprendre." icon={FilePenLine}>
        <PresenceLink to="/site/accueil">Accueil, services ou page de vente</PresenceLink>
        <PresenceLink to="/site/capture">Page de capture · recueillir des emails</PresenceLink>
      </PresenceChoices>
      <PresenceCard title="Améliorer une page" description="Revoir le texte d’une page existante, section par section." icon={PencilLine} to="/site/optimiser" />
      <PresenceCard title="Auditer une page" description="Identifier les informations et les appels à l’action à clarifier." icon={ScanEye} to="/site/audit" />
      <PresenceCard title="Ma page À propos" description="Présenter ton parcours et ta façon de travailler." icon={UserRound} to="/site/a-propos" />
    </div>
    <details className="mt-6 border-y border-border py-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Témoignages et inspirations visuelles</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PresenceCard title="Mes témoignages" description="Préparer une demande et mettre en forme les retours reçus." icon={Quote} to="/site/temoignages" />
        <PresenceCard title="Inspirations de sections" description="Explorer des compositions à reprendre sur ton site." icon={PanelsTopLeft} to="/site/inspirations" />
      </div>
    </details>
    <SiteContext />
    <details className="border-t border-border py-4">
      <summary className="cursor-pointer text-sm text-muted-foreground">Fonctionnalités à venir</summary>
      <p className="mt-3 text-sm text-muted-foreground">Fiches produits et autres optimisations : ces outils ne sont pas encore disponibles.</p>
    </details>
  </PresenceLayout>;
}
