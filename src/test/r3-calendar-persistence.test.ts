import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { planSavedIdea, moveCalendarPost } from '@/lib/idea-calendar-persistence';
const idea = { id: 'idea', titre: 'R3', format: 'post', updated_at: '2026-09-15T12:00:00Z', content_draft: '<p>Riche</p>' };
beforeEach(() => rpc.mockReset());
describe('R3 confirmed transactions', () => {
 it('returns actual replayed date without rewriting source or allocating a new identity', async () => {
  rpc.mockResolvedValue({data:{id:'post', date:'2026-10-25', replayed:true},error:null});
  expect(await planSavedIdea(idea,'2027-03-28')).toEqual({id:'post',date:'2026-10-25',replayed:true});
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][1]).toMatchObject({p_idea_id:'idea',p_expected_updated_at:idea.updated_at,p_payload:{content_draft:idea.content_draft}});
 });
 it('does not report success after a lost response, absent receipt or rejected source write', async () => {
  for (const response of [{data:null,error:new Error('network')},{data:null,error:null},{data:null,error:{message:'calendar_idea_not_found'}}]) {
   rpc.mockResolvedValue(response); await expect(planSavedIdea(idea,'2026-10-25')).rejects.toBeDefined();
  }
 });
 it.each(['2026-10-25','2027-03-28'])('keeps %s as a calendar day, not a timestamp', async(date)=>{
  rpc.mockResolvedValue({data:{id:'post',date},error:null});
  await moveCalendarPost('post',date,'2026-09-15');
  expect(rpc.mock.calls[0][1]).toEqual({p_post_id:'post',p_date:date,p_expected_date:'2026-09-15'});
 });
 it('rejects nonexistent date before a write',async()=>{await expect(planSavedIdea(idea,'2026-02-30')).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('rejects a different record in move receipt',async()=>{rpc.mockResolvedValue({data:{id:'other',date:'2026-10-25'},error:null});await expect(moveCalendarPost('post','2026-10-25','2026-09-15')).rejects.toThrow();});
});
