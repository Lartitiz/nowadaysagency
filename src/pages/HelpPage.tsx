import { Link } from "react-router-dom";
import { ChevronDown, Mail } from "lucide-react";
import AppHeader from "@/components/AppHeader";

/**
 * Page d'aide courte (chantier G, 15/10/2026) : les questions qu'une personne se
 * pose seule devant l'outil. Questions repliées pour tenir sans défiler.
 * Pas de chiffres de forfait ici : ils vivent dans « Mon abonnement ».
 */
const QUESTIONS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Par où je commence ?",
    a: <>Remplis d'abord <Link to="/branding" className="underline">Mon identité</Link> : ton activité, ta voix, les personnes que tu veux toucher. Plus elle est complète, plus les textes te ressemblent. Ensuite, clique sur « Créer ».</>,
  },
  {
    q: "Comment je crée un contenu ?",
    a: <>Clique sur « Créer » (en haut sur ordinateur, en bas sur téléphone). Choisis le réseau, puis le format : post, carrousel, reel, story… Écris ton idée en une phrase. L'outil rédige, et tu peux tout modifier.</>,
  },
  {
    q: "Où je retrouve ce que j'ai créé ?",
    a: <>Dans <Link to="/idees" className="underline">Mes idées</Link> si tu l'as gardé, ou dans le <Link to="/calendrier" className="underline">Calendrier</Link> si tu l'as placé à une date.</>,
  },
  {
    q: "L'outil publie-t-il à ma place ?",
    a: <>Pour Instagram et LinkedIn, oui, si tu relies ton compte dans <Link to="/parametres/connexions" className="underline">Paramètres, Connexions</Link>. Tu publies tout de suite ou à une date choisie. Sinon, copie le texte et télécharge les visuels.</>,
  },
  {
    q: "C'est quoi, les crédits ?",
    a: <>Chaque texte ou visuel préparé par l'outil utilise des crédits. Le compteur en haut de l'écran montre ce qu'il te reste ce mois-ci. Il repart au début de chaque mois. Le détail est dans <Link to="/abonnement" className="underline">Mon abonnement</Link>.</>,
  },
  {
    q: "Le texte ne me ressemble pas. Que faire ?",
    a: <>Complète ta voix et tes expressions dans <Link to="/branding" className="underline">Mon identité</Link>. Puis demande une nouvelle proposition, ou corrige le texte toi-même : il est entièrement modifiable.</>,
  },
  {
    q: "Que deviennent mes informations ?",
    a: <>Elles servent seulement à préparer tes contenus. Tu peux supprimer ton compte et toutes tes informations depuis <Link to="/parametres" className="underline">Paramètres</Link>.</>,
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-2xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 md:pb-8">
        <h1 className="font-display text-3xl text-bordeaux dark:text-foreground">Aide</h1>
        <p className="mt-1 text-sm text-muted-foreground">Les réponses aux questions les plus fréquentes.</p>

        <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="group px-4 sm:px-5">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-pale/60 p-4">
          <p className="text-sm text-foreground">Une autre question ou un souci ?</p>
          <a href="mailto:laetitia@nowadaysagency.com" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Mail className="h-4 w-4" aria-hidden="true" /> Écrire à Laetitia
          </a>
        </div>
      </main>
    </div>
  );
}
