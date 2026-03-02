import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ContentRecycling from "@/components/ContentRecycling";
import CrosspostFlow from "@/components/CrosspostFlow";
import InspireFlow from "@/components/InspireFlow";

type TransformMode = "select" | "recycle" | "crosspost" | "inspire";

const MODES = [
  { id: "recycle" as const, emoji: "♻️", label: "Recycler", desc: "Transforme un contenu existant en plusieurs formats" },
  { id: "crosspost" as const, emoji: "🔄", label: "Crosspost", desc: "Adapte un contenu pour un autre canal" },
  { id: "inspire" as const, emoji: "✨", label: "S'inspirer", desc: "Analyse un contenu qui te plaît et crée ta version" },
];

export default function CreerTransformTab() {
  const [mode, setMode] = useState<TransformMode>("select");

  if (mode === "select") {
    return (
      <div className="space-y-3 animate-fade-in">
        <p className="text-sm font-semibold text-foreground">Que veux-tu faire ?</p>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className="w-full rounded-xl border-2 border-border bg-card p-4 text-left hover:border-primary/40 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{m.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{m.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => setMode("select")} className="gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour
      </Button>
      {mode === "recycle" && <ContentRecycling />}
      {mode === "crosspost" && <CrosspostFlow />}
      {mode === "inspire" && <InspireFlow />}
    </div>
  );
}
