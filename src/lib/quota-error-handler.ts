import { toast } from "sonner";

// Callback global pour ouvrir le modal quand quota total épuisé
let _quotaWallCallback: ((data: {
  plan: string;
  usage: Record<string, { used: number; limit: number }>;
  message: string;
}) => void) | null = null;

/**
 * Enregistre le callback qui ouvre QuotaWallModal.
 * Appelé une seule fois depuis un composant parent (ex: App ou layout).
 */
export function registerQuotaWallCallback(
  cb: (data: { plan: string; usage: Record<string, { used: number; limit: number }>; message: string }) => void
) {
  _quotaWallCallback = cb;
}

export function unregisterQuotaWallCallback() {
  _quotaWallCallback = null;
}

/**
 * Detects if an error is a quota/limit error and shows a friendly toast or opens the wall modal.
 * Returns true if it was a quota error (caller should stop processing).
 */
export function handleQuotaError(error: any): boolean {
  const msg = typeof error === "string" ? error : error?.message || "";
  const dataError = error?.data?.error || error?.error || "";

  const isQuota =
    dataError === "limit_reached" ||
    msg.includes("limit_reached") ||
    msg.includes("générations IA ce mois") ||
    msg.includes("ce mois. Tes crédits") ||
    msg.includes("disponible à partir du plan") ||
    msg.includes("Quota") ||
    msg.includes("quota");

  if (!isQuota) return false;

  const serverMessage = error?.data?.message || error?.message || msg;
  const quota = error?.data?.quota || error?.quota;
  const reason = quota?.reason || error?.data?.category;

  // Si quota total épuisé ET callback enregistré → ouvrir le modal
  if (_quotaWallCallback && (reason === "total" || serverMessage.includes("générations IA ce mois"))) {
    _quotaWallCallback({
      plan: quota?.plan || "free",
      usage: quota?.usage || {},
      message: serverMessage,
    });
    return true;
  }

  // Sinon → toast classique (catégorie spécifique ou fonctionnalité premium)
  const friendlyTitle = serverMessage.includes("disponible à partir")
    ? "Fonctionnalité premium ✨"
    : "Plus de crédits ce mois-ci 🌸";

  const friendlyDescription = serverMessage.includes("disponible à partir")
    ? serverMessage
    : serverMessage || "Tes crédits se renouvellent le 1er du mois prochain.";

  toast(friendlyTitle, {
    description: friendlyDescription,
    action: {
      label: "Voir les plans →",
      onClick: () => {
        window.location.href = "/pricing";
      },
    },
    duration: 8000,
  });

  return true;
}
