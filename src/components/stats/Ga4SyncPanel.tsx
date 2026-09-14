import {useState,useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {GA4_FIELDS,type Ga4Field} from '@/lib/ga4-stats';
import {useGa4Stats,type Ga4Pending} from '@/hooks/use-ga4-stats';
import {monthLabel} from '@/lib/stats-helpers';
function ConflictChoice({item,busy,onReplace}:{item:Ga4Pending;busy:boolean;onReplace:(fields:Ga4Field[])=>void}) {
  const [selected,setSelected]=useState<Ga4Field[]>([]);
  return <fieldset className="min-w-0 space-y-2 rounded-lg border p-3" disabled={busy}>
    <legend className="px-1 text-sm font-medium">Valeurs à vérifier — {monthLabel(item.report.month)}</legend>
    <p className="text-xs text-muted-foreground">Propriété {item.report.propertyId}. Coche uniquement les valeurs que tu souhaites remplacer. Les autres sont conservées.</p>
    {item.conflicts.map(c=><label key={c.field} className="flex gap-2 items-start text-sm">
      <input type="checkbox" checked={selected.includes(c.field)} onChange={e=>setSelected(s=>e.target.checked?[...s,c.field]:s.filter(k=>k!==c.field))}/>
      <span>{GA4_FIELDS[c.field].label} : {c.previous==null?'vide':String(c.previous)} → {c.incoming} {GA4_FIELDS[c.field].unit} <span className="text-muted-foreground">({c.source==='manual'?'saisie manuelle':c.source==='import'?'import':c.source==='ga4'?'autre relevé GA4':c.source})</span></span>
    </label>)}
    <Button className="h-auto max-w-full whitespace-normal py-2 text-left" size="sm" variant="outline" disabled={busy||!selected.length} onClick={()=>{onReplace(selected);setSelected([]);}}>Remplacer les valeurs sélectionnées par GA4</Button>
  </fieldset>;
}
export default function Ga4SyncPanel({userId,workspaceId,month,history,onSaved,blocked=false,stored,onBusyChange}:{userId:string;workspaceId:string|null;month:string;history:string[];onSaved:()=>void;blocked?:boolean;stored?:Record<string,any>;onBusyChange?:(busy:boolean)=>void}) {
  const sync=useGa4Stats(userId,workspaceId,onSaved,blocked);
  useEffect(()=>{onBusyChange?.(sync.busy);return()=>onBusyChange?.(false);},[sync.busy,onBusyChange]);
  return <section aria-label="Synchronisation Google Analytics" className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
    <p className="text-sm text-muted-foreground">Actualise les visiteurs et sources de trafic de ton site. Les relevés de cette propriété GA4 sont actualisés ; les saisies manuelles, imports et anciennes valeurs restent protégés.</p>
    {blocked&&<p role="status" className="text-sm">Enregistre tes modifications du formulaire avant de récupérer GA4.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={sync.busy||blocked} onClick={()=>void sync.refresh([month])}>{sync.busy?'Récupération…':`Actualiser GA4 — ${monthLabel(month)}`}</Button>
      <Button size="sm" variant="outline" disabled={sync.busy||blocked} onClick={()=>void sync.refresh(history)}>Récupérer 12 mois d'historique</Button>
    </div>
    {sync.message&&<p role="status" className="text-sm">{sync.message}</p>}
    {sync.error&&<p role="alert" className="text-sm text-destructive">{sync.error}</p>}
    {sync.last&&<p className="text-xs text-muted-foreground">Propriété {sync.last.propertyId} · {sync.last.observation.startDate} au {sync.last.observation.endDate} ({sync.last.observation.timeZone}) · {sync.last.observation.periodState==='partial'?'mois en cours, données provisoires':'mois terminé'} · relevé du {new Date(sync.last.observation.fetchedAt).toLocaleString('fr-FR')}. Visiteurs = utilisateurs ; trafic = sessions.</p>}
    {stored && <details className="text-xs text-muted-foreground"><summary>Sources des valeurs enregistrées</summary>
      <ul className="mt-2 space-y-1">{Object.entries(GA4_FIELDS).map(([field,info])=>{const p=stored[field];return <li key={field}>{info.label} : {p?.source==='ga4'?`GA4 ${p.propertyId} · ${p.startDate} au ${p.endDate} (${p.timeZone}) · ${p.periodState==='partial'?'mois partiel':'mois terminé'} · relevé ${p.fetchedAt}`:p?.source==='manual'?'saisie manuelle':p?.source==='import'?'import':'origine non renseignée'} · {info.unit}</li>;})}</ul>
    </details>}
    {sync.pending?.map((item,index)=><ConflictChoice key={item.report.month+item.report.observation.fetchedAt} item={item} busy={sync.busy||blocked} onReplace={fields=>void sync.replace(index,fields)}/>)}
  </section>;
}
