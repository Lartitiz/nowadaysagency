import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type AuditSection = "nom" | "bio" | "stories" | "epingles" | "feed" | "edito";

interface AuditInsightProps {
  section: AuditSection;
}

interface SectionData {
  score: number | null;
  diagnostic: string;
  recommandations: string[];
  // structured fields (new format)
  summary?: { positives: string[]; improvements: string[] };
  structuredRecommendations?: { number: number; title: string; explanation: string; example?: string }[];
  proposed_version?: string;
}

const SCORE_FIELD_MAP: Record<AuditSection, string> = {
  nom: "score_nom",
  bio: "score_bio",
  stories: "score_stories",
  epingles: "score_epingles",
  feed: "score_feed",
  edito: "score_edito",
};

function getScoreColor(score: number) {
  if (score >= 70) return { bg: "bg-green-100", text: "text-green-700", emoji: "🟢" };
  if (score >= 40) return { bg: "bg-amber-100", text: "text-amber-700", emoji: "🟡" };
  return { bg: "bg-red-100", text: "text-red-700", emoji: "🔴" };
}

export function useAuditInsight(section: AuditSection) {
  const { user } = useAuth();
  const [data, setData] = useState<SectionData | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("instagram_audit")
      .select("details, score_nom, score_bio, score_stories, score_epingles, score_feed, score_edito")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!row) return;
        const score = (row as any)[SCORE_FIELD_MAP[section]] ?? null;
        const det = row.details as any;
        const sectionData = det?.sections?.[section];
        if (!sectionData && score === null) return;
        setData({
          score,
          diagnostic: sectionData?.diagnostic || "",
          recommandations: sectionData?.recommandations || [],
          summary: sectionData?.summary,
          structuredRecommendations: sectionData?.recommendations,
          proposed_version: sectionData?.proposed_version,
        });
      });
  }, [user, section]);

  return data;
}

export default function AuditInsight({ section }: AuditInsightProps) {
  const data = useAuditInsight(section);

  if (!data || (data.score === null && !data.diagnostic)) return null;

  const scoreColor = data.score !== null ? getScoreColor(data.score) : null;
  const hasStructured = data.structuredRecommendations && data.structuredRecommendations.length > 0;

  return (
    <div className="space-y-4 mb-6 animate-fade-in">
      {/* ─── Zone 1: Score + Summary ─── */}
      <div className="rounded-2xl border-l-[3px] border-l-primary bg-rose-pale p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            🔍 Résultat de ton audit
          </p>
          {data.score !== null && scoreColor && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-sm font-bold ${scoreColor.bg} ${scoreColor.text}`}>
              {scoreColor.emoji} {data.score}/100
            </span>
          )}
        </div>

        {data.score !== null && (
          <Progress value={data.score} className="h-2.5 mb-3" />
        )}

        {/* Structured summary or legacy diagnostic */}
        {data.summary ? (
          <>
            {data.summary.positives?.map((p, i) => (
              <p key={`pos-${i}`} className="text-sm text-foreground leading-relaxed">✅ {p}</p>
            ))}
            {data.summary.improvements?.map((imp, i) => (
              <p key={`imp-${i}`} className="text-sm text-muted-foreground leading-relaxed">⚠️ {imp}</p>
            ))}
          </>
        ) : data.diagnostic ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{data.diagnostic}</p>
        ) : null}
      </div>

      {/* ─── Zone 2: Recommendation Cards ─── */}
      {hasStructured ? (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            📋 Recommandations
          </h3>
          {data.structuredRecommendations!.map((rec) => (
            <div key={rec.number} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {rec.number}
                </span>
                <h4 className="text-[15px] font-semibold text-foreground leading-tight">{rec.title}</h4>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed pl-10">{rec.explanation}</p>
              {rec.example && (
                <div className="ml-10 bg-accent/30 border-l-[3px] border-l-accent rounded-r-lg px-4 py-3">
                  <p className="text-sm text-foreground/80 italic">💡 {rec.example}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : data.recommandations.length > 0 ? (
        /* Legacy list format */
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui mb-2">📋 Recommandations</p>
          <ul className="space-y-2">
            {data.recommandations.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground leading-relaxed">• {r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ─── Proposed version (if available) ─── */}
      {data.proposed_version && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">✨ Version proposée</h3>
          <div className="border-2 border-primary rounded-2xl p-5 bg-card shadow-md">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{data.proposed_version}</p>
          </div>
        </div>
      )}

      {/* ─── Refaire l'audit ─── */}
      <div className="text-right">
        <Link
          to="/instagram/audit"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
        >
          <RotateCcw className="h-3 w-3" />
          Refaire l'audit
        </Link>
      </div>
    </div>
  );
}
