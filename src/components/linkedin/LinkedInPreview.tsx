interface LinkedInPreviewProps {
  text: string;
  cutoff: number;
  label?: string;
}

export default function LinkedInPreview({ text, cutoff, label }: LinkedInPreviewProps) {
  if (!text) return null;

  const before = text.slice(0, cutoff);
  const after = text.slice(cutoff);
  const hasCut = after.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-1">
      {label && (
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          👁️ Prévisualisation {label} LinkedIn
        </p>
      )}
      <div className="text-sm leading-relaxed">
        <span className="text-foreground whitespace-pre-line">{before}</span>
        {hasCut && (
          <>
            <span className="text-muted-foreground/60 cursor-default select-none">…voir plus</span>
            <div className="mt-1 text-foreground/20 whitespace-pre-line select-none">{after}</div>
          </>
        )}
      </div>
      <p className="text-2xs text-muted-foreground pt-2 border-t border-border mt-3">
        ✂️ Coupure à {cutoff} caractères — {hasCut ? `${before.length} visibles sans clic` : "Tout est visible"}
      </p>
    </div>
  );
}
