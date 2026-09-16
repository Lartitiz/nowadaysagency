import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import ProductionApp from '@/App';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId, savePhotos, loadPhotos, clearFlowState } from '@/hooks/use-flow-persistence';
const mocks = vi.hoisted(() => ({ user: 'owner', workspace: 'A', ready: true, brandChecking: false, photoRead: vi.fn(), photoDecode: vi.fn(), generate: vi.fn(), cloud: null as any, connect: vi.fn(), publishProps: null as any, saveProps: null as any, resultProps: null as any }));
// Keep the production BrowserRouter/AnimatedRoutes and creation page real.
vi.mock('@/contexts/WorkspaceContext', () => ({ WorkspaceProvider: ({children}: any) => children }));
vi.mock('@/contexts/SessionContext', () => ({ SessionProvider: ({children}: any) => children }));
vi.mock('@/components/SelectionMenuProvider', () => ({ default: ({children}: any) => children }));
vi.mock('@/components/ProtectedRoute', () => ({ default: ({children}: any) => children }));
vi.mock('@/components/demo/DemoBanner', () => ({ default: () => null }));
vi.mock('@/components/session/SessionOverlay', () => ({ default: () => null }));
vi.mock('@/components/admin/AiDebugShortcut', () => ({ default: () => null }));
vi.mock('@/components/UpdateBanner', () => ({ default: () => null }));
vi.mock('@/components/feedback/BetaFeedbackWidget', () => ({ default: () => null }));
vi.mock('@/components/AppSidebar', () => ({ default: () => {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/creer?sujet=Nouvelle%20intention')}>Production nouvelle intention</button><button onClick={() => navigate('/creer?canal=pinterest')}>Production Pinterest</button><button onClick={() => navigate(-1)}>Production précédent</button></>;
} }));
vi.mock('@/lib/social-connect', () => ({ startSocialConnect: (...args: any[]) => mocks.connect(...args) }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: (p: any) => { mocks.publishProps=p; return null; } }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: (p: any) => { mocks.saveProps=p; return null; } }));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({children}: any) => children, useAuth: () => ({ user: { id: mocks.user }, session: { user: { id: mocks.user } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => mocks.workspace, useWorkspaceReady: () => mocks.ready, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: mocks.workspace }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({children}: any) => children, useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: mocks.brandChecking, pending: false }) }));
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
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => <p>Choix Recycler et Crosspost</p> }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><button onClick={p.onBack}>Retour idée</button></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps=p; return <div><pre data-testid="result">{JSON.stringify(p.result)}</pre><button onClick={p.onReset}>Réinitialiser</button><button onClick={p.onEdit}>Éditer le résultat</button></div>; } }));
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
function App() { const nav = useNavigate(); return <><button onClick={() => nav('/ailleurs')}>Quitter</button><button onClick={() => nav('/creer')}>Créer</button><button onClick={() => nav('/creer?new=1')}>Nouveau explicite</button><button onClick={() => nav('/creer?sujet=Autre%20sujet')}>Autre intention</button><button onClick={() => nav('/creer?canal=pinterest')}>Canal Pinterest</button><button onClick={() => nav('/creer?mode=transform')}>Transformer</button><button onClick={() => nav(-1)}>Historique précédent</button><Routes><Route path="/creer" element={<CreerUnifie/>}/><Route path="/ailleurs" element={<p>Ailleurs</p>}/></Routes></>; }
function mount(url: any = '/creer') { return render(<StrictMode><MemoryRouter initialEntries={[url]}><App/></MemoryRouter></StrictMode>); }
function type(text: string) { fireEvent.change(screen.getByRole('textbox'), { target: { value: text } }); }
beforeEach(() => { cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); mocks.user='owner'; mocks.workspace='A'; mocks.ready=true; mocks.brandChecking=false; setFlowUserId('owner'); setFlowWorkspaceId('A'); mocks.photoRead.mockResolvedValue({data:[{id:'library-1',name:'Portrait'}],error:null}); mocks.photoDecode.mockResolvedValue({base64:'data:image/png;base64,AA==',name:'Portrait',mimeType:'image/png'}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
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
    const app=mount('/creer?canal=linkedin'); type('LinkedIn initial'); fireEvent.click(screen.getByText('Continuer'));
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
  it('undoes the initial idea, persists the restored value and clears history across spaces', async () => {
    const app=mount(); type('Idée corrigée');
    fireEvent.keyDown(screen.getByLabelText('Ton idée'), {key:'z',metaKey:true});
    expect(screen.getByLabelText('Ton idée')).toHaveValue('');
    expect(loadFlowState()?.ideaText).toBe('');
    fireEvent.click(screen.getByLabelText('Rétablir la modification du sujet'));
    expect(screen.getByLabelText('Ton idée')).toHaveValue('Idée corrigée');
    fireEvent.click(screen.getByText('Continuer'));
    await screen.findByText('Retour idée');
    fireEvent.click(screen.getByText('Retour idée'));
    fireEvent.keyDown(screen.getByLabelText('Ton idée'), {key:'z',ctrlKey:true});
    expect(screen.getByLabelText('Ton idée')).toHaveValue('');
    fireEvent.keyDown(screen.getByLabelText('Ton idée'), {key:'y',ctrlKey:true});
    mocks.workspace='B'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByLabelText('Annuler la modification du sujet')).toBeDisabled();
    type('Sujet B'); fireEvent.keyDown(screen.getByLabelText('Ton idée'), {key:'z',ctrlKey:true});
    expect(screen.getByLabelText('Ton idée')).toHaveValue('');
    mocks.workspace='A'; app.rerender(<StrictMode><MemoryRouter><CreerUnifie/></MemoryRouter></StrictMode>);
    expect(screen.getByLabelText('Ton idée')).toHaveValue('Idée corrigée');
    expect(screen.getByLabelText('Annuler la modification du sujet')).toBeDisabled();
  });
  it('undoes the photo subject without undoing the idea or changing its photos', async () => {
    mount(); type('Idée texte'); fireEvent.click(screen.getByText('Partir de photos'));
    fireEvent.click(screen.getByText('Ajouter photo test'));
    const subject=screen.getByLabelText(/De quoi veux-tu parler/);
    fireEvent.change(subject,{target:{value:'Sujet photo'}});
    fireEvent.keyDown(subject,{key:'z',metaKey:true});
    expect(subject).toHaveValue('');
    expect(loadFlowState()?.ideaText).toBe('Idée texte');
    expect(loadPhotos()).toHaveLength(1);
    fireEvent.keyDown(subject,{key:'Z',metaKey:true,shiftKey:true});
    expect(subject).toHaveValue('Sujet photo');
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


it('reopens a deliberately empty saved result without restoring the original', async () => {
  saveFlowState({step:'result',ideaText:'R1 vide',result:{type:'post',raw:{content:'Original à ne pas restaurer',edited_text:''}},selectedFormat:'post',creationId:'r1-empty'});
  mount(); await screen.findByTestId('result');
  fireEvent.click(screen.getByText('Éditer le résultat'));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
});
it('opens only the editable newsletter body, preserving its separate metadata', async () => {
  saveFlowState({step:'result',ideaText:'R1 newsletter',result:{type:'newsletter',raw:{subject:'Objet distinct',preview_text:'Aperçu distinct',body:'Corps éditable',personal_tip:'Conseil privé'}},selectedFormat:'newsletter',creationId:'r1-newsletter'});
  mount(); await screen.findByTestId('result');
  fireEvent.click(screen.getByText('Éditer le résultat'));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Corps éditable'));
});


it.each(['stories','sequences','slides'])('persists story updates immutably for the %s alias', async alias => {
  const original=[{id:'s1',text:'Ancien',sticker:{type:'poll',options:['A','B']}}];
  const updated=[{...original[0],text:'Retouche R2'}];
  const raw={ [alias]:original, custom:{keep:true}, caption:'Distincte' };
  saveFlowState({step:'result',ideaText:'R1 raccord R2',result:{type:'story',raw},selectedFormat:'story',creationId:'r1-story'});
  const app=mount(); await screen.findByTestId('result');
  act(() => mocks.resultProps.onStoriesUpdate(updated));
  await waitFor(() => expect(loadFlowState()?.result?.raw?.[alias]).toEqual(updated));
  expect(raw[alias]).toEqual(original);
  app.unmount(); sessionStorage.clear(); mount(); await screen.findByTestId('result');
  expect(mocks.resultProps.result).toMatchObject({[alias]:updated,custom:{keep:true},caption:'Distincte'});
});


it('does not replay a saved result entry when the brand query refetches after URL cleanup', async () => {
  const raw={subject:'Objet',content:'Original',edited_text:'Newsletter sauvée'};
  const entry={pathname:'/creer',search:'?sujet=Newsletter&format=newsletter&angle=newsletter&canal=newsletter&idea_id=saved-newsletter',state:{ideaId:'saved-newsletter',resumeIdea:{format:'newsletter',raw}}};
  saveFlowState({step:'result',ideaText:'Newsletter',selectedFormat:'newsletter',result:{type:'newsletter',raw},editingIdeaId:'saved-newsletter'});
  const app=mount(entry);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Démarrer le nouveau contenu'));
  await screen.findByTestId('result');
  mocks.brandChecking=true;
  app.rerender(<StrictMode><MemoryRouter initialEntries={[entry]}><App/></MemoryRouter></StrictMode>);
  mocks.brandChecking=false;
  app.rerender(<StrictMode><MemoryRouter initialEntries={[entry]}><App/></MemoryRouter></StrictMode>);
  expect(screen.getByTestId('result')).toHaveTextContent('Newsletter sauvée');
  expect(loadFlowState()).toMatchObject({step:'result',editingIdeaId:'saved-newsletter',result:{raw}});
});

it('detaches a historical empty first-step draft from its old saved idea before typing a new subject', () => {
  saveFlowState({step:'idea',ideaText:'',selectedFormat:'newsletter',result:null,editingIdeaId:'old-newsletter',creationId:'broken-resume'});
  mount(); type('Nouveau Reel');
  expect(loadFlowState()?.editingIdeaId).toBeNull();
});

it.each(['owner','A'])('normalizes OAuth scope %s and rejects a late response after leaving creation', async workspace => {
  mocks.workspace=workspace; setFlowWorkspaceId(workspace);
  saveFlowState({step:'result',ideaText:'LinkedIn',selectedFormat:'linkedin',result:{type:'linkedin',raw:{content:'À publier'}}});
  mount(); await screen.findByTestId('result');
  let resolve!: (x: any) => void;
  mocks.connect.mockImplementation(() => new Promise(r => { resolve=r; }));
  let pending: Promise<void>;
  act(() => { pending=mocks.publishProps.onConnectChannel(); });
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  const [platform,scope,opts]=mocks.connect.mock.calls[0];
  expect(platform).toBe('linkedin'); expect(scope).toBe(workspace==='owner'?undefined:'A');
  expect(opts.isCurrent()).toBe(true);
  fireEvent.click(screen.getByText('Quitter'));
  expect(opts.isCurrent()).toBe(false);
  await act(async () => { resolve({error:'Ancienne visite'}); await pending; });
  expect(screen.getByText('Ailleurs')).toBeVisible();
});
it('ignores a late save callback after a new creation and keeps the new save detached', async () => {
  saveFlowState({step:'result',ideaText:'Ancien',selectedFormat:'post',result:{type:'post',raw:{content:'Ancien'}},editingIdeaId:'old'});
  mount(); await screen.findByTestId('result'); const oldSaved=mocks.saveProps.onSaved;
  fireEvent.click(screen.getByText('Réinitialiser'));fireEvent.click(screen.getByRole('button',{name:'Repartir de zéro'}));
  type('Nouveau'); act(() => oldSaved('old',true));
  expect(mocks.saveProps.editingIdeaId).toBeNull();expect(loadFlowState()?.editingIdeaId).toBeNull();
});

it.each(['text','photo','mix','pure_photo','user_slides'])('preserves saved carousel mode %s, IDs and a separate caption on resume and reload', async mode => {
  const raw={carousel_type:mode==='user_slides'?'text':mode,user_slides:mode==='user_slides',slides:[{id:'slide-b',title:'Deuxième placée avant'},{id:'slide-a',title:'Première placée après'}],caption:{body:'Légende distincte'},visual_html:[]};
  const entry={pathname:'/creer',search:'?format=carousel&canal=instagram&idea_id=saved-carousel',state:{ideaId:'saved-carousel',resumeIdea:{format:'carousel',raw}}};
  const app=mount(entry); await screen.findByTestId('result');
  expect(loadFlowState()?.carouselSubMode).toBe(mode);
  expect(loadFlowState()).toMatchObject({editingIdeaId:'saved-carousel',result:{raw}});
  if(mode==='user_slides') expect(mocks.resultProps.onChangeAngle).toBeUndefined();
  app.unmount(); sessionStorage.clear(); mount();await screen.findByTestId('result');
  expect(loadFlowState()).toMatchObject({editingIdeaId:'saved-carousel',carouselSubMode:mode,result:{raw}});
});

it.each(['/creer?mode=transform','/creer?mode=transform&format=stories'])('opens the transform sheet at %s without replacing the current result or its identity', async url=>{
 const raw={script:[{text:'Reel conservé'}]};saveFlowState({step:'result',ideaText:'Reel QA',selectedFormat:'reel',result:{type:'reel',raw},editingIdeaId:'saved-reel',creationId:'reel-id'});
 mount(url);await screen.findByText('Choix Recycler et Crosspost');
 expect(loadFlowState()).toMatchObject({step:'result',selectedFormat:'reel',editingIdeaId:'saved-reel',creationId:'reel-id',result:{raw}});
 fireEvent.click(screen.getByRole('button',{name:'Close'}));
 expect(screen.getByTestId('result')).toHaveTextContent('Reel conservé');expect(loadFlowState()?.editingIdeaId).toBe('saved-reel');
});
it('opens transform on the already-mounted result and preserves the current creation',async()=>{
 saveFlowState({step:'result',ideaText:'Post QA',selectedFormat:'post',result:{type:'post',raw:{content:'Post gardé'}},editingIdeaId:'saved-post',creationId:'post-id'});
 mount();await screen.findByTestId('result');fireEvent.click(screen.getByText('Transformer'));
 await screen.findByText('Choix Recycler et Crosspost');expect(loadFlowState()).toMatchObject({creationId:'post-id',editingIdeaId:'saved-post',step:'result'});
});

it('preserves saved output through production Routes when consuming resume params with REPLACE', async()=>{
 const raw={subject:'Objet',content:'Original',edited_text:'Retouche sauvegardée'};
 window.history.replaceState({usr:{ideaId:'saved-news',resumeIdea:{format:'newsletter',raw}},key:'resume-news',idx:0},'', '/creer?sujet=Newsletter&format=newsletter&canal=newsletter&idea_id=saved-news');
 render(<ProductionApp/>);
 await screen.findByTestId('result');
 await waitFor(()=>expect(window.location.search).toBe('?canal=newsletter'));
 expect(loadFlowState()).toMatchObject({step:'result',ideaText:'Newsletter',editingIdeaId:'saved-news',result:{raw}});
 // A genuine PUSH must still enter the conflict gate, and POP must return safely.
 fireEvent.click(screen.getByText('Production nouvelle intention'));
 await screen.findByRole('dialog');
 expect(loadFlowState()?.result?.raw).toEqual(raw);
 fireEvent.click(screen.getByText('Production précédent'));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(screen.getByTestId('result')).toHaveTextContent('Retouche sauvegardée');
 expect(loadFlowState()).toMatchObject({editingIdeaId:'saved-news',result:{raw}});
});

it('keeps real PUSH and POP channel navigation through production Routes', async()=>{
 window.history.replaceState({usr:null,key:'channel-linkedin',idx:0},'', '/creer?canal=linkedin');
 render(<ProductionApp/>); await screen.findByRole('textbox'); type('Sujet conservé');
 fireEvent.click(screen.getByText('Production Pinterest'));
 await waitFor(()=>expect(loadFlowState()?.forcedChannel).toBe('pinterest'));
 fireEvent.click(screen.getByText('Production précédent'));
 await waitFor(()=>expect(loadFlowState()?.forcedChannel).toBe('linkedin'));
 expect(screen.getByRole('textbox')).toHaveValue('Sujet conservé');
});

it('protects photos saved without a flow record when entering a new creation', async () => {
  await savePhotos([{id:'p',userPhotoId:'library-1',name:'Photo sans texte'}]);
  expect(loadFlowState()).toBeNull();
  const view = mount('/creer?canal=instagram&new=1');
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(loadPhotos()).toHaveLength(1);
  expect(mocks.generate).not.toHaveBeenCalled();
  view.unmount();
  mount('/creer');
  await waitFor(() => expect(screen.getByTestId('photos')).toHaveTextContent('Photo sans texte'));
  expect(loadPhotos()).toMatchObject([{userPhotoId:'library-1'}]);
});

it('reopens the same generated carousel after precisions and a reload, including designs and caption', async () => {
  const raw = { slides: [{slide_number:1,title:'Couverture',body:''},{slide_number:2,title:'Erreur 1',body:'Une explication à garder'}], caption:{body:'Ma légende'}, _crosspost:{source:'privée'} };
  const visualSlides = [{slide_number:1,html:'<div>Design original</div>'}];
  saveFlowState({step:'result',ideaText:'8 erreurs',selectedFormat:'carousel',carouselSubMode:'text',slideLength:'long',questions:[{id:'q1',question:'Quelle erreur veux-tu expliquer ?'}],answers:{q1:'Réponse existante'},result:{type:'carousel',raw},visualSlides,creationId:'same-creation',editingIdeaId:'same-idea'});
  const app = mount(); await screen.findByTestId('result');
  fireEvent.click(screen.getByRole('button',{name:/Étape 3.*Précisions/}));
  await waitFor(() => expect(screen.queryByTestId('result')).not.toBeInTheDocument());
  expect(await screen.findByText('Quelle erreur veux-tu expliquer ?')).toBeInTheDocument();
  await waitFor(() => expect(loadFlowState()).toMatchObject({step:'questions',result:{raw},visualSlides,answers:{q1:'Réponse existante'},slideLength:'long'}));
  app.unmount(); mount();
  fireEvent.click(screen.getByRole('button',{name:/Étape 4.*Contenu/}));
  await screen.findByTestId('result');
  expect(loadFlowState()).toMatchObject({step:'result',result:{raw},visualSlides,creationId:'same-creation',editingIdeaId:'same-idea'});
  expect(mocks.generate).not.toHaveBeenCalled();
});
