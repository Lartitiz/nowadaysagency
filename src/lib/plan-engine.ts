import { supabase } from "@/integrations/supabase/client";
import { fetchBrandingData, calculateBrandingCompletion } from "./branding-completion";

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
  // Fetch all needed data in parallel
  const [
    brandingRaw,
    { count: storyCount },
    { count: prospectCount },
    { count: contactCount },
    { count: calendarPostCount },
    { data: auditIg },
    liAuditResult,
    { data: editoLine },
    { data: bioData },
    { data: offerData },
  ] = await Promise.all([
    fetchBrandingData(userId),
    supabase.from("storytelling").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("prospects").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("engagement_contacts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("calendar_posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("instagram_audit").select("score_global").eq("user_id", userId).maybeSingle(),
    Promise.resolve(supabase.from("linkedin_audit").select("score_global").eq("user_id", userId).maybeSingle()).catch(() => ({ data: null })),
    supabase.from("instagram_editorial_line").select("pillars").eq("user_id", userId).maybeSingle(),
    supabase.from("instagram_audit").select("score_bio").eq("user_id", userId).maybeSingle(),
    supabase.from("brand_proposition").select("step_1_what, version_final").eq("user_id", userId).maybeSingle(),
  ]);
  const auditLi = liAuditResult?.data;

  const branding = calculateBrandingCompletion(brandingRaw);
  const channels = config.channels || [];

  // Determine step statuses
  const brandingDone = branding.total >= 50;
  const brandingStarted = branding.total > 0;
  const personaDone = branding.persona >= 80;
  const personaStarted = branding.persona > 0;
  const storyDone = (storyCount || 0) > 0;
  const propDone = branding.proposition >= 80;
  const propStarted = branding.proposition > 0;
  const stratDone = branding.strategy >= 80;
  const stratStarted = branding.strategy > 0;
  const toneDone = branding.tone >= 80;
  const toneStarted = branding.tone > 0;

  const igAuditDone = !!auditIg?.score_global;
  const igBioScore = bioData?.score_bio;
  const igBioRecommendation = igBioScore != null && igBioScore < 70 ? "💡 Ta bio actuelle peut être améliorée" : undefined;
  const liAuditDone = !!auditLi?.score_global;
  const editoDone = !!(editoLine?.pillars && Array.isArray(editoLine.pillars) && (editoLine.pillars as any[]).length > 0);
  const calendarDone = (calendarPostCount || 0) > 0;
  const contactsDone = (contactCount || 0) > 0;
  const prospectsDone = (prospectCount || 0) > 0;

  function s(done: boolean, started?: boolean): StepStatus {
    if (done) return "done";
    if (started) return "in_progress";
    return "todo";
  }

  const foundationsLocked = false;
  const brandingComplete = brandingDone && personaDone;

  // Phase 1: Fondations (always present)
  const phase1Steps: PlanStep[] = [
    {
      id: "branding",
      label: "Poser ton branding",
      description: "Positionnement, mission, ton, proposition de valeur",
      duration: 20,
      route: "/branding",
      status: s(brandingDone, brandingStarted),
    },
    {
      id: "persona",
      label: "Définir ta cible",
      description: "Qui est ta cliente idéale, ses frustrations",
      duration: 30,
      route: "/branding/persona",
      status: s(personaDone, personaStarted),
    },
    {
      id: "storytelling",
      label: "Écrire ton histoire",
      description: "Ton storytelling de marque",
      duration: 45,
      route: "/branding/storytelling",
      status: s(storyDone),
    },
    {
      id: "proposition",
      label: "Affiner ta proposition de valeur",
      description: "Ce qui te rend unique pour tes clientes",
      duration: 30,
      route: "/branding/proposition",
      status: s(propDone, propStarted),
    },
    {
      id: "tone",
      label: "Définir ton style & tes combats",
      description: "Ton registre, tes expressions, tes combats",
      duration: 25,
      route: "/branding/ton",
      status: s(toneDone, toneStarted),
    },
  ];

  // Add offers if goal is launch
  if (config.main_goal === "launch" || config.main_goal === "clients") {
    phase1Steps.push({
      id: "offers",
      label: "Définir tes offres",
      description: "Atelier de positionnement d'offre",
      duration: 60,
      route: "/branding/offres",
      status: s(!!offerData?.version_final, !!offerData?.step_1_what),
    });
  }

  // Phase 2: Canaux (conditional)
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
    });
    phase2Steps.push({
      id: "ig_bio",
      label: "Optimiser ta bio Instagram",
      description: "Bio, nom, photo de profil",
      duration: 15,
      route: "/instagram/profil/bio",
      status: igAuditDone ? (igBioScore && igBioScore >= 70 ? "done" : "todo") : "todo",
      recommendation: igBioRecommendation,
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
      description: "Référencement naturel",
      duration: 45,
      route: "#",
      status: "todo",
      comingSoon: true,
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
    });
  }

  phase3Steps.push({
    id: "calendar",
    label: "Planifier ton calendrier",
    description: "Calendrier éditorial du mois",
    duration: 60,
    route: "/calendrier",
    status: s(calendarDone),
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
    });
  }

  phase4Steps.push({
    id: "first_content",
    label: "Créer ton premier contenu",
    description: "Utiliser l'atelier créatif pour ton 1er post",
    duration: 30,
    route: "/atelier",
    status: s(calendarDone),
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

  // Apply locks: if branding not complete, lock steps in phases 2+
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
