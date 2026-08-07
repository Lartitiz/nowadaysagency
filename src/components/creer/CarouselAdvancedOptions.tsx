import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Palette, Settings2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/* ── Options avancées du carrousel ────────────────────────────────────────
   Réglages secondaires (qualité Max, illustration de couverture). Repliés par
   défaut et placés SOUS le bloc principal : avant, ils s'affichaient en premier
   et volaient l'attention à l'idée + au bouton de génération. */

interface Props {
  qualityMax: boolean;
  onQualityMaxChange: (v: boolean) => void;
  qualityMaxLocked: boolean;
  coverIllustration: boolean;
  onCoverIllustrationChange: (v: boolean) => void;
  coverIllustrationLocked: boolean;
}

export default function CarouselAdvancedOptions({
  qualityMax,
  onQualityMaxChange,
  qualityMaxLocked,
  coverIllustration,
  onCoverIllustrationChange,
  coverIllustrationLocked,
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const active: string[] = [];
  if (qualityMax && !qualityMaxLocked) active.push("Qualité Max");
  if (coverIllustration && !coverIllustrationLocked) active.push("Illustration");

  const upgradeLink = (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); navigate("/abonnement"); }}
      className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
    >
      Passe en Premium pour l'activer →
    </button>
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-xl px-1 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <Settings2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Options avancées</span>
        {active.length > 0 && (
          <span className="text-primary-text">· {active.join(" · ")}</span>
        )}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>

      <CollapsibleContent className="animate-fade-in">
        <div className="mt-1 divide-y divide-border rounded-xl border border-border bg-card/60">
          {/* Mode qualité Max */}
          <label className={`block p-3 ${qualityMaxLocked ? "cursor-default" : "cursor-pointer"}`}>
            <span className="flex items-center gap-2">
              <Sparkles className={`h-4 w-4 shrink-0 ${qualityMaxLocked ? "text-muted-foreground" : "text-primary"}`} />
              <span className="text-sm font-medium text-foreground">Mode qualité Max</span>
              {qualityMaxLocked && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Premium
                </span>
              )}
              <Switch
                checked={qualityMax && !qualityMaxLocked}
                onCheckedChange={onQualityMaxChange}
                disabled={qualityMaxLocked}
                className="ml-auto shrink-0"
              />
            </span>
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              Texte <strong>et</strong> visuels dessinés par le modèle le plus puissant. À activer pour
              les contenus importants — c'est nettement plus long. Désactivé = rapide (qualité déjà très bonne).
            </p>
            {qualityMaxLocked && <span className="block pl-6">{upgradeLink}</span>}
          </label>

          {/* Illustration de couverture */}
          <label className={`block p-3 ${coverIllustrationLocked ? "cursor-default" : "cursor-pointer"}`}>
            <span className="flex items-center gap-2">
              <Palette className={`h-4 w-4 shrink-0 ${coverIllustrationLocked ? "text-muted-foreground" : "text-primary"}`} />
              <span className="text-sm font-medium text-foreground">Illustration de couverture</span>
              {coverIllustrationLocked && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Premium
                </span>
              )}
              <Switch
                checked={coverIllustration && !coverIllustrationLocked}
                onCheckedChange={onCoverIllustrationChange}
                disabled={coverIllustrationLocked}
                className="ml-auto shrink-0"
              />
            </span>
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              Une grande illustration dans tes couleurs sur la première slide. À réserver aux carrousels
              où tu veux marquer le coup — ça ajoute quelques secondes à la génération.
            </p>
            {coverIllustrationLocked && <span className="block pl-6">{upgradeLink}</span>}
          </label>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
