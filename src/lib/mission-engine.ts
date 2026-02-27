import { supabase } from "@/integrations/supabase/client";
import { fetchBrandingData, calculateBrandingCompletion } from "@/lib/branding-completion";

export interface MissionDef {
  mission_key: string;
  title: string;
  description: string;
  priority: "urgent" | "important" | "bonus";
  module: string;
  route: string;
  estimated_minutes: number;
}

export interface AppState {
  profile: any;
  brandProfile: any;
  proposition: any;
  persona: any;
  strategy: any;
  storytelling: any;
  rhythm: any;
  editorialLine: any;
  // Counts
  postsThisWeek: number;
  postsTarget: number;
  engagementDone: number;
  engagementTarget: number;
  highlightsCount: number;
  ideasCount: number;
  linkedinProfile: any;
  pinterestProfile: any;
  websiteHomepage: any;
}

export async function fetchAppState(filter: { column: string; value: string }): Promise<AppState> {
  const weekStart = getMonday(new Date()).toISOString().split("T")[0];

  const [
    profileRes, brandRes, propRes, personaRes, stratRes, storyRes,
    rhythmRes, postsRes, engRes, hlRes, ideasRes,
    liRes, pintRes, webRes, editoRes,
  ] = await Promise.all([
    (supabase.from("profiles") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("brand_profile") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("brand_proposition") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("persona") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("brand_strategy") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("storytelling") as any).select("*").eq(filter.column, filter.value).eq("is_primary", true).maybeSingle(),
    (supabase.from("user_rhythm") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("calendar_posts") as any).select("id").eq(filter.column, filter.value).gte("date", weekStart),
    (supabase.from("engagement_weekly") as any).select("*").eq(filter.column, filter.value).eq("week_start", weekStart).maybeSingle(),
    (supabase.from("instagram_highlights") as any).select("id").eq(filter.column, filter.value).eq("is_selected", true),
    (supabase.from("saved_ideas") as any).select("id").eq(filter.column, filter.value),
    (supabase.from("linkedin_profile") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("pinterest_profile") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("website_homepage") as any).select("*").eq(filter.column, filter.value).maybeSingle(),
    (supabase.from("instagram_editorial_line") as any).select("*").eq(filter.column, filter.value).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const rhythm = rhythmRes.data;
  const edito = editoRes.data;
  // Use editorial line posts frequency if available, fallback to rhythm
  let postsTarget = rhythm?.posts_per_week ? Number(rhythm.posts_per_week) : 2;
  if (edito?.posts_frequency) {
    const freq = edito.posts_frequency as string;
    if (freq === "1x/semaine") postsTarget = 1;
    else if (freq === "2x/semaine") postsTarget = 2;
    else if (freq === "3x/semaine") postsTarget = 3;
    else if (freq === "4-5x/semaine") postsTarget = 5;
  }

  return {
    profile: profileRes.data,
    brandProfile: brandRes.data,
    proposition: propRes.data,
    persona: personaRes.data,
    strategy: stratRes.data,
    storytelling: storyRes.data,
    rhythm,
    editorialLine: edito,
    postsThisWeek: postsRes.data?.length || 0,
    postsTarget,
    engagementDone: engRes.data?.total_done || 0,
    engagementTarget: engRes.data?.objective || 10,
    highlightsCount: hlRes.data?.length || 0,
    ideasCount: ideasRes.data?.length || 0,
    linkedinProfile: liRes.data,
    pinterestProfile: pintRes.data,
    websiteHomepage: webRes.data,
  };
}

export function generateMissions(state: AppState): MissionDef[] {
  const urgent: MissionDef[] = [];
  const important: MissionDef[] = [];
  const bonus: MissionDef[] = [];

  // ── PRIORITY 1: Urgent prerequisites ──
  if (!state.proposition || !state.proposition.completed) {
    urgent.push({
      mission_key: "complete_proposition",
      title: "Définis ta proposition de valeur",
      description: "C'est le socle de tout : ta bio, ton site, tes pitchs. Sans proposition de valeur, l'IA ne peut pas personnaliser tes contenus.",
      priority: "urgent",
      module: "branding",
      route: "/branding/proposition",
      estimated_minutes: 15,
    });
  }

  if (!state.persona) {
    urgent.push({
      mission_key: "start_persona",
      title: "Commence ton persona",
      description: "Qui est ta cliente idéale ? Sans cette info, tes contenus parlent dans le vide. L'atelier et le site web en dépendent.",
      priority: "urgent",
      module: "branding",
      route: "/branding/persona",
      estimated_minutes: 20,
    });
  } else if (!state.persona.completed) {
    const step = state.persona.current_step || 1;
    urgent.push({
      mission_key: "complete_persona",
      title: `Termine ton persona (étape ${step}/5)`,
      description: "Tu as commencé mais il manque des étapes. Finis-le pour débloquer la personnalisation IA de tes contenus.",
      priority: "urgent",
      module: "branding",
      route: "/branding/persona",
      estimated_minutes: 15,
    });
  }

  if (!state.storytelling || !state.storytelling.completed) {
    urgent.push({
      mission_key: "complete_storytelling",
      title: "Écris ton storytelling",
      description: "Ton histoire est ton meilleur outil de connexion. Elle alimente ta page d'accueil, ton résumé LinkedIn et ta bio.",
      priority: "urgent",
      module: "branding",
      route: "/branding/storytelling",
      estimated_minutes: 25,
    });
  }

  // ── PRIORITY 2: High impact ──
  const bp = state.brandProfile;
  const hasBio = bp?.voice_description && bp.voice_description.trim().length > 10;
  if (state.proposition?.completed && !hasBio) {
    important.push({
      mission_key: "optimize_bio",
      title: "Optimise ta bio Instagram",
      description: "Ta proposition de valeur est prête, mais ta bio ne la reflète pas encore. C'est ta vitrine : chaque mot compte.",
      priority: "important",
      module: "instagram",
      route: "/instagram/profil/bio",
      estimated_minutes: 15,
    });
  }

  if (state.postsThisWeek === 0) {
    important.push({
      mission_key: "plan_posts",
      title: `Planifie au moins ${state.postsTarget} posts cette semaine`,
      description: "0 post planifié cette semaine. Ouvre le calendrier et place tes contenus. Même 1, c'est mieux que 0.",
      priority: "important",
      module: "instagram",
      route: "/calendrier",
      estimated_minutes: 15,
    });
  }

  if (state.engagementTarget > 0 && state.engagementDone < state.engagementTarget * 0.5) {
    important.push({
      mission_key: "boost_engagement",
      title: "Relance ton engagement",
      description: `Tu es à ${state.engagementDone}/${state.engagementTarget} interactions. Commente, réponds aux stories, envoie des DM. C'est ce qui fait grandir ta communauté.`,
      priority: "important",
      module: "instagram",
      route: "/instagram/routine",
      estimated_minutes: 15,
    });
  }

  if (state.highlightsCount === 0) {
    important.push({
      mission_key: "create_highlights",
      title: "Crée tes stories à la une",
      description: "C'est la première chose qu'une visiteuse regarde. Structure tes highlights comme un mini-site.",
      priority: "important",
      module: "instagram",
      route: "/instagram/profil/stories",
      estimated_minutes: 20,
    });
  }

  if (state.ideasCount === 0) {
    important.push({
      mission_key: "generate_ideas",
      title: "Génère des idées dans l'atelier",
      description: "Ta boîte à idées est vide. L'atelier te propose des sujets personnalisés en 2 clics.",
      priority: "important",
      module: "instagram",
      route: "/atelier",
      estimated_minutes: 10,
    });
  }

  if (!state.websiteHomepage || !state.websiteHomepage.completed) {
    important.push({
      mission_key: "start_homepage",
      title: "Rédige ta page d'accueil",
      description: "Ta page d'accueil est le cœur de ton site. L'IA t'aide à rédiger chaque bloc.",
      priority: "important",
      module: "site_web",
      route: "/site/accueil",
      estimated_minutes: 30,
    });
  }

  if (state.linkedinProfile && !state.linkedinProfile.title_done) {
    important.push({
      mission_key: "optimize_linkedin_title",
      title: "Optimise ton titre LinkedIn",
      description: "C'est ce que les gens voient en premier. Un bon titre = plus de visites sur ton profil.",
      priority: "important",
      module: "linkedin",
      route: "/linkedin/profil",
      estimated_minutes: 10,
    });
  }

  if (state.pinterestProfile && !state.pinterestProfile.pro_account_done) {
    important.push({
      mission_key: "setup_pinterest",
      title: "Configure ton compte Pinterest",
      description: "Passe en compte pro, optimise ton profil et commence à attirer du trafic durable.",
      priority: "important",
      module: "pinterest",
      route: "/pinterest/compte",
      estimated_minutes: 15,
    });
  }

  // ── Editorial line coherence missions ──
  const edito = state.editorialLine;
  if (edito) {
    const estimated = edito.estimated_weekly_minutes as number | null;
    const budget = edito.time_budget_minutes as number | null;
    if (estimated && budget && estimated > budget) {
      important.push({
        mission_key: "adjust_rhythm",
        title: "Ton rythme dépasse ton temps dispo",
        description: `Tu as estimé ~${Math.round(estimated / 60)}h/semaine mais tu n'as que ~${Math.round(budget / 60)}h. Réajuste ta ligne éditoriale pour un rythme tenable.`,
        priority: "important",
        module: "instagram",
        route: "/instagram/profil/edito",
        estimated_minutes: 10,
      });
    }
  }

  if (!edito) {
    important.push({
      mission_key: "create_editorial_line",
      title: "Définis ta ligne éditoriale Instagram",
      description: "Choisis ton rythme, tes formats et tes piliers pour structurer ta création de contenu.",
      priority: "important",
      module: "instagram",
      route: "/instagram/profil/edito",
      estimated_minutes: 15,
    });
  }


  if (!state.strategy || !state.strategy.completed) {
    bonus.push({
      mission_key: "complete_strategy",
      title: "Pose ta stratégie de contenu",
      description: "Définis tes piliers, tes facettes et ton concept créatif pour ne plus jamais manquer d'idées.",
      priority: "bonus",
      module: "branding",
      route: "/branding/strategie",
      estimated_minutes: 20,
    });
  }

  if (bp && (!bp.tone_register || bp.tone_register.trim().length === 0)) {
    bonus.push({
      mission_key: "define_tone",
      title: "Affine ton ton & style",
      description: "Comment tu parles, c'est ce qui te rend unique. Définis ton registre pour que l'IA adopte ta voix.",
      priority: "bonus",
      module: "branding",
      route: "/branding/ton",
      estimated_minutes: 15,
    });
  }

  if (bp && (!bp.combat_cause || bp.combat_cause.trim().length === 0)) {
    bonus.push({
      mission_key: "define_combats",
      title: "Définis tes combats",
      description: "Ce que tu défends et ce que tu refuses. Ça polarise et ça attire les bonnes personnes.",
      priority: "bonus",
      module: "branding",
      route: "/branding/ton",
      estimated_minutes: 10,
    });
  }

  if (state.linkedinProfile && !state.linkedinProfile.summary_final) {
    bonus.push({
      mission_key: "write_linkedin_summary",
      title: "Rédige ton résumé LinkedIn",
      description: "C'est ton espace de storytelling sur LinkedIn. Raconte qui tu es en 2600 caractères.",
      priority: "bonus",
      module: "linkedin",
      route: "/linkedin/resume",
      estimated_minutes: 20,
    });
  }

  // ── Selection rules ──
  const maxMissions = getMaxMissions(state.rhythm?.time_available_weekly);
  const selected: MissionDef[] = [];
  const usedModules = new Set<string>();

  // Add urgents first (max 2, allow same module for urgents)
  for (const m of urgent) {
    if (selected.length >= maxMissions) break;
    selected.push(m);
    usedModules.add(m.module);
  }

  // Add importants (avoid duplicating modules unless urgent)
  for (const m of important) {
    if (selected.length >= maxMissions) break;
    if (usedModules.has(m.module) && urgent.some((u) => u.module === m.module)) continue;
    selected.push(m);
    usedModules.add(m.module);
  }

  // Fill remaining with importants even if module duplicate
  for (const m of important) {
    if (selected.length >= maxMissions) break;
    if (selected.some((s) => s.mission_key === m.mission_key)) continue;
    selected.push(m);
  }

  // Add bonus (max 2)
  let bonusCount = 0;
  for (const m of bonus) {
    if (selected.length >= maxMissions || bonusCount >= 2) break;
    selected.push(m);
    bonusCount++;
  }

  return selected;
}

function getMaxMissions(timeWeekly: number | null | undefined): number {
  if (!timeWeekly || timeWeekly < 120) return 3;
  if (timeWeekly <= 240) return 4;
  return 5;
}

export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Compute progress percentages for the overview section */
export async function computeProgress(state: AppState, userId: string, wf?: { column: string; value: string }) {
  // Branding: use centralized calculation
  const filter = wf || { column: "user_id", value: userId };
  const brandingData = await fetchBrandingData(filter);
  const brandingCompletion = calculateBrandingCompletion(brandingData);
  const branding = brandingCompletion.total;

  // Instagram profile
  const instaChecks = [
    state.brandProfile?.voice_description ? 1 : 0,
    state.highlightsCount > 0 ? 1 : 0,
  ];
  const profilInsta = Math.round((instaChecks.reduce((a, b) => a + b, 0) / instaChecks.length) * 100);

  // Content
  const contenu = state.postsTarget > 0
    ? Math.min(100, Math.round((state.postsThisWeek / state.postsTarget) * 100))
    : 0;

  // Engagement
  const engagement = state.engagementTarget > 0
    ? Math.min(100, Math.round((state.engagementDone / state.engagementTarget) * 100))
    : 0;

  // Site web
  const webFields = state.websiteHomepage
    ? countFilledFields(state.websiteHomepage, ["hook_title", "hook_subtitle", "problem_block", "presentation_block", "offer_block", "benefits_block", "cta_primary"])
    : 0;
  const siteWeb = Math.round((webFields / 7) * 100);

  const global = Math.round((branding + profilInsta + contenu + engagement + siteWeb) / 5);

  return { global, branding, profilInsta, contenu, engagement, siteWeb };
}

function countFilledFields(obj: Record<string, unknown> | null | undefined, fields: string[]): number {
  return fields.filter((f) => obj?.[f] && String(obj[f]).trim().length > 0).length;
}
