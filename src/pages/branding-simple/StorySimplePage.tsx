import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAutoSave, SaveIndicator } from "@/hooks/use-auto-save";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check, Pencil, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

interface StoryResult {
  origin: string;
  turning_point: string;
  struggles: string;
  unique: string;
  vision: string;
  full_story: string;
}

export default function StorySimplePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [rawText, setRawText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Speech recognition
  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    setRawText(prev => prev + (prev ? " " : "") + text);
  });

  // Load existing data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: row } = await (supabase.from("storytelling") as any)
        .select("*")
        .eq(column, value)
        .eq("is_primary", true)
        .maybeSingle();
      if (row) {
        setExistingId(row.id);
        if (row.step_1_raw) setRawText(row.step_1_raw);
        // If already structured, show result
        if (row.story_origin || row.step_7_polished) {
          setResult({
            origin: row.story_origin || row.step_2_location || "",
            turning_point: row.story_turning_point || row.step_3_action || "",
            struggles: row.story_struggles || row.step_4_thoughts || "",
            unique: row.story_unique || row.step_5_emotions || "",
            vision: row.story_vision || "",
            full_story: row.step_7_polished || row.step_6_full_story || "",
          });
          setValidated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  // Auto-save raw text
  const saveFn = useCallback(async () => {
    if (!user || !rawText.trim()) return;
    const payload: any = { step_1_raw: rawText, updated_at: new Date().toISOString() };
    if (existingId) {
      await supabase.from("storytelling").update(payload as any).eq("id", existingId);
    } else {
      payload.user_id = user.id;
      payload.is_primary = true;
      payload.source = "simple";
      payload.story_type = "fondatrice";
      if (workspaceId && workspaceId !== user.id) payload.workspace_id = workspaceId;
      const { data: inserted } = await (supabase.from("storytelling") as any)
        .insert(payload).select("id").single();
      if (inserted) setExistingId(inserted.id);
    }
    queryClient.invalidateQueries({ queryKey: ["storytelling-primary"] });
  }, [user, rawText, existingId, workspaceId]);

  const { saved, saving, triggerSave } = useAutoSave(saveFn, 1500, "story_simple");

  const handleTextChange = (val: string) => {
    setRawText(val);
    triggerSave();
  };

  // Generate structured story
  const handleGenerate = async () => {
    if (!rawText.trim()) { toast.info("Écris d'abord quelques lignes sur ton histoire."); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("branding-structure-ai", {
        body: { section: "story", input: { raw_text: rawText } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.result);
      setValidated(false);
      setEditing(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Oups, un souci. Réessaie !");
    } finally {
      setGenerating(false);
    }
  };

  // Validate result → save to DB
  const handleValidate = async () => {
    if (!result || !existingId) return;
    const payload: any = {
      story_origin: result.origin,
      story_turning_point: result.turning_point,
      story_struggles: result.struggles,
      story_unique: result.unique,
      story_vision: result.vision,
      step_7_polished: result.full_story,
      step_6_full_story: result.full_story,
      completed: true,
    };
    await supabase.from("storytelling").update(payload as any).eq("id", existingId);
    queryClient.invalidateQueries({ queryKey: ["storytelling-primary"] });
    setValidated(true);
    setEditing(false);
    toast.success("Ton histoire est enregistrée ✓");
  };

  const RESULT_SECTIONS = [
    { key: "origin", emoji: "🌱", label: "Mon point de départ" },
    { key: "turning_point", emoji: "⚡", label: "Le déclic" },
    { key: "struggles", emoji: "🌊", label: "Les galères" },
    { key: "unique", emoji: "✨", label: "Ce qui me rend unique" },
    { key: "vision", emoji: "🔭", label: "Ma vision" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))]">
      <AppHeader />
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))]">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }]} currentLabel="Mon histoire" />

        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">📖</span>
          <h1 className="font-display text-[26px] text-foreground" style={{ fontWeight: 400 }}>Mon histoire</h1>
          <div className="ml-auto"><SaveIndicator saved={saved} saving={saving} /></div>
        </div>

        {/* Simple input view */}
        {!result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[20px] bg-white border border-border p-6 shadow-sm">
              <div className="relative">
                <Textarea
                  value={rawText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="Raconte-moi ton projet en quelques lignes. Comment tu en es arrivée là, pourquoi tu fais ce que tu fais, ce qui te rend différente..."
                  rows={8}
                  className="text-[15px] leading-relaxed resize-none border-0 focus-visible:ring-0 p-0 min-h-[200px]"
                />
                {isSupported && (
                  <button
                    onClick={toggleMic}
                    className={`absolute bottom-2 right-2 p-2 rounded-full transition-all ${
                      isListening ? "bg-primary text-primary-foreground animate-pulse" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    title={isListening ? "Arrêter la dictée" : "Dicter"}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3 italic">
                Pas besoin que ce soit parfait. Écris comme tu parlerais à une amie.
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !rawText.trim()}
              className="w-full h-12 rounded-full text-[15px] font-semibold gap-2"
              style={{ backgroundColor: "#fb3d80", color: "white" }}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Je structure ton histoire..." : "Structurer mon histoire ✨"}
            </Button>

            <button
              onClick={() => navigate("/branding/storytelling/new")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Remplir chaque partie séparément →
            </button>
          </div>
        )}

        {/* Result view */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Full story card */}
            <div className="rounded-[20px] bg-white border border-border p-6 shadow-sm">
              <h3 className="font-display text-lg text-foreground mb-3" style={{ fontWeight: 400 }}>Mon histoire</h3>
              {editing ? (
                <Textarea
                  value={result.full_story}
                  onChange={(e) => setResult({ ...result, full_story: e.target.value })}
                  rows={8}
                  className="text-[15px] leading-relaxed"
                />
              ) : (
                <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-line">{result.full_story}</p>
              )}
            </div>

            {/* Structured sections */}
            <div className="grid grid-cols-1 gap-3">
              {RESULT_SECTIONS.map(({ key, emoji, label }) => {
                const val = result[key as keyof StoryResult];
                if (!val) return null;
                return (
                  <div key={key} className="rounded-[20px] bg-white border border-border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{emoji}</span>
                      <span className="text-sm font-medium text-foreground">{label}</span>
                    </div>
                    {editing ? (
                      <Textarea
                        value={val}
                        onChange={(e) => setResult({ ...result, [key]: e.target.value })}
                        rows={3}
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground leading-relaxed">{val}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            {!validated ? (
              <div className="flex gap-3">
                <Button
                  onClick={handleValidate}
                  className="flex-1 h-11 rounded-full gap-2"
                  style={{ backgroundColor: "#fb3d80", color: "white" }}
                >
                  <Check className="h-4 w-4" /> C'est bon ✓
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditing(!editing)}
                  className="flex-1 h-11 rounded-full gap-2"
                >
                  <Pencil className="h-4 w-4" /> {editing ? "Aperçu" : "Modifier"}
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setEditing(true); setValidated(false); }}
                  className="flex-1 h-11 rounded-full gap-2"
                >
                  <Pencil className="h-4 w-4" /> Modifier
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setResult(null); }}
                  className="flex-1 h-11 rounded-full gap-2"
                >
                  <Sparkles className="h-4 w-4" /> Regénérer
                </Button>
              </div>
            )}

            <button
              onClick={() => navigate("/branding/storytelling/new")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Remplir chaque partie séparément →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
