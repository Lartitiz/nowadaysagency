import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmt, fmtEur, monthLabel, monthLabelShort } from '@/lib/stats-helpers';
import { monthsInRange } from '@/lib/stats-reading';
import type { StatsRow } from './stats-types';

const metrics = {
  reach: { label: 'Portée Instagram', unit: 'comptes touchés', source: 'Instagram · relevés enregistrés', money: false },
  website_visitors: { label: 'Visiteurs du site', unit: 'utilisateurs', source: 'Site · saisie, import ou Google Analytics', money: false },
  revenue: { label: 'Chiffre d’affaires', unit: '€', source: 'Activité · chiffres saisis ou importés', money: true },
  clients_signed: { label: 'Clients signés', unit: 'clients', source: 'Activité · chiffres saisis ou importés', money: false },
};
type Metric = keyof typeof metrics;
export default function StatsReading({ rows, from, to, currentMonth, onData }: { rows: StatsRow[]; from: string; to: string; currentMonth: string; onData: () => void }) {
  const [metric, setMetric] = useState<Metric>('reach');
  const definition = metrics[metric];
  const entries = monthsInRange(from,to).map(month => ({month,row:rows.find(r=>r.month_date===month)}));
  const values = entries.map(({row}) => typeof row?.[metric] === 'number' && Number.isFinite(row[metric]) ? row[metric] as number : null);
  const present = values.filter((v):v is number => v!==null);
  const maximum = Math.max(1,...present);
  const display = (v:number|null) => v===null ? 'Non renseigné' : definition.money ? fmtEur(v) : fmt(Math.round(v));
  const single = entries.length === 1;
  // Reach and users are not additive across months (the same person can recur).
  const average = metric==='reach'||metric==='website_visitors';
  const complete = values.length>0 && present.length===values.length;
  const value = present.length ? average ? present.reduce((a,b)=>a+b,0)/present.length : complete ? present.reduce((a,b)=>a+b,0) : null : null;
  return <section className="rounded-2xl border border-[#ead7e1] bg-[#fffafd] dark:bg-card p-5 sm:p-7 space-y-6" aria-label="Lecture de mes statistiques">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <label className="text-sm font-medium space-y-2 block">Je veux suivre
        <select className="block max-w-full rounded-lg border border-border bg-card p-2.5 mt-2" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>
          {Object.entries(metrics).map(([key,item])=><option key={key} value={key}>{item.label}</option>)}
        </select>
      </label>
      <Button variant="outline" onClick={onData}>Compléter mes données</Button>
    </div>
    {!entries.length ? <p role="alert">Choisis une date de début antérieure ou égale à la date de fin.</p> : <>
      <div>
        <p className="text-xs text-muted-foreground">{definition.source}</p>
        <h2 className="font-display text-4xl text-[#4a1733] dark:text-foreground mt-3">{display(value)}</h2>
        <p className="text-sm mt-2">{single ? definition.unit : average ? `${definition.unit} en moyenne par mois renseigné` : `${definition.unit} sur la période complète`}</p>
        <p className="text-xs text-muted-foreground mt-2">{monthLabel(from)}{!single && ` à ${monthLabel(to)}`} · {present.length}/{entries.length} mois renseignés{to>=currentMonth?' · période en cours':''}</p>
        {!complete && <p className="text-sm mt-3 text-muted-foreground">Les mois absents restent vides. {average ? 'La moyenne porte seulement sur les mois renseignés.' : 'Le total sera disponible quand tous les mois seront renseignés.'}</p>}
        {metric==='reach' && <p className="text-xs text-muted-foreground mt-2">Un relevé Instagram récent peut couvrir 28 jours glissants, rangés dans le mois en cours. La portée mensuelle ne s’additionne pas en audience unique.</p>}
      </div>
      <figure aria-label={`${definition.label} par mois`}>
        <figcaption className="font-medium text-sm mb-4">L’évolution, mois par mois</figcaption>
        <div className="space-y-3">{entries.map(({month},i)=><div key={month} className="grid grid-cols-[5rem_minmax(0,1fr)_6rem] items-center gap-3 text-xs">
          <span>{monthLabelShort(month)}</span>
          <div className="h-3 bg-[#f4e9ef] rounded-full" aria-hidden="true">{values[i]!==null && <div className="h-full bg-[#652345] rounded-full" style={{width:`${Math.max(0,values[i]!)/maximum*100}%`}}/>}</div>
          <span className="text-right tabular-nums">{display(values[i])}</span>
        </div>)}</div>
      </figure>
      <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm text-primary">Voir les chiffres et leur provenance</summary>
        <div className="overflow-x-auto mt-3"><table className="w-full text-sm text-left"><caption className="sr-only">Relevés enregistrés pour {definition.label}</caption><thead><tr><th scope="col" className="p-2">Mois</th><th scope="col" className="p-2">Valeur</th><th scope="col" className="p-2">Provenance</th></tr></thead><tbody>{entries.map(({month,row},i)=>{
          const provenance=row?.metric_provenance?.[metric];
          return <tr key={month} className="border-t border-border"><th scope="row" className="p-2 font-normal">{monthLabel(month)}</th><td className="p-2">{display(values[i])}</td><td className="p-2">{values[i]===null?'Aucune valeur':provenance?.source==='ga4' && provenance.value===values[i]?`Google Analytics · propriété ${provenance.property_id || provenance.propertyId || 'voir Mes sources'}`:provenance?.source==='manual'?'Saisie manuelle':provenance?.source==='import'?'Import':'Relevé enregistré · source non documentée'}{provenance?.source==='ga4' && provenance.value===values[i] && <span className="block text-xs text-muted-foreground">{provenance.startDate} → {provenance.endDate} · {provenance.timeZone || 'Fuseau non documenté'} · {provenance.periodState==='partial'?'Période partielle':'Période complète'}{provenance.fetchedAt && ` · récupéré le ${new Date(provenance.fetchedAt).toLocaleDateString('fr-FR')}`}</span>}</td></tr>;
        })}</tbody></table></div>
      </details>
    </>}
  </section>;
}
