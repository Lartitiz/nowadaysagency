import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { instagramKPIs, monthsInRange } from '@/lib/stats-reading';
import StatsReading from '@/components/stats/StatsReading';
it('retains true zero in means and does not invent missing engagement or growth',()=>{
 const result=instagramKPIs([{month_date:'2026-07-01',reach:0},{month_date:'2026-08-01',reach:100}], '2026-07-01','2026-08-01','2026-09-01');
 expect(result?.avgReach).toBe(50);expect(result?.avgEngagement).toBeNull();expect(result?.netGrowth).toBeNull();
});
it('does not replace a missing comparison month by an older available one',()=>{
 const result=instagramKPIs([{month_date:'2026-05-01',reach:50},{month_date:'2026-08-01',reach:100}], '2026-08-01','2026-08-01','2026-09-01');
 expect(result?.changeReach).toBeNull();
});
it('does not treat interactions as unique engaged accounts, or absent losses as zero',()=>{
 const result=instagramKPIs([{month_date:'2026-08-01',reach:100,interactions:20,followers_gained:12}], '2026-08-01','2026-08-01','2026-09-01');
 expect(result?.avgEngagement).toBeNull();expect(result?.netGrowth).toBeNull();
});
it('compares matching completed periods and suspends changes for the current month',()=>{
 const rows=[{month_date:'2026-08-01',reach:50,accounts_engaged:10,followers_gained:12,followers_lost:2},{month_date:'2026-09-01',reach:100,accounts_engaged:30,followers_gained:15,followers_lost:3}];
 expect(instagramKPIs(rows,'2026-09-01','2026-09-01','2026-09-01')?.changeReach).toBeNull();
 expect(instagramKPIs(rows,'2026-09-01','2026-09-01','2026-10-01')?.changeReach?.val).toBe(100);
 expect(instagramKPIs(rows,'2026-09-01','2026-09-01','2026-10-01')?.avgEngagement).toBe(30);
});
it('keeps calendar holes and rejects reversed periods',()=>{
 expect(monthsInRange('2026-07-01','2026-09-01')).toEqual(['2026-07-01','2026-08-01','2026-09-01']);expect(monthsInRange('2026-09-01','2026-07-01')).toEqual([]);
});
it('shows data coverage and absent values separately from zero',()=>{
 render(<StatsReading rows={[{month_date:'2026-08-01',reach:0}]} from="2026-07-01" to="2026-08-01" currentMonth="2026-09-01" onData={()=>{}}/>);
 expect(screen.getByRole('heading',{name:'0'})).toBeInTheDocument();expect(screen.getByText(/1\/2 mois renseignés/)).toBeInTheDocument();expect(screen.getAllByText('Non renseigné').length).toBeGreaterThan(0);
});
