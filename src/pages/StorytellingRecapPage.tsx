import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useParams } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Copy, FileText, Loader2, RefreshCw, Pencil } from "lucide-react";
import EditableText from "@/components/EditableText";

interface RecapSummary {
  before: string;
  trigger: string;
  after: string;
  values: string[];
  unique: string[];
  mistakes: string[];
}

export default function StorytellingRecapPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { id } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const query = id
      ? (supabase.from("storytelling") as any).select("*").eq("id", id).eq(column, value).single()
      : (supabase.from("storytelling") as any).select("*").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle();
    query.then(({ data: d }) => {
      setData(d);
      setLoading(false);
      if (d && !d.recap_summary) {
        const storyText = d.step_7_polished || d.imported_text || d.step_6_full_story || "";
        if (storyText) autoGenerateRef.current = true;
      }
    });
  }, [user, id, column, value]);

  const autoGenerateRef = useRef(false);
  useEffect(() => {
    if (autoGenerateRef.current && data && !generating) {
      autoGenerateRef.current = false;
      generateRecap();
    }
  }, [data]);

  const story = data?.step_7_polished || data?.imported_text || data?.step_6_full_story || "";
  const summary: RecapSummary | null = data?.recap_summary as any;

  const saveRecapField = async (path: string[], value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    await supabase.from("storytelling").update({ recap_summary: updated } as any).eq("id", data.id);
    setData({ ...data, recap_summary: updated });
  };

  const saveRecapArrayItem = async (arrayKey: string, index: number, value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    updated[arrayKey][index] = value;
    await supabase.from("storytelling").update({ recap_summary: updated } as any).eq("id", data.id);
    setData({ ...data, recap_summary: updated });
  };

  const saveDirectField = async (field: string, value: string) => {
    if (!data) return;
    await supabase.from("storytelling").update({ [field]: value } as any).eq("id", data.id);
    setData({ ...data, [field]: value });
  };

  const generateRecap = async () => {
    if (!story) return;
    setGenerating(true);
    try {
      const { data: profData } = await (supabase.from("profiles") as any).select("activite, prenom").eq(column, value).single();
      const { data: bpData } = await (supabase.from("brand_profile") as any).select("mission, offer, target_description, tone_register, key_expressions, things_to_avoid").eq(column, value).maybeSingle();
      const profile = { ...(profData || {}), ...(bpData || {}) };
      const { data: fnData, error } = await supabase.functions.invoke("storytelling-ai", {
        body: { type: "generate-recap", storytelling: story, profile },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      await supabase.from("storytelling").update({ recap_summary: parsed } as any).eq("id", data.id);
      setData({ ...data, recap_summary: parsed });
      toast({ title: "Synthèse générée !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
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
      pdf.save(`mon-histoire-${data?.title || "storytelling"}.pdf`);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur export", description: friendlyError(e), variant: "destructive" });
    }
    setExporting(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-background"><AppHeader /><div className="flex justify-center py-20"><p className="text-muted-foreground">Chargement...</p></div></div>
  );

  if (!data) return (
    <div className="min-h-screen bg-background"><AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Mon histoire", to: "/branding/section?section=story" }]} currentLabel="Fiche récap" />
        <p className="text-muted-foreground">Aucun storytelling trouvé.</p>
      </main>
    </div>
  );

  const editLink = data?.source === "import" ? `/branding/storytelling/${data.id}/edit` : `/branding/storytelling/${data?.id || "new"}`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[780px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Mon histoire", to: "/branding/section?section=story" }]} currentLabel={data?.title || "Fiche récap"} />

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to={editLink}><Button variant="outline" size="sm" className="rounded-pill text-xs"><Pencil className="h-3 w-3 mr-1" /> Modifier</Button></Link>
            <Button variant="outline" size="sm" className="rounded-pill text-xs" onClick={generateRecap} disabled={generating || !story}>
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
            <p className="text-foreground text-[15px] mb-4">✨ Ta fiche récap sera générée automatiquement à partir de ton storytelling.</p>
            <Button onClick={generateRecap} disabled={generating || !story} className="rounded-pill">
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération...</> : "✨ Générer ma fiche"}
            </Button>
          </div>
        )}

        {summary && (
          <div ref={recapRef} id="storytelling-recap" className="bg-white rounded-2xl border border-[hsl(var(--border))] shadow-[var(--shadow-card)] overflow-hidden">
            <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="font-display text-[22px] sm:text-[26px] font-bold" style={{ color: "#1a1a2e" }}>👑 Mon histoire</h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-[11px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: "#fb3d80" }}>
                  👩 {data.story_type || "Fondatrice"}
                </span>
              </div>
            </div>

            {data.pitch_short && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5" style={{ backgroundColor: "#FFF4F8" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>Mon pitch</p>
                <EditableText
                  value={data.pitch_short}
                  onSave={(v) => saveDirectField("pitch_short", v)}
                  className="font-body text-[16px] italic leading-relaxed"
                />
                <div className="flex items-center justify-between mt-4">
                  <span className="font-mono-ui text-[10px] uppercase tracking-wide" style={{ color: "#6B5E7B" }}>Pitch court</span>
                  <button onClick={() => copyText(data.pitch_short)} className="inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-70 transition-opacity" style={{ color: "#fb3d80" }}>
                    <Copy className="h-3 w-3" /> Copier
                  </button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="px-6 sm:px-8 mb-2">
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>Le fil rouge</p>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 sm:gap-3 items-stretch">
                <TimelineCard emoji="🔵" label="AVANT" text={summary.before} color="#FFF4F8" onSave={(v) => saveRecapField(["before"], v)} />
                <div className="hidden sm:flex items-center text-muted-foreground/40 text-lg select-none">→</div>
                <TimelineCard emoji="💥" label="DÉCLIC" text={summary.trigger} color="#FFF4F8" onSave={(v) => saveRecapField(["trigger"], v)} />
                <div className="hidden sm:flex items-center text-muted-foreground/40 text-lg select-none">→</div>
                <TimelineCard emoji="🌱" label="APRÈS" text={summary.after} color="#E8F5E9" onSave={(v) => saveRecapField(["after"], v)} />
              </div>
            </div>

            <div className="mx-6 sm:mx-8 my-8 border-t border-border" />

            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <EditableListCard emoji="❤️" title="Mes valeurs" items={summary.values} bgColor="#FFF4F8" onSaveItem={(i, v) => saveRecapArrayItem("values", i, v)} />
              <EditableListCard emoji="💪" title="Ce qui me rend unique" items={summary.unique} bgColor="#FFF4F8" onSaveItem={(i, v) => saveRecapArrayItem("unique", i, v)} />
            </div>

            <div className="px-6 sm:px-8 mb-6">
              <EditableListCard emoji="⚡" title="Mes erreurs qui m'ont construite" items={summary.mistakes} bgColor="#FFF8F0" onSaveItem={(i, v) => saveRecapArrayItem("mistakes", i, v)} />
            </div>

            {(data.pitch_medium || data.pitch_long) && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5" style={{ backgroundColor: "#FFF4F8" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>Mes pitchs</p>
                {data.pitch_medium && (
                  <PitchBlock emoji="☕" label="Naturel" text={data.pitch_medium} onCopy={() => copyText(data.pitch_medium)} onSave={(v) => saveDirectField("pitch_medium", v)} />
                )}
                {data.pitch_long && (
                  <PitchBlock emoji="🎤" label="Networking" text={data.pitch_long} onCopy={() => copyText(data.pitch_long)} onSave={(v) => saveDirectField("pitch_long", v)} className="mt-4" />
                )}
              </div>
            )}

            <div className="px-6 sm:px-8 py-4 border-t border-[hsl(var(--border))]">
              <p className="text-center font-mono-ui text-[10px] uppercase tracking-wider" style={{ color: "#6B5E7B" }}>L'Assistant Com' × Nowadays Agency</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/branding/storytelling" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">← Retour à Mes storytellings</Link>
        </div>
      </main>
    </div>
  );
}

function TimelineCard({ emoji, label, text, color, onSave }: { emoji: string; label: string; text: string; color: string; onSave: (v: string) => Promise<void> }) {
  return (
    <div className="rounded-xl p-5 flex flex-col" style={{ backgroundColor: color }}>
      <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>{emoji} {label}</p>
      <EditableText value={text} onSave={onSave} className="font-body text-[13px] leading-relaxed flex-1" />
    </div>
  );
}

function EditableListCard({ emoji, title, items, bgColor, onSaveItem }: { emoji: string; title: string; items: string[]; bgColor: string; onSaveItem: (i: number, v: string) => Promise<void> }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: bgColor }}>
      <p className="font-display text-base font-semibold mb-4" style={{ color: "#1a1a2e" }}>{emoji} {title}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-1.5 text-[8px] shrink-0" style={{ color: "#fb3d80" }}>●</span>
            <EditableText value={item} onSave={(v) => onSaveItem(i, v)} type="input" className="font-body text-[13px] leading-relaxed" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PitchBlock({ emoji, label, text, onCopy, onSave, className = "" }: { emoji: string; label: string; text: string; onCopy: () => void; onSave: (v: string) => Promise<void>; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono-ui text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6B5E7B" }}>{emoji} {label}</span>
        <button onClick={onCopy} className="inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-70 transition-opacity" style={{ color: "#fb3d80" }}>
          <Copy className="h-3 w-3" /> Copier
        </button>
      </div>
      <EditableText value={text} onSave={onSave} className="font-body text-[14px] italic leading-relaxed" />
    </div>
  );
}
