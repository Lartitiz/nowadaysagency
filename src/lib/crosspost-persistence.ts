import { supabase } from '@/integrations/supabase/client';
import { commitCalendarContent } from '@/lib/calendar-persistence';
import { crosspostEnvelope, type CrosspostResult } from './crosspost-content';
import { buildCalendarContent } from '@/features/creer/build-calendar-content';
export interface CrosspostSession {
  id: string; result: CrosspostResult; source: Record<string, any>;
  calendar: Record<string, { id: string; payload: Record<string, any>; confirmed?: boolean }>;
  ideas: Record<string, { id: string; payload: Record<string, any>; confirmed?: boolean }>;
}
export function createCrosspostSession(result: CrosspostResult, source: Record<string, any>): CrosspostSession {
  return { id: crypto.randomUUID(), result, source, calendar: {}, ideas: {} };
}
export function crosspostScope(userId: string, workspaceId: string) { return `crosspost:v2:${userId}:${workspaceId}`; }
export function archiveCrosspost(scope: string, session: CrosspostSession) {
  sessionStorage.setItem(`${scope}:archive:${session.id}`, JSON.stringify(session));
}
export function crosspostHistory(scope: string): CrosspostSession[] {
  const entries = new Map<string, CrosspostSession>();
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)!;
    if (!key.startsWith(`${scope}:archive:`) && !key.startsWith(`${scope}:late:`)) continue;
    try { const value = JSON.parse(sessionStorage.getItem(key)!); if (value?.id && value.result?.versions) entries.set(value.id, value); } catch { /* unrelated or incomplete cache */ }
  }
  return Array.from(entries.values());
}
export function persistCrosspost(scope: string, session: CrosspostSession) {
  // The operation ID must reach durable browser storage BEFORE the request.
  sessionStorage.setItem(`${scope}:result`, JSON.stringify(session));
}
export function readCrosspost(scope: string): CrosspostSession | null {
  try { return JSON.parse(sessionStorage.getItem(`${scope}:result`) || 'null'); } catch { return null; }
}
export async function saveCrosspostCalendar(session: CrosspostSession, scope: string, key: string,
  date: string, ownerId: string, workspaceId: string | null) {
  if (!ownerId) throw new Error('Le propriétaire de cet espace n’est pas encore disponible.');
  let operation = session.calendar[key];
  if (!operation) {
    const envelope = crosspostEnvelope(session.result, key, session.source);
    const { contentDraft, accroche, storyDetail } = buildCalendarContent(key, envelope);
    const format = key === 'reel' ? 'reel' : key === 'stories' ? 'story_serie' : key === 'instagram' ? 'carousel' : 'post';
    operation = { id: crypto.randomUUID(), payload: {
      user_id: ownerId, workspace_id: workspaceId, date, theme: `Crosspost ${key} : ${session.source.source_type}`,
      canal: key === 'linkedin' ? 'linkedin' : 'instagram', format,
      content_draft: contentDraft, accroche, story_sequence_detail: storyDetail,
      ...(Array.isArray(storyDetail?.media_urls) ? { media_urls: storyDetail.media_urls }
        : Array.isArray(storyDetail?.visual_urls) ? { media_urls: storyDetail.visual_urls } : {}),
      ...(Array.isArray(storyDetail?.stories) ? { stories_count: storyDetail.stories.length } : {}),
    } };
    session.calendar[key] = operation;
  }
  persistCrosspost(scope, session);
  const receipt = await commitCalendarContent({ postId: operation.id, payload: operation.payload, create: true, briefId: null, ideaId: null });
  operation.confirmed = true;
  persistCrosspost(scope, session);
  return { ...receipt, date: operation.payload.date };
}
export async function saveCrosspostIdea(session: CrosspostSession, scope: string, key: string,
  fields: Record<string, any>, ownerId: string, workspaceId: string | null) {
  if (!ownerId) throw new Error('Le propriétaire de cet espace n’est pas encore disponible.');
  let operation = session.ideas[key];
  if (!operation) {
    operation = { id: crypto.randomUUID(), payload: { ...fields, user_id: ownerId, workspace_id: workspaceId,
      type: 'draft', status: 'to_explore', source_module: 'crosspost' } };
    session.ideas[key] = operation;
  }
  persistCrosspost(scope, session);
  // No upsert: a retry must never overwrite an idea edited elsewhere.
  const { data, error } = await supabase.from('saved_ideas').insert({ ...operation.payload, id: operation.id } as any).select('id').single();
  if (error && error.code !== '23505') throw error;
  if (error) {
    let query = supabase.from('saved_ideas').select('id').eq('id', operation.id).eq('user_id', ownerId);
    query = workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null);
    const existing = await query.single();
    if (existing.error || existing.data?.id !== operation.id) throw existing.error || new Error('Enregistrement non confirmé');
  } else if (data?.id !== operation.id) throw new Error('Enregistrement non confirmé');
  operation.confirmed = true;
  persistCrosspost(scope, session);
  return operation.id;
}
