import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useNavigate, Link } from "react-router-dom";
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
    module: "Branding",
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
          className="text-sm text-muted-foreground leading-relaxed"
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
  const navigate = useNavigate();
  const { data: profileData } = useProfile();
  const [goal, setGoal] = useState("");
  const [time, setTime] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [diagnosticSummary, setDiagnosticSummary] = useState("");
  const [brandingCards, setBrandingCards] = useState<BrandingCard[]>([]);
  const [offers, setOffers] = useState<{ id: string; name: string; promise: string | null; price_text: string | null; target_ideal: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandingStillLoading, setBrandingStillLoading] = useState(true);

  const prenom = (profileData as any)?.prenom || "";
  const channels: string[] = (profileData as any)?.canaux || [];

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
          .eq("user_id", user.id)
          .maybeSingle(),
        (supabase.from("audit_recommendations") as any)
          .select("*")
          .eq(column, value)
          .order("position", { ascending: true })
          .limit(3),
        (supabase.from("brand_charter") as any)
          .select("color_primary, color_secondary, color_accent, font_title, font_body, mood_keywords, photo_style, moodboard_description")
          .eq(column, value)
          .maybeSingle(),
        (supabase.from("brand_proposition") as any)
          .select("version_final, version_one_liner")
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
      const cards: BrandingCard[] = [];
      const bp = brandProfileRes.data as BrandProfileData | null;

      if (bp?.positioning) {
        cards.push({ emoji: "🎯", title: "Positionnement", content: bp.positioning, route: "/branding/proposition/recap", dbTable: "brand_profile", dbField: "positioning" });
      }
      if (bp?.mission) {
        cards.push({ emoji: "🚀", title: "Mission", content: bp.mission, route: "/branding", dbTable: "brand_profile", dbField: "mission" });
      }
      if (bp?.tone_style || (bp?.tone_keywords && bp.tone_keywords.length > 0)) {
        const toneContent = bp.tone_style || (bp.tone_keywords || []).join(", ");
        cards.push({ emoji: "💬", title: "Ton de voix", content: toneContent, route: "/branding/section?section=tone_style", dbTable: bp.tone_style ? "brand_profile" : undefined, dbField: bp.tone_style ? "tone_style" : undefined });
      }
      if (bp?.combats) {
        cards.push({ emoji: "⚔️", title: "Combats", content: bp.combats, route: "/branding/section?section=tone_style", dbTable: "brand_profile", dbField: "combats" });
      }
      if (bp?.values && bp.values.length > 0) {
        cards.push({ emoji: "💎", title: "Valeurs", content: (bp.values as any[]).map(v => typeof v === "string" ? v : (v as any).name || v).join(", "), route: "/branding/section?section=tone_style" });
      }
      if (bp?.content_pillars && bp.content_pillars.length > 0) {
        const pillarsText = (bp.content_pillars as any[]).map(p => typeof p === "string" ? p : (p as any).name || p).join(", ");
        cards.push({ emoji: "📝", title: "Piliers de contenu", content: pillarsText, route: "/branding/section?section=content_strategy" });
      }

      const persona = personaRes.data as any;
      if (persona) {
        const personaParts: string[] = [];
        if (persona.portrait_prenom) personaParts.push(persona.portrait_prenom);
        if (persona.description) personaParts.push(persona.description);
        if (persona.step_1_frustrations) personaParts.push(`Frustrations : ${persona.step_1_frustrations}`);
        if (persona.step_2_transformation) personaParts.push(`Transformation : ${persona.step_2_transformation}`);
        const personaContent = personaParts.filter(Boolean).join(" · ");
        if (personaContent) {
          cards.push({ emoji: "🎭", title: "Persona", content: personaContent, route: "/branding/section?section=persona" });
        }
      }

      const offersData = (offersRes.data as any[]) || [];
      if (offersData.length > 0) {
        setOffers(offersData.map((o: any) => ({ id: o.id, name: o.name || "", promise: o.promise || null, price_text: o.price_text || null, target_ideal: o.target_ideal || null })));
      }

      const story = storyRes.data as any;
      if (story?.imported_text) {
        cards.push({ emoji: "📖", title: "Ton histoire", content: story.imported_text, route: "/branding/section?section=story", dbTable: "storytelling", dbField: "imported_text" });
      }

      // Proposition de valeur
      const prop = propositionRes.data as any;
      if (prop?.version_final) {
        cards.push({ emoji: "💎", title: "Proposition de valeur", content: prop.version_final, route: "/branding/proposition/recap" });
      } else if (prop?.version_one_liner) {
        cards.push({ emoji: "💎", title: "One-liner", content: prop.version_one_liner, route: "/branding/proposition/recap" });
      }

      // Stratégie de contenu
      const strat = strategyRes.data as any;
      if (strat?.pillar_major) {
        const pillars = [strat.pillar_major, strat.pillar_minor_1, strat.pillar_minor_2, strat.pillar_minor_3].filter(Boolean);
        const stratContent = pillars.join(", ") + (strat.creative_concept ? ` · Concept : ${strat.creative_concept}` : "");
        cards.push({ emoji: "🧭", title: "Stratégie de contenu", content: stratContent, route: "/branding/section?section=content_strategy" });
      }

      // Charte graphique
      const charter = charterRes.data as any;
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
                .eq(column, value);
            }
          },
        });
      }

      setBrandingCards(cards);
      if (cards.length >= 3) setBrandingStillLoading(false);
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
          .select("color_primary, color_secondary, color_accent, font_title, font_body, mood_keywords, photo_style, moodboard_description")
          .eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any)
          .select("version_final, version_one_liner")
          .eq(column, value).maybeSingle(),
        (supabase.from("brand_strategy") as any)
          .select("pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept")
          .eq(column, value).maybeSingle(),
      ]);

      const cards: BrandingCard[] = [];
      const bp = brandProfileRes.data as BrandProfileData | null;
      if (bp?.positioning) cards.push({ emoji: "🎯", title: "Positionnement", content: bp.positioning, route: "/branding/proposition/recap", dbTable: "brand_profile", dbField: "positioning" });
      if (bp?.mission) cards.push({ emoji: "🚀", title: "Mission", content: bp.mission, route: "/branding", dbTable: "brand_profile", dbField: "mission" });
      if (bp?.tone_style || (bp?.tone_keywords && bp.tone_keywords.length > 0)) {
        const toneContent = bp.tone_style || (bp.tone_keywords || []).join(", ");
        cards.push({ emoji: "💬", title: "Ton de voix", content: toneContent, route: "/branding/section?section=tone_style", dbTable: bp?.tone_style ? "brand_profile" : undefined, dbField: bp?.tone_style ? "tone_style" : undefined });
      }
      if (bp?.combats) cards.push({ emoji: "⚔️", title: "Combats", content: bp.combats, route: "/branding/section?section=tone_style", dbTable: "brand_profile", dbField: "combats" });
      if (bp?.values && bp.values.length > 0) cards.push({ emoji: "💎", title: "Valeurs", content: (bp.values as any[]).map(v => typeof v === "string" ? v : (v as any).name || v).join(", "), route: "/branding/section?section=tone_style" });
      if (bp?.content_pillars && bp.content_pillars.length > 0) {
        const pillarsText = (bp.content_pillars as any[]).map(p => typeof p === "string" ? p : (p as any).name || p).join(", ");
        cards.push({ emoji: "📝", title: "Piliers de contenu", content: pillarsText, route: "/branding/section?section=content_strategy" });
      }
      const persona = personaRes.data as any;
      if (persona) {
        const personaParts: string[] = [];
        if (persona.portrait_prenom) personaParts.push(persona.portrait_prenom);
        if (persona.description) personaParts.push(persona.description);
        if (persona.step_1_frustrations) personaParts.push(`Frustrations : ${persona.step_1_frustrations}`);
        if (persona.step_2_transformation) personaParts.push(`Transformation : ${persona.step_2_transformation}`);
        const personaContent = personaParts.filter(Boolean).join(" · ");
        if (personaContent) cards.push({ emoji: "🎭", title: "Persona", content: personaContent, route: "/branding/section?section=persona" });
      }
      const offersData = (offersRes.data as any[]) || [];
      if (offersData.length > 0 && offersData.length > offers.length) {
        setOffers(offersData.map((o: any) => ({ id: o.id, name: o.name || "", promise: o.promise || null, price_text: o.price_text || null, target_ideal: o.target_ideal || null })));
      }
      const story = storyRes.data as any;
      if (story?.imported_text) cards.push({ emoji: "📖", title: "Ton histoire", content: story.imported_text, route: "/branding/section?section=story", dbTable: "storytelling", dbField: "imported_text" });
      const prop = propositionRes.data as any;
      if (prop?.version_final) cards.push({ emoji: "💎", title: "Proposition de valeur", content: prop.version_final, route: "/branding/proposition/recap" });
      else if (prop?.version_one_liner) cards.push({ emoji: "💎", title: "One-liner", content: prop.version_one_liner, route: "/branding/proposition/recap" });
      const strat = strategyRes.data as any;
      if (strat?.pillar_major) {
        const pillars = [strat.pillar_major, strat.pillar_minor_1, strat.pillar_minor_2, strat.pillar_minor_3].filter(Boolean);
        const stratContent = pillars.join(", ") + (strat.creative_concept ? ` · Concept : ${strat.creative_concept}` : "");
        cards.push({ emoji: "🧭", title: "Stratégie de contenu", content: stratContent, route: "/branding/section?section=content_strategy" });
      }
      const charter = charterRes.data as any;
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
                .eq(column, value);
            }
          },
        });
      }

      // Only update if we got MORE cards than currently displayed
      if (cards.length > brandingCards.length) {
        setBrandingCards(cards);
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
    // Navigate immediately, don't wait for the update
    navigate(destination);
    // Fire-and-forget: update welcome_seen in background
    (supabase.from("user_plan_config") as any)
      .update({ welcome_seen: true })
      .eq("user_id", user.id)
      .then(({ error }: any) => {
        if (error) console.error("markSeen error:", error);
      });
  };

  const handleCardSave = useCallback(async (cardIndex: number, newValue: string) => {
    const card = brandingCards[cardIndex];
    if (!card.dbTable || !card.dbField || !user) return;

    const filterCol = card.dbTable === "persona" || card.dbTable === "storytelling"
      ? column : column;
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
                {brandingCards.map((card, i) => (
                  <BrandingCardItem key={i} card={card} index={i} onSave={handleCardSave} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-card border border-border p-5">
                <p className="text-sm text-muted-foreground">
                  Le diagnostic n'a pas pu pré-remplir ton branding cette fois. Pas de souci, on va le construire ensemble.
                </p>
              </div>
            )}
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
                <div
                  key={rec.id}
                  className={`rounded-xl border p-4 transition-colors ${
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
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${IMPACT_COLORS[rec.priorite] || IMPACT_COLORS.medium}`}>
                            {rec.priorite === "high" ? "prioritaire" : rec.priorite === "medium" ? "important" : "bonus"}
                          </span>
                        )}
                      </div>
                      {rec.detail && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rec.detail}</p>
                      )}
                      {rec.temps_estime && (
                        <div className="mt-2">
                          <span className="text-[11px] text-muted-foreground">⏱️ {rec.temps_estime}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
            {time && (
              <span className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                ⏰ {TIME_LABELS[time] || time}
              </span>
            )}
            {channels.map((ch) => (
              <span key={ch} className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium">
                📱 {ch}
              </span>
            ))}
          </div>
        </div>

        {/* F) CTAs */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => markSeen("/dashboard")}
            className="w-full rounded-pill gap-2"
            size="lg"
          >
            ✅ Tout est bon, c'est parti !
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Tu pourras toujours modifier ton branding depuis l'espace Branding.
          </p>
        </div>
      </div>
    </div>
  );
}
