import { Link } from "react-router-dom";
import { CheckCircle2, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BRANDING_READY_THRESHOLD, isBrandingReady } from "@/lib/branding-completion";

interface Props {
  total: number;
  onImport: () => void;
  onReanalyze?: () => void;
  onShowSynthesis: () => void;
}

/**
 * Haut de /branding : où en est la fiche (même seuil que le reste de l'app) et
 * l'import mis en avant. Doit rester visible sans défiler en 1440×900 et
 * 390×844 (règle du plan simplicité du 15/10/2026).
 */
export default function BrandingProgressHeader({ total, onImport, onReanalyze, onShowSynthesis }: Props) {
  const ready = isBrandingReady(total);
  return <section aria-label="Avancement de mon identité" className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-[220px] flex-1">
        <p className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">Mon identité</span>
          <span className="text-muted-foreground"><strong className="text-foreground">{total} %</strong> rempli</span>
        </p>
        <Progress value={total} aria-label={`Mon identité remplie à ${total} %`} className="mt-2 h-2" />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {ready
            ? <><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /> Ta fiche est suffisante : l'IA écrit avec ta voix. Tu peux la compléter quand tu veux.</>
            : <>Encore {BRANDING_READY_THRESHOLD - total} % pour une fiche suffisante.</>}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button onClick={onImport} variant={ready ? "outline" : "default"} className="h-auto min-h-10 flex-1 whitespace-normal text-left sm:flex-none">
          <Sparkles className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" /> Remplir à partir de mon site, Instagram ou LinkedIn
        </Button>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="gap-2">Autres actions <ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onReanalyze && <DropdownMenuItem onSelect={onReanalyze}>Actualiser depuis mes sources</DropdownMenuItem>}
            <DropdownMenuItem onSelect={onShowSynthesis}>Résumer mon activité</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/branding/audit">Vérifier ma communication</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </section>;
}
