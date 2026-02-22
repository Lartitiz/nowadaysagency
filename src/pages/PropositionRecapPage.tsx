import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, FileText, Loader2, RefreshCw, Pencil } from "lucide-react";
import EditableText from "@/components/EditableText";

interface RecapSummary {
  what_i_do: string[];
  what_i_dont: string[];
  for_whom: string;
  for_whom_tags: string[];
  how: string[];
  differentiator: string;
}

export default function PropositionRecapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("brand_proposition").select("*").eq("user_id", user.id).maybeSingle().then(({ data: d }) => {
      setData(d);
      setLoading(false);
    });
  }, [user?.id]);

  const summary: RecapSummary | null = data?.recap_summary as any;

  const saveRecapField = async (path: string[], value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    await supabase.from("brand_proposition").update({ recap_summary: updated } as any).eq("id", data.id);
    setData({ ...data, recap_summary: updated });
  };

  const saveRecapArrayItem = async (arrayKey: string, index: number, value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    updated[arrayKey][index] = value;
    await supabase.from("brand_proposition").update({ recap_summary: updated } as any).eq("id", data.id);
    setData({ ...data, recap_summary: updated });
  };

  const saveVersionField = async (field: string, value: string) => {
    if (!data) return;
    await supabase.from("brand_proposition").update({ [field]: value } as any).eq("id", data.id);
    setData({ ...data, [field]: value });
  };

  const generateRecap = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const [profRes, bpRes, perRes] = await Promise.all([
        supabase.from("profiles").select("activite, prenom").eq("user_id", user!.id).single(),
        supabase.from("brand_profile").select("mission, offer, combat_cause, combat_fights, combat_refusals").eq("user_id", user!.id).maybeSingle(),
        supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", user!.id).maybeSingle(),
      ]);
      const { data: fnData, error } = await supabase.functions.invoke("proposition-ai", {
        body: {
          type: "generate-recap",
          proposition_data: data,
          profile: { ...(profRes.data || {}), ...(bpRes.data || {}) },
          persona: perRes.data || {},
          tone: bpRes.data || {},
        },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      await supabase.from("brand_proposition").update({ recap_summary: parsed } as any).eq("id", data.id);
      setData({ ...data, recap_summary: parsed });
      toast({ title: "Synthèse générée !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const exportPDF = async () => {
    if (!recapRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      const canvas = await html2canvas(recapRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save("ma-proposition-de-valeur.pdf");
    } catch (e: any) {
      toast({ title: "Erreur export", description: e.message, variant: "destructive" });
    }
    setExporting(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma proposition de valeur" />
        <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-6 text-center">
          <p className="text-foreground text-[15px] mb-4">💎 Complète d'abord ta proposition de valeur pour voir ta fiche récap.</p>
          <Link to="/branding/proposition"><Button className="rounded-pill">Commencer →</Button></Link>
        </div>
      </main>
    </div>
  );

  const VERSION_FIELDS = [
    { emoji: "🪪", label: "Bio Instagram / LinkedIn", field: "version_bio" },
    { emoji: "🎤", label: "Pitch oral / networking", field: "version_pitch_naturel" },
    { emoji: "🌐", label: "Page d'accueil site web", field: "version_site_web" },
    { emoji: "🔥", label: "Accroche engagée", field: "version_engagee" },
    { emoji: "✨", label: "One-liner mémorable", field: "version_one_liner" },
  ];
  const versions = VERSION_FIELDS.filter(v => data[v.field]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[780px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel="Ma proposition de valeur" />

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/branding/proposition">
              <Button variant="outline" size="sm" className="rounded-pill text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Modifier
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="rounded-pill text-xs" onClick={generateRecap} disabled={generating}>
              {generating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              {summary ? "Regénérer" : "Générer la synthèse"}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-pill text-xs" onClick={exportPDF} disabled={exporting || !summary}>
            {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
            Exporter PDF
          </Button>
        </div>

        {!summary && (
          <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-8 text-center mb-6">
            <p className="text-foreground text-[15px] mb-4">✨ Clique sur "Générer la synthèse" pour créer ta fiche récap visuelle.</p>
            <Button onClick={generateRecap} disabled={generating} className="rounded-pill">
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération...</> : "✨ Générer ma fiche"}
            </Button>
          </div>
        )}

        {summary && (
          <div ref={recapRef} id="proposition-recap" className="bg-white rounded-2xl border border-[hsl(var(--border))] shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
              <h1 className="font-display text-[22px] sm:text-[26px] font-bold" style={{ color: "#1a1a2e" }}>💎 Ma proposition de valeur</h1>
            </div>

            {data.version_bio && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5 border-l-4" style={{ backgroundColor: "#FFF4F8", borderLeftColor: "#fb3d80" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>En une phrase</p>
                <EditableText
                  value={data.version_bio}
                  onSave={(v) => saveVersionField("version_bio", v)}
                  className="font-body text-[18px] italic leading-relaxed"
                  type="input"
                />
                <div className="flex justify-end mt-3">
                  <CopyBtn onClick={() => copyText(data.version_bio)} />
                </div>
              </div>
            )}

            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EditableListCard emoji="✅" title="Ce que je fais" items={summary.what_i_do} dotColor="#22c55e" onSaveItem={(i, v) => saveRecapArrayItem("what_i_do", i, v)} />
              <EditableListCard emoji="🚫" title="Ce que je ne fais pas" items={summary.what_i_dont} dotColor="#f87171" onSaveItem={(i, v) => saveRecapArrayItem("what_i_dont", i, v)} />
            </div>

            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>🎯 Pour qui</p>
                <EditableText
                  value={summary.for_whom}
                  onSave={(v) => saveRecapField(["for_whom"], v)}
                  className="font-body text-[13px] leading-relaxed mb-3"
                />
                <div className="flex flex-wrap gap-1.5">
                  {summary.for_whom_tags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-0.5 rounded-pill text-[11px] font-semibold" style={{ backgroundColor: "#EDE8F5", color: "#6B5E7B" }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>🛠️ Comment</p>
                <ul className="space-y-1.5">
                  {summary.how.map((item, i) => (
                    <li key={i} className="font-body text-[13px] leading-relaxed flex items-start gap-2" style={{ color: "#1a1a2e" }}>
                      <span style={{ color: "#8b5cf6" }} className="mt-0.5 shrink-0">•</span>
                      <EditableText value={item} onSave={(v) => saveRecapArrayItem("how", i, v)} type="input" className="font-body text-[13px]" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5 text-center" style={{ backgroundColor: "#FFF4F8" }}>
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>🔥 Ce qui me rend différente</p>
              <EditableText
                value={summary.differentiator}
                onSave={(v) => saveRecapField(["differentiator"], v)}
                className="font-body text-[16px] italic leading-relaxed"
                type="input"
              />
            </div>

            {versions.length > 0 && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>Mes versions prêtes à l'emploi</p>
                <div className="space-y-0">
                  {versions.map((v, i) => (
                    <div key={i}>
                      {i > 0 && <div className="border-t border-dashed my-4" style={{ borderColor: "#D8D0E5" }} />}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#6B5E7B" }}>{v.emoji} {v.label}</p>
                          <EditableText
                            value={data[v.field]}
                            onSave={(val) => saveVersionField(v.field, val)}
                            className="font-body text-[14px] italic leading-relaxed"
                          />
                        </div>
                        <CopyBtn onClick={() => copyText(data[v.field]!)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 sm:px-8 py-4 border-t border-[hsl(var(--border))]">
              <p className="text-center font-mono-ui text-[10px] uppercase tracking-wider" style={{ color: "#6B5E7B" }}>L'Assistant Com' × Nowadays Agency</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">← Retour au Branding</Link>
        </div>
      </main>
    </div>
  );
}

function EditableListCard({ emoji, title, items, dotColor, onSaveItem }: { emoji: string; title: string; items: string[]; dotColor: string; onSaveItem: (i: number, v: string) => Promise<void> }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "#E5E0EB", backgroundColor: "#ffffff" }}>
      <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>{emoji} {title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="font-body text-[13px] leading-relaxed flex items-start gap-2" style={{ color: "#1a1a2e" }}>
            <span style={{ color: dotColor }} className="mt-0.5 shrink-0">•</span>
            <EditableText value={item} onSave={(v) => onSaveItem(i, v)} type="input" className="font-body text-[13px]" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-70 transition-opacity" style={{ color: "#fb3d80" }}>
      <Copy className="h-3 w-3" /> Copier
    </button>
  );
}
