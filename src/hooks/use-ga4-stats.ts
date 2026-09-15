import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {invokeWithTimeout} from '@/lib/invoke-with-timeout';
import {planGa4Update,validateGa4Report,type Ga4Field,type Ga4Report,type StatsRecord} from '@/lib/ga4-stats';
import {readStatsMonth,saveStatsPatch} from '@/lib/stats-persistence';
export type Ga4Pending = {report:Ga4Report;row:StatsRecord|null;conflicts:ReturnType<typeof planGa4Update>['conflicts']};
export function useGa4Stats(userId:string,workspaceId:string|null,onSaved:()=>void,blocked=false) {
  const scope=useMemo(()=>({userId,workspaceId}),[userId,workspaceId]);
  const active=useRef<typeof scope|null>(null), request=useRef(0);
  const [state,setState]=useState<{scope:typeof scope;busy:boolean;message:string;error:string;pending:Ga4Pending[];last:Ga4Report|null}|null>(null);
  useLayoutEffect(()=>{active.current=scope;return()=>{active.current=null;};},[scope]);
  const current=state?.scope===scope?state:null;
  const refresh=useCallback(async(months:string[])=>{
    if(active.current!==scope || !userId || blocked) return;
    const id=++request.current;
    const valid=()=>active.current===scope&&request.current===id;
    setState({scope,busy:true,message:'',error:'',pending:[],last:null});
    const pending:Ga4Pending[]=[];
    let saved=0,failed=0,partial=0,last:Ga4Report|null=null;
    for(const month of months) {
      if(!valid()) return;
      try {
        const {data,error}=await invokeWithTimeout('ga4-insights-fetch',{body:{workspace_id:workspaceId??undefined,month}},60000);
        if(!valid()) return;
        if(error || data?.error) throw new Error(data?.error||error?.message||'Google Analytics indisponible');
        const report=validateGa4Report(data,month,workspaceId);
        const row=await readStatsMonth(userId,workspaceId,month);
        if(!valid()) return;
        const plan=planGa4Update(row,report);
        let receipt=row;
        if(Object.keys(plan.patch).length) {
          receipt=await saveStatsPatch(workspaceId,month,row,plan.patch,'ga4',report);
          if(!valid()) return;
          saved++;
        }
        if(plan.conflicts.length) pending.push({report,row:receipt,conflicts:plan.conflicts});
        if(report.observation.reportState==='partial') partial++;
        last=report;
      } catch(e) {
        if(!valid()) return;
        failed++;
        if(months.length===1) {
          setState({scope,busy:false,message:'',error:(e as Error).message||'Récupération impossible',pending,last});
          return;
        }
      }
    }
    if(!valid()) return;
    setState({scope,busy:false,message:`${saved} mois enregistré(s). ${pending.length} mois avec des valeurs à vérifier.${partial?` ${partial} relevé(s) partiel(s) : certaines mesures sont indisponibles.`:''}`,error:failed?`${failed} mois en échec. Leurs données sont conservées ; relance la récupération.`:'',pending,last});
    if(saved) onSaved();
  },[scope,userId,workspaceId,onSaved,blocked]);
  const replace=useCallback(async(index:number,fields:Ga4Field[])=>{
    const item=current?.pending[index];
    if(!item || !fields.length || active.current!==scope || blocked || current.busy) return;
    const id=++request.current;
    const valid=()=>active.current===scope&&request.current===id;
    setState({...current,busy:true,error:''});
    try {
      const patch=Object.fromEntries(item.conflicts.filter(c=>fields.includes(c.field)).map(c=>[c.field,c.incoming]));
      const row=await saveStatsPatch(workspaceId,item.report.month,item.row,patch,'ga4',item.report);
      if(!valid()) return;
      const remaining=item.conflicts.filter(c=>!fields.includes(c.field));
      setState({...current,busy:false,message:'Les valeurs sélectionnées sont enregistrées. Elles suivront désormais cette propriété GA4.',pending:current.pending.flatMap((p,i)=>i!==index?[p]:remaining.length?[{...p,row,conflicts:remaining}]:[])});
      onSaved();
    } catch(e) {if(valid()) setState({...current,busy:false,error:(e as Error).message||'Enregistrement impossible'});}
  },[current,scope,workspaceId,onSaved,blocked]);
  return {...current,busy:current?.busy??false,refresh,replace};
}
