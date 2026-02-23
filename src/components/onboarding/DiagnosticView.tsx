import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { type DiagnosticData, getScoreMessage } from "@/lib/diagnostic-data";

interface Props {
  data: DiagnosticData;
  prenom: string;
  onComplete: () => void;
  hasInstagram?: boolean;
  hasWebsite?: boolean;
}

export default function DiagnosticView({ data, prenom, onComplete, hasInstagram, hasWebsite }: Props) {
  const isMobile = useIsMobile();
  return isMobile
    ? <MobileSlides data={data} prenom={prenom} onComplete={onComplete} hasInstagram={hasInstagram} hasWebsite={hasWebsite} />
    : <DesktopScroll data={data} prenom={prenom} onComplete={onComplete} hasInstagram={hasInstagram} hasWebsite={hasWebsite} />;
}

/* ═══ MOBILE: Slide-by-slide ═══ */
function MobileSlides({ data, prenom, onComplete, hasInstagram, hasWebsite }: Props) {
  const [slide, setSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const totalSlides = 7;

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && slide < totalSlides - 1) setSlide(s => s + 1);
      if (diff < 0 && slide > 0) setSlide(s => s - 1);
    }
  };

  const sections = [
    <AccrocheSection key="a" prenom={prenom} hasInstagram={hasInstagram} hasWebsite={hasWebsite} />,
    <ScoreSection key="b" score={data.totalScore} />,
    <StrengthsSection key="c" strengths={data.strengths} />,
    <WeaknessesSection key="d" weaknesses={data.weaknesses} />,
    <PrioritiesSection key="e" priorities={data.priorities} />,
    <ChannelScoresSection key="f" channelScores={data.channelScores} />,
    <FinalSection key="g" onComplete={onComplete} />,
  ];

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              {sections[slide]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="pb-8 pt-4 px-6">
        <div className="flex justify-center gap-1.5 mb-4">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === slide ? "w-6 bg-primary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
        {slide < totalSlides - 1 && (
          <div className="text-center">
            <Button onClick={() => setSlide(s => s + 1)} className="rounded-full px-8">
              Suivant →
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ DESKTOP: Scroll with animations ═══ */
function DesktopScroll({ data, prenom, onComplete, hasInstagram, hasWebsite }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-6 py-16 space-y-24">
        <AnimatedSection><AccrocheSection prenom={prenom} hasInstagram={hasInstagram} hasWebsite={hasWebsite} /></AnimatedSection>
        <AnimatedSection><ScoreSection score={data.totalScore} /></AnimatedSection>
        <AnimatedSection><StrengthsSection strengths={data.strengths} /></AnimatedSection>
        <AnimatedSection><WeaknessesSection weaknesses={data.weaknesses} /></AnimatedSection>
        <AnimatedSection><PrioritiesSection priorities={data.priorities} /></AnimatedSection>
        <AnimatedSection><ChannelScoresSection channelScores={data.channelScores} /></AnimatedSection>
        <AnimatedSection><FinalSection onComplete={onComplete} /></AnimatedSection>
      </div>
    </div>
  );
}

function AnimatedSection({ children }: { children: ReactNode }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}

/* ═══ Section 1: Accroche ═══ */
function AccrocheSection({ prenom, hasInstagram, hasWebsite }: { prenom: string; hasInstagram?: boolean; hasWebsite?: boolean }) {
  let analyzed = "ce que tu m'as partagé sur ta marque";
  if (hasInstagram && hasWebsite) analyzed = "ton Instagram, ton site, et ce que tu m'as partagé";
  else if (hasInstagram) analyzed = "ton Instagram et ce que tu m'as partagé";
  else if (hasWebsite) analyzed = "ton site et ce que tu m'as partagé";

  return (
    <div className="text-center space-y-4">
      <h1 className="text-[28px] md:text-[32px] font-display font-bold text-foreground leading-tight">
        {prenom}, voilà ce que je vois.
      </h1>
      <p className="text-base text-muted-foreground">J'ai regardé {analyzed}.</p>
      <p className="text-base text-muted-foreground">Voilà ton point de départ.</p>
    </div>
  );
}

/* ═══ Section 2: Score ═══ */
function ScoreSection({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= score) { setDisplayed(score); clearInterval(interval); }
      else setDisplayed(Math.round(current));
    }, duration / steps);
    return () => clearInterval(interval);
  }, [isInView, score]);

  const pct = score / 100;
  const circumference = 2 * Math.PI * 80;
  const offset = circumference * (1 - pct);
  const color = score < 40 ? "hsl(0 84% 60%)" : score < 60 ? "hsl(25 95% 53%)" : score < 80 ? "hsl(var(--primary))" : "hsl(160 84% 39%)";

  return (
    <div ref={ref} className="text-center space-y-6">
      <h2 className="text-xl font-display font-bold text-foreground">Ton score de communication</h2>
      <div className="relative w-[200px] h-[200px] mx-auto">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="80" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <motion.circle
            cx="100" cy="100" r="80" fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={isInView ? { strokeDashoffset: offset } : {}}
            transition={{ duration: 1.5, ease: "easeOut" }}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-6xl font-bold text-foreground">{displayed}</span>
          <span className="text-xl text-muted-foreground">/100</span>
        </div>
      </div>
      <p className="text-base text-muted-foreground italic max-w-sm mx-auto">{getScoreMessage(score)}</p>
    </div>
  );
}

