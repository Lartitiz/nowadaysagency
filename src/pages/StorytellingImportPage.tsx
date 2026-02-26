import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { useNavigate } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Mic, Loader2 } from "lucide-react";

const TYPES = [
  { value: "fondatrice", label: "👩 Fondatrice" },
  { value: "marque", label: "🏷️ Marque" },
  { value: "produit", label: "💚 Produit/Offre" },
  { value: "autre", label: "📝 Autre" },
];

export default function StorytellingImportPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [storyType, setStoryType] = useState("fondatrice");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [step, setStep] = useState<"form" | "improve" | "saving">("form");
  const [aiLoading, setAiLoading] = useState(false);
  const [improvedText, setImprovedText] = useState("");

  const { data: profileData } = useProfile();
  const { data: brandProfileData } = useBrandProfile();
  const profile = profileData ? { ...profileData, ...(brandProfileData || {}) } : null;

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((transcript) => {
    setText((prev) => prev + (prev ? " " : "") + transcript);
  });

  const handleImprove = async () => {
    setAiLoading(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
        body: { type: "improve", text, step_context: "Texte complet de storytelling importé. Améliore le style, la fluidité et l'impact émotionnel tout en gardant le sens intact.", profile },
      });
      if (error) throw error;
      setImprovedText(fnData.content);
      setStep("improve");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur IA", description: friendlyError(e), variant: "destructive" });
    }
    setAiLoading(false);
  };

  const saveAndGeneratePitches = async (finalText: string, wasImproved: boolean) => {
    if (!user) return;
    setStep("saving");
    setAiLoading(true);

    try {
      // Generate pitches
      const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
        body: { type: "generate-pitch", storytelling: finalText, profile },
      });
      if (error) throw error;

      let parsed: any;
      try {
        const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(raw);
      } catch {
        parsed = { short: fnData.content, medium: "", long: "" };
      }

      // Check if any existing storytelling is marked primary
      const { data: existing } = await (supabase
        .from("storytelling") as any)
        .select("id")
        .eq(column, value)
        .eq("is_primary", true);

      const isPrimary = !existing || existing.length === 0;

      const { data: inserted, error: insertError } = await supabase.from("storytelling").insert({
        user_id: user.id,
        title: title || "Mon storytelling importé",
        story_type: storyType,
        source: "import",
        is_primary: isPrimary,
        imported_text: text,
        step_7_polished: wasImproved ? finalText : null,
        pitch_short: parsed.short || "",
        pitch_medium: parsed.medium || "",
        pitch_long: parsed.long || "",
        current_step: 8,
        completed: true,
      } as any).select("id").single();

      if (insertError) throw insertError;

      toast({ title: "Storytelling importé avec succès !" });
      navigate(`/branding/storytelling/${inserted.id}/recap`);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
      setStep("form");
    }
    setAiLoading(false);
  };

  if (step === "saving") {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Je génère tes pitchs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mes storytellings" parentTo="/branding/storytelling" currentLabel="Importer" />

        <h1 className="font-display text-[26px] font-bold text-foreground mb-1">Importe ton storytelling</h1>
        <p className="text-[15px] text-muted-foreground italic mb-8">
          Tu as déjà écrit ton histoire ? Colle-la ici. On génère directement tes pitchs.
        </p>

        {step === "form" && (
          <div className="space-y-6">
            {/* Type */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">C'est l'histoire de qui ?</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setStoryType(t.value)}
                    className={`px-4 py-2 rounded-pill text-sm font-medium transition-all ${
                      storyType === t.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-rose-pale text-foreground hover:bg-rose-soft"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Le titre</p>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Mon histoire de fondatrice / L'histoire de [nom de marque]"
              />
            </div>

            {/* Text */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Le texte</p>
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Colle ton storytelling ici, ou dicte-le..."
                  className="w-full min-h-[400px] rounded-xl border-2 border-input bg-card px-4 py-3 pr-12 text-[15px] leading-relaxed placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary transition-colors resize-none"
                />
                {isSupported && (
                  <button
                    onClick={toggleMic}
                    className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
                      isListening ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"
                    }`}
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Improve? */}
            {text.trim().length > 50 && (
              <div className="rounded-xl bg-rose-pale border border-border p-5">
                <p className="text-sm text-foreground mb-3">💡 Tu veux que l'IA améliore ton texte ?</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => saveAndGeneratePitches(text, false)}
                    className="rounded-pill"
                  >
                    Non merci, je le garde tel quel →
                  </Button>
                  <Button
                    onClick={handleImprove}
                    disabled={aiLoading}
                    className="rounded-pill"
                  >
                    {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Amélioration en cours...</> : "✨ Oui, améliore-le"}
                  </Button>
                </div>
              </div>
            )}

            {text.trim().length > 0 && text.trim().length <= 50 && (
              <Button onClick={() => saveAndGeneratePitches(text, false)} className="rounded-pill w-full">
                Importer et générer mes pitchs →
              </Button>
            )}
          </div>
        )}

        {step === "improve" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-mono-ui text-[12px] font-semibold text-muted-foreground mb-2">📝 Version originale</p>
                <div className="rounded-xl border border-border bg-card p-4 text-[14px] leading-relaxed max-h-[400px] overflow-y-auto whitespace-pre-line">
                  {text}
                </div>
              </div>
              <div>
                <p className="font-mono-ui text-[12px] font-semibold text-primary-text mb-2">✨ Version améliorée</p>
                <div className="rounded-xl border-2 border-primary bg-card p-4 text-[14px] leading-relaxed max-h-[400px] overflow-y-auto whitespace-pre-line">
                  {improvedText}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => saveAndGeneratePitches(text, false)} variant="outline" className="rounded-pill">
                Garder ma version originale →
              </Button>
              <Button onClick={() => saveAndGeneratePitches(improvedText, true)} className="rounded-pill">
                ✨ Utiliser la version améliorée →
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
