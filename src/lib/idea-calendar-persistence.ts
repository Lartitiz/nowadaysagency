import { supabase } from '@/integrations/supabase/client';
import { buildCalendarPostFromIdea, type IdeaForCalendar } from './idea-to-calendar';
import { isCalendarDate } from './photo-workflows';

export async function planSavedIdea(idea: IdeaForCalendar & { id: string }, date: string) {
  if (!isCalendarDate(date)) throw new Error('Choisis une date valide.');
  const { data, error } = await supabase.rpc('plan_saved_idea' as any, {
    p_idea_id: idea.id, p_date: date,
    p_payload: buildCalendarPostFromIdea(idea), p_expected_updated_at: idea.updated_at ?? null,
  });
  if (error) throw error;
  const receipt = data as any;
  if (!receipt?.id || !isCalendarDate(receipt.date)) throw new Error('La confirmation est indisponible. Vérifie le calendrier avant de réessayer.');
  return receipt as { id: string; date: string; replayed: boolean; updated_at: string };
}
export async function moveCalendarPost(id: string, date: string, expectedDate: string) {
  if (!isCalendarDate(date)) throw new Error('Choisis une date valide.');
  const { data, error } = await supabase.rpc('move_calendar_post' as any, {
    p_post_id: id, p_date: date, p_expected_date: expectedDate,
  });
  if (error) throw error;
  const receipt = data as any;
  if (receipt?.id !== id || receipt?.date !== date) throw new Error('Le déplacement n’a pas pu être confirmé. Rouvre le calendrier.');
  return receipt as { id: string; date: string; updated_at: string };
}
