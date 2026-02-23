import { supabase } from "@/integrations/supabase/client";

export type StepStatus = "done" | "in_progress" | "todo" | "locked";

export interface PlanStep {
  id: string;
  label: string;
  description: string;
  duration: number; // minutes
  route: string;
  status: StepStatus;
  detail?: string; // e.g. "Score : 62/100"
  recommendation?: string;
  comingSoon?: boolean;
  debugInfo?: string;
}

export interface PlanPhase {
  id: string;
  title: string;
  emoji: string;
  steps: PlanStep[];
  locked: boolean;
}

export interface PlanConfig {
  weekly_time: string;
  channels: string[];
  main_goal: string;
}

export interface PlanData {
  phases: PlanPhase[];
  config: PlanConfig;
  progressPercent: number;
  totalMinutesRemaining: number;
  completedCount: number;
  totalCount: number;
}

const GOAL_LABELS: Record<string, string> = {
  start: "Poser les bases de ma com'",
  visibility: "Être plus visible sur les réseaux",
  launch: "Lancer une offre / un produit",
  clients: "Trouver des client·es",
  structure: "Structurer ce que je fais déjà",
};

const TIME_LABELS: Record<string, string> = {
  less_2h: "Moins de 2h",
  "2_5h": "2 à 5h",
  "5_10h": "5 à 10h",
  more_10h: "Plus de 10h",
};

export { GOAL_LABELS, TIME_LABELS };

