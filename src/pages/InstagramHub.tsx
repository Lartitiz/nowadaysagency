import { useState } from "react";
import { UserRound, ScanEye, NotebookPen, Rocket } from "lucide-react";
import { useDemoContext } from "@/contexts/DemoContext";
import { HubConnectBanner } from "@/components/hub";
import InstagramProfileCoaching from "@/components/instagram/InstagramProfileCoaching";
import { PresenceLayout, PresenceScope, PresenceCreate, PresenceCard, PresenceChoices, PresenceLink } from "@/components/hub/PresenceLayout";

export default function InstagramHub() { return <PresenceScope page={InstagramSpace} />; }

function InstagramSpace() {
  const { isDemoMode } = useDemoContext();
  const [coachingOpen, setCoachingOpen] = useState(false);
  return <PresenceLayout label="Instagram" title="Ton Instagram, à ton image." description="Travaille ton profil, puis crée des contenus qui donnent envie de te découvrir.">
    <PresenceCreate channel="instagram" label="Créer pour Instagram" description="Un post, un carrousel, un reel ou une story." />
    <div className="grid gap-4 sm:grid-cols-2">
      <PresenceCard title="Mon profil" description="Nom, bio, stories à la une, posts épinglés et feed." icon={UserRound} to="/instagram/profil" />
      <PresenceCard title="Faire le point" description="Un audit de ton profil et des recommandations pour avancer." icon={ScanEye} to="/instagram/audit" />
      <PresenceChoices title="Ma ligne éditoriale" description="Tes sujets, tes formats et un rythme qui te convient." icon={NotebookPen}>
        <PresenceLink to="/instagram/profil/edito">Mes sujets et mes piliers</PresenceLink>
        <PresenceLink to="/instagram/rythme">Mes formats et mon rythme</PresenceLink>
      </PresenceChoices>
      <PresenceCard title="Préparer un lancement" description="Ton offre, un plan, puis les contenus à créer." icon={Rocket} to="/instagram/lancement" />
    </div>
    <nav aria-label="Suivi Instagram" className="my-6 flex flex-wrap gap-x-6 gap-y-1">
      <PresenceLink to="/instagram/stats">Mes statistiques</PresenceLink>
      <PresenceLink to="/calendrier?canal=instagram">Mon calendrier</PresenceLink>
    </nav>
    <details className="mb-6 border-y border-border py-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Besoin d’aide ou envie de développer mon réseau</summary>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
        <button type="button" onClick={() => setCoachingOpen(true)} className="min-h-11 text-left text-sm font-medium text-bordeaux underline underline-offset-4 dark:text-foreground">Me laisser guider par l’IA pour mon profil</button>
        <PresenceLink to="/instagram/routine">Ma routine, mes contacts et mes échanges</PresenceLink>
      </div>
    </details>
    {!isDemoMode && <HubConnectBanner platform="instagram" />}
    {coachingOpen && <InstagramProfileCoaching open onOpenChange={setCoachingOpen} />}
  </PresenceLayout>;
}
