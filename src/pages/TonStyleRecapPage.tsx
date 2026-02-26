import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBrandProfile } from "@/hooks/use-profile";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Copy, FileText, Loader2, RefreshCw, Pencil } from "lucide-react";
import EditableText from "@/components/EditableText";

interface RecapSummary {
  voice_oneliner: string;
  register_tags: string[];
  i_am: string[];
  i_am_not: string[];
  my_expressions: string[];
  forbidden_words: string[];
  verbatims: string[];
  major_fight: { name: string; description: string };
  minor_fights: string[];
}

export default function TonStyleRecapPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const { data: hookBrandProfile } = useBrandProfile();
  const queryClient = useQueryClient();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    if (hookBrandProfile === undefined) return; // still loading
    const d = hookBrandProfile as any;
    setData(d);
    if (d && !d.recap_summary) {
      setGenerating(true);
      (async () => {
        try {
          const stratRes = await (supabase.from("brand_strategy") as any).select("creative_concept").eq(column, value).maybeSingle();
          const { data: fnData, error } = await supabase.functions.invoke("niche-ai", {
            body: {
              type: "generate-tone-recap",
              tone_data: {
                voice_description: d.voice_description,
                tone_register: d.tone_register, tone_level: d.tone_level,
                tone_style: d.tone_style, tone_humor: d.tone_humor, tone_engagement: d.tone_engagement,
                key_expressions: d.key_expressions, things_to_avoid: d.things_to_avoid,
                target_verbatims: d.target_verbatims, combat_cause: d.combat_cause,
                combat_fights: d.combat_fights, combat_refusals: d.combat_refusals,
                combat_alternative: d.combat_alternative,
              },
              creative_concept: stratRes.data?.creative_concept || "",
            },
          });
          if (!error) {
            const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            const parsed = JSON.parse(raw);
            await supabase.from("brand_profile").update({ recap_summary: parsed } as any).eq("id", d.id);
            queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
            setData({ ...d, recap_summary: parsed });
          }
        } catch (e) {
          console.error("Auto-generate recap failed:", e);
        }
        setGenerating(false);
      })();
    }
    setLoading(false);
  }, [user?.id, hookBrandProfile]);

  const summary: RecapSummary | null = data?.recap_summary as any;

  /* ── Save helpers ── */
  const saveRecapField = async (path: string[], value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    let obj = updated;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
    await supabase.from("brand_profile").update({ recap_summary: updated } as any).eq("id", data.id);
    queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    setData({ ...data, recap_summary: updated });
  };

  const saveRecapArrayItem = async (arrayKey: string, index: number, value: string) => {
    if (!data || !summary) return;
    const updated = JSON.parse(JSON.stringify(summary));
    updated[arrayKey][index] = value;
    await supabase.from("brand_profile").update({ recap_summary: updated } as any).eq("id", data.id);
    queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    setData({ ...data, recap_summary: updated });
  };

  const saveRawField = async (field: string, value: string) => {
    if (!data) return;
    await supabase.from("brand_profile").update({ [field]: value } as any).eq("id", data.id);
    queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
    setData({ ...data, [field]: value });
  };

  const generateRecap = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const stratRes = await (supabase.from("brand_strategy") as any).select("creative_concept").eq(column, value).maybeSingle();
      const { data: fnData, error } = await supabase.functions.invoke("niche-ai", {
        body: {
          type: "generate-tone-recap",
          tone_data: {
            voice_description: data.voice_description, tone_register: data.tone_register,
            tone_level: data.tone_level, tone_style: data.tone_style,
            tone_humor: data.tone_humor, tone_engagement: data.tone_engagement,
            key_expressions: data.key_expressions, things_to_avoid: data.things_to_avoid,
            target_verbatims: data.target_verbatims, combat_cause: data.combat_cause,
            combat_fights: data.combat_fights, combat_refusals: data.combat_refusals,
            combat_alternative: data.combat_alternative,
          },
          creative_concept: stratRes.data?.creative_concept || "",
        },
      });
      if (error) throw error;
      const raw = fnData.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw);
      await supabase.from("brand_profile").update({ recap_summary: parsed } as any).eq("id", data.id);
      queryClient.invalidateQueries({ queryKey: ["brand-profile"] });
      setData({ ...data, recap_summary: parsed });
      toast({ title: "Synthèse générée !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    }
    setGenerating(false);
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
      pdf.save("mon-ton-et-combats.pdf");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur export", description: friendlyError(e), variant: "destructive" });
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
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Mon ton & style", to: "/branding/section?section=tone_style" }]} currentLabel="Récap" />
        <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-6 text-center">
          <p className="text-foreground text-[15px] mb-4">🎨 Complète d'abord ton ton & tes combats pour voir ta fiche récap.</p>
          <Link to="/branding/ton"><Button className="rounded-pill">Commencer →</Button></Link>
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[780px] px-6 py-8 max-md:px-4">
        <SubPageHeader breadcrumbs={[{ label: "Branding", to: "/branding" }, { label: "Mon ton & style", to: "/branding/section?section=tone_style" }]} currentLabel="Récap" />

        {/* Action bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/branding/ton">
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

        {/* Fallback: show raw data while generating */}
        {!summary && (
          <div className="rounded-2xl bg-white border border-[hsl(var(--border))] shadow-[var(--shadow-card)] overflow-hidden p-6 sm:p-8 mb-6">
            <h2 className="font-display text-[20px] font-bold mb-4" style={{ color: "#1a1a2e" }}>🎨 Ma voix & mes combats</h2>

            {data?.voice_description && (
              <div className="mb-4">
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B5E7B" }}>Ma voix</p>
                <EditableText
                  value={data.voice_description}
                  onSave={(v) => saveRawField("voice_description", v)}
                  className="font-body text-[14px] leading-relaxed"
                />
              </div>
            )}

            {data?.key_expressions && (
              <div className="mb-4">
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B5E7B" }}>Mes expressions</p>
                <EditableText
                  value={data.key_expressions}
                  onSave={(v) => saveRawField("key_expressions", v)}
                  className="font-body text-[14px] leading-relaxed"
                />
              </div>
            )}

            {data?.combat_cause && (
              <div className="mb-4">
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B5E7B" }}>Mes combats</p>
                <EditableText
                  value={data.combat_cause}
                  onSave={(v) => saveRawField("combat_cause", v)}
                  className="font-body text-[14px] leading-relaxed"
                />
                {data.combat_fights && (
                  <EditableText
                    value={data.combat_fights}
                    onSave={(v) => saveRawField("combat_fights", v)}
                    className="font-body text-[13px] mt-1"
                  />
                )}
              </div>
            )}

            {generating && (
              <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: "#FFF4F8" }}>
                <p className="text-[13px] flex items-center gap-2" style={{ color: "#1a1a2e" }}>
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#fb3d80" }} />
                  ✨ Ta fiche synthétique est en cours de génération...
                </p>
              </div>
            )}

            {!generating && (
              <Button onClick={generateRecap} className="rounded-pill mt-4">
                ✨ Générer ma fiche
              </Button>
            )}
          </div>
        )}

        {/* === RECAP CARD === */}
        {summary && (
          <div ref={recapRef} id="ton-recap" className="bg-white rounded-2xl border border-[hsl(var(--border))] shadow-[var(--shadow-card)] overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
              <h1 className="font-display text-[22px] sm:text-[26px] font-bold" style={{ color: "#1a1a2e" }}>
                🎨 Mon ton & mes combats
              </h1>
            </div>

            {/* Ma voix en une phrase */}
            <div className="mx-6 sm:mx-8 mb-6 rounded-xl p-5 border-l-4 text-center" style={{ backgroundColor: "#FFF4F8", borderLeftColor: "#fb3d80" }}>
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                Ma voix en une phrase
              </p>
              <EditableText
                value={summary.voice_oneliner}
                onSave={(v) => saveRecapField(["voice_oneliner"], v)}
                className="font-body text-[18px] italic leading-relaxed"
                type="input"
              />
            </div>

            {/* Mon registre - tags */}
            <div className="px-6 sm:px-8 mb-5">
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                Mon registre
              </p>
              <div className="flex flex-wrap gap-2">
                {summary.register_tags.map((tag, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-pill text-[11px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "#fb3d80", color: "#ffffff" }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Je suis / Je ne suis pas */}
            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4" style={{ borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                  ✅ Je suis
                </p>
                <ul className="space-y-1.5">
                  {summary.i_am.map((item, i) => (
                    <li key={i} className="font-body text-[13px] leading-relaxed flex items-start gap-2" style={{ color: "#1a1a2e" }}>
                      <span style={{ color: "#22c55e" }} className="mt-0.5 shrink-0">•</span>
                      <EditableText
                        value={item}
                        onSave={(v) => saveRecapArrayItem("i_am", i, v)}
                        type="input"
                        className="font-body text-[13px]"
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                  🚫 Je ne suis pas
                </p>
                <ul className="space-y-1.5">
                  {summary.i_am_not.map((item, i) => (
                    <li key={i} className="font-body text-[13px] leading-relaxed flex items-start gap-2" style={{ color: "#1a1a2e" }}>
                      <span style={{ color: "#f87171" }} className="mt-0.5 shrink-0">•</span>
                      <EditableText
                        value={item}
                        onSave={(v) => saveRecapArrayItem("i_am_not", i, v)}
                        type="input"
                        className="font-body text-[13px]"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Expressions / Mots interdits */}
            <div className="px-6 sm:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: "#f0fdf4" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                  💬 Mes expressions
                </p>
                <div className="space-y-1.5">
                  {summary.my_expressions.map((expr, i) => (
                    <EditableText
                      key={i}
                      value={expr}
                      onSave={(v) => saveRecapArrayItem("my_expressions", i, v)}
                      type="input"
                      className="font-body text-[13px] italic"
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: "#fef2f2" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                  ⛔ Mes mots interdits
                </p>
                <div className="space-y-1.5">
                  {summary.forbidden_words.map((word, i) => (
                    <EditableText
                      key={i}
                      value={word}
                      onSave={(v) => saveRecapArrayItem("forbidden_words", i, v)}
                      type="input"
                      className="font-body text-[13px] italic line-through"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Verbatims */}
            {summary.verbatims && summary.verbatims.length > 0 && (
              <div className="mx-6 sm:mx-8 mb-5 rounded-xl p-5" style={{ backgroundColor: "#F8F4FF" }}>
                <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#6B5E7B" }}>
                  🗣️ Verbatims de mon persona
                </p>
                <div className="space-y-2">
                  {summary.verbatims.map((v, i) => (
                    <EditableText
                      key={i}
                      value={v}
                      onSave={(val) => saveRecapArrayItem("verbatims", i, val)}
                      type="input"
                      className="font-body text-[14px] italic"
                    />
                  ))}
                </div>
                <p className="text-[11px] italic mt-3" style={{ color: "#9CA3AF" }}>
                  Les mots exacts de ta cliente. Réutilise-les dans tes contenus pour qu'elle se reconnaisse.
                </p>
              </div>
            )}

            {/* Combats */}
            <div className="px-6 sm:px-8 mb-5">
              <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#6B5E7B" }}>
                ✊ Mes combats
              </p>

              {summary.major_fight && (
                <div className="rounded-xl p-5 border-l-4 mb-4" style={{ backgroundColor: "#FFF4F8", borderLeftColor: "#fb3d80" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span>🔥</span>
                    <EditableText
                      value={summary.major_fight.name}
                      onSave={(v) => saveRecapField(["major_fight", "name"], v)}
                      type="input"
                      className="font-display text-[15px] font-bold"
                    />
                  </div>
                  <EditableText
                    value={summary.major_fight.description}
                    onSave={(v) => saveRecapField(["major_fight", "description"], v)}
                    className="font-body text-[13px] leading-relaxed"
                  />
                </div>
              )}

              {summary.minor_fights && summary.minor_fights.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {summary.minor_fights.map((fight, i) => (
                    <div key={i} className="rounded-xl border px-4 py-3 flex items-center gap-2" style={{ borderColor: "#E5E0EB", backgroundColor: "#ffffff" }}>
                      <span>🌱</span>
                      <EditableText
                        value={fight}
                        onSave={(v) => saveRecapArrayItem("minor_fights", i, v)}
                        type="input"
                        className="font-body text-[13px] font-medium"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 sm:px-8 py-4 border-t border-[hsl(var(--border))]">
              <p className="text-center font-mono-ui text-[10px] uppercase tracking-wider" style={{ color: "#6B5E7B" }}>
                L'Assistant Com' × Nowadays Agency
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            ← Retour au Branding
          </Link>
        </div>
      </main>
    </div>
  );
}
