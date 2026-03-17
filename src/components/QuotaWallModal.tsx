import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sparkles, Calendar, ArrowRight } from "lucide-react";
import { posthog } from "@/lib/posthog";
import type { CategoryUsage } from "@/hooks/use-user-plan";

interface QuotaWallModalProps {
  open: boolean;
  onClose: () => void;
  plan: string;
  usage: Record<string, CategoryUsage>;
  serverMessage?: string;
}

export default function QuotaWallModal({ open, onClose, plan, usage }: QuotaWallModalProps) {
  const navigate = useNavigate();

  // Track modal open
  useEffect(() => {
    if (open) {
      posthog.capture("quota_wall_shown", {
        plan,
        total_used: usage?.total?.used,
        content_used: usage?.content?.used,
        audit_used: usage?.audit?.used,
      });
    }
  }, [open]);

  const handleClose = () => {
    posthog.capture("quota_wall_dismissed", { plan });
    onClose();
  };

  const handleCtaClick = () => {
    posthog.capture("quota_wall_cta_clicked", { plan });
    onClose();
    navigate("/mon-plan");
  };

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  const renewDate = nextMonth.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  const now = new Date();
  const daysLeft = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const contentUsed = usage?.content?.used || 0;
  const auditUsed = usage?.audit?.used || 0;
  const coachUsed = usage?.coach?.used || 0;
  const totalUsed = usage?.total?.used || 0;
  const hasDetailedStats = contentUsed > 0 || auditUsed > 0 || coachUsed > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden border-0 gap-0">
        {/* Header gradient */}
        <div className="bg-gradient-to-b from-[#FFF4F8] to-white px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FB3D80]/10">
            <Sparkles className="h-7 w-7 text-[#FB3D80]" />
          </div>
          <h2 className="text-lg font-display font-semibold text-[#91014b]">
            Tes crédits du mois sont utilisés
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Et c'est une bonne nouvelle : ça veut dire que tu avances ! 💪
          </p>
        </div>

        {/* Bilan du mois */}
        <div className="px-6 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Ce mois-ci, tu as accompli
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {contentUsed > 0 && (
              <div className="text-center">
                <p className="text-2xl font-display font-bold text-foreground">{contentUsed}</p>
                <p className="text-xs text-muted-foreground">contenu{contentUsed > 1 ? "s" : ""}</p>
              </div>
            )}
            {auditUsed > 0 && (
              <div className="text-center">
                <p className="text-2xl font-display font-bold text-foreground">{auditUsed}</p>
                <p className="text-xs text-muted-foreground">audit{auditUsed > 1 ? "s" : ""}</p>
              </div>
            )}
            {coachUsed > 0 && (
              <div className="text-center">
                <p className="text-2xl font-display font-bold text-foreground">{coachUsed}</p>
                <p className="text-xs text-muted-foreground">coaching{coachUsed > 1 ? "s" : ""}</p>
              </div>
            )}
            {totalUsed > 0 && !hasDetailedStats && (
              <div className="text-center">
                <p className="text-2xl font-display font-bold text-foreground">{totalUsed}</p>
                <p className="text-xs text-muted-foreground">génération{totalUsed > 1 ? "s" : ""} IA</p>
              </div>
            )}
          </div>
        </div>

        {/* Séparateur */}
        <div className="mx-6 border-t border-border" />

        {/* En attendant + CTA */}
        <div className="px-6 pt-4 pb-6 space-y-4">
          {/* Renouvellement */}
          <div className="flex items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3">
            <Calendar className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Tes crédits reviennent le {renewDate}
              </p>
              <p className="text-xs text-muted-foreground">
                Dans {daysLeft} jour{daysLeft > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* CTA Premium */}
          {plan === "free" && (
            <button
              onClick={() => { onClose(); navigate("/mon-plan"); }}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-[#FB3D80] px-6 py-3 text-sm font-medium text-white hover:bg-[#e0326f] transition-colors shadow-md hover:shadow-lg"
            >
              <Sparkles className="h-4 w-4" />
              Passer au Premium — 300 crédits/mois
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {plan === "free" && (
            <p className="text-center text-[11px] text-muted-foreground">
              À partir de 39€/mois · Sans engagement · Annulable à tout moment
            </p>
          )}

          {/* En attendant */}
          <div className="rounded-xl bg-muted/50 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">En attendant, tu peux :</p>
            <p className="text-xs text-muted-foreground">→ Travailler ton branding et ton calendrier éditorial</p>
            <p className="text-xs text-muted-foreground">→ Préparer tes idées dans la bibliothèque</p>
            <p className="text-xs text-muted-foreground">→ Organiser ta stratégie par canal</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
