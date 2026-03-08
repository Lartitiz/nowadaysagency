import { toast } from "sonner";

/**
 * Detects if an error is a quota/limit error and shows a friendly toast.
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

  // Extract the server message if available
  const serverMessage =
    error?.data?.message || error?.message || msg;

  // Friendly message with renewal info
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
