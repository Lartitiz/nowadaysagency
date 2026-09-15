import { supabase } from '@/integrations/supabase/client';
import type { StatsRecord, Ga4Report } from './ga4-stats';
export async function readStatsMonth(userId: string, workspaceId: string | null, month: string): Promise<StatsRecord | null> {
  let q = supabase.from('monthly_stats').select('*').eq('month_date',month);
  q = workspaceId ? q.eq('workspace_id',workspaceId) : q.eq('user_id',userId).is('workspace_id',null);
  const { data,error } = await q.maybeSingle();
  if(error) throw error;
  return data;
}
export async function saveStatsPatch(workspaceId: string | null, month: string, expected: StatsRecord | null, patch: StatsRecord, source: 'manual'|'import'|'ga4', report?: Ga4Report): Promise<StatsRecord> {
  const {data,error} = await (supabase.rpc as any)('save_monthly_stats',{
    p_workspace_id: workspaceId, p_month: month, p_expected: expected, p_patch: patch, p_source: source,
    p_observation: report ? {...report.observation,propertyId:report.propertyId} : null,
  });
  if(error) throw error;
  if(!data?.id) throw new Error('Aucun relevé enregistré. Réessaie.');
  return data;
}
