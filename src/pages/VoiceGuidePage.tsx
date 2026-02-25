import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import SubPageHeader from "@/components/SubPageHeader";
import { Sparkles, RefreshCw, Copy, Download, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface VoiceGuide {
  brand_name: string;
  voice_summary: string;
  tone_keywords: string[];
  do_say: string[];
  dont_say: string[];
  words_to_use: string[];
  words_to_avoid: string[];
  rhythm: string;
  emotions_to_create: string[];
  post_template: string;
  bio_example: string;
}

export default function VoiceGuidePage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const [guide, setGuide] = useState<VoiceGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await (supabase.from("voice_guides") as any)
        .select("guide_data")
        .eq(column, value)
        .maybeSingle();
      if (data?.guide_data) setGuide(data.guide_data);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connectée");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-voice-guide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur");
      }
      const json = await res.json();
      setGuide(json.guide);
      toast.success("✨ Guide de voix généré !");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!guide) return;
    const text = [
      `GUIDE DE VOIX — ${guide.brand_name}`,
      "",
      `MA VOIX EN RÉSUMÉ\n${guide.voice_summary}`,
      "",
      `MON TON : ${guide.tone_keywords.join(", ")}`,
      "",
      `CE QUE JE DIS :\n${guide.do_say.map(s => `✅ ${s}`).join("\n")}`,
      "",
      `CE QUE JE NE DIS PAS :\n${guide.dont_say.map(s => `❌ ${s}`).join("\n")}`,
      "",
      `MOTS À UTILISER : ${guide.words_to_use.join(", ")}`,
      "",
      `MOTS À ÉVITER : ${guide.words_to_avoid.join(", ")}`,
      "",
      `MON RYTHME\n${guide.rhythm}`,
      "",
      `ÉMOTIONS À CRÉER : ${guide.emotions_to_create.join(", ")}`,
      "",
      `TEMPLATE DE POST :\n${guide.post_template}`,
      "",
      `EXEMPLE DE BIO :\n${guide.bio_example}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Guide copié !");
  };

  const handlePdf = async () => {
    if (!guideRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(guideRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * contentW;
      let remaining = imgH;
      const pageContentH = pageH - margin * 2;
      let isFirst = true;
      while (remaining > 0) {
        if (!isFirst) pdf.addPage();
        isFirst = false;
        const sourceY = (imgH - remaining) / imgH * canvas.height;
        const sliceH = Math.min(pageContentH / contentW * canvas.width, canvas.height - sourceY);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceImg = sliceCanvas.toDataURL("image/png");
        const sliceImgH = (sliceH / canvas.width) * contentW;
        pdf.addImage(sliceImg, "PNG", margin, margin, contentW, sliceImgH);
        remaining -= pageContentH;
      }
      pdf.save(`guide-voix-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF téléchargé !");
    } catch {
      toast.error("Erreur export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Ton style" parentTo="/branding/style" currentLabel="Guide de voix" />

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="font-display text-[26px] font-bold text-foreground">🎤 Mon guide de voix</h1>
          {guide && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" /> Copier
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePdf} disabled={exporting}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Régénérer
              </Button>
            </div>
          )}
        </div>

        {!guide ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center space-y-4">
            <div className="text-4xl">🎤</div>
            <h2 className="font-display text-lg font-bold text-foreground">Ton guide de voix personnalisé</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              L'IA analyse ton branding pour créer un guide que tu peux partager avec tes prestataires (graphiste, CM, assistante).
            </p>
            <Button onClick={generate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Génération en cours..." : "✨ Générer mon guide de voix"}
            </Button>
          </div>
        ) : (
          <div ref={guideRef} className="space-y-6">
            {/* Header */}
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground mb-1">Guide de voix</h2>
              <p className="text-lg text-primary font-semibold">{guide.brand_name}</p>
            </div>

            {/* Voice summary */}
            <Section emoji="💬" title="Ma voix en résumé">
              <p className="text-[15px] text-foreground/80 leading-relaxed">{guide.voice_summary}</p>
            </Section>

            {/* Tone keywords */}
            <Section emoji="🎨" title="Mon ton">
              <div className="flex flex-wrap gap-2">
                {guide.tone_keywords.map((kw, i) => (
                  <span key={i} className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">{kw}</span>
                ))}
              </div>
            </Section>

            {/* Do / Don't */}
            <Section emoji="✍️" title="Ce que je dis / Ce que je ne dis pas">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">✅ Ce que je dis</p>
                  {guide.do_say.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">❌ Ce que je ne dis pas</p>
                  {guide.dont_say.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                      <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* Vocabulary */}
            <Section emoji="📖" title="Mon vocabulaire">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">À utiliser</p>
                  <div className="flex flex-wrap gap-1.5">
                    {guide.words_to_use.map((w, i) => (
                      <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800">{w}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">À éviter</p>
                  <div className="flex flex-wrap gap-1.5">
                    {guide.words_to_avoid.map((w, i) => (
                      <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800">{w}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            {/* Rhythm */}
            <Section emoji="🎵" title="Mon rythme">
              <p className="text-[15px] text-foreground/80 leading-relaxed">{guide.rhythm}</p>
            </Section>

            {/* Emotions */}
            <Section emoji="💫" title="Les émotions que je crée">
              <div className="flex flex-wrap gap-2">
                {guide.emotions_to_create.map((e, i) => (
                  <span key={i} className="px-4 py-2 rounded-full bg-accent text-accent-foreground text-sm font-medium">{e}</span>
                ))}
              </div>
            </Section>

            {/* Post template */}
            <Section emoji="📝" title="Template de post">
              <div className="rounded-xl bg-muted/50 border border-border p-5">
                <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">{guide.post_template}</pre>
              </div>
            </Section>

            {/* Bio example */}
            <Section emoji="📱" title="Exemple de bio">
              <div className="rounded-xl bg-muted/50 border border-border p-5">
                <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{guide.bio_example}</p>
              </div>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="text-xl">{emoji}</span>
        <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}
