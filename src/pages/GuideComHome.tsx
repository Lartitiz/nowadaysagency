import { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useGuideRecommendation } from "@/hooks/use-guide-recommendation";
import { useDemoContext } from "@/contexts/DemoContext";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Target, Compass, MessageCircle, ArrowRight, BookOpen, Users, Search,
  ClipboardCheck, LayoutGrid, PenLine, Palette, Layers, CalendarDays,
  CalendarPlus, Lightbulb, BarChart3, Sparkles,
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

/* ── Animations ── */
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

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
          className="text-xs text-muted-foreground mb-3 animate-pulse"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Je regarde où tu en es...
        </p>
      </main>
    </div>
  );
}

/* ── Component ── */
export default function GuideComHome() {
  const { isDemoMode } = useDemoContext();
  const navigate = useNavigate();
  const { recommendation, profileSummary, isLoading } = useGuideRecommendation();

  if (isLoading) return <GuideSkeleton />;

  return (
    <div className="min-h-screen" style={{ background: "#fff4f8" }}>
      <AppHeader />

      <motion.main
        className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* ─── Header accueil ─── */}
        <motion.div variants={itemVariants} className="mb-8 sm:mb-10">
          <h1
            className="text-xl sm:text-2xl md:text-[28px] text-foreground leading-tight"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            Salut{" "}
            <span className="text-[#fb3d80]">{profileSummary.firstName}</span> !
            <br className="sm:hidden" />{" "}
            Prête à avancer sur ta com' aujourd'hui&nbsp;?
          </h1>
          <p
            className="mt-2 text-sm text-muted-foreground"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Je regarde où tu en es et je te propose la prochaine étape.
          </p>
        </motion.div>

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
              <p
                className="text-sm text-muted-foreground leading-relaxed mb-5"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {recommendation.explanation}
              </p>
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
