import { useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useDemoContext } from "@/contexts/DemoContext";
import { getWelcomeMessage } from "@/lib/welcome-messages";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { DashboardViewToggle, getDashboardPreference } from "@/components/dashboard/DashboardViewToggle";
import GuideProgressBar from "@/components/dashboard/GuideProgressBar";
import {
  Target, Compass, MessageCircle, ArrowRight, BookOpen, Users, Search,
  ClipboardCheck, LayoutGrid, PenLine, Palette, Layers, CalendarDays,
  CalendarPlus, Lightbulb, BarChart3, Sparkles, Rocket, Heart, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Icon map ── */
const ICON_MAP: Record<string, LucideIcon> = {
  Target, Compass, MessageCircle, BookOpen, Users, Search,
  ClipboardCheck, LayoutGrid, PenLine, Palette, Layers, CalendarDays,
  CalendarPlus, Lightbulb, BarChart3, Sparkles,
};

function getIcon(name: string, className: string) {
  const Icon = ICON_MAP[name] ?? Sparkles;
  return <Icon className={className} />;
}

/* ── Rich text: render *(...) * as styled asides ── */
function RichExplanation({ text }: { text: string }) {
  const parts = text.split(/(\*\(.*?\)\*)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("*(") && part.endsWith(")*")) {
          const inner = part.slice(2, -2);
          return (
            <span
              key={i}
              className="block mt-2 text-xs italic"
              style={{ color: "#91014b", fontFamily: "'IBM Plex Mono', monospace" }}
            >
              ({inner})
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/* ── Animations ── */
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

/* ── Dots loading animation ── */
function DotsLoading() {
  return (
    <span className="inline-flex gap-1 ml-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-[#fb3d80]/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </span>
  );
}

/* ── Skeleton loader ── */
function GuideSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "#fff4f8" }}>
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8">
          <div className="h-7 w-72 rounded-md bg-muted/40 animate-pulse mb-3" />
          <div className="h-4 w-56 rounded-md bg-muted/30 animate-pulse" />
        </div>
        <div className="bg-white rounded-[20px] border-l-4 border-[#fb3d80]/30 p-6 sm:p-8 mb-6">
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-lg bg-muted/30 animate-pulse shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-5 w-3/4 rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-full rounded bg-muted/30 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted/30 animate-pulse" />
              <div className="h-10 w-36 rounded-xl bg-muted/30 animate-pulse mt-4" />
            </div>
          </div>
        </div>
        <p
          className="text-xs text-muted-foreground italic"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Je regarde où tu en es
          <DotsLoading />
        </p>
      </main>
    </div>
  );
}

