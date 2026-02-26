import { useState } from "react";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: "instagram" | "linkedin";
}

const OBJECTIFS = [
  { id: "visibilite", emoji: "👀", label: "Me faire remarquer" },
  { id: "expertise", emoji: "🧠", label: "Montrer mon expertise" },
  { id: "conversation", emoji: "💬", label: "Créer une vraie conversation" },
] as const;

const TONS = [
  { id: "complice", emoji: "💛", label: "Complice et perso" },
  { id: "expert", emoji: "📊", label: "Expert et info" },
  { id: "provoc", emoji: "🔥", label: "Décalé et provoc" },
] as const;

const TYPE_LABELS: Record<string, { badge: string; color: string }> = {
  court: { badge: "Court", color: "bg-blue-100 text-blue-700" },
  developpe: { badge: "Développé", color: "bg-purple-100 text-purple-700" },
  value_bomb: { badge: "Value bomb", color: "bg-amber-100 text-amber-700" },
};

export default function EngagementCoachingDialog({ open, onOpenChange, platform }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [postText, setPostText] = useState("");
  const [objectif, setObjectif] = useState("");
  const [ton, setTon] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const reset = () => {
    setStep(1);
    setPostText("");
    setObjectif("");
    setTon("");
    setResult(null);
    setLoading(false);
    setCopiedIdx(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("engagement-coaching", {
        body: { post_text: postText, objectif, ton_envie: ton, platform },
      });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message || "Impossible de générer", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleTonSelect = (t: string) => {
    setTon(t);
    generate();
  };

  const copyComment = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast({ title: "📋 Commentaire copié !" });
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <CoachingShell
      open={open}
      onOpenChange={handleClose}
      title="Coach engagement"
      description="Je t'aide à rédiger des commentaires qui créent de vraies conversations."
      emoji="💬"
    >

        {/* Step 1: Post text */}
        {step === 1 && !loading && !result && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Colle le post que tu veux commenter</p>
            <Textarea
              value={postText}
              onChange={e => setPostText(e.target.value)}
              placeholder="Copie-colle le texte du post ici..."
              className="min-h-[120px]"
            />
            <Button
              onClick={() => setStep(2)}
              disabled={postText.trim().length < 10}
              className="w-full rounded-pill"
            >
              Suivant →
            </Button>
          </div>
        )}

        {/* Step 2: Objectif */}
        {step === 2 && !loading && !result && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">C'est quoi ton objectif avec ce commentaire ?</p>
            <div className="grid gap-2">
              {OBJECTIFS.map(o => (
                <button
                  key={o.id}
                  onClick={() => { setObjectif(o.id); setStep(3); }}
                  className="w-full text-left rounded-xl border border-border p-3 hover:border-primary/40 hover:bg-primary/5 transition-all text-sm"
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Ton */}
        {step === 3 && !loading && !result && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Quel ton pour ce commentaire ?</p>
            <div className="grid gap-2">
              {TONS.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleTonSelect(t.id)}
                  className="w-full text-left rounded-xl border border-border p-3 hover:border-primary/40 hover:bg-primary/5 transition-all text-sm"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">L'IA prépare tes commentaires...</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-4">
            {result.comments?.map((c: any, i: number) => {
              const meta = TYPE_LABELS[c.type] || TYPE_LABELS.court;
              return (
                <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                    {meta.badge}
                  </span>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{c.text}</p>
                  <p className="text-xs text-muted-foreground italic">💡 {c.strategy}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => copyComment(c.text, i)}
                  >
                    {copiedIdx === i ? <><Check className="h-3 w-3 mr-1" /> Copié</> : <><Copy className="h-3 w-3 mr-1" /> Copier</>}
                  </Button>
                </div>
              );
            })}

            {result.tip && (
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                💡 <strong>Conseil :</strong> {result.tip}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1 rounded-pill text-sm">
                Recommencer
              </Button>
              <Button onClick={() => handleClose(false)} className="flex-1 rounded-pill text-sm">
                Fermer
              </Button>
            </div>
          </div>
        )}
    </CoachingShell>
  );
}
