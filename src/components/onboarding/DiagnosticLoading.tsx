import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type DiagnosticData, computeDiagnosticData, DEMO_DIAGNOSTIC } from "@/lib/diagnostic-data";

const LOADING_PHRASES = [
  "Je regarde ta bio...",
  "J'analyse tes derniers posts...",
  "Je scanne les pages de ton site...",
  "Je calcule ton score...",
  "Je prépare tes recommandations...",
];

interface Props {
  hasInstagram: boolean;
  hasWebsite: boolean;
  hasDocuments: boolean;
  isDemoMode: boolean;
  answers: { canaux: string[]; instagram: string; website: string };
  brandingAnswers: {
    positioning: string; mission: string; target_description: string;
    tone_keywords: string[]; offers: { name: string }[]; values: string[];
  };
  onReady: (data: DiagnosticData) => void;
}

export default function DiagnosticLoading({
  hasInstagram, hasWebsite, hasDocuments, isDemoMode,
  answers, brandingAnswers, onReady,
}: Props) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [checks, setChecks] = useState({ ig: false, web: false, docs: false });

  useEffect(() => {
    if (isDemoMode) {
      // Show animated loading in demo too, but faster (3s)
      const timers = [
        setTimeout(() => setChecks(c => ({ ...c, ig: true })), 500),
        setTimeout(() => setChecks(c => ({ ...c, web: true })), 1000),
        setTimeout(() => setChecks(c => ({ ...c, docs: true })), 1500),
        setTimeout(() => onReady(DEMO_DIAGNOSTIC), 3000),
      ];
      return () => timers.forEach(clearTimeout);
    }

    const timers = [
      setTimeout(() => setChecks(c => ({ ...c, docs: true })), 1000),
      setTimeout(() => setChecks(c => ({ ...c, web: true })), 1800),
      setTimeout(() => setChecks(c => ({ ...c, ig: true })), 2500),
    ];

    const data = computeDiagnosticData(answers, brandingAnswers);
    timers.push(setTimeout(() => onReady(data), 3500));

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIdx(p => (p + 1) % LOADING_PHRASES.length);
    }, isDemoMode ? 1000 : 2500);
    return () => clearInterval(interval);
  }, [isDemoMode]);

  const getStatus = (key: "ig" | "web" | "docs", has: boolean) => {
    if (!has) return "—";
    return checks[key] ? "✅" : "en cours...";
  };

  return (
    <div className="text-center space-y-10">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
        J'analyse ta communication...
      </h1>

      <div className="space-y-3 text-left max-w-xs mx-auto">
        <CheckLine emoji="📱" label="Ton Instagram" status={getStatus("ig", hasInstagram)} />
        <CheckLine emoji="🌐" label="Ton site web" status={getStatus("web", hasWebsite)} />
        <CheckLine emoji="📄" label="Tes documents" status={getStatus("docs", hasDocuments)} />
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={phraseIdx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-muted-foreground italic"
        >
          {LOADING_PHRASES[phraseIdx]}
        </motion.p>
      </AnimatePresence>

      <div className="flex justify-center gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-2 w-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function CheckLine({ emoji, label, status }: { emoji: string; label: string; status: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>{emoji}</span>
      <span className="text-foreground font-medium flex-1">{label}</span>
      <span className={status === "en cours..." ? "text-muted-foreground animate-pulse" : ""}>
        {status}
      </span>
    </div>
  );
}
