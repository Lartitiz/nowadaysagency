import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BrandingAnalysisLoaderProps {
  sources: { website?: string; instagram?: string; linkedin?: string; hasDocuments?: boolean };
  error?: string | null;
  onRetry: () => void;
  onSkip: () => void;
  done?: boolean;
}

export default function BrandingAnalysisLoader({
  sources,
  error,
  onRetry,
  onSkip,
  done = false,
}: BrandingAnalysisLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(5);

  // Build dynamic messages based on sources provided
  const messages: string[] = [];
  if (sources.website) messages.push("Je lis ton site web...");
  if (sources.instagram) messages.push("Je regarde ton Instagram...");
  if (sources.linkedin) messages.push("Je parcours ton LinkedIn...");
  if (sources.hasDocuments) messages.push("Je lis tes documents...");
  messages.push(
    "J'analyse ton positionnement...",
    "Je devine à qui tu parles...",
    "Je comprends ton ton de voix...",
    "Je structure tout ça pour toi...",
    "C'est presque prêt..."
  );

  // Rotate messages every 4s
  useEffect(() => {
    if (error || done) return;
    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [messages.length, error, done]);

  // Progress bar advances by step with each message, capped at 85%
  useEffect(() => {
    if (done) {
      setProgress(100);
      return;
    }
    if (error) return;
    const stepSize = 80 / messages.length;
    const target = Math.min(5 + stepSize * (messageIndex + 1), 85);
    setProgress(target);
  }, [messageIndex, messages.length, done, error]);

  if (error) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[480px] text-center"
        >
          <div className="text-4xl mb-4">😕</div>
          <p className="font-display text-[22px] text-foreground mb-3">
            Oups, j'ai eu du mal à analyser tes liens.
          </p>
          <p className="font-mono-ui text-[14px] text-muted-foreground mb-8 leading-relaxed">
            Ça peut arriver ! Tu peux réessayer ou remplir ton branding manuellement.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onRetry}
              className="bg-[#fb3d80] hover:bg-[#91014b] text-white rounded-[12px] px-8 py-3 text-[15px] font-semibold transition-all duration-200 hover:scale-[1.02]"
            >
              Réessayer
            </button>
            <button
              onClick={onSkip}
              className="font-mono-ui text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Remplir manuellement →
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-[480px] text-center"
      >
        {/* Animated message */}
        <div className="h-[60px] flex items-center justify-center mb-6">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="font-mono-ui text-[16px] text-[#91014b]"
            >
              {messages[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[320px] mx-auto mb-6">
          <div className="h-[8px] rounded-full bg-[#fce4ec] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #ffa7c6, #fb3d80)",
              }}
              initial={{ width: "5%" }}
              animate={{ width: `${progress}%` }}
              transition={{
                type: "spring",
                stiffness: 60,
                damping: 20,
              }}
            />
          </div>
        </div>

        {/* Sub-text */}
        <p className="font-mono-ui text-[12px] text-muted-foreground">
          Ça prend entre 15 et 45 secondes. Le temps d'un café ☕
        </p>
      </motion.div>
    </div>
  );
}
