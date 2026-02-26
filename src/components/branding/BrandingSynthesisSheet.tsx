import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Download, Copy, RefreshCw, ExternalLink, Loader2, Pencil, Sparkles, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { calculateBrandingCompletion, fetchBrandingData } from "@/lib/branding-completion";
import { parseStringList, safeParseJson } from "@/lib/branding-utils";

interface SynthesisData {
  brand: any;
  persona: any;
  storytelling: any;
  proposition: any;
  strategy: any;
  offers: any[];
  channels: string[];
  planConfig: any;
  brandingAudit: any;
  completion: number;
  completionDetail: any;
  userName: string | null;
  userActivity: string | null;
}


function CollapsibleText({ text, label, maxChars = 150, isQuote }: { text: string; label?: string; maxChars?: number; isQuote?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > maxChars;
  const display = isLong && !expanded ? text.slice(0, maxChars).replace(/\s+\S*$/, "") + "…" : text;

  if (isQuote) {
    return (
      <blockquote className="border-l-[3px] border-primary/30 pl-5 py-1">
        <p className="text-[15px] text-foreground/80 leading-relaxed italic break-words whitespace-pre-line">{display}</p>
        {isLong && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary font-medium mt-2 hover:underline">
            {expanded ? "Réduire" : "Lire la suite"}
          </button>
        )}
      </blockquote>
    );
  }

  return (
    <div>
      {label && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>}
      <p className="text-[15px] text-foreground/80 leading-relaxed break-words whitespace-pre-line">{display}</p>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary font-medium mt-1.5 hover:underline">
          {expanded ? "Réduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}

/* ── Empty state card ── */
function EmptySection({ message, linkLabel, link }: { message: string; linkLabel: string; link: string }) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      <button onClick={() => navigate(link)} className="text-sm font-semibold text-primary hover:underline">
        {linkLabel}
      </button>
    </div>
  );
}

/* ── Section separator — magazine editorial ── */
function SectionSep({ emoji, title }: { emoji?: string; title?: string }) {
  if (!title) return <div className="my-12" />;
  return (
    <div className="mt-16 mb-8 flex flex-col items-center text-center">
      {emoji && <span className="text-3xl mb-3">{emoji}</span>}
      <h2 className="font-display text-xs font-bold uppercase tracking-[0.25em] text-primary/70">{title}</h2>
      <div className="w-12 h-0.5 bg-primary/20 mt-3 rounded-full" />
    </div>
  );
}

/* ── Section card — clean container ── */
function SectionCard({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 sm:p-8 space-y-6" style={{ pageBreakInside: "avoid" }}>
      {children}
    </div>
  );
}

/* ── Light section ── */
function SectionLight({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5 py-2" style={{ pageBreakInside: "avoid" }}>
      {children}
    </div>
  );
}

/* ── Tag list — bigger, rose pale ── */
function Tags({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {items.map((item, i) => (
        <span key={i} className="text-sm font-medium px-4 py-2 rounded-full bg-rose-pale text-foreground border border-primary/10">
          {item}
        </span>
      ))}
    </div>
  );
}

/* ── Summary helpers ── */

function SummaryHookAndPoints({ hook, points }: { hook?: string | null; points?: string[] | null }) {
  if (!hook && (!points || points.length === 0)) return null;
  return (
    <div className="space-y-3">
      {hook && <p className="text-[15px] text-foreground font-medium leading-relaxed">{hook}</p>}
      {points && points.length > 0 && (
        <ul className="space-y-2">
          {points.map((p, i) => (
            <li key={i} className="text-sm text-foreground/80 flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-primary/40" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VoiceLayersSummary({ layers }: { layers?: Array<{name: string; summary: string}> | null }) {
  if (!layers || layers.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {layers.map((l, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="shrink-0 text-sm font-semibold text-primary/70 min-w-[140px]">{l.name}</span>
          <span className="text-sm text-foreground/70">{l.summary}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main component ── */

export default function BrandingSynthesisSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const { data: profileHookData } = useProfile();
  const { data: brandProfileHookData } = useBrandProfile();
  const navigate = useNavigate();
  const [data, setData] = useState<SynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [summaries, setSummaries] = useState<any>(null);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const uid = user.id;

    const [personaRes, storyRes, propRes, stratRes, offersRes, configRes, auditRes, brandingRaw] = await Promise.all([
      (supabase.from("persona") as any).select("*").eq(column, value).maybeSingle(),
      (supabase.from("storytelling") as any).select("*").eq(column, value).eq("is_primary", true).maybeSingle(),
      (supabase.from("brand_proposition") as any).select("*").eq(column, value).maybeSingle(),
      (supabase.from("brand_strategy") as any).select("*").eq(column, value).maybeSingle(),
      (supabase.from("offers") as any).select("*").eq(column, value).order("created_at"),
      (supabase.from("user_plan_config") as any).select("*").eq(column, value).maybeSingle(),
      (supabase.from("branding_audits") as any).select("*").eq(column, value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      fetchBrandingData({ column, value }),
    ]);

    const completion = calculateBrandingCompletion(brandingRaw);

    setData({
      brand: brandProfileHookData,
      persona: personaRes.data,
      storytelling: storyRes.data,
      proposition: propRes.data,
      strategy: stratRes.data,
      offers: offersRes.data || [],
      channels: (configRes.data?.channels as string[]) || [],
      planConfig: configRes.data,
      brandingAudit: auditRes.data,
      completion: completion.total,
      completionDetail: completion,
      userName: (profileHookData as any)?.first_name || (profileHookData as any)?.prenom || null,
      userActivity: (profileHookData as any)?.activity || (profileHookData as any)?.activite || null,
    });
    setLoading(false);
  };

  const loadSummaries = async () => {
    if (!user) return;
    setSummariesLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-branding-summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ force: false }),
        }
      );
      
      if (res.ok) {
        const json = await res.json();
        setSummaries(json.summaries);
      }
    } catch (e) {
      console.error("Failed to load branding summaries:", e);
    } finally {
      setSummariesLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadSummaries();
  }, [user?.id]);

  const handleCopy = () => {
    if (!sheetRef.current) return;
    navigator.clipboard.writeText(sheetRef.current.innerText);
    toast.success("Fiche copiée !");
  };

  const handleExportPdf = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      const COLOR_TITLE = brand?.visual_style ? "#E91E8C" : "#E91E8C";
      const COLOR_SUBTITLE = "#1A1A2E";
      const COLOR_BODY = "#333333";
      const footerText = "Généré avec L'Assistant Com' · nowadays.agency";
      const dateStr = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

      const addFooter = () => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`${footerText} · ${dateStr}`, pageW / 2, pageH - 8, { align: "center" });
      };

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 18) {
          addFooter();
          pdf.addPage();
          y = margin;
        }
      };

      const addSectionTitle = (title: string) => {
        checkPage(14);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.setTextColor(COLOR_TITLE);
        pdf.text(title, margin, y);
        y += 3;
        pdf.setDrawColor(COLOR_TITLE);
        pdf.setLineWidth(0.5);
        pdf.line(margin, y, margin + 40, y);
        y += 8;
      };

      const addSubtitle = (text: string) => {
        checkPage(10);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(COLOR_SUBTITLE);
        pdf.text(text, margin, y);
        y += 6;
      };

      const addBody = (text: string) => {
        if (!text) return;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(COLOR_BODY);
        const lines = pdf.splitTextToSize(text, contentW);
        for (const line of lines) {
          checkPage(5);
          pdf.text(line, margin, y);
          y += 4.5;
        }
        y += 2;
      };

      const addBullet = (label: string, value: string) => {
        if (!value) return;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(COLOR_SUBTITLE);
        checkPage(5);
        const labelW = pdf.getTextWidth(label + " : ");
        pdf.text(label + " : ", margin + 2, y);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(COLOR_BODY);
        const remaining = contentW - labelW - 4;
        const valLines = pdf.splitTextToSize(value, remaining > 30 ? remaining : contentW);
        if (remaining > 30) {
          pdf.text(valLines[0], margin + 2 + labelW, y);
          y += 4.5;
          for (let i = 1; i < valLines.length; i++) {
            checkPage(5);
            pdf.text(valLines[i], margin + 4, y);
            y += 4.5;
          }
        } else {
          y += 4.5;
          for (const vl of valLines) {
            checkPage(5);
            pdf.text(vl, margin + 4, y);
            y += 4.5;
          }
        }
      };

      // ══════════ PAGE 1: HEADER ══════════
      y = 40;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(28);
      pdf.setTextColor(COLOR_TITLE);
      const headerName = userName || "Mon Branding";
      pdf.text(headerName, pageW / 2, y, { align: "center" });
      y += 10;

      if (userActivity) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(COLOR_SUBTITLE);
        pdf.text(userActivity, pageW / 2, y, { align: "center" });
        y += 8;
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Synthèse Branding · ${dateStr}`, pageW / 2, y, { align: "center" });
      y += 5;
      pdf.setDrawColor(COLOR_TITLE);
      pdf.setLineWidth(0.3);
      pdf.line(pageW / 2 - 25, y, pageW / 2 + 25, y);
      y += 15;

      // ══════════ L'ESSENTIEL ══════════
      addSectionTitle("L'essentiel");
      const pitch = proposition?.version_pitch_naturel || proposition?.version_final || proposition?.version_one_liner;
      if (pitch) { addSubtitle("Pitch"); addBody(pitch); }
      if (brand?.mission) { addBullet("Mission", brand.mission); }
      if (brand?.positioning) { addBullet("Positionnement", brand.positioning); }
      if (proposition?.version_one_liner && pitch !== proposition.version_one_liner) {
        addBullet("One-liner", proposition.version_one_liner);
      }
      y += 4;

      // ══════════ MA CLIENTE IDÉALE ══════════
      if (persona) {
        addSectionTitle("Ma cliente idéale");
        const p = safeParseJson(persona.portrait);
        if (p?.portrait_prenom) addBullet("Prénom", p.portrait_prenom);
        if (persona.step_1_frustrations) addBullet("Frustrations", persona.step_1_frustrations);
        if (persona.step_2_transformation) addBullet("Transformation", persona.step_2_transformation);
        if (persona.step_3a_objections) addBullet("Objections", persona.step_3a_objections);
        y += 4;
      }

      // ══════════ MA VOIX ══════════
      if (brand) {
        addSectionTitle("Ma voix & mes combats");
        if (brand.voice_description) addBullet("Voix", brand.voice_description);
        const reg = [brand.tone_register, brand.tone_level, brand.tone_style].filter(Boolean).join(" · ");
        if (reg) addBullet("Registre", reg);
        if (brand.tone_humor) addBullet("Humour", brand.tone_humor);
        if (brand.key_expressions) addBullet("Expressions clés", brand.key_expressions);
        if (brand.things_to_avoid) addBullet("À éviter", brand.things_to_avoid);
        if (brand.combat_cause) addBullet("Cause", brand.combat_cause);
        if (brand.combat_refusals) addBullet("Refus", brand.combat_refusals);
        y += 4;
      }

      // ══════════ MA STRATÉGIE ══════════
      if (strategy) {
        addSectionTitle("Ma stratégie de contenu");
        if (strategy.pillar_major) addBullet("Pilier majeur", strategy.pillar_major);
        const minors = [strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3].filter(Boolean);
        if (minors.length) addBullet("Piliers secondaires", minors.join(", "));
        if (strategy.creative_concept) addBullet("Concept créatif", strategy.creative_concept);
        const facets = [strategy.facet_1, strategy.facet_2, strategy.facet_3].filter(Boolean);
        if (facets.length) addBullet("Facettes", facets.join(", "));
        y += 4;
      }

      // ══════════ MES OFFRES ══════════
      if (offers && offers.length > 0) {
        addSectionTitle("Mes offres");
        for (const offer of offers) {
          checkPage(18);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.setTextColor(COLOR_SUBTITLE);
          const typeLabel = offer.offer_type === "paid" ? "💎 Payante" : offer.offer_type === "free" ? "🎁 Gratuite" : "🎤 Service";
          pdf.text(`${offer.name || "Sans nom"} (${typeLabel})`, margin, y);
          y += 5;
          if (offer.price_text) addBullet("Prix", offer.price_text);
          if (offer.promise) addBullet("Promesse", offer.promise);
          if (offer.target_ideal) addBullet("Pour qui", offer.target_ideal);
          y += 3;
        }
      }

      addFooter();
      pdf.save(`synthese-branding-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF téléchargé !");
    } catch (e) {
      console.error("PDF export error:", e);
      toast.error("Erreur lors de l'export PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;
  const { brand, persona, storytelling, proposition, strategy, offers, channels, planConfig, brandingAudit, completion, completionDetail, userName, userActivity } = data;
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const portrait = safeParseJson(persona?.portrait);

  const allChannels = [
    { id: "instagram", label: "Instagram", emoji: "📱" },
    { id: "linkedin", label: "LinkedIn", emoji: "💼" },
    { id: "newsletter", label: "Newsletter", emoji: "📧" },
    { id: "pinterest", label: "Pinterest", emoji: "📌" },
    { id: "site", label: "Site web", emoji: "🌐" },
    { id: "seo", label: "SEO", emoji: "🔍" },
  ];

  const missingParts: string[] = [];
  if (completionDetail.storytelling === 0) missingParts.push("ton histoire");
  if (completionDetail.persona === 0) missingParts.push("ta cible");
  if (completionDetail.proposition === 0) missingParts.push("ta proposition de valeur");
  if (completionDetail.tone === 0) missingParts.push("ton ton & tes combats");
  if (completionDetail.strategy === 0) missingParts.push("ta ligne éditoriale");

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setSummariesLoading(true);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                const res = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-branding-summary`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ force: true }),
                  }
                );
                if (res.ok) {
                  const json = await res.json();
                  setSummaries(json.summaries);
                  toast.success("Résumés régénérés !");
                }
              } catch {
                toast.error("Erreur lors de la régénération");
              } finally {
                setSummariesLoading(false);
              }
            }}
            disabled={summariesLoading}
            className="gap-1.5 text-xs"
          >
            {summariesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {summariesLoading ? "Synthèse..." : "Synthétiser IA"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" /> Copier
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting} className="gap-1.5 text-xs">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={sharing}
            className="gap-1.5 text-xs"
            onClick={async () => {
              if (!user) return;
              setSharing(true);
              try {
                // Check for existing active link
                const { data: existing } = await (supabase
                  .from("shared_branding_links") as any)
                  .select("token")
                  .eq(column, value)
                  .eq("is_active", true)
                  .gte("expires_at", new Date().toISOString())
                  .limit(1) as any;
                
                let token: string;
                if (existing && existing.length > 0) {
                  token = existing[0].token;
                } else {
                  const { data: newLink, error } = await supabase
                    .from("shared_branding_links")
                    .insert({ user_id: user.id } as any)
                    .select("token")
                    .single() as any;
                  if (error) throw error;
                  token = newLink.token;
                }
                const url = `${window.location.origin}/share/branding/${token}`;
                await navigator.clipboard.writeText(url);
                toast.success("Lien copié ! Valide 30 jours.");
              } catch (e) {
                console.error("Share error:", e);
                toast.error("Erreur lors de la création du lien");
              } finally {
                setSharing(false);
              }
            }}
          >
            {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Partager
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Sheet content */}
      <div ref={sheetRef} className="bg-card border border-border rounded-2xl space-y-0 max-w-full overflow-hidden" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>

        {/* ═══ HEADER — Magazine cover ═══ */}
        <div className="relative p-8 sm:p-12 md:p-16 rounded-t-2xl overflow-hidden" style={{ background: "linear-gradient(160deg, #FFF4F8 0%, #FFE561 30%, #ffa7c6 60%, #FFF4F8 100%)", opacity: 0.97 }}>
          <div className="absolute inset-0 bg-white/60" />
          <div className="relative z-10 text-center max-w-lg mx-auto">
            {userName && (
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-foreground leading-tight tracking-tight">
                {userName}
              </h1>
            )}
            {userActivity && (
              <p className="text-base sm:text-lg text-foreground/60 mt-2 font-body">{userActivity}</p>
            )}
            <div className="w-10 h-0.5 bg-primary mx-auto mt-6 mb-6 rounded-full" />
            <p className="font-display text-sm uppercase tracking-[0.2em] text-primary/80 font-semibold">Ma stratégie de communication</p>
            <p className="text-xs text-muted-foreground mt-2">Généré le {today}</p>

            {/* Score bar */}
            <div className="mt-8 bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Complétion branding</span>
                <span className="text-sm font-bold text-primary">{completion}%</span>
              </div>
              <Progress value={completion} className="h-2" />
              {missingParts.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Manque : {missingParts.join(", ")}.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 md:p-10 pt-0 sm:pt-0 md:pt-0 space-y-0">

        {/* ═══ POSITIONNEMENT ═══ */}
        <SectionSep emoji="🎯" title="Mon positionnement" />

        {proposition?.version_final || proposition?.version_one_liner || brand?.mission ? (
          <div className="space-y-8">
            {/* Hero quote : big and centered */}
            {(proposition?.version_final || proposition?.version_one_liner) && (
              <div className="text-center py-4 sm:py-6 px-4">
                <p className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground leading-snug max-w-2xl mx-auto">
                  "{proposition.version_final || proposition.version_one_liner}"
                </p>
              </div>
            )}

            {/* Mission + What makes unique : 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              {brand?.mission && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">Ma mission</p>
                  <CollapsibleText text={brand.mission} maxChars={200} />
                </div>
              )}
              {proposition?.step_2b_values && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">Ce qui me rend unique</p>
                  {summaries?.unique_hook ? (
                    <SummaryHookAndPoints hook={summaries.unique_hook} points={summaries.unique_points} />
                  ) : (
                    <CollapsibleText text={proposition.step_2b_values} maxChars={180} />
                  )}
                </div>
              )}
            </div>

            {/* Values as tags : use tone_keywords (short tags) instead of voice_description (long paragraphs) */}
            {(brand?.tone_keywords || brand?.values) && (() => {
              const rawValues = brand.tone_keywords || brand.values;
              const valuesList = Array.isArray(rawValues)
                ? rawValues.filter(Boolean).map(String)
                : typeof rawValues === "string"
                  ? rawValues.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean)
                  : [];
              if (valuesList.length === 0) return null;
              return (
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Mes valeurs</p>
                  <div className="flex flex-wrap justify-center gap-2.5">
                    {valuesList.slice(0, 8).map((v: string, i: number) => (
                      <span key={i} className="text-sm font-medium px-4 py-2 rounded-full bg-rose-pale text-foreground border border-primary/10">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <EmptySection message="Tu n'as pas encore défini ton positionnement." linkLabel="Définir mon positionnement →" link="/branding/proposition" />
        )}

        {/* ═══ LEVEL 2 — MA CIBLE (card) ═══ */}
        <SectionSep emoji="👤" title="Ma cible" />

        {portrait ? (
          <SectionCard emoji="👤" title="Ma cible">
            {/* Portrait header */}
            <div>
              <p className="text-base font-semibold text-foreground">
                {persona?.portrait_prenom || portrait.prenom || "Ma cliente idéale"}
                {portrait.qui_elle_est?.age && `, ${portrait.qui_elle_est.age}`}
              </p>
              {portrait.qui_elle_est?.metier && (
                <p className="text-sm text-muted-foreground">{portrait.qui_elle_est.metier}</p>
              )}
              {portrait.qui_elle_est?.situation && (
                <p className="text-sm text-muted-foreground">{portrait.qui_elle_est.situation}</p>
              )}
              {portrait.qui_elle_est?.ca && (
                <p className="text-sm text-muted-foreground">CA : {portrait.qui_elle_est.ca}</p>
              )}
            </div>

            {/* Desires */}
            {portrait.objectifs?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Ce qu'elle veut</p>
                <ul className="space-y-1">
                  {portrait.objectifs.map((o: string, i: number) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="shrink-0">✨</span> <span className="break-words">{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Main blocker */}
            {portrait.blocages?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Son blocage principal</p>
                <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-4 py-3">
                  <p className="text-sm text-foreground italic break-words">"{portrait.blocages[0]}"</p>
                </div>
              </div>
            )}

            {/* Signature phrase */}
            {portrait.ses_mots?.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1.5">Sa phrase signature</p>
                <div className="rounded-lg bg-muted/30 border-l-2 border-primary/30 px-4 py-3">
                  <p className="text-sm text-foreground italic flex items-start gap-2 break-words">
                    <span className="shrink-0">💬</span>
                    "{portrait.ses_mots[0]}"
                  </p>
                </div>
              </div>
            )}
          </SectionCard>
        ) : persona ? (
          <SectionCard emoji="👤" title="Ma cible">
            {persona.step_1_frustrations && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Ses frustrations</p>
                <CollapsibleText text={persona.step_1_frustrations} />
              </div>
            )}
            {persona.step_2_transformation && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Sa transformation souhaitée</p>
                <CollapsibleText text={persona.step_2_transformation} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Certaines infos manquent. <span className="text-primary cursor-pointer" onClick={() => navigate("/branding/persona")}>Compléter →</span></p>
          </SectionCard>
        ) : (
          <>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2 uppercase tracking-wide mb-4">
              <span>👤</span> Ma cible
            </h3>
            <EmptySection
              message="Tu n'as pas encore défini ta cible."
              linkLabel="Définir ma cible →"
              link="/branding/persona"
            />
          </>
        )}

        {/* ═══ MON TON & MES COMBATS ═══ */}
        <SectionSep emoji="🗣️" title="Ma voix & mes combats" />

        {brand && (brand.tone_register || brand.tone_style || brand.combat_cause) ? (
          <div className="space-y-10">

            {/* Tone tags : centered, big */}
            <div className="text-center">
              <Tags items={[brand.tone_register, brand.tone_style, brand.tone_level, brand.tone_humor, brand.tone_engagement].filter(Boolean)} />
            </div>

            {/* Voice: IA layers OR short fallback */}
            {brand.voice_description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-4">Les couches de ma voix</p>
                {summaries?.voice_layers && summaries.voice_layers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    {summaries.voice_layers.map((l: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-primary/40" />
                        <p className="text-sm text-foreground/80"><span className="font-semibold text-foreground">{l.name}</span> : {l.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <CollapsibleText text={brand.voice_description} maxChars={200} isQuote />
                )}
              </div>
            )}

            {/* Things to avoid */}
            {brand.things_to_avoid && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3">Ce que je fuis</p>
                <div className="flex flex-wrap gap-2">
                  {parseStringList(brand.things_to_avoid).map((item, i) => (
                    <span key={i} className="text-xs bg-muted/50 text-muted-foreground rounded-full px-3 py-1.5 border border-border/50">
                      ✕ {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Combats : dedicated card */}
            {(brand.combat_cause || brand.combat_fights) && (
              <div className="rounded-2xl bg-gradient-to-br from-rose-pale/60 to-card border border-primary/10 p-6 sm:p-8 space-y-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">Mes combats</p>
                {summaries?.combats_hook ? (
                  <>
                    <SummaryHookAndPoints hook={summaries.combats_hook} points={summaries.combats_points} />
                    {summaries.combats_alternative && (
                      <div className="pt-4 border-t border-primary/10">
                        <p className="text-xs text-muted-foreground mb-1">Mon alternative</p>
                        <p className="text-[15px] text-foreground/80 leading-relaxed">{summaries.combats_alternative}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    {brand.combat_cause && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">La cause</p>
                        <CollapsibleText text={brand.combat_cause} maxChars={200} />
                      </div>
                    )}
                    {brand.combat_fights && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Ce contre quoi je me bats</p>
                        <CollapsibleText text={brand.combat_fights} maxChars={150} />
                      </div>
                    )}
                    {brand.combat_alternative && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Mon alternative</p>
                        <CollapsibleText text={brand.combat_alternative} maxChars={150} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Key expressions */}
            {(summaries?.expressions_key?.length > 0 || brand.key_expressions) && (
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Mes expressions clés</p>
                <Tags items={(summaries?.expressions_key || parseStringList(brand.key_expressions)).slice(0, 10)} />
              </div>
            )}
          </div>
        ) : (
          <EmptySection message="Tu n'as pas encore défini ton ton et tes combats." linkLabel="Définir mon ton →" link="/branding/ton" />
        )}

        {/* ═══ MON HISTOIRE ═══ */}
        <SectionSep emoji="📖" title="Mon histoire" />

        {storytelling ? (
          <div className="space-y-6">
            {/* Short pitch */}
            {storytelling.pitch_short && (
              <blockquote className="text-center py-2">
                <p className="text-lg sm:text-xl font-display italic text-foreground/80 leading-relaxed max-w-2xl mx-auto">
                  "{storytelling.pitch_short}"
                </p>
              </blockquote>
            )}

            {/* Timeline: before → trigger → after */}
            {storytelling.recap_summary && (() => {
              const sr = storytelling.recap_summary as any;
              if (!sr.before && !sr.trigger && !sr.after) return null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sr.before && (
                    <div className="rounded-xl bg-muted/20 p-5 border border-border/40 text-center space-y-2">
                      <span className="text-2xl block">🔵</span>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avant</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{sr.before}</p>
                    </div>
                  )}
                  {sr.trigger && (
                    <div className="rounded-xl bg-rose-pale/60 p-5 border border-primary/10 text-center space-y-2">
                      <span className="text-2xl block">💥</span>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">Le déclic</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{sr.trigger}</p>
                    </div>
                  )}
                  {sr.after && (
                    <div className="rounded-xl bg-muted/20 p-5 border border-border/40 text-center space-y-2">
                      <span className="text-2xl block">🌱</span>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Après</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{sr.after}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Full story collapsed */}
            {!storytelling.pitch_short && (storytelling.step_7_polished || storytelling.step_6_full_story) && (
              <CollapsibleText text={storytelling.step_7_polished || storytelling.step_6_full_story} maxChars={200} />
            )}
          </div>
        ) : (
          <EmptySection message="Tu n'as pas encore écrit ton histoire." linkLabel="Écrire mon histoire →" link="/branding/storytelling" />
        )}

        {/* ═══ MES OFFRES ═══ */}
        <SectionSep emoji="🎁" title="Mes offres" />

        {offers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {offers.map((o) => {
              const offerSummary = summaries?.offers_summaries?.find((s: any) => s.name === o.name);
              return (
                <div key={o.id} className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 space-y-3" style={{ pageBreakInside: "avoid" }}>
                  <div>
                    <h4 className="font-display text-base font-bold text-foreground">{o.name || "Sans nom"}</h4>
                    {o.price_text && <p className="text-sm text-primary font-medium mt-0.5">{o.price_text}</p>}
                  </div>
                  {offerSummary?.one_liner ? (
                    <p className="text-sm text-foreground/80 font-medium leading-relaxed">{offerSummary.one_liner}</p>
                  ) : o.description_short ? (
                    <p className="text-sm text-foreground/70 leading-relaxed break-words">{o.description_short.length > 120 ? o.description_short.slice(0, 120).replace(/\s+\S*$/, "") + "…" : o.description_short}</p>
                  ) : null}
                  {o.promise && (
                    <blockquote className="border-l-[3px] border-primary/30 pl-4 py-1">
                      <p className="text-sm text-foreground/70 italic break-words">"{o.promise}"</p>
                    </blockquote>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptySection message="Tu n'as pas encore défini tes offres." linkLabel="Créer mes offres →" link="/branding/offres" />
        )}

        {/* ═══ MA LIGNE ÉDITORIALE ═══ */}
        <SectionSep emoji="📝" title="Ma ligne éditoriale" />

        {strategy ? (
          <div className="space-y-8">
            {/* Pillars as big tags */}
            {(strategy.pillar_major || strategy.pillar_minor_1) && (
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Mes piliers de contenu</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {[strategy.pillar_major, strategy.pillar_minor_1, strategy.pillar_minor_2, strategy.pillar_minor_3].filter(Boolean).map((pillar, i) => (
                    <span key={i} className="text-sm font-semibold px-5 py-2.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {pillar}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Content mix + Creative concept — 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Content mix */}
              {strategy.recap_summary && (() => {
                const recap = strategy.recap_summary as any;
                if (!recap?.content_mix) return null;
                const mix = recap.content_mix;
                return (
                  <div className="rounded-xl bg-muted/10 border border-border/40 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Mon mix contenu</p>
                    <div className="space-y-3">
                      {mix.visibility != null && (
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-foreground/70">Visibilité</span>
                            <span className="font-medium">{Math.round((mix.visibility / 10) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                            <div className="h-full bg-[hsl(var(--obj-visibilite))] rounded-full" style={{ width: `${(mix.visibility / 10) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      {mix.trust != null && (
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-foreground/70">Confiance</span>
                            <span className="font-medium">{Math.round((mix.trust / 10) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                            <div className="h-full bg-[hsl(var(--obj-confiance))] rounded-full" style={{ width: `${(mix.trust / 10) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      {mix.sales != null && (
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-foreground/70">Vente</span>
                            <span className="font-medium">{Math.round((mix.sales / 10) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                            <div className="h-full bg-[hsl(var(--obj-vente))] rounded-full" style={{ width: `${(mix.sales / 10) * 100}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Creative concept */}
              {strategy.creative_concept && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3">Mon twist créatif</p>
                  <CollapsibleText text={strategy.creative_concept} maxChars={250} isQuote />
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptySection message="Tu n'as pas encore défini ta ligne éditoriale." linkLabel="Créer ma ligne →" link="/branding/strategie" />
        )}

        {/* ═══ LEVEL 3 — MES CANAUX (light) ═══ */}
        <SectionSep emoji="📱" title="Mes canaux" />
        <SectionLight emoji="📱" title="Mes canaux">
          <div className="flex flex-wrap gap-2">
            {allChannels.map((ch) => {
              const active = channels.includes(ch.id);
              return (
                <span
                  key={ch.id}
                  className={`text-sm px-3 py-1.5 rounded-full ${
                    active
                      ? "bg-rose-pale text-foreground font-medium"
                      : "bg-muted/40 text-muted-foreground/50"
                  }`}
                >
                  {active ? "✅" : "🔜"} {ch.label}
                </span>
              );
            })}
          </div>

          {planConfig && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {planConfig.daily_time && (
                <span>⏰ Temps dispo : {planConfig.daily_time < 60 ? `${planConfig.daily_time} min/jour` : `${Math.round(planConfig.daily_time / 60)}h/semaine`}</span>
              )}
              {planConfig.monthly_goal && (
                <span>🎯 Objectif : {planConfig.monthly_goal}</span>
              )}
            </div>
          )}
        </SectionLight>

        {/* ═══ LEVEL 3 — MON DERNIER AUDIT (light) ═══ */}
        <SectionSep emoji="🔍" title="Mon dernier audit" />

        {brandingAudit ? (
          <SectionLight emoji="🔍" title="Mon dernier audit">
            {brandingAudit.score_global != null && (
              <div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-bold text-foreground">{brandingAudit.score_global}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                <Progress
                  value={brandingAudit.score_global}
                  className={`h-3 ${
                    brandingAudit.score_global >= 75 ? "[&>div]:bg-[hsl(var(--obj-vente))]" :
                    brandingAudit.score_global >= 50 ? "[&>div]:bg-[hsl(var(--obj-confiance))]" :
                    "[&>div]:bg-destructive"
                  }`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(brandingAudit.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            )}

            {brandingAudit.plan_action && (() => {
              const actions = Array.isArray(brandingAudit.plan_action) ? brandingAudit.plan_action.slice(0, 3) : [];
              if (actions.length === 0) return null;
              return (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1.5">Top recommandations :</p>
                  <ol className="space-y-1">
                    {actions.map((a: any, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="font-semibold text-foreground shrink-0">{i + 1}.</span>
                        <span className="break-words">{a.action || a}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}

            <button
              onClick={() => navigate(`/branding/audit/${brandingAudit.id}`)}
              className="text-sm text-primary font-medium hover:underline inline-flex items-center gap-1"
            >
              Voir l'audit complet <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </SectionLight>
        ) : (
          <SectionLight emoji="🔍" title="Mon dernier audit">
            <EmptySection
              message="Tu n'as pas encore fait ton audit."
              linkLabel="Lancer un audit →"
              link="/branding/audit"
            />
          </SectionLight>
        )}

        {/* ═══ FOOTER ACTIONS ═══ */}
        <SectionSep />
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center pt-2">
          <Button variant="outline" size="sm" className="gap-2 text-sm" onClick={() => { onClose(); navigate("/branding"); }}>
            <Pencil className="h-3.5 w-3.5" /> Modifier le branding
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-sm" onClick={() => { onClose(); navigate("/branding/voice-guide"); }}>
            🎤 Voir mon guide de voix
          </Button>
        </div>
        </div>{/* end inner padding wrapper */}
      </div>{/* end sheetRef */}
    </div>
  );
}
