import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * « Créer un autre contenu » en haut de la page de résultat (piste A choisie par
 * Laetitia le 25/11/2026) : le lien du bas de page demandait de tout faire
 * défiler pour le trouver. Même action que ce lien (qui reste), donc même
 * garde anti-perte (`requestReset`, fenêtre « Tu as un contenu en cours »).
 */
export default function NewContentButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end">
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled} className="gap-1.5 rounded-full" data-testid="new-content-top">
        <Plus className="h-3.5 w-3.5" /> Créer un autre contenu
      </Button>
    </div>
  );
}
