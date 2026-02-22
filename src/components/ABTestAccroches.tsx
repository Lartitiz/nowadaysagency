import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ABTestAccrochesProps {
  accroches: string[];
  onGenerate?: () => void;
}

export default function ABTestAccroches({ accroches }: ABTestAccrochesProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  if (!accroches || accroches.length < 2) return null;

  // Take up to 3 accroches
  const hooks = accroches.slice(0, 3);

  const stories = hooks.map((h, i) => ({
    label: `Accroche ${String.fromCharCode(65 + i)}`,
    text: h,
    poll: i === 0 ? "Ça t'accroche ?" : i === 1 ? "Et celle-là ?" : "Celle-ci ?",
  }));

  const copyAll = () => {
    const text = stories.map((s, i) => `Story ${i + 1} :\n"${s.text}"\n🎯 Sondage : "${s.poll}" [Oui / Bof]\n`).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "3 stories copiées !" });
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="rounded-pill gap-1.5">
        <FlaskConical className="h-3.5 w-3.5" /> Tester mes accroches en stories
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-fade-in">
      <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
        🧪 Test A/B en stories
      </h3>
      <p className="text-sm text-muted-foreground">
        Publie ces 3 stories avec le sondage. Utilise l'accroche qui gagne pour ton post feed.
      </p>

      <div className="space-y-3">
        {stories.map((s, i) => (
          <div key={i} className="rounded-xl bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Story {i + 1}
            </p>
            <p className="text-sm text-foreground italic">"{s.text}"</p>
            <p className="text-xs text-primary font-medium">
              🎯 Sondage : "{s.poll}" [Oui / Bof]
            </p>
          </div>
        ))}
      </div>

      <Button size="sm" onClick={copyAll} className="rounded-pill gap-1.5">
        <Copy className="h-3.5 w-3.5" /> Copier les 3 stories
      </Button>

      <p className="text-xs text-muted-foreground italic">
        💡 Publie les 3, regarde les résultats du sondage, puis utilise la gagnante pour ton post feed.
      </p>
    </div>
  );
}
