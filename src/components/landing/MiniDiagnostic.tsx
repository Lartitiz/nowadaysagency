import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const LOADING_PHRASES = [
  "Je regarde ta bio...",
  "J'analyse tes derniers posts...",
  "Je scanne tes highlights...",
  "Je calcule ton score...",
  "Je prépare ton insight...",
];

type Phase = "input" | "loading" | "result";

interface AuditResult {
  handle: string;
  score: number;
  insight: string;
  category: string;
}

function ScoreArc({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = Math.PI * radius; // half-circle
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        {/* Background arc */}
        <path
          d={`M 6 ${size / 2 + 4} A ${radius} ${radius} 0 0 1 ${size - 6} ${size / 2 + 4}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d={`M 6 ${size / 2 + 4} A ${radius} ${radius} 0 0 1 ${size - 6} ${size / 2 + 4}`}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-[1500ms] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <span className="font-display text-3xl font-bold text-foreground">{score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

export default function MiniDiagnostic() {
  const [phase, setPhase] = useState<Phase>("input");
  const [handle, setHandle] = useState("");
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [animatedScore, setAnimatedScore] = useState(0);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Loading phrases rotation
  useEffect(() => {
    if (phase !== "loading") return;
    const interval = setInterval(() => {
      setPhraseIdx(p => (p + 1) % LOADING_PHRASES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [phase]);

  // Non-linear progress bar during loading
  useEffect(() => {
    if (phase !== "loading") return;
    let frame: number;
    const start = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      // Fast start, slow middle, fast end (easeInOut-ish)
      const t = Math.min(elapsed / 8, 0.95); // max 95% until result
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setProgress(eased * 95);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Animate score on result
  useEffect(() => {
    if (phase !== "result" || !result) return;
    let current = 0;
    const target = result.score;
    const step = () => {
      current += 1;
      if (current > target) { setAnimatedScore(target); return; }
      setAnimatedScore(current);
      requestAnimationFrame(step);
    };
    const t = setTimeout(step, 300);
    return () => clearTimeout(t);
  }, [phase, result]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = handle.trim().replace(/^@/, "");
    if (clean.length < 2) return;

    setPhase("loading");
    setError("");
    setPhraseIdx(0);
    setProgress(0);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mini-audit-instagram`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ handle: clean }),
      });

      const data = await resp.json();

      if (data.rate_limited) {
        setError(data.error);
        setPhase("input");
        return;
      }

      if (!resp.ok && !data.fallback) {
        throw new Error(data.error || "Erreur");
      }

      setResult(data);
      setProgress(100);
      setTimeout(() => setPhase("result"), 400);
    } catch {
      // Fallback result
      setResult({
        handle: clean,
        score: 52,
        insight: "Ton profil mérite un vrai diagnostic. Crée ton compte pour découvrir tes axes d'amélioration.",
        category: "general",
      });
      setProgress(100);
      setTimeout(() => setPhase("result"), 400);
    }
  };

  return (
    <div className="rounded-2xl bg-rose-pale border border-primary/10 p-6 sm:p-8 max-w-xl mx-auto">
      <AnimatePresence mode="wait">
        {phase === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-center space-y-5"
          >
            <h3 className="font-display text-xl sm:text-2xl font-bold text-foreground">
              Ton Instagram, on en parle ?
            </h3>
            <p className="text-sm text-muted-foreground">
              Entre ton @ et découvre ton score de communication en 10 secondes.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="ton_compte_instagram"
                  className="pl-8 rounded-xl h-12 bg-card border-border"
                  required
                  minLength={2}
                />
              </div>
              <Button type="submit" className="rounded-pill h-12 px-6 gap-2 shrink-0">
                <Sparkles className="h-4 w-4" /> Analyser mon profil
              </Button>
            </form>

            {error && (
              <p className="text-sm text-primary font-medium">{error}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Gratuit. Pas besoin de compte. Tes données ne sont pas stockées.
            </p>
          </motion.div>
        )}

        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center space-y-5 py-4"
          >
            <p className="font-display text-lg font-bold text-foreground">
              🔍 J'analyse @{handle.replace(/^@/, "")}...
            </p>

            {/* Progress bar */}
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <AnimatePresence mode="wait">
              <motion.p
                key={phraseIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-muted-foreground italic"
              >
                {LOADING_PHRASES[phraseIdx]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {phase === "result" && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-5"
          >
            <p className="text-sm font-medium text-muted-foreground">@{result.handle}</p>

            <div className="flex justify-center">
              <ScoreArc score={animatedScore} />
            </div>

            <div className="rounded-xl bg-card border border-border p-4 text-left">
              <p className="text-sm text-foreground leading-relaxed">
                <span className="mr-1">💡</span>
                {result.insight}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              3 autres recommandations t'attendent dans ton diagnostic complet.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => navigate(`/register?instagram=${result.handle}`)}
                className="rounded-pill gap-2"
              >
                Créer mon compte gratuitement <ArrowRight className="h-4 w-4" />
              </Button>
              <Link to="/?demo=true">
                <Button variant="outline" className="rounded-pill w-full">
                  Voir un exemple complet →
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
