import { cn } from "@/lib/utils";
import { ArrowUp } from "lucide-react";

interface BioVersion {
  label: string;
  bio_text: string;
  character_count: number;
  style_note: string;
  pourquoi?: string;
  structure?: string;
  score?: number;
}

interface BioBeforeAfterProps {
  currentBio: string;
  currentScore: number;
  bestBio: BioVersion;
}

function ScoreCircle({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const color = score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-error";
  const bg = score >= 70 ? "bg-success-bg border-success/30" : score >= 40 ? "bg-warning-bg border-warning/30" : "bg-error-bg border-error/30";
  const dim = size === "lg" ? "h-16 w-16" : "h-12 w-12";

  return (
    <div className={cn("rounded-full border-2 flex items-center justify-center flex-shrink-0", bg, dim)}>
      <span className={cn("font-bold", color, size === "lg" ? "text-lg" : "text-sm")}>{score}</span>
    </div>
  );
}

export default function BioBeforeAfter({ currentBio, currentScore, bestBio }: BioBeforeAfterProps) {
  const bestScore = bestBio.score || 0;
  const delta = bestScore - currentScore;

  if (delta <= 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h3 className="font-body text-sm font-bold text-foreground">📊 Comparatif avant / après</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AVANT */}
        <div className="border-l-4 border-error/30 pl-4 space-y-3">
          <p className="text-xs font-bold text-error uppercase tracking-wide">Avant</p>
          <div className="flex items-start gap-3">
            <ScoreCircle score={currentScore} />
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{currentBio}</p>
          </div>
        </div>

        {/* APRÈS */}
        <div className="border-l-4 border-success pl-4 space-y-3">
          <p className="text-xs font-bold text-success uppercase tracking-wide">Après</p>
          <div className="flex items-start gap-3">
            <ScoreCircle score={bestScore} />
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{bestBio.bio_text}</p>
          </div>
        </div>
      </div>

      {/* DELTA */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <ArrowUp className="h-5 w-5 text-success" />
        <span className="text-lg font-bold text-success">+{delta} points</span>
      </div>
    </div>
  );
}
