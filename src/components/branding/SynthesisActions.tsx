import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Copy, RefreshCw, Loader2, Sparkles, Link2 } from "lucide-react";

interface SynthesisActionsProps {
  onClose: () => void;
  onCopy: () => void;
  onExportPdf: () => void;
  onShare: () => void;
  onRefresh: () => void;
  onRegenerateSummaries: () => void;
  exporting: boolean;
  sharing: boolean;
  summariesLoading: boolean;
}

export default function SynthesisActions({
  onClose,
  onCopy,
  onExportPdf,
  onShare,
  onRefresh,
  onRegenerateSummaries,
  exporting,
  sharing,
  summariesLoading,
}: SynthesisActionsProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Button>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerateSummaries}
          disabled={summariesLoading}
          className="gap-1.5 text-xs"
        >
          {summariesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {summariesLoading ? "Synthèse..." : "✨ Synthétiser"}
        </Button>
        <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5 text-xs">
          <Copy className="h-3.5 w-3.5" /> Copier
        </Button>
        <Button variant="outline" size="sm" onClick={onExportPdf} disabled={exporting} className="gap-1.5 text-xs">
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={sharing}
          className="gap-1.5 text-xs"
          onClick={onShare}
        >
          {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Partager
        </Button>
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
