import { supabase } from "@/integrations/supabase/client";

const messages: Record<string, string> = {
  calendar_auth_required: "Ta session a expiré. Reconnecte-toi : ton contenu reste dans l’éditeur.",
  calendar_not_found: "Ce contenu n’est plus accessible dans le calendrier. Ton travail reste dans l’éditeur.",
  calendar_version_conflict: "Ce contenu a changé dans le calendrier. Ouvre sa dernière version avant d’enregistrer tes modifications.",
  calendar_publication_locked: "Ce contenu est publié ou en cours de publication. Crée une copie pour le modifier.",
  calendar_scheduled_edit_requires_reschedule: "Ce contenu est programmé. Annule sa programmation depuis le calendrier avant de le modifier.",
  calendar_schedule_in_past: "L’heure choisie est passée pendant la préparation. Choisis une nouvelle heure.",
  calendar_schedule_required: "Choisis une date et une heure de publication.",
  calendar_invalid_payload: "La sauvegarde n’a pas pu être préparée. Ton contenu reste dans l’éditeur.",
  calendar_media_required: "Ajoute un visuel avant de programmer ce contenu.",
  calendar_idea_not_found: "L’idée de départ n’est plus accessible. Rien n’a été enregistré dans le calendrier ; ton contenu reste dans l’éditeur.",
  calendar_brief_not_found: "Le brief de départ n’est plus accessible. Rien n’a été enregistré dans le calendrier ; ton contenu reste dans l’éditeur.",
};
export function calendarSaveError(error: any): string {
  const key = Object.keys(messages).find(k => error?.message?.includes(k));
  if (key) return messages[key];
  if (error?.code === "PGRST202") return "La sauvegarde est momentanément indisponible. Ton contenu reste dans l’éditeur.";
  if (error?.code === "42501") return "Tu n’as pas les droits pour enregistrer dans cet espace. Ton contenu reste dans l’éditeur.";
  if (error?.code === "PGRST301" || error?.status === 401) return messages.calendar_auth_required;
  // Locally prepared French validation errors have no database error code.
  if (error instanceof Error && error.name === "Error" && !(error as any).code && !/fetch|network|request/i.test(error.message)) return error.message;
  return "La sauvegarde n’a pas pu être confirmée. Vérifie le calendrier avant de réessayer ; ton contenu reste dans l’éditeur.";
}

export async function commitCalendarContent(args: {
  postId: string; payload: Record<string, any>; create: boolean;
  briefId: string | null; ideaId: string | null; expectedUpdatedAt?: string | null;
}): Promise<{ id: string; replayed: boolean; scheduled: boolean; updated_at: string }> {
  const { data, error } = await supabase.rpc("save_calendar_content" as any, {
    p_post_id: args.postId, p_payload: args.payload, p_create: args.create,
    p_brief_id: args.briefId, p_idea_id: args.ideaId,
    p_expected_updated_at: args.expectedUpdatedAt || null,
  });
  if (error) throw error;
  const receipt = data as any;
  if (!receipt?.id || receipt.id !== args.postId) throw new Error("La confirmation de sauvegarde est indisponible. Vérifie ton calendrier avant de réessayer.");
  return receipt;
}
