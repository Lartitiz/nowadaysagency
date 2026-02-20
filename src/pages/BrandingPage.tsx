import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";

/* ─── Types ─── */
interface SectionProgress {
  storytellingCount: number;
  hasPrimary: boolean;
  persona: number; // out of 5
  tone: number; // out of 8
  proposition: number; // out of 4
  strategy: number; // out of 3
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
    cta: "Voir mes storytellings →",
    progressLabel: (p) => `${p.storytellingCount} storytelling(s)${p.hasPrimary ? " · ⭐ Principal défini" : " · ⚠️ Aucun principal"}`,
    progressValue: (p) => p.storytellingCount > 0 ? 100 : 0,
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
    description: "Ce qui te rend unique. Les phrases que tu vas utiliser partout.",
    route: "/branding/proposition",
    cta: "Trouver ma proposition de valeur →",
    progressLabel: (p) => `${p.proposition} / 4 étapes`,
    progressValue: (p) => (p.proposition / 4) * 100,
    available: true,
  },
  {
    emoji: "🎨",
    title: "Mon ton, mon style & mes combats",
    description: "Comment tu parles, ce que tu défends, tes limites. Tout ce qui fait que c'est toi.",
    route: "/branding/ton",
    cta: "Définir ma voix →",
    progressLabel: (p) => `${p.tone} / 8 sections`,
    progressValue: (p) => (p.tone / 8) * 100,
    available: true,
  },
  {
    emoji: "🍒",
    title: "Ma stratégie de contenu",
    description: "Tes piliers, ton twist créatif. Ce qui donne une colonne vertébrale à tes contenus.",
    route: "/branding/strategie",
    cta: "Poser ma stratégie →",
    progressLabel: (p) => `${p.strategy} / 3 étapes`,
    progressValue: (p) => (p.strategy / 3) * 100,
    available: true,
  },
];

/* ─── Main ─── */
export default function BrandingPage() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<SectionProgress>({ storytellingCount: 0, hasPrimary: false, persona: 0, tone: 0, proposition: 0, strategy: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("storytelling").select("id, is_primary").eq("user_id", user.id),
      supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_profile").select("voice_description, combat_cause, combat_fights, combat_alternative, combat_refusals, tone_register, tone_level, tone_style, tone_humor, tone_engagement, key_expressions, things_to_avoid, target_verbatims, channels").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_proposition").select("step_1_what, step_2a_process, step_3_for_whom, version_final").eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_strategy").select("step_1_hidden_facets, pillar_major, creative_concept").eq("user_id", user.id).maybeSingle(),
    ]).then(([stRes, perRes, toneRes, propRes, stratRes]) => {
      const countFilled = (obj: any, fields: string[]) =>
        obj ? fields.filter((f) => obj[f] && String(obj[f]).trim().length > 0).length : 0;

      const storytellingCount = stRes.data?.length || 0;
      const hasPrimary = stRes.data?.some((s: any) => s.is_primary) || false;
      const persona = countFilled(perRes.data, ["step_1_frustrations", "step_2_transformation", "step_3a_objections", "step_4_beautiful", "step_5_actions"]);

      // Tone: 8 sections = voice_description + combats(any of 4) + 5 chips(counted as 1 if any) + expressions + avoid + verbatims + channels
      const td = toneRes.data;
      let toneScore = 0;
      if (td) {
        if (td.voice_description && String(td.voice_description).trim()) toneScore++;
        if ((td.combat_cause && String(td.combat_cause).trim()) || (td.combat_fights && String(td.combat_fights).trim()) || (td.combat_alternative && String(td.combat_alternative).trim())) toneScore++;
        if (td.combat_refusals && String(td.combat_refusals).trim()) toneScore++;
        const chips = [td.tone_register, td.tone_level, td.tone_style, td.tone_humor, td.tone_engagement];
        if (chips.some((c) => c && String(c).trim())) toneScore++;
        if (td.key_expressions && String(td.key_expressions).trim()) toneScore++;
        if (td.things_to_avoid && String(td.things_to_avoid).trim()) toneScore++;
        if (td.target_verbatims && String(td.target_verbatims).trim()) toneScore++;
        if (td.channels && td.channels.length > 0) toneScore++;
      }

      const proposition = countFilled(propRes.data, ["step_1_what", "step_2a_process", "step_3_for_whom", "version_final"]);
      const strategy = countFilled(stratRes.data, ["step_1_hidden_facets", "pillar_major", "creative_concept"]);

      setProgress({ storytellingCount, hasPrimary, persona, tone: toneScore, proposition, strategy });
      setLoading(false);
    });
  }, [user]);

  // Global score: 5 sections
  const availableSections = 5;
  const sectionScores = [
    progress.storytellingCount > 0 ? 1 : 0,
    progress.persona / 5,
    progress.proposition / 4,
    progress.tone / 8,
    progress.strategy / 3,
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

            return (
              <Link
                key={card.route}
                to={card.route}
                className="block rounded-2xl border-2 bg-card p-5 transition-all group border-border hover:border-primary hover:shadow-md cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{card.emoji}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-display text-base font-bold text-foreground mb-1">{card.title}</h3>
                <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
                <div className="flex items-center gap-2 mb-2">
                  <Progress value={pValue} className="h-1.5 flex-1" />
                  <span className="font-mono-ui text-[10px] font-semibold text-muted-foreground shrink-0">{pLabel}</span>
                </div>
                <span className="font-mono-ui text-[11px] font-semibold text-primary">{card.cta}</span>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
