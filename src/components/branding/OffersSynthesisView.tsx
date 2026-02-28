import { useRef, useState } from "react";
import { Copy, Download, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import OfferSynthesisCard from "./OfferSynthesisCard";

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "💎 Payante", className: "bg-violet-50 text-violet-700" },
  free: { label: "🎁 Gratuite", className: "bg-emerald-50 text-emerald-700" },
  service: { label: "🎤 Service", className: "bg-amber-50 text-amber-700" },
};

function SynthCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card shadow-sm p-5 sm:p-6 ${className}`}>{children}</div>;
}

function SectionLabel({ emoji, title }: { emoji: string; title: string }) {
  return (
    <p className="font-mono-ui text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground flex items-center gap-1.5">
      <span>{emoji}</span> {title}
    </p>
  );
}

interface OffersSynthesisViewProps {
  offers: any[];
  onNavigateToOffer: (offerId: string) => void;
  onNavigateToWorkshop: (offerId: string) => void;
}

export default function OffersSynthesisView({ offers, onNavigateToOffer, onNavigateToWorkshop }: OffersSynthesisViewProps) {
  const synthRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const completed = offers.filter(o => o.completed || o.completion_pct === 100);
  const incomplete = offers.filter(o => !o.completed && (o.completion_pct ?? 0) < 100);

  const copyAll = () => {
    const lines = completed.map(o => {
      let line = `• ${o.name}`;
      if (o.price_text) line += ` — ${o.price_text}`;
      if (o.promise) line += `\n  Promesse : ${o.promise}`;
      return line;
    });
    const text = `Mes offres\n\n${lines.join("\n\n")}`;
    navigator.clipboard.writeText(text);
    toast.success("Résumé copié !");
  };

  const exportPDF = async () => {
    if (!synthRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      const canvas = await html2canvas(synthRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let y = 10;
      const pageHeight = pdf.internal.pageSize.getHeight() - 20;
      if (imgHeight <= pageHeight) {
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, imgWidth, imgHeight);
      } else {
        // Multi-page
        let remainingHeight = canvas.height;
        let srcY = 0;
        while (remainingHeight > 0) {
          const sliceHeight = Math.min(remainingHeight, (pageHeight * canvas.width) / imgWidth);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, srcY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
          const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;
          pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 10, 10, imgWidth, sliceImgHeight);
          remainingHeight -= sliceHeight;
          srcY += sliceHeight;
          if (remainingHeight > 0) pdf.addPage();
        }
      }
      pdf.save(`synthese-offres-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF téléchargé !");
    } catch {
      toast.error("Erreur lors de l'export");
    }
    setExporting(false);
  };

  if (offers.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center">
        <Sparkles className="h-10 w-10 text-primary/40 mx-auto mb-4" />
        <h3 className="font-display text-lg font-bold text-foreground mb-2">Aucune offre créée</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Crée ta première offre dans le module Offres pour voir ta synthèse ici.
        </p>
      </div>
    );
  }

  if (completed.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-8 text-center">
        <Sparkles className="h-10 w-10 text-primary/40 mx-auto mb-4" />
        <h3 className="font-display text-lg font-bold text-foreground mb-2">Complète au moins une offre pour voir ta synthèse</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Tu as {offers.length} offre{offers.length > 1 ? "s" : ""} en cours. Termine-en une pour débloquer la vue synthèse.
        </p>
        {incomplete.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => onNavigateToWorkshop(incomplete[0].id)} className="gap-2">
            Continuer <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={copyAll} className="gap-1.5 text-xs">
          <Copy className="h-3.5 w-3.5" /> Copier tout
        </Button>
        <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting} className="gap-1.5 text-xs">
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </Button>
      </div>

      <div ref={synthRef} className="space-y-6">
        {/* Global summary */}
        <SynthCard>
          <SectionLabel emoji="🎁" title="Vue d'ensemble de tes offres" />
          <p className="text-sm text-muted-foreground mb-3">
            {completed.length} offre{completed.length > 1 ? "s" : ""} complétée{completed.length > 1 ? "s" : ""} sur {offers.length}
          </p>
          <div className="space-y-1.5">
            {offers.map(o => {
              const badge = TYPE_BADGE[o.offer_type] || TYPE_BADGE.paid;
              return (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                  <span className="text-foreground font-medium">{o.name}</span>
                  {o.price_text && <span className="text-muted-foreground">— {o.price_text}</span>}
                  {!o.completed && (o.completion_pct ?? 0) < 100 && (
                    <span className="text-[10px] text-muted-foreground ml-auto">{o.completion_pct ?? 0}%</span>
                  )}
                  {(o.completed || o.completion_pct === 100) && (
                    <span className="text-[10px] text-emerald-600 ml-auto">✓</span>
                  )}
                </div>
              );
            })}
          </div>
        </SynthCard>

        {/* Completed offer cards */}
        {completed.map(offer => (
          <OfferSynthesisCard key={offer.id} offer={offer} onEdit={() => onNavigateToWorkshop(offer.id)} />
        ))}

        {/* Incomplete offers */}
        {incomplete.length > 0 && (
          <SynthCard className="opacity-70">
            <SectionLabel emoji="🚧" title="Offres en cours" />
            <div className="space-y-2.5">
              {incomplete.map(o => (
                <div key={o.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{o.name}</p>
                    <Progress value={o.completion_pct ?? 0} className="h-1.5 mt-1" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => onNavigateToWorkshop(o.id)} className="shrink-0 gap-1 text-xs">
                    Continuer <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </SynthCard>
        )}

        {/* Footer */}
        <p className="font-mono-ui text-[10px] text-muted-foreground text-center">L'Assistant Com' × Nowadays Agency</p>
      </div>
    </div>
  );
}
