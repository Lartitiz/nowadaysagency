import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useResetBranding } from "@/hooks/use-reset-branding";
import { ChevronDown, AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

/**
 * Zone « danger » repliée en bas de /branding : un bouton pour effacer
 * complètement l'identité de marque du workspace et tout reconstruire de zéro.
 * N'efface PAS l'onboarding ni les contenus déjà générés.
 */
export default function BrandingDangerZone() {
  const confirm = useConfirm();
  const { resetBranding, isResetting } = useResetBranding();
  const [open, setOpen] = useState(false);

  const handleReset = async () => {
    const confirmed = await confirm({
      title: "Réinitialiser tout ton branding ?",
      description:
        "Ton histoire, ta cliente idéale, ta proposition de valeur, ton ton, ta stratégie, ta charte graphique, tes offres et tes audits seront effacés définitivement. Tes contenus déjà créés ne sont pas touchés. Cette action est irréversible.",
      confirmText: "Oui, tout effacer",
      cancelText: "Annuler",
      destructive: true,
    });
    if (!confirmed) return;

    const { ok, errors } = await resetBranding();
    if (ok) {
      toast.success("Branding réinitialisé. Tu peux repartir de zéro.");
    } else {
      toast.warning("Réinitialisation partielle", {
        description: errors.join(" · "),
        duration: 10000,
      });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-10">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        Options avancées
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Réinitialiser le branding</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Efface toute ton identité de marque (histoire, cliente idéale, proposition,
                ton, stratégie, charte, offres, audits) pour la reconstruire de zéro. Tes
                contenus déjà créés ne sont pas supprimés.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-4 gap-2"
                onClick={handleReset}
                disabled={isResetting}
              >
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Réinitialiser tout le branding
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
