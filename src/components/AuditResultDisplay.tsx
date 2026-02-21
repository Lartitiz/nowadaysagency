import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Copy, Check, RotateCcw, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──
export interface AuditRecommendation {
  number: number;
  title: string;
  explanation: string;
  example?: string;
}

export interface AuditSummary {
  positives: string[];
  improvements: string[];
}

export interface AuditResultData {
  score: number;
  summary: AuditSummary;
  recommendations: AuditRecommendation[];
  proposed_version?: string;
}

interface AuditResultDisplayProps {
  data: AuditResultData;
  onRegenerate?: () => void;
  onSave?: (content: string) => void;
  saveLabel?: string;
  /** Label for what was audited, e.g. "bio", "titre" */
  auditLabel?: string;
}

// ── Score helpers ──
function getScoreColor(score: number) {
  if (score >= 70) return { text: "text-green-600", bg: "bg-green-100", emoji: "🟢" };
  if (score >= 40) return { text: "text-amber-600", bg: "bg-amber-100", emoji: "🟡" };
  return { text: "text-red-600", bg: "bg-red-100", emoji: "🔴" };
}

export default function AuditResultDisplay({
  data,
  onRegenerate,
  onSave,
  saveLabel = "Sauvegarder",
  auditLabel = "audit",
}: AuditResultDisplayProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedVersion, setEditedVersion] = useState(data.proposed_version || "");

  const scoreInfo = getScoreColor(data.score);

  const handleCopy = async () => {
    const text = editing ? editedVersion : (data.proposed_version || "");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copié !" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── Zone 1: Score + Summary ─── */}
      <div className="rounded-2xl border-l-[3px] border-l-primary bg-rose-pale p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            🔍 Résultat de ton {auditLabel}
          </p>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-pill text-sm font-bold ${scoreInfo.bg} ${scoreInfo.text}`}>
            {scoreInfo.emoji} {data.score}/100
          </span>
        </div>

        <Progress value={data.score} className="h-2.5 mb-4" />

        {data.summary.positives.length > 0 && (
          <div className="mb-2">
            {data.summary.positives.map((p, i) => (
              <p key={i} className="text-sm text-foreground leading-relaxed">
                ✅ {p}
              </p>
            ))}
          </div>
        )}
        {data.summary.improvements.length > 0 && (
          <div>
            {data.summary.improvements.map((imp, i) => (
              <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                ⚠️ {imp}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ─── Zone 2: Recommendations Cards ─── */}
      {data.recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono-ui">
            📋 Mes recommandations
          </h3>

          {data.recommendations.map((rec) => (
            <div
              key={rec.number}
              className="bg-card border border-border rounded-xl p-5 space-y-3"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {rec.number}
                </span>
                <h4 className="text-[15px] font-semibold text-foreground leading-tight">
                  {rec.title}
                </h4>
              </div>

              {/* Explanation */}
              <p className="text-sm text-muted-foreground leading-relaxed pl-10">
                {rec.explanation}
              </p>

              {/* Example */}
              {rec.example && (
                <div className="ml-10 bg-accent/30 border-l-[3px] border-l-accent rounded-r-lg px-4 py-3">
                  <p className="text-sm text-foreground/80 italic">
                    💡 {rec.example}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Zone 3: Proposed Version ─── */}
      {data.proposed_version && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            ✨ Version proposée
          </h3>

          <div className="border-2 border-primary rounded-2xl p-6 bg-card shadow-md">
            {editing ? (
              <textarea
                value={editedVersion}
                onChange={(e) => setEditedVersion(e.target.value)}
                className="w-full text-base text-foreground leading-relaxed bg-transparent border-none outline-none resize-none min-h-[120px]"
                autoFocus
              />
            ) : (
              <p className="text-base text-foreground leading-relaxed whitespace-pre-line">
                {editedVersion || data.proposed_version}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="rounded-pill gap-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copié !" : "Copier"}
            </Button>
            {onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                className="rounded-pill gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Regénérer
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(!editing)}
              className="rounded-pill gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              {editing ? "Terminer" : "Modifier"}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Zone 4: Actions ─── */}
      <div className="flex flex-wrap gap-3 pt-2">
        {onRegenerate && (
          <Button variant="outline" onClick={onRegenerate} className="rounded-pill gap-2">
            <RotateCcw className="h-4 w-4" />
            Refaire l&apos;audit
          </Button>
        )}
        {onSave && (
          <Button
            onClick={() => onSave(editedVersion || data.proposed_version || "")}
            className="rounded-pill gap-2"
          >
            💾 {saveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
