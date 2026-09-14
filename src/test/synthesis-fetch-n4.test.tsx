import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useSynthesisFetch } from "@/components/branding/SynthesisFetchLogic";
const state = vi.hoisted(()=>({scope:'a',owner:'owner',ready:true,fail:'',profile:{first_name:'Owner'},brand:{mission:'Mission'},pending:null as null|((value:any)=>void),slow:false,calls:[] as any[]}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'manager'}})}));
vi.mock('@/hooks/use-workspace-query',()=>({useWorkspaceFilter:()=>({column:'workspace_id',value:state.scope}),useProfileUserId:()=>state.owner,useWorkspaceReady:()=>state.ready}));
vi.mock('@/hooks/use-profile',()=>({useProfile:()=>({data:state.profile}),useBrandProfile:()=>({data:state.brand})}));
vi.mock('@/lib/invoke-with-timeout',()=>({invokeWithTimeout:vi.fn(async (_name,body)=>{state.calls.push(body);return {data:{summaries:{label:state.scope}},error:null}})}));
vi.mock('@/lib/branding-completion',()=>({fetchBrandingDataWithStatus:async()=>({data:{},error:state.fail==='completion'?Error('failed'):null}),calculateBrandingCompletion:()=>({total:25})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
  let scope='';let single=false;const q:any={select:()=>q,eq:(key:string,value:any)=>{if(key==='workspace_id')scope=value;return q},is:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q},then:(resolve:any)=>{
    const data=table==='persona'?[{id:scope+'1',label:scope+' first',is_primary:false},{id:scope+'2',label:scope+' second',is_primary:false}]:table==='storytelling'?[{id:scope+'s1'},{id:scope+'s2'}]:single?null:[];
    const result={data,error:state.fail===table?Error('failed'):null};
    if(table==='persona'&&state.slow){state.slow=false;state.pending=()=>resolve(result)}else resolve(result);
  }};return q;
}}}));
beforeEach(()=>{state.scope='a';state.owner='owner';state.ready=true;state.fail='';state.pending=null;state.slow=false;state.calls=[]});
it('does not arbitrarily select among multiple publics or primary stories',async()=>{const {result}=renderHook(()=>useSynthesisFetch());await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.data.personas).toHaveLength(2);expect(result.current.data.persona).toBeNull();expect(result.current.data.storytelling).toBeNull();act(()=>result.current.selectPersona('a2'));expect(result.current.data.persona.id).toBe('a2');expect(state.calls[0].body.workspace_id).toBe('a')});
it.each(['persona','storytelling','offers','completion'])('%s errors do not become empty data and can be retried',async table=>{state.fail=table;const {result}=renderHook(()=>useSynthesisFetch());await waitFor(()=>expect(result.current.loadError).not.toBe(''));expect(result.current.data).toBeNull();state.fail='';await act(()=>result.current.loadData());expect(result.current.data.personas).toHaveLength(2)});
it('waits for owner and workspace resolution',async()=>{state.owner='';const {result,rerender}=renderHook(()=>useSynthesisFetch());expect(result.current.data).toBeNull();expect(state.calls).toHaveLength(0);state.owner='owner';rerender();await waitFor(()=>expect(result.current.data).not.toBeNull())});
it('late response from the first A visit cannot replace B or a second A visit',async()=>{state.slow=true;const {result,rerender}=renderHook(()=>useSynthesisFetch());await waitFor(()=>expect(state.pending).not.toBeNull());state.scope='b';rerender();await waitFor(()=>expect(result.current.data?.personas[0].id).toBe('b1'));state.scope='a';rerender();await waitFor(()=>expect(result.current.data?.personas[0].id).toBe('a1'));act(()=>result.current.selectPersona('a2'));await act(async()=>state.pending(null));expect(result.current.data.persona.id).toBe('a2')});
