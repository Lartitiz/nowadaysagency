import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const m = vi.hoisted(() => ({ scope: 'A', user: 'user', ready: true, rows: {} as Record<string, any[]>, rpc: vi.fn(), query: vi.fn(), success: vi.fn(), error: vi.fn(), invoke: vi.fn(), writes: [] as any[], fail: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: m.user ? { id: m.user } : null }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceFilter: () => ({ column: m.scope ? 'workspace_id' : 'user_id', value: m.scope || m.user }), useWorkspaceId: () => m.scope || m.user, useWorkspaceReady: () => m.ready }));
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ data: null }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandProposition: () => ({ data: null }) }));
vi.mock('@/hooks/use-speech-recognition', () => ({ useSpeechRecognition: () => ({}) }));
vi.mock('@/components/bio/BioHistoryDrawer', () => ({ default: () => null }));
vi.mock('@/components/linkedin/LinkedInPreview', () => ({ default: () => null }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/AiGeneratedMention', () => ({ default: () => null }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/components/engagement/EngagementCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/input-with-voice', () => ({ InputWithVoice: (p: any) => <input {...p} /> }));
vi.mock('@/components/ui/textarea-with-voice', () => ({ TextareaWithVoice: (p: any) => <textarea {...p} /> }));
vi.mock('@/lib/invoke-with-timeout', () => ({ invokeWithTimeout: m.invoke }));
vi.mock('@/lib/quota-error-handler', () => ({ handleQuotaError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: any[]) => m.rpc(...args), from: (table: string) => {
  let op = 'select', payload: any; const filters: any[] = [];
  const q: any = { select: () => q, eq: (k: string, v: any) => { filters.push([k,v]); return q; }, is: () => q, neq: () => q, limit: () => q, order: () => q, maybeSingle: () => q, single: () => q,
    delete: () => { op = 'delete'; return q; }, insert: (p: any) => { op = 'insert'; payload = p; return q; }, update: (p: any) => { op = 'update'; payload=p; return q; },
    then: (ok: any, bad: any) => Promise.resolve().then(() => m.query({table, op, payload, filters})).then(ok,bad) }; return q;
} } }));
import LinkedInParcours from '@/pages/LinkedInParcours';
import LinkedInRecommandations from '@/pages/LinkedInRecommandations';
import LinkedInProfil from '@/pages/LinkedInProfil';
import LinkedInEngagement from '@/pages/LinkedInEngagement';
import LinkedInCommentStrategy from '@/pages/LinkedInCommentStrategy';
import LinkedInResume from '@/pages/LinkedInResume';
import { MemoryRouter } from 'react-router-dom';
const exp = (id='exp-A', title='Métier conservé') => ({ id, job_title: title, company: 'Entreprise', description_raw: 'Texte original', description_optimized: 'Texte relu', sort_order: 0, created_at: '2026-01-01' });
const reco = () => ({id:'reco-A',person_name:'Alice',person_type:'client',request_sent:true,reco_received:true,created_at:'2026-01-01'});
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };
const receipt = (rows: any[]) => ({data:{rows:structuredClone(rows)},error:null});
function backend(_name: string, p: any) {
  const key = `${p.p_table}:${p.p_workspace_id || 'personal'}`;
  if (p.p_rows === null) return receipt(m.rows[key] || []);
  m.writes.push(p);
  if (m.fail) return {data:null,error:{message:'synthetic insertion failure'}};
  m.rows[key] = p.p_rows.map((row:any) => ({created_at:'2026-01-01',...(m.rows[key] || []).find(r=>r.id===row.id),...row}));
  return receipt(m.rows[key]);
}
beforeEach(() => {
  vi.clearAllMocks(); m.scope='A';m.user='user';m.ready=true;m.fail=false;m.writes=[];
  m.rows={'linkedin_experiences:A':[exp()], 'linkedin_recommendations:A':[reco()], 'linkedin_profile:A':[{id:'profile-A',title:'Titre A'}]};
  m.rpc.mockImplementation(backend);
  // Old code path retained to reproduce delete → failed insert before correction.
  m.query.mockImplementation(({table,op,payload}: any) => {
    const key=`${table}:${m.scope}`;
    if(op==='update' && m.fail) return {data:null,error:{message:'fixture'}};
    if(op==='delete') {m.rows[key]=[];return {data:null,error:null};}
    if(op==='insert') {if(m.fail)return {data:null,error:{message:'synthetic insertion failure'}};m.rows[key]=payload;return {data:null,error:null};}
    return {data:['linkedin_profile','linkedin_comment_strategy'].includes(table) ? m.rows[key]?.[0] : m.rows[key] || [],error:null};
  });
});
afterEach(cleanup);
describe('LinkedIn listes réelles: conservation et reçus', () => {
  it.each([['parcours',LinkedInParcours,'linkedin_experiences','Métier conservé',/Enregistrer mon parcours/],['recommandations',LinkedInRecommandations,'linkedin_recommendations','Alice',/Enregistrer/]] as const)('%s conserve la liste si écriture échoue (R2/N1)', async (_label,Page,table,text,save) => {
    render(<Page/>);await screen.findByDisplayValue(text);const before=structuredClone(m.rows[`${table}:A`]);m.fail=true;
    fireEvent.click(screen.getByRole('button',{name:save}));await waitFor(()=>expect(m.error).toHaveBeenCalled());
    expect(m.rows[`${table}:A`]).toEqual(before);expect(m.success).not.toHaveBeenCalled();
  });
  it.each(['empty','missing','reject'])('ne confirme pas un reçu %s', async mode=>{
    render(<LinkedInParcours/>);await screen.findByDisplayValue('Métier conservé');
    m.rpc.mockImplementationOnce(()=>mode==='reject'?Promise.reject(new Error('fixture')):mode==='empty'?receipt([]):{data:null,error:null});
    fireEvent.click(screen.getByRole('button',{name:/Enregistrer mon parcours/}));await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(m.success).not.toHaveBeenCalled();
  });
  it('conserve IDs, textes bruts/optimisés et ordre après deux sauvegardes puis suppression',async()=>{
    render(<LinkedInParcours/>);await screen.findByDisplayValue('Métier conservé');
    fireEvent.click(screen.getByRole('button',{name:/Ajouter une expérience/}));
    const inputs=screen.getAllByPlaceholderText('Intitulé du poste');
    fireEvent.change(inputs[1],{target:{value:'Seconde'}});
    fireEvent.click(screen.getByRole('button',{name:/Enregistrer mon parcours/}));await waitFor(()=>expect(m.success).toHaveBeenCalledTimes(1));
    const first=structuredClone(m.rows['linkedin_experiences:A']);expect(first[0]).toMatchObject(exp());expect(first[1].id).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Seconde'),{target:{value:'Modifiée'}});
    fireEvent.click(screen.getByRole('button',{name:/Enregistrer mon parcours/}));await waitFor(()=>expect(m.success).toHaveBeenCalledTimes(2));
    expect(m.rows['linkedin_experiences:A'][1]).toMatchObject({id:first[1].id,job_title:'Modifiée',sort_order:1});
    fireEvent.click(screen.getAllByRole('button',{name:/Supprimer/})[1]);await waitFor(()=>expect(m.success).toHaveBeenCalledTimes(3));
    expect(m.rows['linkedin_experiences:A']).toEqual([first[0]]);
  });
  it('préserve statuts et IDs des recommandations, y compris la sixième',async()=>{
    m.rows['linkedin_recommendations:A']=Array.from({length:6},(_,i)=>({...reco(),id:`r${i}`,person_name:`Personne ${i}`}));
    render(<LinkedInRecommandations/>);await screen.findByDisplayValue('Personne 5');
    fireEvent.click(screen.getByRole('button',{name:/Enregistrer/}));await waitFor(()=>expect(m.success).toHaveBeenCalled());
    expect(m.rows['linkedin_recommendations:A']).toHaveLength(6);expect(m.rows['linkedin_recommendations:A'][5]).toMatchObject({id:'r5',request_sent:true,reco_received:true});
  });
  it('refuse doubles clics pendant la sauvegarde',async()=>{
    render(<LinkedInParcours/>);await screen.findByDisplayValue('Métier conservé');const slow=deferred();m.rpc.mockImplementationOnce(()=>slow.promise);
    const button=screen.getByRole('button',{name:/Enregistrer mon parcours/});fireEvent.click(button);fireEvent.click(button);expect(m.rpc).toHaveBeenCalledTimes(2);
    await act(async()=>slow.resolve(receipt([exp()])));
  });
});
describe('LinkedIn portée/visite (N2)',()=>{
  it.each([[LinkedInParcours,'Métier conservé'],[LinkedInRecommandations,'Alice'],[LinkedInProfil,'Titre A']] as const)('recharge A → B vide → A pour %s',async(Page,text)=>{
    const view=render(<Page/>);await screen.findByDisplayValue(text);m.scope='B';view.rerender(<Page/>);
    await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(2));expect(screen.queryByDisplayValue(text)).toBeNull();
    m.scope='A';view.rerender(<Page/>);await screen.findByDisplayValue(text);expect(m.rpc).toHaveBeenCalledTimes(3);
  });
  it('ignore ancienne réponse A après A → B → A',async()=>{
    const slow=deferred();m.rpc.mockImplementationOnce(()=>slow.promise);const view=render(<LinkedInParcours/>);
    m.scope='B';view.rerender(<LinkedInParcours/>);await screen.findByRole('button',{name:/Enregistrer mon parcours/});
    m.scope='A';view.rerender(<LinkedInParcours/>);await screen.findByDisplayValue('Métier conservé');
    await act(async()=>slow.resolve(receipt([exp('old','ANCIEN')])));expect(screen.queryByDisplayValue('ANCIEN')).toBeNull();
  });
  it.each(['reject','error'])('distingue absence et erreur %s avec reprise',async mode=>{
    m.rpc.mockImplementationOnce(()=>mode==='reject'?Promise.reject(new Error('fixture')):{data:null,error:{message:'fixture'}});
    render(<LinkedInParcours/>);await screen.findByRole('alert');expect(screen.queryByRole('button',{name:/Enregistrer mon parcours/})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Réessayer'}));await screen.findByDisplayValue('Métier conservé');
  });
  it('neutralise reçu de sauvegarde et toast de visite précédente',async()=>{
    const view=render(<LinkedInParcours/>);await screen.findByDisplayValue('Métier conservé');const slow=deferred();m.rpc.mockImplementationOnce(()=>slow.promise);
    fireEvent.click(screen.getByRole('button',{name:/Enregistrer mon parcours/}));m.scope='B';view.rerender(<LinkedInParcours/>);
    await screen.findByRole('button',{name:/Enregistrer mon parcours/});await act(async()=>slow.resolve(receipt([exp()])));
    expect(m.success).not.toHaveBeenCalled();expect(screen.queryByDisplayValue('Métier conservé')).toBeNull();
  });
  it('neutralise une optimisation tardive',async()=>{
    const slow=deferred();m.invoke.mockReturnValueOnce(slow.promise);const view=render(<LinkedInParcours/>);await screen.findByDisplayValue('Métier conservé');
    fireEvent.click(screen.getByRole('button',{name:/Rédiger avec la structure/}));m.scope='B';view.rerender(<LinkedInParcours/>);await screen.findByRole('button',{name:/Enregistrer mon parcours/});
    await act(async()=>slow.resolve({data:{content:'ANCIEN'},error:null}));expect(screen.queryByDisplayValue('ANCIEN')).toBeNull();
  });
  it('attend ready, masque déconnexion et scope personnel NULL',async()=>{
    m.ready=false;const view=render(<LinkedInParcours/>);expect(m.rpc).not.toHaveBeenCalled();m.ready=true;m.scope='';view.rerender(<LinkedInParcours/>);
    await screen.findByRole('button',{name:/Enregistrer mon parcours/});expect(m.rpc.mock.calls[0][1].p_workspace_id).toBeNull();m.user='';view.rerender(<LinkedInParcours/>);expect(screen.queryByRole('button',{name:/Enregistrer mon parcours/})).toBeNull();
  });
  it('engagement n’incrémente pas la progression après erreur',async()=>{
    render(<MemoryRouter><LinkedInEngagement/></MemoryRouter>);const buttons=await screen.findAllByRole('button',{name:'+1'});m.fail=true;fireEvent.click(buttons[0]);await waitFor(()=>expect(m.error).toHaveBeenCalled());
    expect(m.rows['engagement_weekly_linkedin:A']).toBeUndefined();expect(m.success).not.toHaveBeenCalled();
  });
});

 describe('Parcours proches', () => {
  it('stratégie conserve le compte affiché après suppression refusée', async()=>{
    m.rows['linkedin_comment_strategy:A']=[{id:'strategy-A',accounts:[{name:'Compte conservé',niche:'Service',url:'https://example.org'}]}];
    render(<LinkedInCommentStrategy/>);await screen.findByText('Compte conservé');m.fail=true;
    fireEvent.click(screen.getByRole('button',{name:'Retirer Compte conservé'}));await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(screen.getByText('Compte conservé')).toBeTruthy();
  });
  it('résumé conserve variantes au changement de profil et ignore réponse tardive',async()=>{
    m.rows['linkedin_profile:A']=[{id:'p-A',summary_final:'Résumé A',summary_storytelling:'Story A',summary_pro:'Pro A'}];
    const view=render(<MemoryRouter><LinkedInResume/></MemoryRouter>);await screen.findByText('Résumé A');m.scope='B';view.rerender(<MemoryRouter><LinkedInResume/></MemoryRouter>);
    await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(2));expect(screen.queryByText('Résumé A')).toBeNull();m.scope='A';view.rerender(<MemoryRouter><LinkedInResume/></MemoryRouter>);await screen.findByText('Résumé A');
  });
 });

it('conserve une recommandation historique sans nom et ne la retire que par action explicite',async()=>{
 m.rows['linkedin_recommendations:A']=[{...reco(),person_name:''}];render(<LinkedInRecommandations/>);await screen.findByRole('button',{name:/Enregistrer/});
 fireEvent.click(screen.getByRole('button',{name:/Enregistrer/}));await waitFor(()=>expect(m.success).toHaveBeenCalled());expect(m.rows['linkedin_recommendations:A'][0]).toMatchObject({id:'reco-A',request_sent:true,reco_received:true});
 fireEvent.click(screen.getByRole('button',{name:'Retirer la recommandation 1'}));await waitFor(()=>expect(m.rows['linkedin_recommendations:A']).toEqual([]));
});
