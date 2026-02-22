import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BioLine, ElementStatus } from "./AuditVisualResult";

const STATUS_DOT: Record<ElementStatus, string> = { ok: "🟢", improve: "🟡", critical: "🔴" };
const LINE_STYLE: Record<ElementStatus, string> = {
  ok: "border-l-green-400 bg-green-50/60 dark:bg-green-950/10",
  improve: "border-l-amber-400 bg-amber-50/60 dark:bg-amber-950/10",
  critical: "border-l-red-400 bg-red-50/60 dark:bg-red-950/10",
};

interface Recommendation {
  lineIndex?: number;
  status: ElementStatus;
  label: string;
  explanation: string;
  proposition?: string;
}

interface Props {
  currentBio: string;
  lignes: BioLine[];
  proposedBio: string;
  recommendations?: Recommendation[];
  onAdoptBio?: (bio: string) => void;
}

export default function AuditBioBeforeAfter({ currentBio, lignes, proposedBio, recommendations, onAdoptBio }: Props) {
  const { toast } = useToast();
  const [editableBio, setEditableBio] = useState(proposedBio);
  const [appliedRecs, setAppliedRecs] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editableBio);
    setCopied(true);
    toast({ title: "Bio copiée !" });
    setTimeout(() => setCopied(false), 2000);
  };

  const applyRec = (idx: number, proposition: string) => {
    // Replace the relevant line in the editable bio
    const lines = editableBio.split("\n");
    const rec = recommendations?.[idx];
    if (rec && rec.lineIndex !== undefined && rec.lineIndex < lines.length) {
      lines[rec.lineIndex] = proposition;
      setEditableBio(lines.join("\n"));
    }
    setAppliedRecs((prev) => new Set([...prev, idx]));
  };

  return (
    <div className="space-y-5">
      {/* ── Annotated current bio ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Ta bio actuelle (avec annotations) :</p>
        <div className="rounded-xl border border-border overflow-hidden">
          {lignes.map((line, i) => (
            <div key={i} className={`border-l-[3px] ${LINE_STYLE[line.status]} px-4 py-3 ${i > 0 ? "border-t border-border/50" : ""}`}>
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{STATUS_DOT[line.status]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {line.texte === "(absent)" ? <em className="text-muted-foreground">(absent)</em> : `"${line.texte}"`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 italic">→ {line.commentaire}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Before / After side by side ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Avant / Après :</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">AVANT</p>
            <p className="text-sm text-foreground whitespace-pre-line">{currentBio}</p>
          </div>
          <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50/40 dark:bg-green-950/20 p-4">
            <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-2">APRÈS (proposition)</p>
            <p className="text-sm text-foreground whitespace-pre-line">{editableBio}</p>
            <p className="text-[10px] text-muted-foreground mt-2">{editableBio.length}/150 caractères</p>
          </div>
        </div>
      </div>

      {/* ── Action recommendations ── */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommandations cliquables :</p>
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-4 transition-all ${
                appliedRecs.has(idx) 
                  ? "border-green-300 bg-green-50/40 dark:bg-green-950/20" 
                  : rec.status === "critical" 
                    ? "border-red-200 bg-red-50/30 dark:bg-red-950/10" 
                    : "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10"
              }`}
            >
              <p className="text-sm font-medium text-foreground mb-1">
                {appliedRecs.has(idx) ? "✅" : STATUS_DOT[rec.status]} {rec.label}
              </p>
              <p className="text-xs text-muted-foreground mb-2">{rec.explanation}</p>
              {rec.proposition && !appliedRecs.has(idx) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-foreground">💡 <em>{rec.proposition}</em></p>
                  <Button variant="outline" size="sm" onClick={() => applyRec(idx, rec.proposition!)} className="rounded-pill text-xs h-7 gap-1">
                    ✅ Appliquer
                  </Button>
                </div>
              )}
              {appliedRecs.has(idx) && <p className="text-xs text-green-600 font-medium">Appliqué ✓</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={handleCopy} className="rounded-pill gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copié !" : "📋 Copier la proposition"}
        </Button>
        {onAdoptBio && (
          <Button onClick={() => onAdoptBio(editableBio)} className="rounded-pill gap-1.5">
            ⭐ Adopter cette bio
          </Button>
        )}
      </div>
    </div>
  );
}