/* ── Error state ── */
function GuideError({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="min-h-screen" style={{ background: "#fff4f8" }}>
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-l-4 border-[#fb3d80] p-6 sm:p-8 text-center"
        >
          <Sparkles className="h-10 w-10 text-[#fb3d80] mx-auto mb-4" />
          <h2
            className="text-lg sm:text-xl text-foreground mb-3"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            Oups, un petit souci
          </h2>
          <p
            className="text-sm text-muted-foreground leading-relaxed mb-5"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Je n'arrive pas à analyser ton compte pour le moment.
            <br />
            En attendant, tu peux explorer l'outil librement !
          </p>
          <Button
            onClick={() => navigate("/dashboard/complet")}
            className="text-white border-0 rounded-xl px-6 py-2.5 text-sm font-medium hover:opacity-90"
            style={{ background: "#fb3d80" }}
          >
            Explorer l'outil
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      </main>
    </div>
  );
}

/* ── First visit welcome (brand new account) ── */
function FirstVisitWelcome({ firstName, navigate }: { firstName: string; navigate: (path: string) => void }) {
  return (
    <motion.div
      variants={itemVariants}
      className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-l-4 border-[#fb3d80] p-6 sm:p-8 mb-6"
    >
      <h2
        className="text-lg sm:text-xl text-foreground mb-4"
        style={{ fontFamily: "'Libre Baskerville', serif" }}
      >
        Bienvenue {firstName} ! 🎉
      </h2>
      <p
        className="text-sm text-muted-foreground leading-relaxed mb-5"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        Je suis ton assistant com'. Ensemble, on va :
      </p>
      <div className="space-y-3 mb-6">
        {[
          { icon: <Heart className="h-5 w-5 text-[#fb3d80]" />, text: "Poser les fondations de ta marque (ton histoire, ton persona, ta proposition de valeur)" },
          { icon: <Zap className="h-5 w-5 text-[#fb3d80]" />, text: "Créer du contenu qui te ressemble, avec l'aide de l'IA" },
          { icon: <Rocket className="h-5 w-5 text-[#fb3d80]" />, text: "Planifier et publier régulièrement, sans prise de tête" },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3 bg-[#fff4f8] rounded-xl p-3">
            <div className="mt-0.5 shrink-0">{item.icon}</div>
            <span
              className="text-sm text-foreground leading-relaxed"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {item.text}
            </span>
          </div>
        ))}
      </div>
      <Button
        onClick={() => navigate("/onboarding")}
        className="text-white border-0 rounded-xl px-6 py-2.5 text-sm font-medium hover:opacity-90"
        style={{ background: "#fb3d80" }}
      >
        Commencer mon diagnostic
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </motion.div>
  );
}

/* ── Component ── */
export default function GuideComHome() {
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const { recommendation, profileSummary, isLoading, error } = useGuideRecommendation();

  // Redirect to complete view if user preference is saved (skip in demo)
  useEffect(() => {
    if (!isDemoMode && getDashboardPreference() === "complete") {
      navigate("/dashboard/complet", { replace: true });
    }
  }, [isDemoMode, navigate]);

  // Welcome message (memoized to avoid re-rolling on re-render)
  const welcomeMessage = useMemo(() => {
    const isFirstVisit = !profileSummary.onboardingComplete && profileSummary.brandingSections === 0;
    return getWelcomeMessage(
      profileSummary.firstName,
      new Date().getHours(),
      isFirstVisit,
      null, // TODO: track daysSinceLastVisit
    );
  }, [profileSummary.firstName, profileSummary.onboardingComplete, profileSummary.brandingSections]);

  // Detect brand-new account (nothing done at all)
  const isBrandNew = !profileSummary.onboardingComplete
    && profileSummary.brandingSections === 0
    && profileSummary.calendarPosts === 0;

  if (isLoading) return <GuideSkeleton />;
  if (error) return <GuideError navigate={navigate} />;

  return (
    <div className="min-h-screen" style={{ background: "#fff4f8" }}>
      <AppHeader />

      <motion.main
        className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* ─── Toggle ─── */}
        <motion.div variants={itemVariants} className="flex justify-end mb-4">
          <DashboardViewToggle current="guide" />
        </motion.div>

        {/* ─── Header accueil ─── */}
        <motion.div variants={itemVariants} className="mb-8 sm:mb-10">
          <h1
            className="text-xl sm:text-2xl md:text-[28px] text-foreground leading-tight"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            {welcomeMessage}
          </h1>
          <p
            className="mt-2 text-sm text-muted-foreground"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Je regarde où tu en es et je te propose la prochaine étape.
          </p>
        </motion.div>

        {/* ─── Progress bar (not for brand new accounts) ─── */}
        {!isBrandNew && (
          <motion.div variants={itemVariants}>
            <GuideProgressBar profileSummary={profileSummary} firstName={profileSummary.firstName} />
          </motion.div>
        )}

        {/* ─── Brand new account: special welcome ─── */}
        {isBrandNew ? (
          <FirstVisitWelcome firstName={profileSummary.firstName} navigate={navigate} />
        ) : (
          <>
            {/* ─── Recommandation principale ─── */}
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-l-4 border-[#fb3d80] p-6 sm:p-8 mb-6"
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {getIcon(recommendation.icon, "h-8 w-8 text-[#fb3d80] shrink-0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h2
                    className="text-lg sm:text-xl text-foreground mb-2"
                    style={{ fontFamily: "'Libre Baskerville', serif" }}
                  >
                    {recommendation.title}
                  </h2>
                  <div
                    className="text-sm text-muted-foreground leading-relaxed mb-5"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    <RichExplanation text={recommendation.explanation} />
                  </div>
                  <Button
                    onClick={() => navigate(recommendation.ctaRoute)}
                    className="text-white border-0 rounded-xl px-6 py-2.5 text-sm font-medium hover:opacity-90"
                    style={{ background: "#fb3d80" }}
                  >
                    {recommendation.ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* ─── Alternatives ─── */}
            {recommendation.alternatives.length > 0 && (
              <motion.div variants={itemVariants} className="mb-10">
                <p
                  className="text-xs text-muted-foreground mb-3"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Sinon, tu peux aussi...
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendation.alternatives.map((alt) => (
                    <button
                      key={alt.route}
                      onClick={() => navigate(alt.route)}
                      className="flex items-center gap-3 bg-white rounded-[16px] border border-[#fb3d80]/20 p-4 text-left
                        hover:border-[#fb3d80]/50 hover:shadow-sm transition-all duration-200 group"
                    >
                      {getIcon(alt.icon, "h-5 w-5 text-[#fb3d80]")}
                      <span
                        className="text-sm text-foreground group-hover:text-[#fb3d80] transition-colors"
                        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                      >
                        {alt.title}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* ─── Lien dashboard complet ─── */}
        <motion.div variants={itemVariants} className="text-center">
          <Link
            to="/dashboard/complet"
            className="text-xs text-muted-foreground hover:text-[#fb3d80] transition-colors inline-flex items-center gap-1"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Voir toutes les fonctionnalités
            <ArrowRight className="h-3 w-3" />
          </Link>
        </motion.div>
      </motion.main>
    </div>
  );
}
