import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link, useParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, FileText, Loader2, RefreshCw, ArrowRight, Pencil } from "lucide-react";

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
      ? supabase.from("storytelling").select("*").eq("id", id).eq("user_id", user.id).single()
      : supabase.from("storytelling").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    query.then(({ data: d }) => {
      setData(d);
      setLoading(false);
      // Auto-generate recap if missing
      if (d && !d.recap_summary) {
        const storyText = d.step_7_polished || d.imported_text || d.step_6_full_story || "";
        if (storyText) {
          autoGenerateRef.current = true;
        }
      }
    });
  }, [user, id]);

  const autoGenerateRef = useRef(false);
  useEffect(() => {
    if (autoGenerateRef.current && data && !generating) {
      autoGenerateRef.current = false;
      generateRecap();
    }
  }, [data]);

  const story = data?.step_7_polished || data?.imported_text || data?.step_6_full_story || "";
  const summary: RecapSummary | null = data?.recap_summary as any;

  const generateRecap = async () => {
    if (!story) return;
    setGenerating(true);
    try {
      const { data: profData } = await supabase
        .from("profiles").select("activite, prenom").eq("user_id", user!.id).single();
      const { data: bpData } = await supabase
        .from("brand_profile").select("mission, offer, target_description, tone_register, key_expressions, things_to_avoid").eq("user_id", user!.id).maybeSingle();

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

      const canvas = await html2canvas(recapRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save(`mon-histoire-${data?.title || "storytelling"}.pdf`);
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
        <SubPageHeader parentLabel="Mes storytellings" parentTo="/branding/storytelling" currentLabel="Fiche récap" />
        <p className="text-muted-foreground">Aucun storytelling trouvé.</p>
      </main>
    </div>
  );

  const editLink = data?.source === "import"
    ? `/branding/storytelling/${data.id}/edit`
    : `/branding/storytelling/${data?.id || "new"}`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[780px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mes storytellings" parentTo="/branding/storytelling" currentLabel={data?.title || "Fiche récap"} />

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to={editLink}>
              <Button variant="outline" size="sm" className="rounded-pill text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Modifier
              </Button>
            </Link>
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

        {/* If no summary yet, prompt to generate */}
        {!summary && (
          <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-8 text-center mb-6">
            <p className="text-foreground text-[15px] mb-4">
              ✨ Ta fiche récap sera générée automatiquement à partir de ton storytelling. Clique sur "Générer la synthèse" pour commencer.
            </p>
            <Button onClick={generateRecap} disabled={generating || !story} className="rounded-pill">
              {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération...</> : "✨ Générer ma fiche"}
            </Button>
          </div>
        )}

        {/* === RECAP CARD === */}
        {summary && (
          <div ref={recapRef} id="storytelling-recap" className="bg-white rounded-2xl border border-[hsl(var(--border))] shadow-[var(--shadow-card)] overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h1 className="font-display text-[22px] sm:text-[26px] font-bold" style={{ color: "#1a1a2e" }}>
                  👑 Mon histoire
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-[11px] font-semibold uppercase tracking-wide text-white" style={{ backgroundColor: "#fb3d80" }}>
                  👩 {data.story_type || "Fondatrice"}
                </span>
              </div>
            </div>

            {/* Pitch court */}
            {data.pitch_short && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5" style={{ backgroundColor: "#FFF4F8" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                  Mon pitch
                </p>
                <p className="font-body text-[16px] italic leading-relaxed mb-4" style={{ color: "#1a1a2e" }}>
                  "{data.pitch_short}"
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono-ui text-[10px] uppercase tracking-wide" style={{ color: "#6B5E7B" }}>Pitch court</span>
                  <button onClick={() => copyText(data.pitch_short)} className="inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-70 transition-opacity" style={{ color: "#fb3d80" }}>
                    <Copy className="h-3 w-3" /> Copier
                  </button>
                </div>
              </div>
            )}

            {/* Fil rouge - Timeline */}
            <div className="px-6 sm:px-8 mb-6">
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>
                Le fil rouge
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TimelineCard emoji="🔵" label="AVANT" text={summary.before} color="#F8F4FF" />
                <TimelineCard emoji="💥" label="DÉCLIC" text={summary.trigger} color="#FFF4F8" />
                <TimelineCard emoji="🌱" label="APRÈS" text={summary.after} color="#F0FFF4" />
              </div>
              {/* Arrows between cards (desktop only) */}
              <div className="hidden sm:flex justify-around mt-[-52px] mb-4 pointer-events-none px-8" style={{ transform: "translateY(-50%)" }}>
                <ArrowRight className="h-5 w-5" style={{ color: "#fb3d80" }} />
                <ArrowRight className="h-5 w-5" style={{ color: "#fb3d80" }} />
              </div>
            </div>

            {/* Valeurs + Unique */}
            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ListCard emoji="❤️" title="Mes valeurs" items={summary.values} bgColor="#FFF4F8" />
              <ListCard emoji="💪" title="Ce qui me rend unique" items={summary.unique} bgColor="#F8F4FF" />
            </div>

            {/* Erreurs */}
            <div className="px-6 sm:px-8 mb-6">
              <ListCard emoji="⚡" title="Mes erreurs qui m'ont construite" items={summary.mistakes} bgColor="#FFF8F0" />
            </div>

            {/* Pitchs */}
            {(data.pitch_medium || data.pitch_long) && (
              <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5" style={{ backgroundColor: "#FFF4F8" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>
                  Mes pitchs
                </p>
                {data.pitch_medium && (
                  <PitchBlock emoji="☕" label="Naturel" text={data.pitch_medium} onCopy={() => copyText(data.pitch_medium)} />
                )}
                {data.pitch_long && (
                  <PitchBlock emoji="🎤" label="Networking" text={data.pitch_long} onCopy={() => copyText(data.pitch_long)} className="mt-4" />
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 sm:px-8 py-4 border-t border-[hsl(var(--border))]">
              <p className="text-center font-mono-ui text-[10px] uppercase tracking-wider" style={{ color: "#6B5E7B" }}>
                L'Assistant Com' × Nowadays Agency
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/branding/storytelling" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            ← Retour à Mes storytellings
          </Link>
        </div>
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function TimelineCard({ emoji, label, text, color }: { emoji: string; label: string; text: string; color: string }) {
  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ backgroundColor: color }}>
      <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B5E7B" }}>
        {emoji} {label}
      </p>
      <p className="font-body text-[13px] leading-relaxed" style={{ color: "#1a1a2e" }}>
        {text}
      </p>
    </div>
  );
}

function ListCard({ emoji, title, items, bgColor }: { emoji: string; title: string; items: string[]; bgColor: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: bgColor }}>
      <p className="font-display text-[15px] font-bold mb-3" style={{ color: "#1a1a2e" }}>
        {emoji} {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="font-body text-[13px] leading-relaxed" style={{ color: "#1a1a2e" }}>
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PitchBlock({ emoji, label, text, onCopy, className = "" }: { emoji: string; label: string; text: string; onCopy: () => void; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono-ui text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6B5E7B" }}>
          {emoji} {label}
        </span>
        <button onClick={onCopy} className="inline-flex items-center gap-1 text-[11px] font-semibold hover:opacity-70 transition-opacity" style={{ color: "#fb3d80" }}>
          <Copy className="h-3 w-3" /> Copier
        </button>
      </div>
      <p className="font-body text-[14px] italic leading-relaxed" style={{ color: "#1a1a2e" }}>
        "{text}"
      </p>
    </div>
  );
}
