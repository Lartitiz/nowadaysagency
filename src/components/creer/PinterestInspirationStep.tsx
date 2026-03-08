import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Props {
  analysis: {
    detected_type: string;
    structure: string;
    keywords: string[];
    why_it_works: string;
    source_description: string;
  };
  proposals: Array<{
    id: string;
    subject: string;
    angle: string;
    recommended_output: "visual" | "photo";
    pin_type: string;
    brief: string;
  }>;
  inspirationPreview?: string;
  imagePreview?: string;
  onSelect: (proposal: any) => void;
  onBack: () => void;
}

export default function PinterestInspirationStep({
  analysis,
  proposals,
  inspirationPreview,
  imagePreview,
  onSelect,
  onBack,
}: Props) {
  const preview = inspirationPreview || imagePreview || "";
  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1) Source analysis */}
      <div className="flex gap-4 items-start">
        {preview ? (
          <img
            src={preview}
            alt="Épingle source"
            className="w-[120px] rounded-xl shadow-md object-cover flex-shrink-0"
            style={{ aspectRatio: "2 / 3" }}
          />
        ) : (
          <div
            className="w-[120px] rounded-xl bg-muted flex items-center justify-center flex-shrink-0"
            style={{ aspectRatio: "2 / 3" }}
          >
            <span className="text-2xl">📌</span>
          </div>
        )}
        <div className="space-y-2 min-w-0">
          {analysis.detected_type && (
            <span className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground uppercase tracking-wider">
              📊 {analysis.detected_type}
            </span>
          )}
          {analysis.source_description && (
            <p className="text-sm text-foreground leading-relaxed">
              {analysis.source_description}
            </p>
          )}
          {analysis.why_it_works && (
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              {analysis.why_it_works}
            </p>
          )}
          {analysis.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.keywords.map((kw, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2) Separator */}
      <div className="border-t border-border" />

      {/* 3) Title */}
      <h3 className="text-base font-semibold text-foreground">
        3 idées pour adapter à ton projet
      </h3>

      {/* 4) Proposal cards */}
      <div className="space-y-3">
        {proposals.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="w-full text-left rounded-xl border border-border bg-card p-4 space-y-2 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm text-foreground leading-snug">
                {p.subject}
              </p>
              {p.recommended_output === "visual" ? (
                <span className="flex-shrink-0 inline-block rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground whitespace-nowrap">
                  🎨 Visuel
                </span>
              ) : (
                <span className="flex-shrink-0 inline-block rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground whitespace-nowrap">
                  📷 Photo
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              {p.angle}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {p.brief}
            </p>
          </button>
        ))}
      </div>

      {/* 5) Back button */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Button>
      </div>
    </div>
  );
}
