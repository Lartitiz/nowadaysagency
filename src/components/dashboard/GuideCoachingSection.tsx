import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, ArrowRight, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserPlan } from "@/hooks/use-user-plan";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";

/* ── localStorage helpers ── */
const LS_VISIT_COUNT = "guide_coaching_visit_count";
const LS_DISMISSED_AT = "guide_coaching_dismissed_at";
const DISMISS_DAYS = 14;

function getVisitCount(): number {
  try { return parseInt(localStorage.getItem(LS_VISIT_COUNT) || "0", 10); } catch { return 0; }
}
function incrementVisitCount() {
  localStorage.setItem(LS_VISIT_COUNT, String(getVisitCount() + 1));
}
function getDismissedAt(): number | null {
  try {
    const ts = localStorage.getItem(LS_DISMISSED_AT);
    return ts ? parseInt(ts, 10) : null;
  } catch { return null; }
}
function dismiss() {
  localStorage.setItem(LS_DISMISSED_AT, String(Date.now()));
}
function isDismissed(): boolean {
  const ts = getDismissedAt();
  if (!ts) return false;
  const daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_DAYS;
}

/* ── Should show soft CTA? ── */
function shouldShowSoftCTA(brandingScore: number, isDemo: boolean): boolean {
  // In demo mode, always show (branding > 50%)
  if (isDemo) return true;
  if (isDismissed()) return false;
  if (brandingScore > 50) return true;
  const count = getVisitCount();
  return count % 3 === 0;
}

/* ── Animations ── */
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

/* ── Demo program card ── */
function DemoActiveProgramCard() {
  const navigate = useNavigate();

  const nextSessionDate = new Date();
  nextSessionDate.setDate(nextSessionDate.getDate() + 5);
  const nextSession = nextSessionDate.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const month = 2;
  const progressPct = Math.round((month / 6) * 100);

  return (
    <motion.div
      variants={itemVariants}
      className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-l-4 border-[#fb3d80] p-5 sm:p-6 mb-6"
    >
      <div className="flex items-start gap-4">
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium text-white"
          style={{ background: "linear-gradient(135deg, #ffa7c6, #fb3d80)" }}
        >
          LM
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-base sm:text-lg text-foreground mb-1"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            Ton accompagnement
          </h3>
          <p
            className="text-xs text-muted-foreground mb-3"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Phase stratégie : on construit ton plan de com'
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <span className="text-foreground">Mois {month}/6</span>
            <span className="text-muted-foreground">Prochaine session : {nextSession}</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,167,198,0.2)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #ffa7c6, #fb3d80)" }}
            />
          </div>
          <button
            onClick={() => navigate("/accompagnement")}
            className="text-xs font-medium inline-flex items-center gap-1 transition-colors hover:opacity-80"
            style={{ color: "#fb3d80", fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Voir mon espace accompagnement
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Active program card (real data) ── */
function ActiveProgramCard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [program, setProgram] = useState<any>(null);
  const [nextSession, setNextSession] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prog } = await (supabase.from("coaching_programs" as any) as any)
        .select("current_month, current_phase, start_date, id")
        .eq("client_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (!prog) return;
      setProgram(prog);

      const { data: sess } = await (supabase.from("coaching_sessions" as any) as any)
        .select("scheduled_date")
        .eq("program_id", prog.id)
        .eq("status", "scheduled")
        .order("scheduled_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (sess?.scheduled_date) {
        setNextSession(new Date(sess.scheduled_date).toLocaleDateString("fr-FR", {
          weekday: "long", day: "numeric", month: "long",
        }));
      }
    })();
  }, [user]);

  if (!program) return null;

  const month = program.current_month || 1;
  const progressPct = Math.round((month / 6) * 100);
  const phaseLabel = month <= 3
    ? "Phase stratégie : on construit ton plan de com'"
    : "Phase application : on met en pratique ensemble";

  return (
    <motion.div
      variants={itemVariants}
      className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-l-4 border-[#fb3d80] p-5 sm:p-6 mb-6"
    >
      <div className="flex items-start gap-4">
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-medium text-white"
          style={{ background: "linear-gradient(135deg, #ffa7c6, #fb3d80)" }}
        >
          LM
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-base sm:text-lg text-foreground mb-1"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            Ton accompagnement
          </h3>
          <p
            className="text-xs text-muted-foreground mb-3"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {phaseLabel}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            <span className="text-foreground">Mois {month}/6</span>
            {nextSession && (
              <span className="text-muted-foreground">Prochaine session : {nextSession}</span>
            )}
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,167,198,0.2)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #ffa7c6, #fb3d80)" }}
            />
          </div>
          <button
            onClick={() => navigate("/accompagnement")}
            className="text-xs font-medium inline-flex items-center gap-1 transition-colors hover:opacity-80"
            style={{ color: "#fb3d80", fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Voir mon espace accompagnement
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Soft CTA card ── */
function SoftCTACard({ onDismiss, isDemo }: { onDismiss: () => void; isDemo: boolean }) {
  const navigate = useNavigate();

  return (
    <motion.div
      variants={itemVariants}
      className="relative rounded-[20px] p-5 sm:p-6 mb-6"
      style={{
        background: "linear-gradient(135deg, #ffffff 0%, #fff4f8 100%)",
        border: "2px dashed #ffa7c6",
      }}
    >
      {/* Dismiss button (hidden in demo) */}
      {!isDemo && (
        <button
          onClick={() => { dismiss(); onDismiss(); }}
          className="absolute top-3 right-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          title="Pas maintenant"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div className="flex items-start gap-4">
        <Heart className="h-7 w-7 text-[#fb3d80] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3
            className="text-base sm:text-lg text-foreground mb-2"
            style={{ fontFamily: "'Libre Baskerville', serif" }}
          >
            Envie de ne plus être seul·e ?
          </h3>
          <p
            className="text-sm text-muted-foreground leading-relaxed mb-4"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            Avec "Ta binôme de com'", on avance ensemble. Pas des conseils qu'on applique jamais : on fait à deux, pendant 6 mois.
          </p>
          <button
            onClick={() => navigate("/abonnement")}
            className="text-sm font-medium inline-flex items-center gap-1 transition-colors hover:opacity-80"
            style={{ color: "#fb3d80", fontFamily: "'IBM Plex Mono', monospace" }}
          >
            En savoir plus
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main export ── */
interface GuideCoachingSectionProps {
  brandingPercent: number; // 0-100
}

export default function GuideCoachingSection({ brandingPercent }: GuideCoachingSectionProps) {
  const { isPilot } = useUserPlan();
  const { isDemoMode, demoPlan } = useDemoContext();
  const [dismissed, setDismissed] = useState(false);

  // Increment visit counter on mount (skip in demo)
  useEffect(() => { if (!isDemoMode) incrementVisitCount(); }, [isDemoMode]);

  // Demo mode: respect the Free/Binôme toggle
  if (isDemoMode) {
    if (demoPlan === "now_pilot") {
      return <DemoActiveProgramCard />;
    }
    // Free demo: always show soft CTA (branding > 50%)
    return <SoftCTACard onDismiss={() => {}} isDemo />;
  }

  // Real mode
  if (isPilot) {
    return <ActiveProgramCard />;
  }

  if (dismissed || !shouldShowSoftCTA(brandingPercent, false)) return null;

  return <SoftCTACard onDismiss={() => setDismissed(true)} isDemo={false} />;
}
