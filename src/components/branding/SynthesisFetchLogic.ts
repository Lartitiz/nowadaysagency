import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceFilter, useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { calculateBrandingCompletion, fetchBrandingData } from "@/lib/branding-completion";
import { toast } from "sonner";

export interface SynthesisData {
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

export function useSynthesisFetch() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const { data: profileHookData } = useProfile();
  const { data: brandProfileHookData } = useBrandProfile();

  const [data, setData] = useState<SynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [summaries, setSummaries] = useState<any>(null);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [personaRes, storyRes, propRes, stratRes, offersRes, configRes, auditRes, brandingRaw] = await Promise.all([
      (supabase.from("persona") as any).select("*").eq(column, value).order("is_primary", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
  }, [user, column, value, brandProfileHookData, profileHookData]);

  const loadSummaries = useCallback(async () => {
    if (!user) return;
    setSummariesLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("generate-branding-summary", {
        body: { force: false },
      }, 90000);
      if (!error && data) {
        setSummaries(data.summaries);
      }
    } catch (e) {
      console.error("Failed to load branding summaries:", e);
    } finally {
      setSummariesLoading(false);
    }
  }, [user]);

  const regenerateSummaries = useCallback(async () => {
    setSummariesLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("generate-branding-summary", {
        body: { force: true },
      }, 90000);
      if (!error && data) {
        setSummaries(data.summaries);
        toast.success("Résumés régénérés !");
      }
    } catch {
      toast.error("Erreur lors de la régénération");
    } finally {
      setSummariesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadSummaries();
  }, [user?.id]);

  const handleCopy = useCallback(() => {
    if (!sheetRef.current) return;
    navigator.clipboard.writeText(sheetRef.current.innerText);
    toast.success("Fiche copiée !");
  }, []);

  const handleShare = useCallback(async () => {
    if (!user) return;
    setSharing(true);
    try {
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
          .insert({ user_id: profileUserId, workspace_id: workspaceId !== profileUserId ? workspaceId : undefined } as any)
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
  }, [user, column, value, profileUserId, workspaceId]);

  const handleExportPdf = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    const { brand, persona, storytelling, proposition, strategy, offers, userName, userActivity } = data;
    try {
      const jsPDF = (await import("jspdf")).default;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      const COLOR_TITLE = "#E91E8C";
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
        if (y + needed > pageH - 18) { addFooter(); pdf.addPage(); y = margin; }
      };

      const addSectionTitle = (title: string) => {
        checkPage(14);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.setTextColor(COLOR_TITLE);
        pdf.text(title, margin, y); y += 3;
        pdf.setDrawColor(COLOR_TITLE); pdf.setLineWidth(0.5); pdf.line(margin, y, margin + 40, y); y += 8;
      };

      const addSubtitle = (text: string) => {
        checkPage(10);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(COLOR_SUBTITLE);
        pdf.text(text, margin, y); y += 6;
      };

      const addBody = (text: string) => {
        if (!text) return;
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(COLOR_BODY);
        const lines = pdf.splitTextToSize(text, contentW);
        for (const line of lines) { checkPage(5); pdf.text(line, margin, y); y += 4.5; }
        y += 2;
      };

      const addBullet = (label: string, val: string) => {
        if (!val) return;
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(COLOR_SUBTITLE);
        checkPage(5);
        const labelW2 = pdf.getTextWidth(label + " : ");
        pdf.text(label + " : ", margin + 2, y);
        pdf.setFont("helvetica", "normal"); pdf.setTextColor(COLOR_BODY);
        const remaining = contentW - labelW2 - 4;
        const valLines = pdf.splitTextToSize(val, remaining > 30 ? remaining : contentW);
        if (remaining > 30) {
          pdf.text(valLines[0], margin + 2 + labelW2, y); y += 4.5;
          for (let i = 1; i < valLines.length; i++) { checkPage(5); pdf.text(valLines[i], margin + 4, y); y += 4.5; }
        } else {
          y += 4.5;
          for (const vl of valLines) { checkPage(5); pdf.text(vl, margin + 4, y); y += 4.5; }
        }
      };

      // PAGE 1: HEADER
      y = 40;
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(28); pdf.setTextColor(COLOR_TITLE);
      pdf.text(userName || "Mon identité", pageW / 2, y, { align: "center" }); y += 10;
      if (userActivity) {
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(12); pdf.setTextColor(COLOR_SUBTITLE);
        pdf.text(userActivity, pageW / 2, y, { align: "center" }); y += 8;
      }
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(150, 150, 150);
      pdf.text(`Synthèse Branding · ${dateStr}`, pageW / 2, y, { align: "center" }); y += 5;
      pdf.setDrawColor(COLOR_TITLE); pdf.setLineWidth(0.3);
      pdf.line(pageW / 2 - 25, y, pageW / 2 + 25, y); y += 15;

      // L'ESSENTIEL
      addSectionTitle("L'essentiel");
      const pitch = proposition?.version_pitch_naturel || proposition?.version_final || proposition?.version_one_liner;
      if (pitch) { addSubtitle("Pitch"); addBody(pitch); }
      if (brand?.mission) addBullet("Mission", brand.mission);
      if (brand?.positioning) addBullet("Positionnement", brand.positioning);
      if (proposition?.version_one_liner && pitch !== proposition.version_one_liner) addBullet("One-liner", proposition.version_one_liner);
      y += 4;

      // MA CLIENTE IDÉALE
      if (persona) {
        const { safeParseJson } = await import("@/lib/branding-utils");
        const p = safeParseJson(persona.portrait);
        addSectionTitle("Ma cliente idéale");
        if (p?.portrait_prenom) addBullet("Prénom", p.portrait_prenom);
        if (persona.step_1_frustrations) addBullet("Frustrations", persona.step_1_frustrations);
        if (persona.step_2_transformation) addBullet("Transformation", persona.step_2_transformation);
        if (persona.step_3a_objections) addBullet("Objections", persona.step_3a_objections);
        y += 4;
      }

      // MA VOIX
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

      // MA STRATÉGIE
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

      // MES OFFRES
      if (offers && offers.length > 0) {
        addSectionTitle("Mes offres");
        for (const offer of offers) {
          checkPage(18);
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(COLOR_SUBTITLE);
          const typeLabel = offer.offer_type === "paid" ? "💎 Payante" : offer.offer_type === "free" ? "🎁 Gratuite" : "🎤 Service";
          pdf.text(`${offer.name || "Sans nom"} (${typeLabel})`, margin, y); y += 5;
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
  }, [data]);

  return {
    data,
    loading,
    exporting,
    sharing,
    summaries,
    summariesLoading,
    sheetRef,
    loadData,
    regenerateSummaries,
    handleCopy,
    handleShare,
    handleExportPdf,
  };
}
