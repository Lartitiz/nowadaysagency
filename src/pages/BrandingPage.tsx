import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";

/* ─── Types ─── */
interface SectionProgress {
  storytelling: number; // out of 8
  persona: number; // out of 5
  tone: number; // out of 9
  proposition: number; // out of 4
  niche: number; // out of 3
  strategy: number; // out of 4
}

/* ─── Card definition ─── */
interface BrandingCard {
  emoji: string;
  title: string;
  description: string;
  route: string;
  cta: string;
  progressLabel: (p: SectionProgress) => string;
  progressValue: (p: SectionProgress) => number;
  available: boolean;
}

const CARDS: BrandingCard[] = [
  {
    emoji: "👑",
    title: "Mon histoire",
    description: "Écris ton histoire en 8 étapes guidées. L'IA t'aide à chaque moment.",
    route: "/branding/storytelling",
    cta: "Écrire mon histoire →",
    progressLabel: (p) => `${p.storytelling} / 8 étapes`,
    progressValue: (p) => (p.storytelling / 8) * 100,
    available: true,
  },
  {
    emoji: "👩‍💻",
    title: "Mon client·e idéal·e",
    description: "Comprends qui tu veux toucher, ce qui la bloque, ce qu'elle désire.",
    route: "/branding/persona",
    cta: "Définir mon persona →",
    progressLabel: (p) => `${p.persona} / 5 étapes`,
    progressValue: (p) => (p.persona / 5) * 100,
    available: true,
  },
  {
    emoji: "❤️",
    title: "Ma proposition de valeur",
    description: "Ce qui te rend unique. Pourquoi ta cliente te choisit toi et pas une autre.",
    route: "/branding/proposition",
    cta: "Trouver ma proposition de valeur →",
    progressLabel: (p) => `${p.proposition} / 4 étapes`,
    progressValue: (p) => (p.proposition / 4) * 100,
    available: true,
  },
  {
    emoji: "💎",
    title: "Ma niche",
    description: "Ce qui fait qu'on pense à toi et pas à quelqu'un d'autre. Ton combat, tes limites, ton positionnement.",
    route: "/branding/niche",
    cta: "Définir ma niche →",
    progressLabel: (p) => `${p.niche} / 3 étapes`,
    progressValue: (p) => (p.niche / 3) * 100,
    available: true,
  },
  {
    emoji: "🎨",
    title: "Mon ton & style",
    description: "Comment tu parles, tes expressions, ton énergie. Ce qui fait que c'est toi.",
    route: "/branding/ton",
    cta: "Définir mon style →",
    progressLabel: (p) => `${p.tone} / 9 champs`,
    progressValue: (p) => (p.tone / 9) * 100,
    available: true,
  },
  {
    emoji: "🍒",
    title: "Ma stratégie de contenu",
    description: "Tes piliers, ton univers, ton twist créatif. Ce qui donne une colonne vertébrale à tous tes contenus.",
    route: "/branding/strategie",
    cta: "Poser ma stratégie →",
    progressLabel: (p) => `${p.strategy} / 4 étapes`,
    progressValue: (p) => (p.strategy / 4) * 100,
    available: true,
  },
];

/* ─── Main ─── */
export default function BrandingPage() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<SectionProgress>({ storytelling: 0, persona: 0, tone: 0, proposition: 0, niche: 0, strategy: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("storytelling").select("step_1_raw, step_2_location, step_3_action, step_4_thoughts, step_5_emotions, step_6_full_story, step_7_polished, pitch_short").eq("user_id", user.id).maybeSingle(),
      supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_proposition").select("step_1_what, step_2a_process, step_3_for_whom, version_final").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_niche").select("step_1a_cause, step_2_refusals, version_final").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_strategy").select("step_1_hidden_facets, cloud_offer, pillar_major, creative_concept").eq("user_id", user.id).maybeSingle(),
    ]).then(([stRes, perRes, toneRes, propRes, nicheRes, stratRes]) => {
      const countFilled = (obj: any, fields: string[]) =>
        obj ? fields.filter((f) => obj[f] && String(obj[f]).trim().length > 0).length : 0;

      const storytelling = countFilled(stRes.data, ["step_1_raw", "step_2_location", "step_3_action", "step_4_thoughts", "step_5_emotions", "step_6_full_story", "step_7_polished", "pitch_short"]);
      const persona = countFilled(perRes.data, ["step_1_frustrations", "step_2_transformation", "step_3a_objections", "step_4_beautiful", "step_5_actions"]);
      const tone = countFilled(toneRes.data, ["tone_register", "tone_level", "tone_style", "tone_humor", "tone_engagement", "key_expressions", "things_to_avoid", "target_verbatims"]) + (toneRes.data?.channels && toneRes.data.channels.length > 0 ? 1 : 0);
      const proposition = countFilled(propRes.data, ["step_1_what", "step_2a_process", "step_3_for_whom", "version_final"]);
      const niche = countFilled(nicheRes.data, ["step_1a_cause", "step_2_refusals", "version_final"]);
      const strategy = countFilled(stratRes.data, ["step_1_hidden_facets", "cloud_offer", "pillar_major", "creative_concept"]);

      setProgress({ storytelling, persona, tone, proposition, niche, strategy });
      setLoading(false);
    });
  }, [user]);

  // Global score: 6 sections all available
  const availableSections = 6;
  const sectionScores = [
    progress.storytelling / 8,
    progress.persona / 5,
    progress.tone / 9,
    progress.proposition / 4,
    progress.niche / 3,
    progress.strategy / 4,
  ];
  const globalPercent = Math.round((sectionScores.reduce((a, b) => a + b, 0) / availableSections) * 100);

  const globalMessage =
    globalPercent > 80
      ? "Ton branding est solide. L'IA te connaît bien."
      : globalPercent >= 50
        ? "Tu avances bien ! Quelques sections à compléter."
        : "Continue à remplir pour débloquer tout le potentiel de l'outil.";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        {/* Back */}
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        {/* Header */}
        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon Branding</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          C'est ici que tout commence. Plus tu remplis, plus L'Assistant Com' te connaît et te propose des idées qui te ressemblent.
        </p>

        {/* Global score */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[12px] font-semibold text-foreground">
              Mon branding est complet à {globalPercent}%
            </span>
          </div>
          <Progress value={globalPercent} className="h-2.5 mb-2" />
          <p className="text-[12px] text-muted-foreground">{globalMessage}</p>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => {
            const pLabel = card.progressLabel(progress);
            const pValue = card.progressValue(progress);
            const CardWrapper = card.available ? Link : "div";
            const wrapperProps = card.available ? { to: card.route } : {};

            return (
              <CardWrapper
                key={card.route}
                {...(wrapperProps as any)}
                className={`block rounded-2xl border-2 bg-card p-5 transition-all group ${
                  card.available
                    ? "border-border hover:border-primary hover:shadow-md cursor-pointer"
                    : "border-border/50 opacity-60 cursor-default"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{card.emoji}</span>
                  {card.available && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                </div>
                <h3 className="font-display text-base font-bold text-foreground mb-1">{card.title}</h3>
                <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
                {card.available ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Progress value={pValue} className="h-1.5 flex-1" />
                      <span className="font-mono-ui text-[10px] font-semibold text-muted-foreground shrink-0">{pLabel}</span>
                    </div>
                    <span className="font-mono-ui text-[11px] font-semibold text-primary">{card.cta}</span>
                  </>
                ) : (
                  <span className="font-mono-ui text-[11px] font-semibold text-muted-foreground">{pLabel}</span>
                )}
              </CardWrapper>
            );
          })}
        </div>
      </main>
    </div>
  );
}
