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
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-full bg-foreground text-background shadow-lg px-4 py-2 text-sm animate-in fade-in slide-in-from-bottom-2"
    >
      <span>Une nouvelle version est disponible</span>
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
