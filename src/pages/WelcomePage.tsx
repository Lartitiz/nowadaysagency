import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePendingBrandReview } from "@/hooks/use-pending-brand-review";
import { useWorkspaceFilter, useProfileUserId } from "@/hooks/use-workspace-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";

import EditableText from "@/components/EditableText";
import { toast as sonnerToast } from "sonner";

const GOAL_LABELS: Record<string, string> = {
  start: "🌱 Poser les bases",
  visibility: "📱 Être plus visible",
  launch: "🎁 Lancer une offre",
  clients: "🎯 Trouver des client·es",
  structure: "🗂️ Structurer",
};

const TIME_LABELS: Record<string, string> = {
  less_2h: "Moins de 2h",
  "2_5h": "2 à 5h",
  "5_10h": "5 à 10h",
  more_10h: "Plus de 10h",
};

// Réponse brute de l'onboarding (profiles.weekly_time) — prioritaire sur le
// bucket du plan pour refléter exactement ce que l'utilisatrice a répondu.
const ONBOARDING_TIME_LABELS: Record<string, string> = {
  "15min": "15 min par-ci par-là",
  "30min": "30 minutes",
  "1h": "1 heure",
  "2h": "2 heures",
  more: "Plus de 2 heures",
};

const IMPACT_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

const STEPS = [
  {
    num: "1️⃣",
    title: "Pose tes fondations",
    emoji: "🎨",
    module: "Identité de marque",
    time: "30 min",
    desc: "Définis ton positionnement, ta cible, ton ton de communication. C'est la base de tout.",
    cta: "👉 C'est ta première étape.",
  },
  {
    num: "2️⃣",
    title: "Audite et optimise tes canaux",
    emoji: "📱",
    module: "Audit Instagram",
    time: "15 min",
    desc: "Analyse ton profil et ta bio. L'outil te dit exactement quoi améliorer.",
  },
  {
    num: "3️⃣",
    title: "Crée tes premiers contenus",
    emoji: "✨",
    module: "Atelier créatif",
    time: "20 min",
    desc: "Posts, Reels, Stories, Carrousels. L'outil t'accompagne de l'idée au texte final.",
  },
  {
    num: "4️⃣",
    title: "Planifie et engage",
    emoji: "📅",
    module: "Calendrier + Contacts",
    time: "15 min",
    desc: "Planifie tes publications et mets en place ta routine d'engagement.",
  },
];

interface Recommendation {
  id: string;
  titre: string | null;
  label: string;
  detail: string | null;
  module: string;
  route: string;
  priorite: string | null;
  temps_estime: string | null;
  position: number | null;
}

interface BrandingCard {
  emoji: string;
  title: string;
  content: string;
  route: string;
  dbTable?: string;
  dbField?: string;
  colors?: string[];
  onColorChange?: (colorIndex: number, newColor: string) => void;
}

interface BrandProfileData {
  positioning: string | null;
  mission: string | null;
  tone_keywords: string[] | null;
  values: string[] | null;
  content_pillars: { name: string }[] | null;
  combats: string | null;
  tone_style: string | null;
}
const CARD_COLLAPSE_LENGTH = 200;

type OfferState = { id: string; name: string; promise: string | null; price_text: string | null; target_ideal: string | null };