export async function computePlan(userId: string, config: PlanConfig): Promise<PlanData> {
  // Fetch all needed data in parallel — simple existence/count checks
  const [
    brandProfileRes,
    personaRes,
    { count: storyCount },
    { count: offerCount },
    { data: auditIg },
    { data: auditIgBio },
    liAuditResult,
    { data: editoLine },
    { count: calendarPostCount },
    { count: contactCount },
    { count: prospectCount },
    strategyRes,
    propRes,
    toneRes,
  ] = await Promise.all([
    supabase.from("brand_profile").select("mission, voice_description, tone_register, offer").eq("user_id", userId).maybeSingle(),
    supabase.from("persona").select("step_1_frustrations, step_2_transformation").eq("user_id", userId).maybeSingle(),
    supabase.from("storytelling").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("offers").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("instagram_audit").select("score_global").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("instagram_audit").select("score_bio").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    Promise.resolve(supabase.from("linkedin_audit").select("score_global").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle()).catch(() => ({ data: null })),
    supabase.from("instagram_editorial_line").select("pillars").eq("user_id", userId).maybeSingle(),
    supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("contact_type", "network"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("contact_type", "prospect"),
    supabase.from("brand_strategy").select("facet_1, pillar_major, creative_concept, step_1_hidden_facets").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("step_1_what, version_final").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_profile").select("tone_register, tone_level, tone_style, combat_cause, combat_fights, key_expressions").eq("user_id", userId).maybeSingle(),
  ]);
  const auditLi = liAuditResult?.data;

  const channels = config.channels || [];

  // Helper
  const filled = (v: any) => v !== null && v !== undefined && (typeof v !== "string" || v.trim().length > 0);

  // ===== Simple existence-based status checks =====
  const bp = brandProfileRes.data;
  const brandingDone = !!(bp && (filled(bp.mission) || filled(bp.voice_description) || filled(bp.tone_register) || filled(bp.offer)));
  const brandingStarted = !!bp;

  const per = personaRes.data;
  const personaDone = !!(per && (filled(per.step_1_frustrations) || filled(per.step_2_transformation)));
  const personaStarted = !!per;

  const storyDone = (storyCount || 0) > 0;

  const prop = propRes.data;
  const propDone = !!(prop && filled(prop.version_final));
  const propStarted = !!(prop && filled(prop.step_1_what));

  const td = toneRes.data;
  const toneDone = !!(td && (filled(td.tone_register) || filled(td.tone_level) || filled(td.tone_style) || filled(td.combat_cause) || filled(td.combat_fights) || filled(td.key_expressions)));
  const toneStarted = !!td;

  const st = strategyRes.data;
  const stratDone = !!(st && (filled(st.pillar_major) || filled(st.facet_1)));
  const stratStarted = !!(st && filled(st.step_1_hidden_facets));

  const igAuditDone = !!auditIg?.score_global;
  const igBioScore = auditIgBio?.score_bio;
  // Bio done if score exists (audit was done and bio was analyzed)
  const igBioDone = igBioScore != null && igBioScore > 0;
  const igBioRecommendation = igBioScore != null && igBioScore < 70 ? "💡 Ta bio actuelle peut être améliorée" : undefined;

  const liAuditDone = !!auditLi?.score_global;

  const editoDone = !!(editoLine?.pillars && Array.isArray(editoLine.pillars) && (editoLine.pillars as any[]).length > 0);
  const calendarDone = (calendarPostCount || 0) > 0;
  const contactsDone = (contactCount || 0) >= 3;
  const prospectsDone = (prospectCount || 0) > 0;
  const offersDone = (offerCount || 0) > 0;

  // Debug info map
  const debugInfo: Record<string, string> = {
    branding: `brand_profile exists=${!!bp}, mission=${filled(bp?.mission)}, voice=${filled(bp?.voice_description)} → ${brandingDone ? "done" : "todo"}`,
    persona: `persona exists=${!!per}, frustrations=${filled(per?.step_1_frustrations)} → ${personaDone ? "done" : "todo"}`,
    storytelling: `count=${storyCount || 0} → ${storyDone ? "done" : "todo"}`,
    proposition: `version_final=${filled(prop?.version_final)}, step_1=${filled(prop?.step_1_what)} → ${propDone ? "done" : propStarted ? "in_progress" : "todo"}`,
    tone: `register=${filled(td?.tone_register)}, combat=${filled(td?.combat_cause)} → ${toneDone ? "done" : "todo"}`,
    ig_audit: `score_global=${auditIg?.score_global ?? "null"} → ${igAuditDone ? "done" : "todo"}`,
    ig_bio: `score_bio=${igBioScore ?? "null"} → ${igBioDone ? "done" : "todo"}`,
    li_audit: `score_global=${auditLi?.score_global ?? "null"} → ${liAuditDone ? "done" : "todo"}`,
    edito: `pillars=${editoLine?.pillars ? (editoLine.pillars as any[]).length : 0} → ${editoDone ? "done" : "todo"}`,
    calendar: `count=${calendarPostCount || 0} → ${calendarDone ? "done" : "todo"}`,
    engagement: `contacts=${contactCount || 0} (need ≥3) → ${contactsDone ? "done" : "todo"}`,
    prospection: `count=${prospectCount || 0} → ${prospectsDone ? "done" : "todo"}`,
    offers: `count=${offerCount || 0} → ${offersDone ? "done" : "todo"}`,
    strategy: `pillar_major=${filled(st?.pillar_major)}, facet_1=${filled(st?.facet_1)} → ${stratDone ? "done" : "todo"}`,
  };

  function s(done: boolean, started?: boolean): StepStatus {
    if (done) return "done";
    if (started) return "in_progress";
    return "todo";
  }

  const brandingComplete = brandingDone && personaDone;

  // Phase 1: Fondations
  const phase1Steps: PlanStep[] = [
    {
      id: "branding",
      label: "Poser ton branding",
      description: "Positionnement, mission, ton, proposition de valeur",
      duration: 20,
      route: "/branding",
      status: s(brandingDone, brandingStarted),
      debugInfo: debugInfo.branding,
    },
    {
      id: "persona",
      label: "Définir ta cible",
      description: "Qui est ta cliente idéale, ses frustrations",
      duration: 30,
      route: "/branding/persona",
      status: s(personaDone, personaStarted),
      debugInfo: debugInfo.persona,
    },
    {
      id: "storytelling",
      label: "Écrire ton histoire",
      description: "Ton storytelling de marque",
      duration: 45,
      route: "/branding/storytelling",
      status: s(storyDone),
      debugInfo: debugInfo.storytelling,
    },
    {
      id: "proposition",
      label: "Affiner ta proposition de valeur",
      description: "Ce qui te rend unique pour tes clientes",
      duration: 30,
      route: "/branding/proposition",
      status: s(propDone, propStarted),
      debugInfo: debugInfo.proposition,
    },
    {
      id: "tone",
      label: "Définir ton style & tes combats",
      description: "Ton registre, tes expressions, tes combats",
      duration: 25,
      route: "/branding/ton",
      status: s(toneDone, toneStarted),
      debugInfo: debugInfo.tone,
    },
  ];

  if (config.main_goal === "launch" || config.main_goal === "clients") {
    phase1Steps.push({
      id: "offers",
      label: "Définir tes offres",
      description: "Atelier de positionnement d'offre",
      duration: 60,
      route: "/branding/offres",
      status: s(offersDone),
      debugInfo: debugInfo.offers,
    });
  }

  // Phase 2: Canaux
  const phase2Steps: PlanStep[] = [];

  if (channels.includes("instagram")) {
    phase2Steps.push({
      id: "ig_audit",
      label: "Auditer ton Instagram",
      description: "Analyse complète de ton profil",
      duration: 20,
      route: "/instagram/audit",
      status: s(igAuditDone),
      detail: igAuditDone && auditIg?.score_global ? `Score : ${auditIg.score_global}/100` : undefined,
      debugInfo: debugInfo.ig_audit,
    });
    phase2Steps.push({
      id: "ig_bio",
      label: "Optimiser ta bio Instagram",
      description: "Bio, nom, photo de profil",
      duration: 15,
      route: "/instagram/profil/bio",
      status: s(igBioDone),
      recommendation: igBioRecommendation,
      debugInfo: debugInfo.ig_bio,
    });
  }

  if (channels.includes("linkedin")) {
    phase2Steps.push({
      id: "li_audit",
      label: "Auditer ton LinkedIn",
      description: "Analyse de ton profil LinkedIn",
      duration: 20,
      route: "/linkedin/audit",
      status: s(liAuditDone),
      detail: liAuditDone && auditLi?.score_global ? `Score : ${(auditLi as any).score_global}/100` : undefined,
      debugInfo: debugInfo.li_audit,
    });
    phase2Steps.push({
      id: "li_profil",
      label: "Optimiser ton profil LinkedIn",
      description: "Titre, résumé, parcours",
      duration: 30,
      route: "/linkedin/profil",
      status: "todo",
    });
  }

  if (channels.includes("pinterest")) {
    phase2Steps.push({
      id: "pinterest",
      label: "Configurer ton Pinterest",
      description: "Compte, tableaux, mots-clés",
      duration: 30,
      route: "/pinterest",
      status: "todo",
    });
  }

  if (channels.includes("newsletter")) {
    phase2Steps.push({
      id: "newsletter",
      label: "Configurer ton emailing",
      description: "Stratégie newsletter",
      duration: 30,
      route: "#",
      status: "todo",
      comingSoon: true,
    });
  }

  if (channels.includes("site")) {
    phase2Steps.push({
      id: "site",
      label: "Optimiser ton site web",
      description: "Pages clés, SEO, capture",
      duration: 45,
      route: "/site",
      status: "todo",
    });
  }

  if (channels.includes("seo")) {
    phase2Steps.push({
      id: "seo",
      label: "Stratégie SEO",
      description: "Référencement naturel — ouvre le SEO Toolkit",
      duration: 45,
      route: "https://referencement-seo.lovable.app/",
      status: "todo",
      comingSoon: false,
    });
  }

  // Phase 3: Stratégie
  const phase3Steps: PlanStep[] = [
    {
      id: "strategy",
      label: "Définir ta stratégie de contenu",
      description: "Piliers, facettes, twist créatif",
      duration: 45,
      route: "/branding/strategie",
      status: s(stratDone, stratStarted),
      debugInfo: debugInfo.strategy,
    },
  ];

  if (channels.includes("instagram")) {
    phase3Steps.push({
      id: "edito",
      label: "Créer ta ligne éditoriale",
      description: "Piliers de contenu, formats, fréquence",
      duration: 45,
      route: "/instagram/profil/edito",
      status: s(editoDone),
      debugInfo: debugInfo.edito,
    });
  }

  phase3Steps.push({
    id: "calendar",
    label: "Planifier ton calendrier",
    description: "Calendrier éditorial du mois",
    duration: 60,
    route: "/calendrier",
    status: s(calendarDone),
    debugInfo: debugInfo.calendar,
  });

  // Phase 4: Quotidien
  const phase4Steps: PlanStep[] = [];

  if (channels.includes("instagram")) {
    phase4Steps.push({
      id: "engagement",
      label: "Mettre en place ta routine d'engagement",
      description: "Contacts stratégiques + routine quotidienne",
      duration: 30,
      route: "/instagram/routine",
      status: s(contactsDone),
      debugInfo: debugInfo.engagement,
    });
  }

  if (config.main_goal === "clients" || config.main_goal === "launch") {
    phase4Steps.push({
      id: "prospection",
      label: "Configurer ta prospection douce",
      description: "Pipeline de prospects + DM",
      duration: 30,
      route: "/instagram/routine",
      status: s(prospectsDone),
      debugInfo: debugInfo.prospection,
    });
  }

  phase4Steps.push({
    id: "first_content",
    label: "Créer ton premier contenu",
    description: "Utiliser l'atelier créatif pour ton 1er post",
    duration: 30,
    route: "/instagram/creer",
    status: s(calendarDone),
    debugInfo: debugInfo.calendar,
  });

  // Build phases
  const phases: PlanPhase[] = [
    { id: "foundations", title: "Les fondations", emoji: "🧱", steps: phase1Steps, locked: false },
  ];

  if (phase2Steps.length > 0) {
    phases.push({ id: "channels", title: "Tes canaux", emoji: "📡", steps: phase2Steps, locked: !brandingComplete });
  }

  phases.push({ id: "strategy", title: "Ta stratégie", emoji: "🎯", steps: phase3Steps, locked: !brandingComplete });

  if (phase4Steps.length > 0) {
    phases.push({ id: "daily", title: "Ton quotidien", emoji: "⚡", steps: phase4Steps, locked: !brandingComplete });
  }

  // Apply locks
  for (const phase of phases) {
    if (phase.locked) {
      for (const step of phase.steps) {
        if (step.status === "todo") {
          step.status = "locked";
        }
      }
    }
  }

  // Calculate progress
  const allSteps = phases.flatMap(p => p.steps).filter(s => !s.comingSoon);
  const completedCount = allSteps.filter(s => s.status === "done").length;
  const totalCount = allSteps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalMinutesRemaining = allSteps.filter(s => s.status !== "done").reduce((sum, s) => sum + s.duration, 0);

  return {
    phases,
    config,
    progressPercent,
    totalMinutesRemaining,
    completedCount,
    totalCount,
  };
}
