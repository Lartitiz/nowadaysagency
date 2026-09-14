import { supabase } from "@/integrations/supabase/client";

export function launchSaveError(error: any): string {
  const message = String(error?.message || "");
  if (message.includes("launch_legacy_review_required")) return "Certains anciens contenus ne peuvent pas être reliés avec certitude à ce plan. Rien n’a été modifié : vérifie les contenus de ce lancement dans le calendrier avant de renvoyer.";
  if (message.includes("launch_version_conflict")) return "Le lancement a changé depuis son ouverture. Ta proposition est conservée ici ; recharge le plan avant de remplacer sa dernière version.";
  if (message.includes("forbidden") || error?.code === "42501") return "Tu n’as pas les droits pour modifier ce lancement dans cet espace.";
  return "L’enregistrement n’a pas pu être confirmé. Ta proposition reste disponible : réessaie sans la régénérer.";
}

export async function syncLaunchCalendar(launchId: string, workspaceId: string | null, slotIds: string[], replace: boolean) {
  const { data, error } = await supabase.rpc("sync_launch_calendar" as any, {
    p_launch_id: launchId, p_workspace_id: workspaceId, p_slot_ids: slotIds, p_replace: replace,
  });
  if (error) throw error;
  const receipt = data as any;
  if (receipt?.launch_id !== launchId || !Array.isArray(receipt.items) || receipt.items.length !== slotIds.length ||
    slotIds.some(id => receipt.items.filter((item: any) => item.slot_id === id && item.post_id).length !== 1)) {
    throw new Error("launch_missing_receipt");
  }
  return receipt as { launch_id: string; inserted: number; refreshed: number; preserved: number; items: {slot_id: string; post_id: string; date: string}[] };
}
