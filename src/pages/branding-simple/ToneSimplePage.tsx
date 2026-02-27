import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Sparkles, Loader2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";

const ARCHETYPES = [
  { id: "pote_engagee", emoji: "✊", label: "La pote engagée", desc: "Directe, sincère, elle dit ce qu'elle pense" },
  { id: "experte_accessible", emoji: "🎓", label: "L'experte accessible", desc: "Savante mais jamais condescendante" },
  { id: "artiste_sensible", emoji: "🎨", label: "L'artiste sensible", desc: "Créative, intuitive, émotionnelle" },
  { id: "rebelle_douce", emoji: "🌸", label: "La rebelle douce", desc: "Qui casse les codes avec élégance" },
  { id: "coach_bienveillante", emoji: "🤗", label: "La coach bienveillante", desc: "Encourageante, à l'écoute, rassurante" },
  { id: "pionniere_visionnaire", emoji: "🚀", label: "La pionnière", desc: "Innovante, inspirante, en avance" },
];

interface ToneResult {
  tone_keywords: string[];
  tone_do: string[];
  tone_dont: string[];
  combats: string;
  voice_description: string;
}

export default function ToneSimplePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [selectedArchetype, setSelectedArchetype] = useState<string | null>(null);
  const [casualPro, setCasualPro] = useState(50);
  const [softPunchy, setSoftPunchy] = useState(50);
  const [discreetBold, setDiscreetBold] = useState(50);
  const [frustration, setFrustration] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ToneResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: row } = await (supabase.from("brand_profile") as any)
        .select("*").eq(column, value).maybeSingle();
      if (row) {
        setExistingId(row.id);
        if (row.combat_cause) setFrustration(row.combat_cause);
        if (row.voice_description) {
          setResult({
            tone_keywords: row.tone_keywords || [],
            tone_do: row.tone_do ? row.tone_do.split("\n").filter(Boolean) : [],
            tone_dont: row.tone_dont ? row.tone_dont.split("\n").filter(Boolean) : [],
            combats: row.combats || row.combat_cause || "",
            voice_description: row.voice_description || "",
          });
          setValidated(true);
        }
      }
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const handleGenerate = async () => {
    if (!selectedArchetype) { toast.info("Choisis d'abord un archétype de marque."); return; }
    setGenerating(true);
    try {
      const archLabel = ARCHETYPES.find(a => a.id === selectedArchetype)?.label || selectedArchetype;
      const { data, error } = await supabase.functions.invoke("branding-structure-ai", {
        body: {
          section: "tone_style",
          input: {
            archetype: archLabel,
            casual_pro: casualPro,
            soft_punchy: softPunchy,
            discreet_bold: discreetBold,
            frustration,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.result);
      setValidated(false);
    } catch (e: any) {
      toast.error(e.message || "Oups, réessaie !");
    } finally {
      setGenerating(false);
    }
  };

  const handleValidate = async () => {
    if (!result || !user) return;
    const payload: any = {
      voice_description: result.voice_description,
      tone_keywords: result.tone_keywords,
      tone_do: result.tone_do.join("\n"),
      tone_dont: result.tone_dont.join("\n"),
      combat_cause: frustration,
      combats: result.combats,
      combat_fights: result.combats,
      updated_at: new Date().toISOString(),
    };
    if (existingId) {
      await supabase.from("brand_profile").update(payload as any).eq("id", existingId);
    } else {
      payload.user_id = user.id;
      if (workspaceId && workspaceId !== user.id) payload.workspace_id = workspaceId;
      const { data: ins } = await (supabase.from("brand_profile") as any).insert(payload).select("id").single();
      if (ins) setExistingId(ins.id);
    }
    queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    setValidated(true);
    toast.success("Ton style & ton identité verbale sont enregistrés ✓");
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
        <SubPageHeader breadcrumbs={[{ label: "Mon identité", to: "/branding" }]} currentLabel="Mon ton & mon style" />

        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🎨</span>
          <h1 className="font-display text-[26px] text-foreground" style={{ fontWeight: 400 }}>Mon ton & mon style</h1>
        </div>

        {!result && (
          <div className="mt-6 space-y-5">
            {/* Archetype selection */}
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
              <p className="text-sm font-medium text-foreground mb-3">Si ta marque était une personne, elle serait plutôt...</p>
              <div className="grid grid-cols-2 gap-2">
                {ARCHETYPES.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedArchetype(a.id)}
                    className={`text-left rounded-[16px] border p-3 transition-all ${
                      selectedArchetype === a.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <span className="text-lg">{a.emoji}</span>
                    <p className="text-xs font-medium text-foreground mt-1">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground">{a.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm space-y-5">
              <p className="text-sm font-medium text-foreground">Ton écriture c'est plutôt...</p>
              {[
                { label: ["Décontracté", "Pro"], value: casualPro, set: setCasualPro },
                { label: ["Doux", "Punchy"], value: softPunchy, set: setSoftPunchy },
                { label: ["Discret", "Affirmé"], value: discreetBold, set: setDiscreetBold },
              ].map(({ label, value: v, set }, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span>{label[0]}</span>
                    <span>{label[1]}</span>
                  </div>
                  <Slider value={[v]} min={0} max={100} step={5} onValueChange={([val]) => set(val)} />
                </div>
              ))}
            </div>

            {/* Frustration */}
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
              <label className="text-sm font-medium text-foreground block mb-2">
                Il y a un truc qui t'énerve dans ton secteur ?
              </label>
              <Textarea
                value={frustration}
                onChange={(e) => setFrustration(e.target.value)}
                placeholder="Ce contre quoi tu te bats, ce que tu voudrais changer..."
                rows={3}
                className="text-[15px] leading-relaxed"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedArchetype}
              className="w-full h-12 rounded-full text-[15px] font-semibold gap-2"
              style={{ backgroundColor: "#fb3d80", color: "white" }}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Je définis ton style..." : "Définir mon ton ✨"}
            </Button>

            <button
              onClick={() => navigate("/branding/ton")}
              className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
            >
              Remplir les champs détaillés →
            </button>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[20px] bg-white border border-border p-5 shadow-sm">
              <p className="text-sm font-medium text-foreground mb-3">🗣️ Ma voix</p>
              <p className="text-sm text-foreground leading-relaxed mb-4">{result.voice_description}</p>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {result.tone_keywords.map((kw, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">{kw}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-white border border-border p-4 shadow-sm">
                <p className="text-xs font-medium text-foreground mb-2">✅ Je fais</p>
                <ul className="space-y-1">
                  {result.tone_do.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[20px] bg-white border border-border p-4 shadow-sm">
                <p className="text-xs font-medium text-foreground mb-2">🚫 Je ne fais jamais</p>
                <ul className="space-y-1">
                  {result.tone_dont.map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {result.combats && (
              <div className="rounded-[20px] bg-white border border-border p-4 shadow-sm">
                <p className="text-xs font-medium text-foreground mb-2">✊ Mes combats</p>
                <p className="text-sm text-foreground leading-relaxed">{result.combats}</p>
              </div>
            )}

            {!validated ? (
              <div className="flex gap-3">
                <Button onClick={handleValidate} className="flex-1 h-11 rounded-full gap-2" style={{ backgroundColor: "#fb3d80", color: "white" }}>
                  <Check className="h-4 w-4" /> C'est bon ✓
                </Button>
                <Button variant="outline" onClick={handleGenerate} className="flex-1 h-11 rounded-full gap-2">
                  <Sparkles className="h-4 w-4" /> Reformuler
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => { setResult(null); }} className="w-full h-11 rounded-full gap-2">
                <Sparkles className="h-4 w-4" /> Regénérer
              </Button>
            )}

            <button
              onClick={() => navigate("/branding/ton")}
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