function buildBrandingCards(
  bp: BrandProfileData | null,
  personaData: any,
  offersData: any,
  storyData: any,
  charterData: any,
  propositionData: any,
  strategyData: any,
  filterColumn: string,
  filterValue: string,
  setBrandingCards: React.Dispatch<React.SetStateAction<BrandingCard[]>>,
  setOffers: React.Dispatch<React.SetStateAction<OfferState[]>>,
): BrandingCard[] {
  const cards: BrandingCard[] = [];

  // Pas de carte « Positionnement » distincte : le positionnement vit désormais dans
  // brand_proposition.version_final (source de vérité unique, PR #207) et s'affiche
  // via la carte « Proposition de valeur » plus bas. brand_profile.positioning est mort.
  if (bp?.mission) cards.push({ emoji: "🚀", title: "Mission", content: bp.mission, route: "/branding", dbTable: "brand_profile", dbField: "mission" });
  if (bp?.tone_style || (bp?.tone_keywords && bp.tone_keywords.length > 0)) {
    const toneContent = bp!.tone_style || (bp!.tone_keywords || []).join(", ");
    cards.push({ emoji: "💬", title: "Ton de voix", content: toneContent, route: "/branding/section?section=tone_style", dbTable: bp!.tone_style ? "brand_profile" : undefined, dbField: bp!.tone_style ? "tone_style" : undefined });
  }
  if (bp?.combats) cards.push({ emoji: "⚔️", title: "Combats", content: bp.combats, route: "/branding/section?section=tone_style", dbTable: "brand_profile", dbField: "combats" });
  if (bp?.values && bp.values.length > 0) cards.push({ emoji: "💎", title: "Valeurs", content: (bp.values as any[]).map(v => typeof v === "string" ? v : (v as any).name || v).join(", "), route: "/branding/section?section=tone_style" });
  if (bp?.content_pillars && bp.content_pillars.length > 0) {
    const pillarsText = (bp.content_pillars as any[]).map(p => typeof p === "string" ? p : (p as any).name || p).join(", ");
    cards.push({ emoji: "📝", title: "Piliers de contenu", content: pillarsText, route: "/branding/section?section=content_strategy" });
  }

  const persona = personaData as any;
  if (persona) {
    const personaParts: string[] = [];
    if (persona.portrait_prenom) personaParts.push(persona.portrait_prenom);
    if (persona.description) personaParts.push(persona.description);
    if (persona.step_1_frustrations) personaParts.push(`Frustrations : ${persona.step_1_frustrations}`);
    if (persona.step_2_transformation) personaParts.push(`Transformation : ${persona.step_2_transformation}`);
    const personaContent = personaParts.filter(Boolean).join(" · ");
    if (personaContent) cards.push({ emoji: "🎭", title: "Mon·a client·e idéal·e", content: personaContent, route: "/branding/section?section=persona" });
  }

  const offers = ((offersData as any[]) || []);
  if (offers.length > 0) {
    setOffers(prev => {
      if (prev.length === 0) {
        return offers.map((o: any) => ({ id: o.id, name: o.name || "", promise: o.promise || null, price_text: o.price_text || null, target_ideal: o.target_ideal || null }));
      }
      const prevIds = new Set(prev.map(p => p.id));
      const newOffers = offers
        .filter((o: any) => !prevIds.has(o.id))
        .map((o: any) => ({ id: o.id, name: o.name || "", promise: o.promise || null, price_text: o.price_text || null, target_ideal: o.target_ideal || null }));
      if (newOffers.length === 0) return prev;
      return [...prev, ...newOffers];
    });
  }

  const story = storyData as any;
  if (story?.imported_text) cards.push({ emoji: "📖", title: "Ton histoire", content: story.imported_text, route: "/branding/section?section=story", dbTable: "storytelling", dbField: "imported_text" });

  const prop = propositionData as any;
  // version_final (modifié via audits) > version_complete (onboarding) > legacy brand_profile.positioning.
  const propContent = prop?.version_final || prop?.version_complete || bp?.positioning;
  if (propContent) cards.push({ emoji: "💎", title: "Proposition de valeur", content: propContent, route: "/branding/proposition/recap" });
  else if (prop?.version_one_liner) cards.push({ emoji: "💎", title: "One-liner", content: prop.version_one_liner, route: "/branding/proposition/recap" });

  const strat = strategyData as any;
  if (strat?.pillar_major) {
    const pillars = [strat.pillar_major, strat.pillar_minor_1, strat.pillar_minor_2, strat.pillar_minor_3].filter(Boolean);
    const stratContent = pillars.join(", ") + (strat.creative_concept ? ` · Concept : ${strat.creative_concept}` : "");
    cards.push({ emoji: "🧭", title: "Stratégie de contenu", content: stratContent, route: "/branding/section?section=content_strategy" });
  }

  const charter = charterData as any;
  if (charter && (charter.color_primary || charter.font_title || charter.photo_style)) {
    const charterColors = [charter.color_primary, charter.color_secondary, charter.color_accent, charter.color_background, charter.color_text].filter(Boolean);
    const colorKeys = ["color_primary", "color_secondary", "color_accent", "color_background", "color_text"].filter((_, i) => [charter.color_primary, charter.color_secondary, charter.color_accent, charter.color_background, charter.color_text][i]);
    const charterParts: string[] = [];
    if (charter.font_title) {
      const fonts = [charter.font_title, charter.font_body].filter(Boolean);
      charterParts.push(`Typos : ${fonts.join(" + ")}`);
    }
    if (charter.photo_style) charterParts.push(`Photo : ${charter.photo_style}`);
    if (charter.mood_keywords?.length) {
      const kw = Array.isArray(charter.mood_keywords) ? charter.mood_keywords : [];
      if (kw.length) charterParts.push(`Ambiance : ${kw.join(", ")}`);
    }
    const charterContent = charterParts.join(" · ");
    cards.push({
      emoji: "🎨", title: "Charte graphique", content: charterContent, route: "/branding/section?section=charter", colors: charterColors,
      onColorChange: async (colorIndex: number, newColor: string) => {
        const colorKey = colorKeys[colorIndex];
        if (!colorKey) return;
        setBrandingCards(prev => prev.map(c => {
          if (c.title !== "Charte graphique" || !c.colors) return c;
          const newColors = [...c.colors];
          newColors[colorIndex] = newColor;
          return { ...c, colors: newColors };
        }));
        if (/^#[0-9A-Fa-f]{6}$/.test(newColor)) {
          await (supabase.from("brand_charter" as any) as any)
            .update({ [colorKey]: newColor })
            .eq(filterColumn, filterValue);
        }
      },
    });
  }

  return cards;
}

