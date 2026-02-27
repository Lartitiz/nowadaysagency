import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useAutoSave, SaveIndicator } from "@/hooks/use-auto-save";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

interface PersonaResult {
  portrait_prenom: string;
  portrait_age: string;
  portrait_job: string;
  portrait_situation: string;
  objectives: string[];
  frustrations: string[];
  desires: string[];
  channels: string[];
  brands: string[];
  description: string;
}

export default function PersonaSimplePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [who, setWho] = useState("");
  const [struggle, setStruggle] = useState("");
  const [problem, setProblem] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<PersonaResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load existing
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: row } = await (supabase.from("persona") as any)
        .select("*").eq(column, value).eq("is_primary", true).maybeSingle();
      if (row) {
        setExistingId(row.id);
        if (row.step_1_frustrations) setStruggle(row.step_1_frustrations);
        if (row.step_2_transformation) setProblem(row.step_2_transformation);
        if (row.description) setWho(row.description?.split(".")[0] || "");
        if (row.portrait_prenom && row.portrait) {
          setResult({
            portrait_prenom: row.portrait_prenom || "",
            portrait_age: row.portrait_age || "",
            portrait_job: row.portrait_job || "",
            portrait_situation: row.portrait_situation || "",
            objectives: row.portrait_objectives || [],
            frustrations: row.portrait_frustrations || (row.step_1_frustrations ? [row.step_1_frustrations] : []),
            desires: row.portrait_desires || [],
            channels: row.channels || [],
            brands: row.portrait_brands || [],
            description: row.description || "",
          });
          setValidated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const handleGenerate = async () => {
    if (!who.trim() || !struggle.trim() || !problem.trim()) {
      toast.info("Réponds aux 3 questions pour continuer.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("branding-structure-ai", {
        body: { section: "persona", input: { who, struggle, problem } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.result);
      setValidated(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Oups, un souci. Réessaie !");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async () => {
    if (!result || !user) return;
    const payload: any = {
      step_1_frustrations: struggle,
      step_2_transformation: problem,
      description: result.description,
      portrait_prenom: result.portrait_prenom,
      portrait: `${result.portrait_prenom}, ${result.portrait_age}, ${result.portrait_job}`,
      portrait_age: result.portrait_age,
      portrait_job: result.portrait_job,
      portrait_situation: result.portrait_situation,
      portrait_objectives: result.objectives,
      portrait_frustrations: result.frustrations,
      portrait_desires: result.desires,
      portrait_brands: result.brands,
      channels: result.channels,
      completed: true,
      updated_at: new Date().toISOString(),
    };

    if (existingId) {
      await supabase.from("persona").update(payload as any).eq("id", existingId);
    } else {
      payload.user_id = user.id;
      payload.is_primary = true;
      if (workspaceId && workspaceId !== user.id) payload.workspace_id = workspaceId;
      const { data: ins } = await (supabase.from("persona") as any).insert(payload).select("id").single();
      if (ins) setExistingId(ins.id);
    }
    queryClient.invalidateQueries({ queryKey: ["persona"] });
    setValidated(true);
    toast.success("Ta fiche persona est enregistrée ✓");
  };

  const QUESTIONS = [
    { label: "À qui tu vends ?", placeholder: "Décris la personne type qui achète chez toi. Pas besoin d'être précise, parle comme si tu me la présentais.", value: who, set: setWho },
    { label: "C'est quoi leur plus grosse galère ?", placeholder: "Par rapport à ce que tu proposes, qu'est-ce qui les bloque, les frustre, les empêche d'avancer ?", value: struggle, set: setStruggle },
    { label: "Si tu pouvais résoudre UN seul problème ?", placeholder: "Le problème n°1 que tu voudrais régler pour cette personne, ce serait quoi ?", value: problem, set: setProblem },
  ];

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }]} currentLabel="Mon·ma client·e idéal·e" />

        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">👩‍💻</span>
          <h1 className="font-display text-[26px] text-foreground" style={{ fontWeight: 400 }}>Mon·ma client·e idéal·e</h1>
        </div>

        {/* Simple input - step by step questions */}
        {!result && (
          <div className="mt-6 space-y-4">
            {QUESTIONS.slice(0, step).map((q, idx) => (
              <div key={idx} className="rounded-[20px] bg-white border border-border p-5 shadow-sm animate-fade-in">
                <label className="text-sm font-medium text-foreground block mb-2">{q.label}</label>
                <Textarea
                  value={q.value}
                  onChange={(e) => {
                    q.set(e.target.value);
                    // Auto advance to next question
                    if (e.target.value.length > 20 && idx === step - 1 && step < 3) {
                      setTimeout(() => setStep(s => Math.min(s + 1, 3)), 500);
                    }
                  }}
                  placeholder={q.placeholder}
                  rows={3}
                  className="text-[15px] leading-relaxed"
                />
              </div>
            ))}

            {step < 3 && (
              <button
                onClick={() => setStep(s => s + 1)}
                className="text-xs text-primary hover:text-primary/80 transition-colors mx-auto block"
              >
                Question suivante →
              </button>
            )}

            {step >= 3 && (
              <>
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full h-12 rounded-full text-[15px] font-semibold gap-2"
                  style={{ backgroundColor: "#fb3d80", color: "white" }}
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? "Je crée ta fiche persona..." : "Créer ma fiche persona ✨"}
                </Button>
                <button
                  onClick={() => navigate("/branding/persona")}
                  className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
                >
                  Remplir la fiche détaillée →
                </button>
              </>
            )}
          </div>
        )}

        {/* Result view - persona card */}
        {result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[20px] bg-white border border-border p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-[12px] bg-primary/10 flex items-center justify-center text-xl">👤</div>
                <div>
                  <h3 className="font-display text-lg text-foreground" style={{ fontWeight: 400 }}>{result.portrait_prenom}</h3>
                  <p className="text-sm text-muted-foreground">{result.portrait_age} · {result.portrait_job}</p>
                </div>
              </div>
              {result.portrait_situation && (
                <p className="text-sm text-foreground mb-4 italic">{result.portrait_situation}</p>
              )}
              <p className="text-sm text-foreground leading-relaxed mb-4">{result.description}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { emoji: "🎯", label: "Objectifs", items: result.objectives },
                  { emoji: "😤", label: "Frustrations", items: result.frustrations },
                  { emoji: "💫", label: "Désirs", items: result.desires },
                  { emoji: "📱", label: "Canaux", items: result.channels },
                ].map(({ emoji, label, items }) => (
                  items?.length > 0 && (
                    <div key={label} className="rounded-xl bg-[hsl(var(--rose-pale))] p-3">
                      <p className="text-xs font-medium text-foreground mb-1.5">{emoji} {label}</p>
                      <ul className="space-y-1">
                        {items.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )
                ))}
              </div>
            </div>

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
                  onClick={handleGenerate}
                  className="flex-1 h-11 rounded-full gap-2"
                >
                  <Sparkles className="h-4 w-4" /> Affiner avec l'IA →
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setResult(null); setStep(1); }} className="flex-1 h-11 rounded-full gap-2">
                  <Sparkles className="h-4 w-4" /> Regénérer
                </Button>
              </div>
            )}

            <button
              onClick={() => navigate("/branding/persona")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Remplir la fiche détaillée →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
