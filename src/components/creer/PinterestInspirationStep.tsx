import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Props {
  analysis: any;
  proposals: any[];
  imagePreview?: string | null;
  onSelect: (proposal: any) => void;
  onBack: () => void;
}

export default function PinterestInspirationStep({ analysis, proposals, imagePreview, onSelect, onBack }: Props) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Retour
        </button>
      </div>

      {/* Analysis summary */}
      {analysis && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">🔍 Analyse de l'épingle</p>
          {analysis.source_description && (
            <p className="text-xs text-muted-foreground">{analysis.source_description}</p>
          )}
          {analysis.keywords && analysis.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {analysis.keywords.map((kw: string, i: number) => (
                <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                  {kw}
                </span>
              ))}
            </div>
          )}
          {analysis.strengths && (
            <p className="text-xs text-muted-foreground">✅ {analysis.strengths}</p>
          )}
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="flex justify-center">
          <img
            src={imagePreview}
            alt="Épingle d'inspiration"
            className="max-h-48 rounded-lg border border-border object-contain"
          />
        </div>
      )}

      {/* Proposals */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">💡 Propositions adaptées à ton projet</p>
        {proposals.map((proposal, i) => (
          <button
            key={i}
            onClick={() => onSelect(proposal)}
            className="w-full text-left rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 transition-all space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{proposal.subject || proposal.title}</p>
              {proposal.recommended_output && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
                  {proposal.recommended_output === "visual" ? "🎨 Visuel" : "📷 Photo"}
                </span>
              )}
            </div>
            {proposal.angle && (
              <p className="text-xs text-muted-foreground">📐 {proposal.angle}</p>
            )}
            {proposal.brief && (
              <p className="text-xs text-muted-foreground">{proposal.brief}</p>
            )}
            {proposal.pin_type && (
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                {proposal.pin_type}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
