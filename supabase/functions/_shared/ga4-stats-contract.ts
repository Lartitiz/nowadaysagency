export const GA4_FIELDS = {
  website_visitors: { metric: 'websiteVisitors', label: 'Visiteurs du site', unit: 'utilisateurs' },
  ga4_users: { metric: 'ga4Users', label: 'Utilisateurs GA4', unit: 'utilisateurs' },
  traffic_search: { metric: 'trafficSearch', label: 'Trafic recherche (naturel et payant)', unit: 'sessions' },
  traffic_social: { metric: 'trafficSocial', label: 'Trafic réseaux (naturel et payant)', unit: 'sessions' },
  traffic_pinterest: { metric: 'trafficPinterest', label: 'Trafic Pinterest', unit: 'sessions' },
  traffic_instagram: { metric: 'trafficInstagram', label: 'Trafic Instagram', unit: 'sessions' },
} as const;
export type Ga4Field = keyof typeof GA4_FIELDS;
export type StatsRecord = Record<string, any>;
export type Ga4Report = {
  success: true; propertyId: string; month: string; workspaceId: string | null;
  metrics: Record<string, number | null>;
  observation: { startDate: string; endDate: string; fetchedAt: string; timeZone: string; periodState: 'partial'|'complete'; reportState: 'partial'|'complete'; unavailable: string[] };
};
export function validateGa4Report(data: Ga4Report, month: string, workspaceId: string | null): Ga4Report {
  if (!data || data.success !== true || !/^\d+$/.test(data.propertyId) || data.month !== month || data.workspaceId !== workspaceId ||
      data.observation?.startDate !== month || !data.observation.timeZone || !Number.isFinite(Date.parse(data.observation.fetchedAt)) ||
      !['partial','complete'].includes(data.observation.periodState) || !['partial','complete'].includes(data.observation.reportState) ||
      !data.observation.endDate || data.observation.endDate.slice(0,7)!==month.slice(0,7) || !data.metrics) throw new Error('Réponse GA4 absente ou incohérente. Relance la récupération.');
  if (!Object.values(GA4_FIELDS).some(f => typeof data.metrics[f.metric] === "number" && Number.isSafeInteger(data.metrics[f.metric]) && data.metrics[f.metric]! >= 0)) throw new Error("Aucune mesure GA4 exploitable.");
  return data;
}
export function planGa4Update(row: StatsRecord | null, report: Ga4Report) {
  const patch: Record<string, number> = {};
  const conflicts: { field: Ga4Field; previous: unknown; incoming: number; source: string }[] = [];
  for (const field of Object.keys(GA4_FIELDS) as Ga4Field[]) {
    const value = report.metrics[GA4_FIELDS[field].metric];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) continue;
    const provenance = row?.metric_provenance?.[field];
    const automatic = provenance?.source === 'ga4' && provenance.propertyId === report.propertyId &&
      provenance.startDate === report.month && provenance.value === row?.[field];
    if (automatic && provenance.fetchedAt && Date.parse(provenance.fetchedAt) > Date.parse(report.observation.fetchedAt)) continue;
    // Explicitly cleared manual/import cells remain protected, including null.
    if (automatic || (row?.[field] == null && !provenance)) patch[field] = value;
    else conflicts.push({ field, previous: row?.[field] ?? null, incoming: value, source: provenance?.source || 'historique, origine inconnue' });
  }
  return { patch, conflicts };
}
export function statsPatch(before: StatsRecord | null, after: StatsRecord) {
  return Object.fromEntries(Object.entries(after).filter(([k,v]) => !['id','user_id','workspace_id','month_date','created_at','updated_at','metric_provenance'].includes(k) && JSON.stringify(v)!==JSON.stringify(before?.[k])));
}
