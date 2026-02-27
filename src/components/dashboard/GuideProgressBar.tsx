import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "@/hooks/use-toast";
import type { ProfileSummary } from "@/hooks/use-guide-recommendation";

/* ── Score calculation ── */
function calculateScore(p: ProfileSummary): number {
  let score = 0;
  if (p.onboardingComplete) score += 15;
  score += p.brandingSections * 10; // max 60
  if (p.lastAuditDate) score += 10;
  if (p.calendarPosts >= 3) score += 10;
  if (p.contentsGenerated && p.contentsGenerated >= 1) score += 5;
  return Math.min(score, 100);
}

/* ── Endowed progress: minimum 10% visual ── */
function displayPercent(score: number): number {
  return Math.max(10, score);
}

/* ── Encouragement label ── */
function getEncouragement(score: number): string {
  if (score > 80) return "(Quasi pro !)";
  if (score > 60) return "(Tu gères !)";
  if (score >= 30) return "(Belle progression !)";
  return "(On y va !)";
}

/* ── Milestone logic ── */
const MILESTONES = [25, 50, 75, 100];
const LS_KEY = "guide_milestones_reached";

function getReachedMilestones(): number[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function markMilestoneReached(milestone: number) {
  const reached = getReachedMilestones();
  if (!reached.includes(milestone)) {
    reached.push(milestone);
    localStorage.setItem(LS_KEY, JSON.stringify(reached));
  }
}

/* ── Chips config ── */
interface ChipConfig {
  label: string;
  done: boolean;
  route: string;
}

function getChips(p: ProfileSummary): ChipConfig[] {
  return [
    {
      label: `Branding ${p.brandingSections}/6`,
      done: p.brandingSections >= 6,
      route: "/branding",
    },
    {
      label: `Calendrier : ${p.calendarPosts} post${p.calendarPosts !== 1 ? "s" : ""}`,
      done: p.calendarPosts >= 3,
      route: "/calendrier",
    },
    {
      label: `Audit : ${p.lastAuditDate ? "fait" : "à faire"}`,
      done: !!p.lastAuditDate,
      route: "/instagram/audit",
    },
    {
      label: `Contenus : ${p.contentsGenerated ?? 0} ce mois`,
      done: (p.contentsGenerated ?? 0) >= 1,
      route: "/creer",
    },
  ];
}

/* ── Component ── */
interface GuideProgressBarProps {
  profileSummary: ProfileSummary;
  firstName: string;
}

export default function GuideProgressBar({ profileSummary, firstName }: GuideProgressBarProps) {
  const navigate = useNavigate();
  const score = calculateScore(profileSummary);
  const visual = displayPercent(score);
  const celebratedRef = useRef(false);

  // Milestone celebration (once per milestone per session)
  useEffect(() => {
    if (celebratedRef.current) return;
    const reached = getReachedMilestones();
    const newMilestone = MILESTONES.find((m) => score >= m && !reached.includes(m));
    if (newMilestone) {
      celebratedRef.current = true;
      markMilestoneReached(newMilestone);
      // Delay to let the bar animate first
      setTimeout(() => {
        confetti({
          particleCount: 60,
          spread: 55,
          origin: { y: 0.7 },
          colors: ["#fb3d80", "#ffa7c6", "#fff4f8", "#91014b"],
          disableForReducedMotion: true,
        });
        toast({
          title: `Bravo ${firstName} ! 🎉`,
          description: `Ta com' est structurée à ${score}% maintenant.`,
        });
      }, 1200);
    }
  }, [score, firstName]);

  const chips = getChips(profileSummary);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mb-6"
    >
      {/* ── Label ── */}
      <p
        className="text-sm mb-2"
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#91014b" }}
      >
        Ta com' est structurée à {score}%{" "}
        <span className="text-muted-foreground">{getEncouragement(score)}</span>
      </p>

      {/* ── Progress bar ── */}
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ background: "rgba(255, 167, 198, 0.2)" }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, #ffa7c6, #fb3d80)",
          }}
          initial={{ width: "0%" }}
          animate={{ width: `${visual}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
        />
      </div>

      {/* ── Chips ── */}
      <div className="flex flex-wrap gap-2 mt-3">
        {chips.map((chip) => (
          <button
            key={chip.route}
            onClick={() => navigate(chip.route)}
            className={`
              inline-flex items-center px-2.5 py-1 rounded-full text-xs border transition-all duration-200
              hover:shadow-sm hover:scale-[1.02] active:scale-[0.98]
              ${
                chip.done
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-[#ffa7c6]/40 bg-white text-muted-foreground"
              }
            `}
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                chip.done ? "bg-emerald-500" : "bg-[#ffa7c6]"
              }`}
            />
            {chip.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
