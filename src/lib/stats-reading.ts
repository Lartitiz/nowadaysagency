import type { StatsRow, DashboardKPIs } from '@/components/stats/stats-types';
import { monthKey, pctChange } from '@/lib/stats-helpers';

export function monthsInRange(from: string, to: string): string[] {
  const start = new Date(`${from.slice(0, 7)}-01T12:00:00`), end = new Date(`${to.slice(0, 7)}-01T12:00:00`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start > end) return [];
  const months: string[] = [];
  while (start <= end && months.length < 1200) { months.push(monthKey(start)); start.setMonth(start.getMonth() + 1); }
  return months;
}
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function instagramKPIs(rows: StatsRow[], from: string, to: string, currentMonth: string): DashboardKPIs | null {
  const months = monthsInRange(from, to);
  if (!months.length || !rows.some(r => months.includes(r.month_date))) return null;
  const summarize = (keys: string[]) => {
    const entries = keys.map(k => rows.find(r => r.month_date === k));
    const reach = entries.map(r => r?.reach);
    const validReach = reach.filter(number);
    const engaged = entries.map(r => r?.accounts_engaged);
    const reachTotal = validReach.reduce((a,b) => a+b,0);
    return {
      followers: entries.at(-1)?.followers ?? null,
      avgReach: validReach.length ? Math.round(validReach.reduce((a,b)=>a+b,0)/validReach.length) : null,
      avgEngagement: reach.every(number) && engaged.every(number) && reachTotal > 0 ? (engaged as number[]).reduce((a,b)=>a+b,0)/reachTotal*100 : null,
      netGrowth: entries.every(r => number(r?.followers_gained) && number(r?.followers_lost)) ? entries.reduce((n,r)=>n+r!.followers_gained!-r!.followers_lost!,0) : null,
      completeReach: validReach.length === keys.length,
      followersGained: keys.length===1 ? entries[0]?.followers_gained ?? null : null,
    };
  };
  const value = summarize(months);
  const prevStart = new Date(`${from.slice(0,7)}-01T12:00:00`); prevStart.setMonth(prevStart.getMonth()-months.length);
  const prevEnd = new Date(`${from.slice(0,7)}-01T12:00:00`); prevEnd.setMonth(prevEnd.getMonth()-1);
  const previous = summarize(monthsInRange(monthKey(prevStart),monthKey(prevEnd)));
  const comparable = to < currentMonth;
  return { ...value, changeFollowers: comparable ? pctChange(value.followers, previous.followers) : null,
    changeReach: comparable && value.completeReach && previous.completeReach ? pctChange(value.avgReach,previous.avgReach) : null,
    changeEngagement: comparable ? pctChange(value.avgEngagement,previous.avgEngagement) : null,
    changeNetGrowth: comparable ? pctChange(value.netGrowth,previous.netGrowth) : null };
}
