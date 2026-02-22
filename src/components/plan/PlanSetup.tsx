import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

const TIME_OPTIONS = [
  { key: "less_2h", label: "Moins de 2h" },
  { key: "2_5h", label: "2 à 5h" },
  { key: "5_10h", label: "5 à 10h" },
  { key: "more_10h", label: "Plus de 10h" },
];

const CHANNEL_OPTIONS = [
  { key: "instagram", emoji: "📱", label: "Instagram" },
  { key: "linkedin", emoji: "💼", label: "LinkedIn" },
  { key: "newsletter", emoji: "📧", label: "Newsletter / Emailing" },
  { key: "site", emoji: "🌐", label: "Site web / Blog" },
  { key: "pinterest", emoji: "📌", label: "Pinterest" },
  { key: "seo", emoji: "🔍", label: "SEO" },
];

const GOAL_OPTIONS = [
  { key: "start", emoji: "🧱", label: "Poser les bases de ma com' (je démarre)" },
  { key: "visibility", emoji: "📈", label: "Être plus visible sur les réseaux" },
  { key: "launch", emoji: "🚀", label: "Lancer une offre / un produit" },
  { key: "clients", emoji: "💰", label: "Trouver des client·es" },
  { key: "structure", emoji: "🗂️", label: "Structurer ce que je fais déjà" },
];

interface PlanSetupProps {
  onSubmit: (config: { weekly_time: string; channels: string[]; main_goal: string }) => void;
  saving: boolean;
  initialConfig?: { weekly_time: string; channels: string[]; main_goal: string } | null;
}

export default function PlanSetup({ onSubmit, saving, initialConfig }: PlanSetupProps) {
  const [time, setTime] = useState(initialConfig?.weekly_time || "2_5h");
  const [channels, setChannels] = useState<string[]>(initialConfig?.channels || ["instagram"]);
  const [goal, setGoal] = useState(initialConfig?.main_goal || "start");

  const toggleChannel = (key: string) => {
    setChannels(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-8">
      <div>
        <h2 className="text-xl font-display font-bold text-foreground mb-1">📋 Configurons ton plan</h2>
        <p className="text-sm text-muted-foreground">Pour te proposer un parcours adapté, dis-moi :</p>
      </div>

      {/* Time */}
      <div>
        <h3 className="font-medium text-foreground mb-3">⏰ Combien de temps par semaine tu peux consacrer à ta com' ?</h3>
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map(t => (
            <Chip key={t.key} active={time === t.key} onClick={() => setTime(t.key)}>{t.label}</Chip>
          ))}
        </div>
      </div>

      {/* Channels */}
      <div>
        <h3 className="font-medium text-foreground mb-3">📱 Quels canaux tu utilises ou tu veux utiliser ?</h3>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map(ch => (
            <Chip key={ch.key} active={channels.includes(ch.key)} onClick={() => toggleChannel(ch.key)}>
              {ch.emoji} {ch.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Goal */}
      <div>
        <h3 className="font-medium text-foreground mb-3">🎯 C'est quoi ton objectif principal en ce moment ?</h3>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map(g => (
            <Chip key={g.key} active={goal === g.key} onClick={() => setGoal(g.key)}>
              {g.emoji} {g.label}
            </Chip>
          ))}
        </div>
      </div>

      <Button
        onClick={() => onSubmit({ weekly_time: time, channels, main_goal: goal })}
        disabled={saving || channels.length === 0}
        className="w-full gap-2"
        size="lg"
      >
        <Sparkles className="h-4 w-4" />
        {initialConfig ? "Mettre à jour mon plan" : "Générer mon plan"}
      </Button>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-card text-foreground border-border hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}
