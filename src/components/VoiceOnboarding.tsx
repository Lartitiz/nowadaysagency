import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";

interface VoiceAnalysis {
  structure_patterns: string[];
  tone_patterns: string[];
  signature_expressions: string[];
  voice_summary: string;
  formatting_habits: string[];
}

interface VoiceOnboardingProps {
  onComplete?: () => void;
  existingProfile?: any;
}

export default function VoiceOnboarding({ onComplete, existingProfile }: VoiceOnboardingProps) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const [step, setStep] = useState<"input" | "review" | "done">(existingProfile ? "done" : "input");
  const [texts, setTexts] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(existingProfile ? {
    structure_patterns: existingProfile.structure_patterns || [],
    tone_patterns: existingProfile.tone_patterns || [],
    signature_expressions: existingProfile.signature_expressions || [],
    voice_summary: existingProfile.voice_summary || "",
    formatting_habits: existingProfile.formatting_habits || [],
  } : null);

  // For review step — track unchecked items
  const [uncheckedStructure, setUncheckedStructure] = useState<Record<number, boolean>>({});
  const [uncheckedTone, setUncheckedTone] = useState<Record<number, boolean>>({});
  const [editedSummary, setEditedSummary] = useState("");
  const [bannedExpressions, setBannedExpressions] = useState("");

  const addText = () => setTexts(prev => [...prev, ""]);
  const removeText = (i: number) => setTexts(prev => prev.filter((_, idx) => idx !== i));
  const updateText = (i: number, val: string) => setTexts(prev => prev.map((t, idx) => idx === i ? val : t));

  const handleAnalyze = async () => {
    const validTexts = texts.filter(t => t.trim().length > 20);
    if (validTexts.length === 0) {
      toast({ title: "Colle au moins un texte (min 20 caractères)", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-analysis", {
        body: { texts: validTexts },
      });
      if (error) throw error;
      setAnalysis(data as VoiceAnalysis);
      setEditedSummary(data.voice_summary || "");
      setStep("review");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user || !analysis) return;
    setLoading(true);
    try {
      const filtered = {
        structure_patterns: analysis.structure_patterns.filter((_, i) => !uncheckedStructure[i]),
        tone_patterns: analysis.tone_patterns.filter((_, i) => !uncheckedTone[i]),
        signature_expressions: analysis.signature_expressions,
        voice_summary: editedSummary || analysis.voice_summary,
        formatting_habits: analysis.formatting_habits,
        banned_expressions: bannedExpressions ? bannedExpressions.split(",").map(e => e.trim()).filter(Boolean) : [],
        sample_texts: texts.filter(t => t.trim().length > 0),
      };

      const { data: existing } = await (supabase.from("voice_profile" as any) as any)
        .select("id")
        .eq(column, value)
        .maybeSingle();

      if (existing) {
        await supabase.from("voice_profile" as any).update({
          ...filtered,
          updated_at: new Date().toISOString(),
        }).eq("id", (existing as any).id);
      } else {
        await supabase.from("voice_profile" as any).insert({
          user_id: user.id,
          ...filtered,
        });
      }

      toast({ title: "✅ Profil de voix sauvegardé !" });
      setStep("done");
      onComplete?.();
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    }
    setLoading(false);
  };

  // Done state
  if (step === "done" && analysis) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
            🎤 Ma voix
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setStep("input")} className="text-xs text-primary">
            ✏️ Modifier
          </Button>
        </div>

        <div className="rounded-xl bg-accent/10 border border-accent/20 p-4">
          <p className="text-sm text-foreground italic">"{analysis.voice_summary}"</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {analysis.signature_expressions.map((expr, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-rose-pale text-primary font-medium">
              "{expr}"
            </span>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Ce profil est injecté dans toutes les générations IA pour reproduire ton style.
        </p>
      </div>
    );
  }

  // Input state
  if (step === "input") {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
            🎤 Apprends ma voix
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Colle ici 3 à 5 de tes meilleurs contenus : posts Instagram, newsletters, textes de site. L'IA va analyser ton style pour le reproduire.
          </p>
        </div>

        {texts.map((text, i) => (
          <div key={i} className="relative">
            <Textarea
              value={text}
              onChange={(e) => updateText(i, e.target.value)}
              placeholder={`Texte ${i + 1}...`}
              className="min-h-[100px]"
            />
            {texts.length > 1 && (
              <button onClick={() => removeText(i)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          {texts.length < 5 && (
            <Button variant="ghost" size="sm" onClick={addText} className="rounded-pill gap-1.5 text-muted-foreground">
              <Plus className="h-3.5 w-3.5" /> Ajouter un texte
            </Button>
          )}
          <Button onClick={handleAnalyze} disabled={loading} className="rounded-pill gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analyse en cours..." : "Analyser ma voix"}
          </Button>
        </div>
      </div>
    );
  }

  // Review state
  if (step === "review" && analysis) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-fade-in">
        <h3 className="font-display text-base font-bold text-foreground">
          🎤 Voilà ce que je retiens de ta voix
        </h3>

        {/* Structure */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Structure</p>
          {analysis.structure_patterns.map((p, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!uncheckedStructure[i]}
                onCheckedChange={(v) => setUncheckedStructure(prev => ({ ...prev, [i]: !v }))}
              />
              <span className={`text-sm ${uncheckedStructure[i] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {p}
              </span>
            </label>
          ))}
        </div>

        {/* Tone */}
        <div className="rounded-xl border border-border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ton</p>
          {analysis.tone_patterns.map((p, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!uncheckedTone[i]}
                onCheckedChange={(v) => setUncheckedTone(prev => ({ ...prev, [i]: !v }))}
              />
              <span className={`text-sm ${uncheckedTone[i] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {p}
              </span>
            </label>
          ))}
        </div>

        {/* Expressions */}
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expressions signature</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.signature_expressions.map((e, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-rose-pale text-primary font-medium">
                "{e}"
              </span>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ta voix en 1 phrase</p>
          <Textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </div>

        {/* Banned expressions */}
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Expressions interdites (optionnel)
          </p>
          <Textarea
            value={bannedExpressions}
            onChange={(e) => setBannedExpressions(e.target.value)}
            placeholder="Sépare par des virgules : holistique, accompagnement, bienveillance..."
            className="min-h-[50px] text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={loading} className="rounded-pill gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            C'est moi, on valide
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setStep("input")} className="rounded-pill text-muted-foreground">
            ← Recommencer
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
