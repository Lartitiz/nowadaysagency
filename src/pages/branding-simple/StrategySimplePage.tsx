import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { useBrandingContext } from "@/hooks/use-branding";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

interface StrategyResult {
  pillars: { name: string; description: string }[];
  creative_twist: string;
  formats: { name: string; frequency: string; example: string }[];
  rhythm: string;
  editorial_line: string;
}

export default function StrategySimplePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const { persona, proposition, storytelling, charter, editorialLine, isLoading: brandingLoading } = useBrandingContext();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustPrompt, setAdjustPrompt] = useState("");

  // Check which sections are completed
  const hasStory = !!storytelling?.step_7_polished || !!storytelling?.step_1_raw;
  const hasPersona = !!persona?.step_1_frustrations;
  const hasProposition = !!proposition?.version_pitch_naturel || !!proposition?.step_1_what;
  const hasTone = false; // We'd need brand_profile check, simplified here
  
  const completedSections = [hasStory, hasPersona, hasProposition].filter(Boolean).length;
  const canGenerate = completedSections >= 3;

  useEffect(() => {
    if (!user || brandingLoading) return;
    const load = async () => {
      const { data: row } = await (supabase.from("brand_strategy") as any)
        .select("*").eq(column, value).maybeSingle();
      if (row) {
        setExistingId(row.id);
        if (row.pillar_major) {
          setResult({
            pillars: [
              { name: row.pillar_major, description: "" },
              ...(row.pillar_minor_1 ? [{ name: row.pillar_minor_1, description: "" }] : []),
              ...(row.pillar_minor_2 ? [{ name: row.pillar_minor_2, description: "" }] : []),
            ],
            creative_twist: row.creative_concept || "",
            formats: [],
            rhythm: "",
            editorial_line: "",
          });
          setValidated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [user?.id, brandingLoading]);

  const buildBrandingContext = () => {
    const parts: string[] = [];
    if (storytelling?.step_7_polished) parts.push(`HISTOIRE : ${storytelling.step_7_polished}`);
    if (persona?.step_1_frustrations) parts.push(`PERSONA - Frustrations : ${persona.step_1_frustrations}`);
    if (persona?.step_2_transformation) parts.push(`PERSONA - Transformation : ${persona.step_2_transformation}`);
    if (proposition?.version_pitch_naturel) parts.push(`PROPOSITION DE VALEUR : ${proposition.version_pitch_naturel}`);
    return parts.join("\n\n");
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("branding-structure-ai", {
        body: {
          section: "content_strategy",
          input: {},
          branding_context: buildBrandingContext() + (adjustPrompt ? `\n\nDemande spécifique : ${adjustPrompt}` : ""),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.result);
      setValidated(false);
      setAdjustPrompt("");
    } catch (e: any) {
      toast.error(e.message || "Oups, réessaie !");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async () => {
    if (!result || !user) return;
    const payload: any = {
      pillar_major: result.pillars[0]?.name || "",
      pillar_minor_1: result.pillars[1]?.name || "",
      pillar_minor_2: result.pillars[2]?.name || "",
      pillar_minor_3: result.pillars[3]?.name || "",
      creative_concept: result.creative_twist,
      completed: true,
      updated_at: new Date().toISOString(),
    };
    if (existingId) {
      await supabase.from("brand_strategy").update(payload as any).eq("id", existingId);
    } else {
      payload.user_id = user.id;
      if (workspaceId && workspaceId !== user.id) payload.workspace_id = workspaceId;
      const { data: ins } = await (supabase.from("brand_strategy") as any).insert(payload).select("id").single();
      if (ins) setExistingId(ins.id);
    }
    queryClient.invalidateQueries({ queryKey: ["brand-strategy"] });
    setValidated(true);
    toast.success("Ta stratégie de contenu est enregistrée ✓");
  };

  const missingSections = [
    !hasStory && "Mon histoire",
    !hasPersona && "Mon·ma client·e idéal·e",
    !hasProposition && "Ma proposition de valeur",
  ].filter(Boolean);

  if (loading || brandingLoading) return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))]">
      <AppHeader />
      <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[hsl(var(--rose-pale))]">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }]} currentLabel="Ma stratégie de contenu" />

        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🍒</span>
          <h1 className="font-display text-[26px] text-foreground" style={{ fontWeight: 400 }}>Ma stratégie de contenu</h1>
        </div>

        <p className="text-sm text-muted-foreground mt-2 mb-6">
          Cette section est générée automatiquement à partir de ton branding. Pas besoin de la remplir à la main.
        </p>

        {!canGenerate && !result && (
          <div className="rounded-[20px] bg-white border border-border p-6 shadow-sm text-center">
            <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-foreground mb-2">
              Je pourrai te proposer une stratégie de contenu quand ton branding de base sera posé.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Il te reste : {missingSections.join(", ")}
            </p>
            <Button variant="outline" onClick={() => navigate("/branding")} className="rounded-full">
              Compléter mon branding
            </Button>
          </div>
        )}

        {canGenerate && !result && (
          <div className="space-y-4">
            <div className="rounded-[20px] bg-white border border-border p-6 shadow-sm text-center">
              <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
              <p className="text-sm text-foreground mb-4">
                D'après ton branding, je peux te proposer une stratégie de contenu personnalisée.
              </p>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="h-12 rounded-full text-[15px] font-semibold gap-2 px-8"
                style={{ backgroundColor: "#fb3d80", color: "white" }}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Je construis ta stratégie..." : "Générer ma stratégie ✨"}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-[20px] bg-primary/5 border border-primary/20 p-5 shadow-sm">
              <p className="text-xs text-primary font-medium mb-1">✨ D'après ton branding</p>
              <p className="text-sm text-foreground">Voici la stratégie de contenu que je te recommande :</p>
            </div>

            {/* Pillars */}
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
              <p className="text-sm font-medium text-foreground mb-3">📌 Tes piliers de contenu</p>
              <div className="space-y-3">
                {result.pillars.map((p, i) => (
                  <div key={i} className="rounded-xl bg-[hsl(var(--rose-pale))] p-3">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Creative twist */}
            {result.creative_twist && (
              <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
                <p className="text-sm font-medium text-foreground mb-2">🎯 Ton concept créatif</p>
                <p className="text-sm text-foreground leading-relaxed">{result.creative_twist}</p>
              </div>
            )}

            {/* Formats */}
            {result.formats?.length > 0 && (
              <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
                <p className="text-sm font-medium text-foreground mb-3">📱 Formats recommandés</p>
                <div className="space-y-2">
                  {result.formats.map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{f.frequency} — {f.example}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Editorial line */}
            {result.editorial_line && (
              <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
                <p className="text-sm font-medium text-foreground mb-2">✍️ Ligne éditoriale</p>
                <p className="text-sm text-foreground leading-relaxed">{result.editorial_line}</p>
              </div>
            )}

            {/* Adjust */}
            {!validated && (
              <div className="rounded-[20px] bg-white border border-border p-4 shadow-sm">
                <Textarea
                  value={adjustPrompt}
                  onChange={(e) => setAdjustPrompt(e.target.value)}
                  placeholder="Je voudrais plus de..., Le pilier X ne me parle pas..."
                  rows={2}
                  className="text-sm mb-2"
                />
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating} className="rounded-full gap-1.5 text-xs">
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Ajuster
                </Button>
              </div>
            )}

            {!validated ? (
              <Button onClick={handleValidate} className="w-full h-11 rounded-full gap-2" style={{ backgroundColor: "#fb3d80", color: "white" }}>
                <Check className="h-4 w-4" /> C'est bon ✓
              </Button>
            ) : (
              <Button variant="outline" onClick={() => { setResult(null); }} className="w-full h-11 rounded-full gap-2">
                <Sparkles className="h-4 w-4" /> Regénérer
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
