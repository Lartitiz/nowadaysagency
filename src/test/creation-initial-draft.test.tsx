import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId, savePhotos, loadPhotos, clearFlowState } from '@/hooks/use-flow-persistence';
const mocks = vi.hoisted(() => ({ user: 'owner', workspace: 'A', ready: true, photoRead: vi.fn(), photoDecode: vi.fn(), generate: vi.fn(), cloud: null as any }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.user }, session: { user: { id: mocks.user } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => mocks.workspace, useWorkspaceReady: () => mocks.ready, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: mocks.workspace }) }));
vi.mock('@/contexts/DemoContext', () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: false, pending: false }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock('@/hooks/use-activity-examples', () => ({ useActivityExamples: () => ({ activityText: '' }) }));
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => 20, plan: 'free', usage: {}, refresh: () => {} }) }));
vi.mock('@/hooks/use-user-photos', () => ({ useUserPhotos: () => ({ data: [] }) }));
vi.mock('@/hooks/use-photo-wishlist', () => ({ usePhotoWishlistMutations: () => ({}) }));
vi.mock('@/hooks/use-carousel-autosave', () => ({ useCarouselAutosave: (p: any) => { mocks.cloud = p; return {}; } }));
vi.mock('@/hooks/use-carousel-quality', () => ({ useCarouselQuality: () => ({}) }));
vi.mock('@/hooks/use-linkedin-carousel-caption', () => ({ useLinkedInCarouselCaption: () => ({}) }));
vi.mock('@/hooks/use-user-slides-generate', () => ({ useUserSlidesGenerate: () => ({}) }));
vi.mock('@/hooks/use-select-inspiration-proposal', () => ({ useSelectInspirationProposal: () => ({}) }));
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({}) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: () => ({}) }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.generate }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><button onClick={p.onBack}>Retour idée</button></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => <div><pre data-testid="result">{JSON.stringify(p.result)}</pre><button onClick={p.onReset}>Réinitialiser</button></div> }));
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }));
vi.mock('@/lib/photo-storage', () => ({ userPhotoToBase64: (...args: any[]) => mocks.photoDecode(...args) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const q: any = { then: (resolve: any) => Promise.resolve(table === 'user_photos' ? mocks.photoRead() : { data: [], error: null }).then(resolve) };
  for (const key of ['select','eq','in','order','limit','insert','update']) q[key] = () => q;
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  return q;
} } }));
// Media decoding/upload is a boundary; CreerUnifie and CreerStepIdea stay real.
vi.mock('@/components/creer/PhotoUploadZone', () => ({ PhotoUploadZone: (p: any) => <div>
  <span data-testid="photos">{p.initialPhotos.map((x: any) => x.name).join(',')}</span>
  <button onClick={() => p.onPhotosChange([{ id:'photo-1',userPhotoId:'library-1',base64:'data:image/png;base64,AA==',preview:'data:image/png;base64,AA==',name:'Portrait',context:'Contexte photo' }])}>Ajouter photo test</button>
  <button onClick={() => p.onPhotosChange([{id:'local-photo',name:'Photo locale',base64:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZsAAAAASUVORK5CYII=',preview:'',mimeType:'image/png'}])}>Ajouter photo locale</button>
  <button onClick={() => p.onPhotosChange([])}>Retirer photos</button>
  <input aria-label="Description photo" value={p.initialDescription} onChange={e => p.onDescriptionChange(e.target.value)}/>
</div> }));
function App() { const nav = useNavigate(); return <><button onClick={() => nav('/ailleurs')}>Quitter</button><button onClick={() => nav('/creer')}>Créer</button><button onClick={() => nav('/creer?new=1')}>Nouveau explicite</button><button onClick={() => nav('/creer?sujet=Autre%20sujet')}>Autre intention</button><button onClick={() => nav('/creer?canal=pinterest')}>Canal Pinterest</button><button onClick={() => nav(-1)}>Historique précédent</button><Routes><Route path="/creer" element={<CreerUnifie/>}/><Route path="/ailleurs" element={<p>Ailleurs</p>}/></Routes></>; }
function mount(url: any = '/creer') { return render(<StrictMode><MemoryRouter initialEntries={[url]}><App/></MemoryRouter></StrictMode>); }
function type(text: string) { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); }
beforeEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); mocks.user='owner'; mocks.workspace='A'; mocks.ready=true; setFlowUserId('owner'); setFlowWorkspaceId('A'); mocks.photoRead.mockResolvedValue({data:[{id:'library-1',name:'Portrait'}],error:null}); mocks.photoDecode.mockResolvedValue({base64:'data:image/png;base64,AA==',name:'Portrait',mimeType:'image/png'}); });
afterEach(cleanup);
describe('initial creation draft through real React components', () => {
  it('keeps the first words on leave, return and reload before continuing', async () => {
    const app=mount(); type('  Mes premiers mots\nencore bruts  ');
    expect(loadFlowState()?.ideaText).toBe('  Mes premiers mots\nencore bruts  ');
    fireEvent.click(screen.getByText('Quitter')); fireEvent.click(screen.getByText('Créer'));
    expect(screen.getByRole('textbox')).toHaveValue('  Mes premiers mots\nencore bruts  ');
    app.unmount(); mount(); expect(screen.getByRole('textbox')).toHaveValue('  Mes premiers mots\nencore bruts  ');
  });
  it('restores a historical first-step draft on plain /creer', () => {
    saveFlowState({step:'idea',ideaText:'Brouillon historique',creationId:'same-id',editingIdeaId:'idea-id',incomingBriefId:'brief-id'});
    mount(); expect(screen.getByRole('textbox')).toHaveValue('Brouillon historique');
    expect(loadFlowState()).toMatchObject({creationId:'same-id',editingIdeaId:'idea-id',incomingBriefId:'brief-id'});
  });
  it('persists an intentionally emptied subject through closing the tab', () => {
    saveFlowState({step:'idea',ideaText:'Ancien texte'}); const app=mount(); type(''); app.unmount(); sessionStorage.clear();
    mount(); expect(screen.getByRole('textbox')).toHaveValue(''); expect(loadFlowState()?.ideaText).toBe('');
  });
  it('keeps account and workspace drafts through A → B → A, including an empty B', () => {
    const app=mount(); type('A owner');
    mocks.workspace='B'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByRole('textbox')).toHaveValue(''); type('B owner');
    mocks.workspace='A'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByRole('textbox')).toHaveValue('A owner');
    mocks.user='another'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByRole('textbox')).toHaveValue(''); type('A another');
    mocks.user='owner'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByRole('textbox')).toHaveValue('A owner');
    mocks.workspace='B'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByRole('textbox')).toHaveValue('B owner');
  });
  it('waits for workspace initialization without replacing the draft', () => {
    saveFlowState({step:'idea',ideaText:'Avant init',creationId:'original'}); mocks.ready=false;
    const app=mount(); expect(screen.queryByRole('textbox')).toBeNull();
    mocks.ready=true; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByRole('textbox')).toHaveValue('Avant init'); expect(loadFlowState()?.creationId).toBe('original');
  });
  it('keeps the requested channel, next/back and refresh without regenerating', async () => {
    const app=mount('/creer?canal=linkedin'); type('LinkedIn initial'); fireEvent.click(screen.getByText('Suivant'));
    await screen.findByText('Format : linkedin');
    fireEvent.click(screen.getByText('Retour idée')); expect(screen.getByRole('textbox')).toHaveValue('LinkedIn initial');
    type(''); app.unmount(); mount(); expect(screen.getByRole('textbox')).toHaveValue('');
    expect(loadFlowState()?.forcedChannel).toBe('linkedin'); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('does not change any draft identity while the real conflict dialog is open, and resumes', () => {
    saveFlowState({step:'idea',ideaText:'À garder',creationId:'same',editingIdeaId:'idea',calendarPostId:'calendar',reelMp4Url:'old-video'});
    const before=loadFlowState(); const location=window.location; const replace=vi.fn(); vi.stubGlobal('location', {...location, replace});
    const app=mount('/creer?new=1');
    expect(screen.getByRole('dialog')).toBeVisible(); expect(loadFlowState()).toEqual(before);
    fireEvent.click(screen.getByText('Reprendre mon contenu en cours')); expect(replace).toHaveBeenCalled();
    app.unmount(); mount(); expect(screen.getByRole('textbox')).toHaveValue('À garder');
    expect(loadFlowState()).toMatchObject({creationId:'same',editingIdeaId:'idea',calendarPostId:'calendar'}); vi.stubGlobal('location', location);
  });
  it('starts blank only after explicit discard and does not restore the completed content', async () => {
    saveFlowState({step:'result',ideaText:'Ancien',creationId:'old',result:{type:'post',raw:{content:'Texte ancien'}},editingIdeaId:'old-idea',publishedCalendarId:'old-calendar'});
    const app=mount('/creer?new=1'); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Démarrer le nouveau contenu'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(screen.getByRole('textbox')).toHaveValue('');
    expect(loadFlowState()?.creationId).not.toBe('old'); expect(loadFlowState()?.editingIdeaId).toBeNull(); expect(loadFlowState()?.publishedCalendarId).toBeUndefined();
    app.unmount(); mount(); expect(screen.getByRole('textbox')).toHaveValue(''); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('keeps photos, description and an empty photo subject after closing and restoring under StrictMode', async () => {
    let app=mount(); type('Une idée texte distincte'); fireEvent.click(screen.getByText('Partir de photos'));
    fireEvent.click(screen.getByText('Ajouter photo test')); fireEvent.change(screen.getByLabelText('Description photo'), {target:{value:'Description exacte'}});
    const subject=screen.getAllByRole('textbox').find(x => x.tagName==='TEXTAREA')!;
    fireEvent.change(subject,{target:{value:'Sujet photo'}}); fireEvent.change(subject,{target:{value:''}});
    expect(loadPhotos()).toMatchObject([{id:'photo-1',userPhotoId:'library-1',context:'Contexte photo'}]);
    app.unmount(); sessionStorage.clear(); app=mount(); await waitFor(() => expect(screen.getByTestId('photos')).toHaveTextContent('Portrait'));
    expect(screen.getByLabelText('Description photo')).toHaveValue('Description exacte'); expect(screen.getAllByRole('textbox').find(x => x.tagName==='TEXTAREA')).toHaveValue('');
    expect(loadFlowState()?.ideaText).toBe('Une idée texte distincte');
    fireEvent.click(screen.getByText('Retirer photos')); expect(loadPhotos()).toEqual([]);
    app.unmount(); sessionStorage.clear(); mount(); expect(screen.getByTestId('photos')).toBeEmptyDOMElement();
  });
  it('ignores an old callback after switching A → B → A', () => {
    const app=mount(); type('A'); const old=mocks.cloud.onId;
    mocks.workspace='B'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>); type('B');
    mocks.workspace='A'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    act(() => old('late-idea')); expect(loadFlowState()?.ideaText).toBe('A'); expect(loadFlowState()?.editingIdeaId).toBeNull();
  });

  it('restores later results and IDs, then clears them on an internal reset', async () => {
    const raw={content:'Résultat original',caption:'Légende',_crosspost:{source:'privée'}};
    saveFlowState({step:'result',ideaText:'Sujet',result:{type:'post',raw},selectedFormat:'post',creationId:'creation',editingIdeaId:'idea',incomingBriefId:'brief',calendarPostId:'calendar',publishedCalendarId:'published'});
    const app=mount(); await screen.findByTestId('result'); expect(loadFlowState()).toMatchObject({result:{raw},creationId:'creation',editingIdeaId:'idea',incomingBriefId:'brief',calendarPostId:'calendar',publishedCalendarId:'published'});
    const old=mocks.cloud.onId; fireEvent.click(screen.getByText('Réinitialiser')); fireEvent.click(screen.getByText('Garder mon contenu'));
    expect(loadFlowState()?.result?.raw).toEqual(raw);
    fireEvent.click(screen.getByText('Réinitialiser')); fireEvent.click(screen.getByRole('button',{name:'Repartir de zéro'}));
    expect(screen.getByRole('textbox')).toHaveValue(''); act(() => old('late-id'));
    expect(loadFlowState()?.editingIdeaId).toBeNull(); expect(loadFlowState()?.calendarPostId).toBeNull(); expect(loadFlowState()?.result).toBeUndefined();
    app.unmount(); sessionStorage.clear(); mount(); expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('keeps a photo-only draft when saving it through the text-only conflict path is unsupported', async () => {
    saveFlowState({step:'idea',ideaText:'',photoEntry:true,photoSubject:'',creationId:'photo-draft'});
    await savePhotos([{id:'p',userPhotoId:'library-1',name:'Portrait'}]);
    const before=loadFlowState(); const app=mount('/creer?new=1'); expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByText('Démarrer le nouveau contenu'));
    await waitFor(() => expect(screen.getByText('Reprendre mon contenu en cours')).toBeEnabled());
    expect(loadFlowState()).toEqual(before); expect(loadPhotos()).toHaveLength(1);
    app.unmount(); mount(); await waitFor(() => expect(screen.getByTestId('photos')).toHaveTextContent('Portrait'));
  });
  it('ignores late library replies from the first A visit after A → B → A', async () => {
    const resolvers: ((x:any)=>void)[]=[];
    mocks.photoRead.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    saveFlowState({step:'idea',ideaText:'A',photoEntry:true}); await savePhotos([{id:'p',userPhotoId:'library-1',name:'Portrait A'}]);
    const app=mount(); await waitFor(() => expect(resolvers.length).toBe(2));
    mocks.workspace='B'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>); type('B');
    mocks.photoRead.mockResolvedValue({data:[{id:'library-1',name:'Portrait A'}],error:null});
    mocks.workspace='A'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    await waitFor(() => expect(screen.getByTestId('photos')).toHaveTextContent('Portrait A'));
    fireEvent.click(screen.getByText('Retirer photos'));
    await act(async () => { resolvers.forEach(resolve => resolve({data:[{id:'library-1',name:'Réponse tardive'}],error:null})); });
    expect(screen.getByTestId('photos')).toBeEmptyDOMElement(); expect(loadPhotos()).toEqual([]);
  });
  it('keeps missing library references after a failed read', async () => {
    mocks.photoRead.mockResolvedValue({data:null,error:new Error('offline')});
    saveFlowState({step:'idea',ideaText:'',photoEntry:true}); await savePhotos([{id:'p',userPhotoId:'library-1',name:'À récupérer'}]);
    mount(); await waitFor(() => expect(screen.getByTestId('photos')).toHaveTextContent('À récupérer'));
    expect(loadPhotos()).toMatchObject([{id:'p',userPhotoId:'library-1'}]);
  });

  it('protects the draft when another creation intent arrives on the already-mounted route', () => {
    mount(); type('Première intention'); const before=loadFlowState();
    fireEvent.click(screen.getByText('Autre intention')); expect(screen.getByRole('dialog')).toBeVisible();
    expect(loadFlowState()).toEqual(before);
  });

  it('restores the requested channel when using browser history between channel entries', async () => {
    mount('/creer?canal=linkedin'); type('Sujet conservé');
    fireEvent.click(screen.getByText('Canal Pinterest')); expect(loadFlowState()?.forcedChannel).toBe('pinterest');
    fireEvent.click(screen.getByText('Historique précédent')); expect(screen.getByRole('textbox')).toHaveValue('Sujet conservé');
    expect(loadFlowState()?.forcedChannel).toBe('linkedin');
  });

});
