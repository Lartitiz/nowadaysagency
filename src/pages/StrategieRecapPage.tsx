import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Copy, FileText, RefreshCw, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import EditableText from "@/components/EditableText";

interface PillarData {
  name: string;
  type: "major" | "minor";
  percentage: number;
  content_ideas: string[];
}

interface RecapSummary {
  concept_short: string;
  concept_full: string;
  pillars: PillarData[];
  facets: string[];
  content_mix: { visibility: number; trust: number; sales: number };
  creative_gestures: string[];
}

export default function StrategieRecapPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [summary, setSummary] = useState<RecapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (supabase.from("brand_strategy") as any).select("*").eq(column, value).maybeSingle()
      .then(({ data: d }) => {
        setData(d);
        if (d?.recap_summary) setSummary(d.recap_summary as unknown as RecapSummary);
        setLoading(false);
      });
  }, [user?.id, column, value]);

  const saveRecapField = async (path: string[], value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    await supabase.from("brand_strategy").update({ recap_summary: updated as any }).eq("id", data.id);
    setSummary(updated);
  };

  const saveRecapArrayItem = async (arrayKey: string, index: number, value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    updated[arrayKey][index] = value;
    await supabase.from("brand_strategy").update({ recap_summary: updated as any }).eq("id", data.id);
    setSummary(updated);
  };

  const savePillarField = async (pillarIdx: number, field: string, value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    updated.pillars[pillarIdx][field] = value;
    await supabase.from("brand_strategy").update({ recap_summary: updated as any }).eq("id", data.id);
    setSummary(updated);
  };

  const savePillarIdea = async (pillarIdx: number, ideaIdx: number, value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    updated.pillars[pillarIdx].content_ideas[ideaIdx] = value;
    await supabase.from("brand_strategy").update({ recap_summary: updated as any }).eq("id", data.id);
    setSummary(updated);
  };

  const generateSummary = async () => {
    if (!user || !data) return;
    setGenerating(true);
    try {
      const [profileRes, personaRes, propositionRes, toneRes, editorialRes] = await Promise.all([
        (supabase.from("profiles") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("persona") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_profile") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("instagram_editorial_line") as any).select("*").eq(column, value).maybeSingle(),
      ]);
      const { data: fnData, error } = await supabase.functions.invoke("strategy-ai", {
        body: { type: "generate-recap", strategy_data: data, profile: profileRes.data, persona: personaRes.data, proposition: propositionRes.data, tone: toneRes.data, editorial_line: editorialRes.data },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json|```/g, "").trim();
      const parsed: RecapSummary = JSON.parse(raw);
      await supabase.from("brand_strategy").update({ recap_summary: parsed as any }).eq("id", data.id);
      setSummary(parsed);
      toast({ title: "Synthèse générée !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const exportPDF = async () => {
    if (!recapRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(recapRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgW, imgH);
      pdf.save("ma-strategie-de-contenu.pdf");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background"><AppHeader /><div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div></div>
  );

  if (!data) return (
    <div className="min-h-screen bg-background"><AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8">
        <p className="text-muted-foreground">Aucune stratégie enregistrée.</p>
        <Link to="/branding/strategie" className="text-primary hover:underline mt-4 block">Commencer →</Link>
      </main>
    </div>
  );

  if (!summary) return (
    <div className="min-h-screen bg-background"><AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Ma stratégie", to: "/branding/section?section=content_strategy" }]} currentLabel="Récap" />
        <h1 className="font-display text-[26px] font-bold text-foreground mb-4">🚀 Ma ligne éditoriale</h1>
        <p className="text-muted-foreground mb-6">La synthèse de ta stratégie n'a pas encore été générée.</p>
        <Button onClick={generateSummary} disabled={generating}>
          {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération...</> : "✨ Générer ma fiche récap"}
        </Button>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Ma stratégie", to: "/branding/section?section=content_strategy" }]} currentLabel="Récap" />

        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={generateSummary} disabled={generating}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5 text-xs">Regénérer</span>
          </Button>
        </div>

        <div ref={recapRef} id="strategie-recap" className="bg-white p-8 max-md:p-5 rounded-2xl print:p-6">
          <div className="flex justify-between items-start mb-6">
            <h1 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>🚀 Ma ligne éditoriale</h1>
            <button onClick={exportPDF} disabled={exporting} className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: "#fb3d80" }}>
              <FileText className="h-4 w-4" />{exporting ? "Export..." : "Exporter PDF"}
            </button>
          </div>

          {/* Concept créatif */}
          <div style={{ background: "#FFF4F8", borderLeft: "4px solid #fb3d80", padding: "24px", borderRadius: "0 12px 12px 0", marginBottom: 32 }}>
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B", marginBottom: 8 }}>Mon concept créatif</p>
            <EditableText
              value={summary.concept_short}
              onSave={(v) => saveRecapField(["concept_short"], v)}
              type="input"
              className="text-[16px] italic"
            />
            {summary.concept_full && summary.concept_full !== summary.concept_short && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 12, color: "#fb3d80", cursor: "pointer" }}>Voir le concept complet</summary>
                <div className="mt-2">
                  <EditableText
                    value={summary.concept_full}
                    onSave={(v) => saveRecapField(["concept_full"], v)}
                    className="text-[13px]"
                  />
                </div>
              </details>
            )}
          </div>

          {/* Piliers */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B", marginBottom: 16 }}>Mes piliers de contenu</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              {summary.pillars.map((p, i) => {
                const isMajor = p.type === "major";
                return (
                  <div key={i} style={{ border: `2px solid ${isMajor ? "#fb3d80" : "#E5E0EB"}`, borderRadius: 12, padding: 16, background: isMajor ? "rgba(251,61,128,0.03)" : "#fff" }}>
                    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, padding: "3px 8px", borderRadius: 99, marginBottom: 8, background: isMajor ? "#fb3d80" : "#F3F0F7", color: isMajor ? "#fff" : "#6B5E7B" }}>
                      {isMajor ? "🔥 Majeur" : "🌱 Mineur"}
                    </span>
                    <div style={{ marginBottom: 12 }}>
                      <EditableText value={p.name} onSave={(v) => savePillarField(i, "name", v)} type="input" className="text-[14px] font-semibold" />
                    </div>
                    <div style={{ width: "100%", height: 6, borderRadius: 99, background: "#F3F0F7", marginBottom: 4 }}>
                      <div style={{ width: `${p.percentage}%`, height: 6, borderRadius: 99, background: isMajor ? "#fb3d80" : "#8B5CF6" }} />
                    </div>
                    <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 12 }}>{p.percentage}%</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#6B5E7B", marginBottom: 4 }}>Idées :</p>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                      {p.content_ideas.map((idea, j) => (
                        <li key={j} className="flex items-start gap-1 mb-1">
                          <span style={{ fontSize: 12, color: "#4B5563" }}>•</span>
                          <EditableText value={idea} onSave={(v) => savePillarIdea(i, j, v)} type="input" className="text-[12px]" />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Facettes */}
          {summary.facets?.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B", marginBottom: 12 }}>Mes facettes</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {summary.facets.map((f, i) => (
                  <span key={i} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "#F8F4FF", color: "#6B5E7B" }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Mix de contenu */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B", marginBottom: 16 }}>Mon mix de contenu</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12 }}>Sur 10 posts :</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <MixBar emoji="👁️" label="Visibilité" value={summary.content_mix.visibility} color="#fb3d80" />
              <MixBar emoji="🤝" label="Confiance" value={summary.content_mix.trust} color="#8B5CF6" />
              <MixBar emoji="💰" label="Vente" value={summary.content_mix.sales} color="#F59E0B" />
            </div>
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: 16, marginTop: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#6B5E7B", marginBottom: 8 }}>💡 Mémo rapide</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <p style={{ fontSize: 12, color: "#4B5563" }}><strong>Visibilité :</strong> contenus qui attirent de nouvelles personnes</p>
                <p style={{ fontSize: 12, color: "#4B5563" }}><strong>Confiance :</strong> contenus qui créent du lien</p>
                <p style={{ fontSize: 12, color: "#4B5563" }}><strong>Vente :</strong> contenus qui invitent à l'action</p>
              </div>
            </div>
          </div>

          {/* Gestes créatifs */}
          {summary.creative_gestures?.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6B5E7B", marginBottom: 12 }}>Les gestes créatifs de ma signature</p>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {summary.creative_gestures.map((g, i) => (
                  <li key={i} className="flex items-start gap-2.5" style={{ fontSize: 14, color: "#1a1a2e" }}>
                    <span style={{ color: "#fb3d80", fontWeight: 700 }} className="shrink-0">{i + 1}.</span>
                    <EditableText value={g} onSave={(v) => saveRecapArrayItem("creative_gestures", i, v)} type="input" className="text-[14px]" />
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p style={{ textAlign: "center", fontSize: 11, color: "#D1D5DB", marginTop: 32 }}>L'Assistant Com' × Nowadays Agency</p>
        </div>
      </main>
    </div>
  );
}

function MixBar({ emoji, label, value, color }: { emoji: string; label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 14, width: 24 }}>{emoji}</span>
      <span style={{ fontSize: 12, color: "#4B5563", width: 80 }}>{label}</span>
      <div style={{ flex: 1, height: 10, borderRadius: 99, background: "#F3F0F7" }}>
        <div style={{ width: `${(value / 10) * 100}%`, height: 10, borderRadius: 99, background: color }} />
      </div>
      <span style={{ fontSize: 12, color: "#6B5E7B", width: 40, textAlign: "right" }}>{value}/10</span>
    </div>
  );
}
