import { RefreshCw } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";

/**
 * Pastille discrète affichée quand un nouveau bundle a été publié
 * pendant que l'onglet restait ouvert. Un clic recharge la page.
 */
export default function UpdateBanner() {
  const updateAvailable = useVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      // Téléphone : au-dessus de la barre du bas (min-h-14 + zone de sécurité)
      // et à gauche du bouton d'avis (right-4, 3,5 rem de large), sans rien recouvrir.
      className="fixed z-[60] flex items-center justify-between gap-3 rounded-full bg-foreground text-background shadow-lg px-4 py-2 text-sm animate-in fade-in slide-in-from-bottom-2 left-4 right-20 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:left-1/2 md:right-auto md:bottom-4 md:-translate-x-1/2 md:justify-start"
    >
      <span className="md:hidden">Nouvelle version</span>
      <span className="hidden md:inline">Une nouvelle version est disponible</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold hover:opacity-90 transition-opacity"
      >
        <RefreshCw className="h-3 w-3" />
        Recharger
      </button>
    </div>
  );
}
