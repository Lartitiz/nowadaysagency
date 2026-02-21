import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";

type AuditSection = "nom" | "bio" | "stories" | "epingles" | "feed" | "edito";

interface AuditInsightProps {
  section: AuditSection;
}

interface SectionData {
  score: number | null;
  diagnostic: string;
  recommandations: string[];
}

const SCORE_FIELD_MAP: Record<AuditSection, string> = {
  nom: "score_nom",
  bio: "score_bio",
  stories: "score_stories",
  epingles: "score_epingles",
  feed: "score_feed",
  edito: "score_edito",
};

function getScoreColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 70) return { bg: "bg-green-100", text: "text-green-700", label: "🟢" };
  if (score >= 40) return { bg: "bg-yellow-100", text: "text-yellow-700", label: "🟠" };
  return { bg: "bg-red-100", text: "text-red-700", label: "🔴" };
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
        });
      });
  }, [user, section]);

  return data;
}

export default function AuditInsight({ section }: AuditInsightProps) {
  const data = useAuditInsight(section);

  if (!data || (data.score === null && !data.diagnostic)) return null;

  const scoreColor = data.score !== null ? getScoreColor(data.score) : null;

  return (
    <div className="rounded-2xl border-l-[3px] border-l-primary bg-rose-pale p-5 mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          🔍 Résultat de ton audit
        </p>
        {data.score !== null && scoreColor && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-xs font-semibold ${scoreColor.bg} ${scoreColor.text}`}>
            {scoreColor.label} {data.score}/100
          </span>
        )}
      </div>

      {data.diagnostic && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          {data.diagnostic}
        </p>
      )}

      {data.recommandations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">Recommandations</p>
          <ul className="space-y-1">
            {data.recommandations.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 text-right">
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
