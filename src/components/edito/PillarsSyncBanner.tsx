import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { usePillarsSync } from "@/hooks/use-pillars-sync";

export function PillarsSyncBanner() {
  const { isOutOfSync, isDismissed, brandingPillars, editoPillars, resync, dismiss } = usePillarsSync();
  const [busy, setBusy] = useState<null | "rename_only" | "full_replace">(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  if (!isOutOfSync || isDismissed) return null;

  const handleResync = async (mode: "rename_only" | "full_replace") => {
    setBusy(mode);
    try {
      await resync(mode);
      toast.success(
        mode === "rename_only" ? "Noms mis à jour ✅" : "Piliers remplacés ✅",
        {
          description:
            mode === "rename_only"
              ? "Les descriptions et pourcentages ont été préservés."
              : "Les piliers ont été régénérés depuis le Branding.",
        },
      );
    } catch (e: any) {
      toast.error("Erreur", { description: friendlyError(e) });
    } finally {
      setBusy(null);
      setShowReplaceConfirm(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Tes piliers Branding ont changé
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Les noms de tes piliers diffèrent entre ton Branding et ta Ligne éditoriale Instagram.
                L'IA utilise la version éditoriale — penses à resynchroniser pour qu'elle reste alignée.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-background/60 border border-border p-3">
                <div className="text-2xs uppercase tracking-wide text-muted-foreground mb-1">
                  Branding (source)
                </div>
                <ul className="space-y-0.5 text-foreground">
                  {brandingPillars.length === 0 ? (
                    <li className="italic text-muted-foreground">— aucun —</li>
                  ) : (
                    brandingPillars.map((p, i) => <li key={i}>• {p}</li>)
                  )}
                </ul>
              </div>
              <div className="rounded-lg bg-background/60 border border-border p-3">
                <div className="text-2xs uppercase tracking-wide text-muted-foreground mb-1">
                  Ligne éditoriale (actuel)
                </div>
                <ul className="space-y-0.5 text-foreground">
                  {editoPillars.length === 0 ? (
                    <li className="italic text-muted-foreground">— aucun —</li>
                  ) : (
                    editoPillars.map((p, i) => <li key={i}>• {p.name || <em className="text-muted-foreground">(sans nom)</em>}</li>)
                  )}
                </ul>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleResync("rename_only")}
                disabled={busy !== null}
                className="text-xs"
              >
                {busy === "rename_only" ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Mettre à jour les noms
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowReplaceConfirm(true)}
                disabled={busy !== null}
                className="text-xs"
              >
                Tout remplacer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismiss}
                disabled={busy !== null}
                className="text-xs"
              >
                Ignorer
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tout remplacer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action régénère tes piliers depuis le Branding et <strong>écrase les descriptions
              et pourcentages</strong> que tu as personnalisés ici. Cette opération est irréversible.
              <br /><br />
              Si tu veux juste mettre à jour les noms en gardant tes descriptions, annule et utilise
              "Mettre à jour les noms".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleResync("full_replace");
              }}
              disabled={busy !== null}
            >
              {busy === "full_replace" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Oui, tout remplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
