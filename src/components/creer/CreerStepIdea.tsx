import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles, HelpCircle, Newspaper } from "lucide-react";
import { OBJECTIVE_RECOMMENDATIONS } from "@/lib/content-structures";
import ContentCoachingDialog from "@/components/dashboard/ContentCoachingDialog";
import NewsjackingPanel from "./NewsjackingPanel";

interface Props {
  onNext: (idea: string, objective?: string) => void;
  onCoachingSelect?: (data: { subject: string; format: string; objective: string; carouselSubMode?: "text" | "photo" }) => void;
  onNewsjackingSelect?: (data: { subject: string; context: string; format?: string; vehicule?: string }) => void;
  workspaceId?: string;
}

const objectives = Object.entries(OBJECTIVE_RECOMMENDATIONS).map(([id, o]) => ({
  id,
  label: o.label,
  emoji: o.emoji,
}));

export default function CreerStepIdea({ onNext, onCoachingSelect, onNewsjackingSelect, workspaceId }: Props) {
  const [idea, setIdea] = useState("");
  const [objective, setObjective] = useState<string | undefined>(undefined);
  const [coachOpen, setCoachOpen] = useState(false);
  const [showNewsjacking, setShowNewsjacking] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Qu'est-ce que tu veux partager ?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Raconte ton idée en quelques mots, même vague. L'IA va t'aider à la transformer en contenu.
        </p>
      </div>

      {/* Subject textarea */}
      <div className="space-y-2">
        <Textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Ex : je veux montrer les nouveaux colliers en velours que j'ai reçus / je voudrais parler de pourquoi je fais ce métier / j'ai envie de réagir à une actu..."
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">Pas besoin d'être précise : un mot-clé, une phrase, une envie. L'outil te guide ensuite.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setCoachOpen(true)}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Aide-moi à trouver une idée
          </Button>
          {!showNewsjacking && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setShowNewsjacking(true)}
            >
              <Newspaper className="h-3.5 w-3.5" /> Surfer sur l'actu
            </Button>
          )}
        </div>
      </div>

      {/* Newsjacking panel */}
      {showNewsjacking && (
        <NewsjackingPanel
          onSelect={(data) => {
            setShowNewsjacking(false);
            if (onNewsjackingSelect) {
              onNewsjackingSelect(data);
            }
          }}
          onClose={() => setShowNewsjacking(false)}
          workspaceId={workspaceId}
        />
      )}

      {/* Objective selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Quel objectif ? <span className="text-muted-foreground font-normal">(optionnel)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {objectives.map((o) => (
            <button
              key={o.id}
              onClick={() => setObjective(objective === o.id ? undefined : o.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${
                objective === o.id
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              <span>{o.emoji}</span> {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Next button */}
      <Button
        onClick={() => onNext(idea.trim(), objective)}
        disabled={!idea.trim()}
        className="w-full gap-2"
      >
        Suivant <ArrowRight className="h-4 w-4" />
      </Button>

      {/* Coaching dialog */}
      <ContentCoachingDialog open={coachOpen} onOpenChange={setCoachOpen} onSelect={onCoachingSelect} />
    </div>
  );
}
