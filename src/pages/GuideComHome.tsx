import { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useProfile } from "@/hooks/use-profile";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Compass, Target, Palette, MessageCircle, ArrowRight } from "lucide-react";

/* ── Types ── */
interface Alternative {
  title: string;
  route: string;
  icon: React.ReactNode;
}

interface Recommendation {
  title: string;
  explanation: string;
  ctaLabel: string;
  ctaRoute: string;
  icon: React.ReactNode;
  alternatives: Alternative[];
}

/* ── Static mock (will be replaced by smart logic) ── */
const MOCK_RECOMMENDATION: Recommendation = {
  title: "Clarifier qui est ton·ta client·e idéal·e",
  explanation:
    "Tu as un super storytelling mais ton persona n'est pas encore défini. Sans ça, tes contenus risquent de parler dans le vide. On va poser les bases en 10 minutes.",
  ctaLabel: "C'est parti !",
  ctaRoute: "/branding/persona",
  icon: <Target className="h-8 w-8 text-[#fb3d80] shrink-0" />,
  alternatives: [
    {
      title: "Travailler mon positionnement",
      route: "/branding/proposition",
      icon: <Compass className="h-5 w-5 text-[#fb3d80]" />,
    },
    {
      title: "Créer un contenu",
      route: "/creer",
      icon: <MessageCircle className="h-5 w-5 text-[#fb3d80]" />,
    },
  ],
};

/* ── Animations ── */
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

/* ── Component ── */
export default function GuideComHome() {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const navigate = useNavigate();
  const { data: profileRaw } = useProfile();

  const prenom = useMemo(() => {
    if (isDemoMode && demoData) return demoData.profile.first_name;
    return (profileRaw as any)?.first_name || (profileRaw as any)?.prenom || "toi";
  }, [profileRaw, isDemoMode, demoData]);

  const recommendation = MOCK_RECOMMENDATION;

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
            <span className="text-[#fb3d80]">{prenom}</span> !
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
            <div className="mt-1">{recommendation.icon}</div>
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
                className="text-white border-0 rounded-xl px-6 py-2.5 text-sm font-medium"
                style={{ background: "#fb3d80" }}
              >
                {recommendation.ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ─── Alternatives ─── */}
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
                {alt.icon}
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
