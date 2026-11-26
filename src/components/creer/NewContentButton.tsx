import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppHeaderSlot } from "@/lib/app-header-slot";

/**
 * « Créer un autre contenu » en haut de la page de résultat (piste A choisie par
 * Laetitia le 25/11/2026) : le lien du bas de page demandait de tout faire
 * défiler pour le trouver. Même action que ce lien (qui reste), donc même
 * garde anti-perte (`requestReset`, fenêtre « Tu as un contenu en cours »).
 * Slide en grand (26/11/2026) : pendant la retouche d'un carrousel sur ordinateur,
 * le bouton monte dans la barre fine du menu (sa ligne à lui revient à la slide).
 */
export default function NewContentButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const slot = useAppHeaderSlot("actions");
  const button = (
    <Button type="button" variant={slot ? "ghost" : "outline"} size="sm" onClick={onClick} disabled={disabled} className={`gap-1.5 rounded-full ${slot ? "text-muted-foreground" : ""}`} data-testid="new-content-top">
      <Plus className="h-3.5 w-3.5" /> Créer un autre contenu
    </Button>
  );
  return slot ? createPortal(button, slot) : <div className="flex justify-end">{button}</div>;
}