/* ═══ Section 3: Strengths ═══ */
function StrengthsSection({ strengths }: { strengths: string[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">✅ Ce qui marche déjà chez toi</h2>
      {strengths.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.3, duration: 0.4 }}
          className="flex items-start gap-3"
        >
          <span className="text-green-500 text-xl mt-0.5">✓</span>
          <p className="text-foreground text-base">{s}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ═══ Section 4: Weaknesses ═══ */
function WeaknessesSection({ weaknesses }: { weaknesses: { title: string; why: string }[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">⚡ Ce qu'on va travailler</h2>
      {weaknesses.map((w, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.3, duration: 0.4 }}
          className="flex items-start gap-3"
        >
          <span className="text-orange-400 text-xl mt-0.5">⚠️</span>
          <div>
            <p className="font-medium text-foreground">{w.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{w.why}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ═══ Section 5: Priorities ═══ */
function PrioritiesSection({ priorities }: { priorities: DiagnosticData["priorities"] }) {
  const channelEmoji: Record<string, string> = {
    instagram: "📱", website: "🌐", newsletter: "✉️",
    seo: "🔍", branding: "🎨", linkedin: "💼",
  };
  const impactBorder: Record<string, string> = {
    high: "border-l-primary", medium: "border-l-accent", low: "border-l-border",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">🎯 Par où commencer</h2>
      <p className="text-sm text-muted-foreground">Si tu fais 3 choses ce mois-ci, fais celles-là :</p>
      <div className="space-y-3">
        {priorities.map((p, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.2 }}
            className={`p-5 rounded-xl bg-card border border-border border-l-4 ${impactBorder[p.impact]} shadow-sm`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl font-bold text-primary">{i + 1}.</span>
              <div>
                <p className="font-medium text-foreground">{p.title}</p>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{channelEmoji[p.channel] || "📌"} {p.channel}</span>
                  <span>·</span>
                  <span>Impact {p.impact === "high" ? "fort" : "moyen"}</span>
                  <span>·</span>
                  <span>⏱️ {p.time}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ═══ Section 6: Channel Scores ═══ */
function ChannelScoresSection({ channelScores }: { channelScores: DiagnosticData["channelScores"] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold text-foreground">📊 Ta com' canal par canal</h2>
      <div className="space-y-3">
        {channelScores.map((c, i) => (
          <ChannelBar key={i} {...c} />
        ))}
      </div>
    </div>
  );
}

function ChannelBar({ emoji, label, score }: { emoji: string; label: string; score: number | null }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-xl w-8">{emoji}</span>
        <span className="w-28 text-sm text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground italic">Non analysé</span>
      </div>
    );
  }

  const color = score < 40 ? "bg-destructive/60" : score < 60 ? "bg-accent" : score < 80 ? "bg-primary" : "bg-green-400";

  return (
    <div className="flex items-center gap-4">
      <span className="text-xl w-8">{emoji}</span>
      <span className="w-28 text-sm text-muted-foreground">{label}</span>
      <div className="flex-1 bg-border/30 rounded-full h-3">
        <motion.div
          className={`h-3 rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <span className="text-sm font-medium w-16 text-right text-foreground">{score}/100</span>
    </div>
  );
}

/* ═══ Section 7: Final ═══ */
function FinalSection({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="text-center space-y-6 py-8">
      <h2 className="text-[28px] md:text-[32px] font-display font-bold text-foreground leading-tight">
        Maintenant, tu sais d'où tu pars.
      </h2>
      <div className="space-y-1 text-base text-muted-foreground">
        <p>Ton espace est prêt.</p>
        <p>Tes priorités sont identifiées.</p>
        <p>On a du boulot, mais c'est faisable.</p>
      </div>
      <p className="text-lg font-display font-bold text-foreground">On y va ?</p>
      <Button
        onClick={onComplete}
        size="lg"
        className="rounded-full px-10 text-base shadow-lg"
      >
        Découvrir mon espace →
      </Button>
    </div>
  );
}