function BrandingCardItem({ card, index, onSave }: { card: BrandingCard; index: number; onSave: (i: number, v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = card.content.length > CARD_COLLAPSE_LENGTH;
  const displayText = !expanded && isLong ? card.content.slice(0, CARD_COLLAPSE_LENGTH) + "…" : card.content;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{card.emoji}</span>
        <span className="text-sm font-semibold text-foreground">{card.title}</span>
      </div>
      {card.colors && card.colors.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 py-1">
          {card.colors.map((color, ci) => (
            <div key={ci} className="flex items-center gap-2">
              <input
                type="color"
                value={color || "#888888"}
                onChange={(e) => {
                  if (card.onColorChange) card.onColorChange(ci, e.target.value);
                }}
                className="w-8 h-8 rounded-lg border border-border cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={color || ""}
                placeholder="#000000"
                onChange={(e) => {
                  let v = e.target.value;
                  if (v && !v.startsWith("#")) v = "#" + v;
                  if (v === "#" || /^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                    if (card.onColorChange) card.onColorChange(ci, v);
                  }
                }}
                className="font-mono text-xs uppercase text-foreground bg-secondary/50 border border-border rounded-lg px-2 py-1.5 w-24 focus:border-primary focus:outline-none transition-colors"
              />
            </div>
          ))}
        </div>
      )}
      {card.dbTable && card.dbField ? (
        <EditableText
          value={card.content}
          onSave={(v) => onSave(index, v)}
          className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line"
          placeholder="Cliquer pour modifier"
        />
      ) : (
        <div>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{displayText}</p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-1"
            >
              {expanded ? "Réduire" : "Lire la suite"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function WelcomePage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  // L'enrichissement est async : on re-interroge pendant la lecture de la page
  // pour que le bouton dise la vérité quand la fiche arrive en cours de route.
  const { pending: brandReviewPending } = usePendingBrandReview({ pollMs: 5000 });
  const profileUserId = useProfileUserId();
  const navigate = useNavigate();
  const { data: profileData } = useProfile();
  const [goal, setGoal] = useState("");
  const [time, setTime] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [diagnosticSummary, setDiagnosticSummary] = useState("");
  const [brandingCards, setBrandingCards] = useState<BrandingCard[]>([]);
  const brandingCardsCountRef = useRef(0);
  const [offers, setOffers] = useState<OfferState[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandingStillLoading, setBrandingStillLoading] = useState(true);
  // L4 : première idée personnalisée générée par le diagnostic (saved_ideas,
  // source_module="diagnostic") — alimente le CTA « Générer mon premier contenu ».
  const [starterIdea, setStarterIdea] = useState<{ titre: string; format: string } | null>(null);
  const starterIdeaRef = useRef(false);
  const [brandingExpanded, setBrandingExpanded] = useState(false);

  const fetchStarterIdea = useCallback(async () => {
    if (starterIdeaRef.current) return;
    const { data } = await (supabase.from("saved_ideas") as any)
      .select("titre, format")
      .eq(column, value)
      .eq("source_module", "diagnostic")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.titre) {
      starterIdeaRef.current = true;
      setStarterIdea({ titre: data.titre, format: data.format || "post" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column, value]);

  const prenom = (profileData as any)?.prenom || "";
  const channels: string[] = (profileData as any)?.canaux || [];
  const onboardingTime = (profileData as any)?.weekly_time || "";

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Config - use user_id directly, not workspace filter, for auth check
      const { data: config } = await (supabase.from("user_plan_config") as any)
        .select("main_goal, weekly_time, welcome_seen, onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      
      // If welcome already seen, go to dashboard
      if (config?.welcome_seen) {
        navigate("/dashboard", { replace: true });
        return;
      }
      
      if (config) {
        setGoal(config.main_goal || "");
        setTime(config.weekly_time || "");
      }

      // Load all branding data in parallel
      const [
        brandProfileRes,
        personaRes,
        offersRes,
        storyRes,
        profileRes,
        recsRes,
        charterRes,
        propositionRes,
        strategyRes,
      ] = await Promise.all([
        (supabase.from("brand_profile") as any)
          .select("positioning, mission, tone_keywords, values, content_pillars, combats, tone_style")
          .eq(column, value)
          .maybeSingle(),
        (supabase.from("persona") as any)
          .select("description, portrait_prenom, step_1_frustrations, step_2_transformation, step_3a_objections, demographics")
          .eq(column, value)
          .eq("is_primary", true)
          .maybeSingle(),
        (supabase.from("offers") as any)
          .select("id, name, promise, price_text, target_ideal")
          .eq(column, value)
          .order("sort_order")
          .limit(5),
        (supabase.from("storytelling") as any)
          .select("imported_text")
          .eq(column, value)
          .eq("is_primary", true)
          .maybeSingle(),
        supabase.from("profiles")
          .select("diagnostic_data")
          .eq("user_id", profileUserId)
          .maybeSingle(),
        (supabase.from("audit_recommendations") as any)
          .select("*")
          .eq(column, value)
          .order("position", { ascending: true })
          .limit(3),
        (supabase.from("brand_charter") as any)
          .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, photo_style, moodboard_description")
          .eq(column, value)
          .maybeSingle(),
        (supabase.from("brand_proposition") as any)
          .select("version_final, version_complete, version_one_liner")
          .eq(column, value)
          .maybeSingle(),
        (supabase.from("brand_strategy") as any)
          .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept")
          .eq(column, value)
          .maybeSingle(),
      ]);

      // Diagnostic summary
      const diagData = (profileRes.data as any)?.diagnostic_data;
      if (diagData?.summary) {
        setDiagnosticSummary(diagData.summary);
      }

      // Recommendations
      if (recsRes.data && recsRes.data.length > 0) {
        setRecommendations(recsRes.data as Recommendation[]);
      }

      // Build branding cards
      const cards = buildBrandingCards(
        brandProfileRes.data as BrandProfileData | null,
        personaRes.data, offersRes.data, storyRes.data,
        charterRes.data, propositionRes.data, strategyRes.data,
        column, value, setBrandingCards, setOffers,
      );

      setBrandingCards(cards);
      brandingCardsCountRef.current = cards.length;
      if (cards.length >= 3) setBrandingStillLoading(false);
      fetchStarterIdea();
      setLoading(false);
    };
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling : refetch le branding toutes les 5s pendant 60s pour attendre l'enrichissement Opus
  useEffect(() => {
    if (!user || loading) return;
    let attempts = 0;
    const maxAttempts = 24; // 24 × 5s = 120s (2 min pour attendre l'enrichissement Opus)
    const intervalRef = { current: null as ReturnType<typeof setInterval> | null };

    const refetchBranding = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      // L4 : l'idée personnalisée arrive avec l'enrichissement Opus (asynchrone)
      fetchStarterIdea();

      const [
        brandProfileRes, personaRes, offersRes, storyRes,
        charterRes, propositionRes, strategyRes,
      ] = await Promise.all([
        (supabase.from("brand_profile") as any)
          .select("positioning, mission, tone_keywords, values, content_pillars, combats, tone_style")
          .eq(column, value).maybeSingle(),
        (supabase.from("persona") as any)
          .select("description, portrait_prenom, step_1_frustrations, step_2_transformation, step_3a_objections, demographics")
          .eq(column, value).eq("is_primary", true).maybeSingle(),
        (supabase.from("offers") as any)
          .select("id, name, promise, price_text, target_ideal")
          .eq(column, value).order("sort_order").limit(5),
        (supabase.from("storytelling") as any)
          .select("imported_text")
          .eq(column, value).eq("is_primary", true).maybeSingle(),
        (supabase.from("brand_charter") as any)
          .select("color_primary, color_secondary, color_accent, color_background, color_text, font_title, font_body, mood_keywords, photo_style, moodboard_description")
          .eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any)
          .select("version_final, version_complete, version_one_liner")
          .eq(column, value).maybeSingle(),
        (supabase.from("brand_strategy") as any)
          .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept")
          .eq(column, value).maybeSingle(),
      ]);

      const cards = buildBrandingCards(
        brandProfileRes.data as BrandProfileData | null,
        personaRes.data, offersRes.data, storyRes.data,
        charterRes.data, propositionRes.data, strategyRes.data,
        column, value, setBrandingCards, setOffers,
      );

      // Only update if we got MORE cards than currently displayed
      if (cards.length > brandingCardsCountRef.current) {
        setBrandingCards(cards);
        brandingCardsCountRef.current = cards.length;
        if (cards.length >= 3) setBrandingStillLoading(false);
        if (cards.length >= 5 && intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      }
    };

    // Timeout de sécurité : après 60s, on arrête d'attendre
    const safetyTimeout = setTimeout(() => setBrandingStillLoading(false), 60000);

    // Premier refetch à 3s, puis toutes les 4s
    const startTimeout = setTimeout(() => {
      refetchBranding();
      intervalRef.current = setInterval(refetchBranding, 4000);
    }, 3000);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(safetyTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, loading, column, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const markSeen = (destination: string) => {
    if (!user) return;
    // Flag lu par AuthContext (resolvePostAuthRoute) : évite de renvoyer de
    // force sur /welcome au login suivant.
    localStorage.setItem("lac_welcome_seen", "true");
    // Navigate immediately, don't wait for the update
    navigate(destination);
    // Fire-and-forget en arrière-plan ; si la ligne n'existe pas encore
    // (update 0 ligne silencieux), on la crée.
    (supabase.from("user_plan_config") as any)
      .update({ welcome_seen: true })
      .eq("user_id", user.id)
      .select("user_id")
      .then(({ data, error }: any) => {
        if (error) { console.error("markSeen error:", error); return; }
        if (!data?.length) {
          (supabase.from("user_plan_config") as any)
            .insert({ user_id: user.id, welcome_seen: true })
            .then(({ error: insError }: any) => {
              if (insError) console.error("markSeen insert error:", insError);
            });
        }
      });
  };

  // CTA « Générer mon premier contenu » : si la marque captée à l'inscription
  // attend sa relecture (fiche branding_autofill pending_review), on route vers
  // l'écran de validation (même chemin que la fin de diagnostic, #633) ; sinon
  // comportement historique — direct sur la 1re création. Vérifié AU CLIC (pas
  // au mount) : l'enrichment est async, la fiche peut arriver pendant que la
  // personne lit cette page. En cas d'erreur réseau → chemin historique.
  const handleCreateFirst = async () => {
    const creerUrl = `/creer?sujet=${encodeURIComponent(starterIdea?.titre || "3 erreurs fréquentes dans mon domaine (et comment les éviter)")}&format=${starterIdea?.format === "carousel" ? "carousel" : "post"}&auto=1`;
    let pendingReview = false;
    try {
      const { data } = await (supabase.from("branding_autofill") as any)
        .select("id")
        .eq(column, value)
        .eq("autofill_status", "pending_review")
        .limit(1)
        .maybeSingle();
      pendingReview = !!data;
    } catch { /* réseau KO → on ne bloque jamais la 1re création */ }
    markSeen(pendingReview ? "/branding?from=onboarding&next=creer" : creerUrl);
  };

  const handleCardSave = useCallback(async (cardIndex: number, newValue: string) => {
    const card = brandingCards[cardIndex];
    if (!card.dbTable || !card.dbField || !user) return;

    const filterCol = column;
    const extraFilter = card.dbTable === "persona"
      ? { is_primary: true }
      : card.dbTable === "storytelling"
        ? { is_primary: true }
        : {};

    let query = (supabase.from(card.dbTable as any) as any)
      .update({ [card.dbField]: newValue })
      .eq(filterCol, value);

    for (const [k, v] of Object.entries(extraFilter)) {
      query = query.eq(k, v);
    }

    const { error } = await query;
    if (error) {
      console.error("Save error:", error);
      sonnerToast.error("Erreur de sauvegarde");
      throw error;
    }

    setBrandingCards(prev => prev.map((c, i) => i === cardIndex ? { ...c, content: newValue } : c));
  }, [brandingCards, user, column, value]);

  const handleOfferFieldSave = useCallback(async (offerId: string, field: string, newValue: string) => {
    setOffers(prev => prev.map(o => o.id === offerId ? { ...o, [field]: newValue } : o));
    const { error } = await (supabase.from("offers") as any)
      .update({ [field]: newValue })
      .eq("id", offerId);
    if (error) {
      console.error("Offer save error:", error);
      sonnerToast.error("Erreur de sauvegarde");
    }
  }, []);

  const hasRecs = recommendations.length > 0;
  const hasBranding = brandingCards.length > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl animate-fade-in space-y-8">
        {/* A) Header personnalisé */}
        <div className="text-center space-y-3">
          <h1 className="font-display text-2xl md:text-3xl text-foreground">
            ✨ {prenom ? `${prenom}, voilà` : "Voilà"} ce que j'ai préparé pour toi
          </h1>
          <p className="text-sm text-muted-foreground">
            J'ai pré-rempli ton branding à partir de ce que j'ai trouvé. <strong className="text-foreground">Clique sur n'importe quel texte pour le modifier.</strong> Quand tout te va, valide en bas.
          </p>
        </div>

        {/* B) Diagnostic summary */}
        {diagnosticSummary && !loading && (
          <div className="rounded-2xl bg-[hsl(var(--rose-pale))] border border-border p-5">
            <p className="text-sm text-foreground italic leading-relaxed">
              {diagnosticSummary}
            </p>
          </div>
        )}

        {/* C) Branding pré-rempli */}
        {!loading && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Ton branding pré-rempli
            </h2>
            {brandingStillLoading ? (
              <div className="rounded-2xl bg-[hsl(var(--rose-pale))]/50 border border-border p-8 flex flex-col items-center justify-center gap-3">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.16}s` }} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">Je prépare ton branding personnalisé...</p>
                <p className="text-xs text-muted-foreground">Ça prend quelques secondes, c'est bientôt prêt ✨</p>
              </div>
            ) : hasBranding ? (
              <div className="grid grid-cols-1 gap-3">
                {/* Replié par défaut : la page welcome empilait 11 cartes — 3 suffisent
                    pour montrer que le branding est rempli, le reste sur demande. */}
                {(brandingExpanded ? brandingCards : brandingCards.slice(0, 3)).map((card, i) => (
                  <BrandingCardItem key={i} card={card} index={i} onSave={handleCardSave} />
                ))}
                {brandingCards.length > 3 && (
                  <button
                    onClick={() => setBrandingExpanded((e) => !e)}
                    className="w-full rounded-2xl border border-dashed border-border bg-card/50 py-3 text-sm font-medium text-primary hover:bg-secondary/50 transition-colors"
                  >
                    {brandingExpanded
                      ? "Réduire ↑"
                      : `Voir les ${brandingCards.length - 3} autres sections ↓`}
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-card border border-border p-5">
                <p className="text-sm text-muted-foreground">
                  On va construire ta marque ensemble, étape par étape — c'est tout à fait normal au début. En quelques minutes, l'assistant s'en servira pour personnaliser tous tes contenus. ✨
                </p>
              </div>
            )}
          </div>
        )}

        {/* C-bis) Offres éditables */}
        {!loading && offers.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tes offres
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {offers.map((offer) => (
                <div key={offer.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🛍️</span>
                    <EditableText
                      value={offer.name}
                      onSave={(v) => handleOfferFieldSave(offer.id, "name", v)}
                      type="input"
                      placeholder="Nom de l'offre"
                      className="text-sm font-semibold text-foreground"
                    />
                    {offer.price_text && (
                      <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-pill">
                        {offer.price_text}
                      </span>
                    )}
                  </div>
                  {offer.promise ? (
                    <EditableText
                      value={offer.promise}
                      onSave={(v) => handleOfferFieldSave(offer.id, "promise", v)}
                      placeholder="Promesse de l'offre"
                      className="text-sm text-muted-foreground leading-relaxed"
                    />
                  ) : (
                    <EditableText
                      value=""
                      onSave={(v) => handleOfferFieldSave(offer.id, "promise", v)}
                      placeholder="Ajoute une promesse (ex: Ce que ta cliente obtient)"
                      className="text-sm text-muted-foreground leading-relaxed italic"
                    />
                  )}
                  {offer.target_ideal && (
                    <p className="text-xs text-muted-foreground">
                      🎯 {offer.target_ideal}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* D) Priorities / Steps */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {hasRecs ? "Tes priorités personnalisées" : "Ton parcours en 4 étapes"}
          </h2>

          {loading ? (
            <div className="flex justify-center py-8 gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.16}s` }} />
              ))}
            </div>
          ) : hasRecs ? (
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => markSeen(rec.route || "/dashboard")}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    i === 0 ? "border-primary bg-secondary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg mt-0.5">{i === 0 ? "🎯" : i === 1 ? "📌" : "💡"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          {rec.titre || rec.label}
                        </p>
                        {rec.priorite && (
                          <span className={`text-2xs font-bold uppercase px-2 py-0.5 rounded-full ${IMPACT_COLORS[rec.priorite] || IMPACT_COLORS.medium}`}>
                            {rec.priorite === "high" ? "prioritaire" : rec.priorite === "medium" ? "important" : "bonus"}
                          </span>
                        )}
                      </div>
                      {rec.detail && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rec.detail}</p>
                      )}
                      {rec.temps_estime && (
                        <div className="mt-2">
                          <span className="text-2xs text-muted-foreground">⏱️ {rec.temps_estime}</span>
                        </div>
                      )}
                    </div>
                    <span aria-hidden className="text-primary shrink-0 mt-0.5">→</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {STEPS.map((s, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 ${
                    i === 0 ? "border-primary bg-secondary" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{s.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {s.num} {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.module} · {s.time}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                      {s.cta && (
                        <p className="text-xs font-semibold text-primary mt-1">{s.cta}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* E) Config recap */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Ton outil s'adapte
          </h2>
          <div className="flex flex-wrap gap-2">
            {goal && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                🎯 {GOAL_LABELS[goal] || goal}
              </span>
            )}
            {(onboardingTime || time) && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                ⏰ {ONBOARDING_TIME_LABELS[onboardingTime] || TIME_LABELS[time] || time}
              </span>
            )}
            {channels.map((ch) => (
              <span key={ch} className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                📱 {ch}
              </span>
            ))}
          </div>
        </div>

        {/* F) CTAs — 1ère génération guidée (L5) : sujet + format pré-remplis, on saute
            direct aux questions (auto=1). Le « waouh » dès l'onboarding, sans page blanche.
            MAIS si la marque captée attend encore sa relecture (fiche pending_review,
            flux #633), la prochaine action n'est PAS de créer : c'est de valider sa
            fiche. Le bouton le DIT (au lieu de promettre un contenu puis de rediriger),
            et handleCreateFirst re-vérifie au clic — l'enrichissement est async, la
            fiche peut arriver pendant la lecture de cette page. */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={handleCreateFirst}
            className="w-full rounded-pill gap-2"
            size="lg"
          >
            {brandReviewPending ? "📋 Valider ma fiche de marque" : "✨ Générer mon premier contenu"}
          </Button>
          {brandReviewPending && (
            <p className="text-xs text-muted-foreground text-center -mt-1">
              Une minute de relecture, et tes contenus parleront vraiment de toi.
            </p>
          )}
          {starterIdea && !brandReviewPending && (
            <p className="text-xs text-muted-foreground text-center -mt-1">
              💡 On démarre sur « {starterIdea.titre} » — une idée tirée de ton diagnostic.
            </p>
          )}
          <Button
            onClick={() => markSeen("/dashboard")}
            variant="outline"
            className="w-full rounded-pill gap-2"
            size="lg"
          >
            Voir mon tableau de bord
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Tu pourras toujours modifier ton branding depuis l'espace Branding.
          </p>
        </div>
      </div>
    </div>
  );
}
