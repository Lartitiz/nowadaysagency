// Encadré « Le détail qui rendra cette séquence vraiment tienne », sorti de
// StoryResult.tsx à l'identique (chantier D, 15/10/2026) pour alléger le fichier.
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

export default function StoryPersonalAnchor({ tip, value, onChange, onInsert }: { tip: string; value: string; onChange: (value: string) => void; onInsert: () => void }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2" data-story-personal-anchor>
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">Le détail qui rendra cette séquence vraiment tienne</p>
          <p className="text-xs text-muted-foreground">{tip}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor="story-personal-anchor" className="text-2xs font-medium text-muted-foreground">
            Ce que tu as vraiment pensé, vu ou dit
          </label>
          <Textarea
            id="story-personal-anchor"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-[64px] resize-y bg-background text-sm"
            placeholder="Ex. Là, je me suis dit : il y a un truc qui cloche."
          />
        </div>
        <Button type="button" size="sm" onClick={onInsert} disabled={!value.trim()}>
          Ajouter à la story 1
        </Button>
      </div>
    </div>
  );
}
