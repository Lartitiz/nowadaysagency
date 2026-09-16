import { useState } from "react";
import { UserRound, ScanEye, ScanText, Repeat2 } from "lucide-react";
import { useDemoContext } from "@/contexts/DemoContext";
import { HubConnectBanner } from "@/components/hub";
import LinkedInCoaching from "@/components/linkedin/LinkedInCoaching";
import { PresenceLayout, PresenceScope, PresenceCreate, PresenceCard, PresenceChoices, PresenceLink } from "@/components/hub/PresenceLayout";

export default function LinkedInHub() { return <PresenceScope page={LinkedInSpace} />; }

function LinkedInSpace() {
  const { isDemoMode } = useDemoContext();
  const [coachingOpen, setCoachingOpen] = useState(false);
  return <PresenceLayout label="LinkedIn" title="Ton LinkedIn, avec ta voix." description="Un profil clair et des contenus qui rendent ton travail compréhensible.">
    <PresenceCreate channel="linkedin" label="Créer pour LinkedIn" description="Pars d’une idée pour préparer ton prochain post." />
    <div className="grid gap-4 sm:grid-cols-2">
      <PresenceChoices title="Mon profil" description="Présentation, résumé, expériences et recommandations." icon={UserRound}>
        <PresenceLink to="/linkedin/profil">Titre, photo, bannière et réglages</PresenceLink>
        <PresenceLink to="/linkedin/resume">Mon résumé · À propos</PresenceLink>
        <PresenceLink to="/linkedin/parcours">Expériences, formations et compétences</PresenceLink>
        <PresenceLink to="/linkedin/recommandations">Demandes et recommandations reçues</PresenceLink>
      </PresenceChoices>
      <PresenceCard title="Faire le point" description="Relire ton profil et identifier tes priorités." icon={ScanEye} to="/linkedin/audit" />
      <PresenceCard title="Analyser un post" description="Retravailler un texte que tu as déjà écrit." icon={ScanText} to="/linkedin/post" />
      <PresenceCard title="Adapter un contenu" description="Préparer plusieurs versions à partir d’un même contenu." icon={Repeat2} to="/linkedin/crosspost" />
    </div>
    <nav aria-label="Organisation LinkedIn" className="my-6 flex flex-wrap gap-x-6 gap-y-1">
      <PresenceLink to="/calendrier?canal=linkedin">Mon calendrier</PresenceLink>
    </nav>
    <details className="mb-6 border-y border-border py-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Besoin d’aide ou envie de développer mon réseau</summary>
      <div className="mt-3 flex flex-col items-start">
        <button type="button" onClick={() => setCoachingOpen(true)} className="min-h-11 text-left text-sm font-medium text-bordeaux underline underline-offset-4 dark:text-foreground">Me laisser guider par l’IA pour mon profil et ma stratégie</button>
        <PresenceLink to="/linkedin/comment-strategy">Mes comptes à commenter</PresenceLink>
        <PresenceLink to="/linkedin/engagement">Ma routine et mes échanges</PresenceLink>
      </div>
    </details>
    {!isDemoMode && <HubConnectBanner platform="linkedin" />}
    {coachingOpen && <LinkedInCoaching open onOpenChange={setCoachingOpen} />}
  </PresenceLayout>;
}
