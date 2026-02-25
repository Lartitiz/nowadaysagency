import { Button } from "@/components/ui/button";
import { ArrowRight, Phone, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

const CALENDLY_URL = "https://calendly.com/laetitia-mattioli/rendez-vous-avec-laetitia";

const PHASES = [
  {
    title: "Mois 1-3 : Je construis pour toi",
    emoji: "🔧",
    items: [
      "Audit complet de ta communication",
      "Positionnement & branding sur-mesure",
      "Portrait de ta cible idéale",
      "Ligne éditoriale & calendrier 3 mois",
      "Contenus prêts à publier (10-15)",
      "Templates Canva personnalisés",
    ],
  },
  {
    title: "Mois 4-6 : On fait ensemble",
    emoji: "🤝",
    items: [
      "Suivi mensuel de tes résultats",
      "Ajustements stratégiques en continu",
      "Coaching sur tes contenus en direct",
      "Support WhatsApp illimité",
      "Bilan final & plan d'autonomie",
    ],
  },
];

const DELIVERABLES = [
  "Audit de communication complet",
  "Branding & positionnement",
  "Portrait cible détaillé",
  "Offres reformulées",
  "Ligne éditoriale complète",
  "Calendrier éditorial 3 mois",
  "Bio Instagram optimisée",
  "10-15 contenus rédigés",
  "Templates Canva sur-mesure",
  "Plan de com' sur 6 mois",
];

export default function NowPilotPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-b from-rose-pale to-background">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <span className="text-sm font-semibold text-primary uppercase tracking-wide">🤝 Accompagnement</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3 mb-4">
            Mon accompagnement
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-2">
            3 mois je construis pour toi.<br />3 mois on fait ensemble.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            L'accompagnement complet pour les solopreneuses qui veulent une communication pro, sans y passer leurs journées.
          </p>
          <Button asChild size="lg" className="rounded-full gap-2 text-base px-8">
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              <Phone className="h-4 w-4" /> Réserver un appel découverte
            </a>
          </Button>
        </div>
      </div>

      {/* Phases */}
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="font-display text-2xl font-bold text-foreground text-center mb-8">Le programme en 2 phases</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PHASES.map(phase => (
            <div key={phase.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-display text-lg font-bold text-foreground mb-4">{phase.emoji} {phase.title}</h3>
              <ul className="space-y-2">
                {phase.items.map(item => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Deliverables */}
      <div className="bg-rose-pale py-12">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="font-display text-2xl font-bold text-foreground text-center mb-6">Tes livrables</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DELIVERABLES.map(d => (
              <div key={d} className="flex items-center gap-2 bg-card rounded-xl px-4 py-3 text-sm font-medium text-foreground">
                <span className="text-primary">✅</span> {d}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="mx-auto max-w-3xl px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">250€/mois × 6 mois</h2>
        <p className="text-muted-foreground mb-2">300 crédits IA inclus · 9 sessions avec Laetitia · WhatsApp illimité</p>
        <p className="text-sm text-muted-foreground mb-6">L'outil complet + un regard humain expert sur ta communication.</p>
        <Button asChild size="lg" className="rounded-full gap-2 text-base px-8">
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
            <Phone className="h-4 w-4" /> Réserver un appel découverte
          </a>
        </Button>
        <div className="mt-4">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← Retour au dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
