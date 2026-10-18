import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Sous un post LinkedIn : « Créer le carrousel », avec son coût écrit (chantier J, 18/10/2026). */
export default function LinkedInCarouselInvite({ onCreate, disabled }: { onCreate: () => void; disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in" data-testid="linkedin-carousel-invite">
      <div>
        <p className="text-sm font-semibold text-foreground">Transformer en carrousel LinkedIn ?</p>
        <p className="text-xs text-muted-foreground">L'IA structure ton post en slides visuelles téléchargeables en PDF. Compte pour 1 carrousel du mois.</p>
      </div>
      <Button variant="default" size="sm" onClick={onCreate} disabled={disabled} className="gap-1.5 shrink-0">
        <Palette className="h-3.5 w-3.5" /> Créer le carrousel
      </Button>
    </div>
  );
}
