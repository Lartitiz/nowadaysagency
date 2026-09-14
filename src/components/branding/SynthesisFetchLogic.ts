import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceFilter, useProfileOwner, useWorkspaceReady } from "@/hooks/use-workspace-query";
import { useProfile, useBrandProfile } from "@/hooks/use-profile";
import { calculateBrandingCompletion, fetchBrandingDataWithStatus } from "@/lib/branding-completion";
import { toast } from "sonner";

export interface SynthesisData {
  brand: any;
  persona: any;
  personas: any[];
  stories: any[];
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
  const ready = useWorkspaceReady();
  const profileOwner = useProfileOwner();
  const profileUserId = profileOwner.userId;
  const { data: profileHookData, isLoading: profileLoading, error: profileError } = useProfile();
  const { data: brandProfileHookData, isLoading: brandLoading, error: brandError } = useBrandProfile();

  const [data, setData] = useState<SynthesisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const sequence = useRef(0);
  const scope = `${user?.id}:${column}:${value}`;
  const summarySequence = useRef(0);
  const activeScope = useRef(scope);
  if (activeScope.current !== scope) { activeScope.current = scope; sequence.current++; summarySequence.current++; }
  const [dataScope, setDataScope] = useState("");
  const [summaries, setSummaries] = useState<any>(null);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    const request = ++sequence.current;
    setData(null); setLoadError("");
    if (profileOwner.error) { setLoadError("Impossible de retrouver le propriétaire de cet espace. Réessaie."); setLoading(false); return; }
    if (!user || !ready || !profileUserId || profileLoading || brandLoading) { setLoading(true); return; }
    setLoading(true);
    try {
    if (profileError || brandError) throw profileError || brandError;
    const scoped = (table: string) => {
      const q = (supabase.from(table as any) as any).select("*").eq(column, value);
      return column === "user_id" ? q.is("workspace_id", null) : q;
    };

    const [personaRes, storyRes, propRes, stratRes, offersRes, configRes, auditRes, brandingRaw] = await Promise.all([
      scoped("persona").order("created_at"),
      scoped("storytelling").eq("is_primary", true).order("created_at"),
      scoped("brand_proposition").maybeSingle(),
      scoped("brand_strategy").maybeSingle(),
      scoped("offers").order("created_at"),
      scoped("user_plan_config").maybeSingle(),
      scoped("branding_audits").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      fetchBrandingDataWithStatus({ column, value }),
    ]);

    if (brandingRaw.error) throw brandingRaw.error;
    if ([personaRes, storyRes, propRes, stratRes, offersRes, configRes, auditRes].some(r => r.error)) throw Error("Lecture incomplète");
    if (request !== sequence.current) return;
    const completion = calculateBrandingCompletion(brandingRaw.data);
    const primary = personaRes.data.filter((p: any) => p.is_primary);
    setDataScope(scope);

    setData({
      brand: brandProfileHookData,
      persona: primary.length === 1 ? primary[0] : personaRes.data.length === 1 ? personaRes.data[0] : null,
      personas: personaRes.data,
      stories: storyRes.data,
      storytelling: storyRes.data.length === 1 ? storyRes.data[0] : null,
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
    } catch { if (request === sequence.current) setLoadError("Impossible de charger toute la synthèse. Réessaie."); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [user?.id, column, value, brandProfileHookData, profileHookData, profileLoading, brandLoading, profileError, brandError, ready, profileUserId, profileOwner.error, scope]);

  const loadSummaries = useCallback(async () => {
    if (profileOwner.error) { setLoadError("Impossible de retrouver le propriétaire de cet espace. Réessaie."); setLoading(false); return; }
    if (!user || !ready || !profileUserId) return;
    const request = ++summarySequence.current;
    setSummariesLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("generate-branding-summary", {
        body: { force: false, workspace_id: column === "workspace_id" ? value : undefined },
      }, 90000);
      if (!error && data && summarySequence.current === request) {
        setSummaries(data.summaries);
      }
    } catch (e) {
      console.error("Failed to load branding summaries:", e);
    } finally {
      if (summarySequence.current === request) setSummariesLoading(false);
    }
  }, [user?.id, column, value, ready, profileUserId, profileOwner.error]);

  const regenerateSummaries = useCallback(async () => {
    const request = ++summarySequence.current;
    setSummariesLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("generate-branding-summary", {
        body: { force: true, workspace_id: column === "workspace_id" ? value : undefined },
      }, 90000);
      if (!error && data && summarySequence.current === request) {
        setSummaries(data.summaries);
        toast.success("Résumés régénérés !");
      }
    } catch {
      toast.error("Erreur lors de la régénération");
    } finally {
      if (summarySequence.current === request) setSummariesLoading(false);
    }
  }, [column, value]);

  useEffect(() => { loadData(); return () => { sequence.current++; }; }, [loadData]);
  useEffect(() => { setSummaries(null); setShareOpen(false); loadSummaries(); return () => { summarySequence.current++; }; }, [loadSummaries]);

  const handleCopy = useCallback(() => {
    if (!sheetRef.current) return;
    navigator.clipboard.writeText(sheetRef.current.innerText);
    toast.success("Fiche copiée !");
  }, []);

  const handleShare = useCallback(() => setShareOpen(true), []);
  const selectPersona = (id: string) => setData(current => current ? { ...current, persona: current.personas.find(p => p.id === id) || null } : current);
  const selectStory = (id: string) => setData(current => current ? { ...current, storytelling: current.stories.find(s => s.id === id) || null } : current);

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
      // Positionnement : source de vérité = brand_proposition.version_final (déjà dans le Pitch ci-dessus, cf #207).
      // On n'affiche le legacy brand_profile.positioning qu'à défaut, pour ne pas dupliquer/contredire le Pitch.
      if (brand?.positioning && !proposition?.version_final) addBullet("Positionnement", brand.positioning);
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
    data: dataScope === scope ? data : null,
    loading: loading || (dataScope !== scope && !loadError),
    loadError,
    shareOpen, setShareOpen, column, value, profileUserId, scope, selectPersona, selectStory,
    exporting,
    sharing: false,
    summaries: dataScope === scope ? summaries : null,
    summariesLoading,
    sheetRef,
    loadData: profileOwner.error ? async () => { await profileOwner.reload(); } : loadData,
    regenerateSummaries,
    handleCopy,
    handleShare,
    handleExportPdf,
  };
}
