import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

interface PropositionResult {
  key_phrase: string;
  problem: string;
  solution: string;
  differentiator: string;
  proof: string;
}

export default function PropositionSimplePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [whatIDo, setWhatIDo] = useState("");
  const [whyMe, setWhyMe] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<PropositionResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: row } = await (supabase.from("brand_proposition") as any)
        .select("*").eq(column, value).maybeSingle();
      if (row) {
        setExistingId(row.id);
        if (row.step_1_what) setWhatIDo(row.step_1_what);
        if (row.step_2a_process) setWhyMe(row.step_2a_process);
        if (row.version_pitch_naturel) {
          setResult({
            key_phrase: row.version_pitch_naturel || "",
            problem: row.value_prop_problem || "",
            solution: row.value_prop_solution || "",
            differentiator: row.value_prop_difference || "",
            proof: row.value_prop_proof || "",
          });
          setValidated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const handleGenerate = async () => {
    if (!whatIDo.trim() || !whyMe.trim()) { toast.info("Réponds aux 2 questions."); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("branding-structure-ai", {
        body: { section: "value_proposition", input: { what: whatIDo, why_her: whyMe } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.result);
      setValidated(false);
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message || "Oups, réessaie !");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async () => {
    if (!result || !user) return;
    const payload: any = {
      step_1_what: whatIDo,
      step_2a_process: whyMe,
      version_pitch_naturel: result.key_phrase,
      value_prop_problem: result.problem,
      value_prop_solution: result.solution,
      value_prop_difference: result.differentiator,
      value_prop_proof: result.proof,
      completed: true,
      updated_at: new Date().toISOString(),
    };
    if (existingId) {
      await supabase.from("brand_proposition").update(payload as any).eq("id", existingId);
    } else {
      payload.user_id = user.id;
      if (workspaceId && workspaceId !== user.id) payload.workspace_id = workspaceId;
      const { data: ins } = await (supabase.from("brand_proposition") as any).insert(payload).select("id").single();
      if (ins) setExistingId(ins.id);
    }
    queryClient.invalidateQueries({ queryKey: ["brand-proposition"] });
    setValidated(true);
    toast.success("Ta proposition de valeur est enregistrée ✓");
  };

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
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }]} currentLabel="Ma proposition de valeur" />

        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">❤️</span>
          <h1 className="font-display text-[26px] text-foreground" style={{ fontWeight: 400 }}>Ma proposition de valeur</h1>
        </div>

        {!result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
              <label className="text-sm font-medium text-foreground block mb-2">En une phrase, qu'est-ce que tu fais ?</label>
              <Input
                value={whatIDo}
                onChange={(e) => setWhatIDo(e.target.value)}
                placeholder="Ex : J'aide les marques éthiques à se rendre visibles sans compromis"
                className="text-[15px]"
              />
            </div>

            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
              <label className="text-sm font-medium text-foreground block mb-2">Pourquoi toi et pas quelqu'un d'autre ?</label>
              <Textarea
                value={whyMe}
                onChange={(e) => setWhyMe(e.target.value)}
                placeholder="Qu'est-ce qui fait que TES client·es viennent chez TOI ?"
                rows={4}
                className="text-[15px] leading-relaxed"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !whatIDo.trim() || !whyMe.trim()}
              className="w-full h-12 rounded-full text-[15px] font-semibold gap-2"
              style={{ backgroundColor: "#fb3d80", color: "white" }}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Je formule ta proposition..." : "Formuler ma proposition de valeur ✨"}
            </Button>

            <button
              onClick={() => navigate("/branding/proposition")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Remplir les champs détaillés →
            </button>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            {/* Key phrase highlight */}
            <div className="rounded-[20px] bg-primary/5 border-2 border-primary/20 p-6 shadow-sm text-center">
              {editing ? (
                <Textarea
                  value={result.key_phrase}
                  onChange={(e) => setResult({ ...result, key_phrase: e.target.value })}
                  rows={2}
                  className="text-center text-lg font-medium"
                />
              ) : (
                <p className="font-display text-xl text-foreground leading-relaxed" style={{ fontWeight: 400 }}>{result.key_phrase}</p>
              )}
            </div>

            {/* Details */}
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm space-y-4">
              {[
                { emoji: "🎯", label: "Problème résolu", key: "problem" as const },
                { emoji: "💡", label: "Solution", key: "solution" as const },
                { emoji: "✨", label: "Différenciateur", key: "differentiator" as const },
                { emoji: "🏆", label: "Preuves", key: "proof" as const },
              ].map(({ emoji, label, key }) => (
                <div key={key}>
                  <p className="text-xs font-medium text-foreground mb-1">{emoji} {label}</p>
                  {editing ? (
                    <Textarea
                      value={result[key]}
                      onChange={(e) => setResult({ ...result, [key]: e.target.value })}
                      rows={2}
                      className="text-sm"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground leading-relaxed">{result[key]}</p>
                  )}
                </div>
              ))}
            </div>

            {!validated ? (
              <div className="flex gap-3">
                <Button onClick={handleValidate} className="flex-1 h-11 rounded-full gap-2" style={{ backgroundColor: "#fb3d80", color: "white" }}>
                  <Check className="h-4 w-4" /> C'est bon ✓
                </Button>
                <Button variant="outline" onClick={() => setEditing(!editing)} className="flex-1 h-11 rounded-full gap-2">
                  <Pencil className="h-4 w-4" /> {editing ? "Aperçu" : "Modifier"}
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setEditing(true); setValidated(false); }} className="flex-1 h-11 rounded-full gap-2">
                  <Pencil className="h-4 w-4" /> Modifier
                </Button>
                <Button variant="outline" onClick={handleGenerate} className="flex-1 h-11 rounded-full gap-2">
                  <Sparkles className="h-4 w-4" /> Reformuler →
                </Button>
              </div>
            )}

            <button
              onClick={() => navigate("/branding/proposition")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Remplir les champs détaillés →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
