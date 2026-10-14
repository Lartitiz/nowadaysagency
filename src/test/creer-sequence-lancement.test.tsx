import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, loadPhotos, saveFlowState, savePhotos, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Lot E du découpage de CreerUnifie (docs/robustesse/gros-fichiers.md, fiche 1) :
// séquence de lancement (angle « lancement » = 5 contenus, un par chapitre).
// Posé AVANT de déplacer le code, pour vérifier que le déplacement ne change rien.
// La page est réelle ; la génération, l'étape format et l'écran de résultat
// sont les frontières.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), invoke: vi.fn(), photoRead: vi.fn(), photoDecode: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  demo: false,
  setResult: null as any, formatNextParams: null as any, doGenerateParams: null as any, hookProps: null as any, resultProps: null as any,
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<any>()), toast: mocks.toast }));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => ({ user: { id: 'owner' }, session: { user: { id: 'owner' } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'A', useWorkspaceReady: () => true, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: 'A' }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({ children }: any) => children, useDemoContext: () => ({ isDemoMode: mocks.demo, demoData: mocks.demo ? {} : undefined }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: false, pending: false }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock('@/hooks/use-activity-examples', () => ({ useActivityExamples: () => ({ activityText: '' }) }));
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => 20, plan: 'free', usage: {}, refresh: () => {} }) }));
vi.mock('@/hooks/use-user-photos', () => ({ useUserPhotos: () => ({ data: [] }) }));
vi.mock('@/hooks/use-photo-wishlist', () => ({ usePhotoWishlistMutations: () => ({}) }));
vi.mock('@/hooks/use-carousel-autosave', () => ({ useCarouselAutosave: () => ({}) }));
vi.mock('@/hooks/use-carousel-quality', () => ({ useCarouselQuality: () => ({}) }));
vi.mock('@/hooks/use-linkedin-carousel-caption', () => ({ useLinkedInCarouselCaption: () => ({}) }));
vi.mock('@/hooks/use-user-slides-generate', () => ({ useUserSlidesGenerate: () => ({}) }));
vi.mock('@/hooks/use-select-inspiration-proposal', () => ({ useSelectInspirationProposal: () => ({}) }));
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: (p: any) => { mocks.doGenerateParams = p; return { doGenerate: mocks.generate }; } }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: () => ({}) }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  mocks.setResult = setResult;
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: (p: any) => { mocks.formatNextParams = p; return { handleFormatNext: mocks.formatNext }; } }));
vi.mock('@/lib/invoke-with-timeout', async (importOriginal) => ({ ...(await importOriginal<any>()), invokeWithTimeout: (...args: any[]) => mocks.invoke(...args) }));
vi.mock('@/lib/photo-storage', () => ({ userPhotoToBase64: (...args: any[]) => mocks.photoDecode(...args) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><p>Idée : {p.idea}</p></div> }));
vi.mock('@/components/creer/HookSelectionStep', () => ({ default: (p: any) => { mocks.hookProps = p; return <ul data-testid="angles">{p.hooks.map((h: any) => <li key={h.text}>{h.text}</li>)}</ul>; } }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps = p; return <pre data-testid="result">{JSON.stringify(p.result)}</pre>; } }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: () => null }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/components/creer/PhotoUploadZone', () => ({ PhotoUploadZone: (p: any) => <span data-testid="photos">{p.initialPhotos.map((x: any) => x.name).join(',')}</span> }));
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve(table === 'user_photos' ? mocks.photoRead() : { data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'not', 'is']) q[key] = () => q;
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: { id: 'brief' }, error: null });
  return q;
} } }));

function mount() {
  return render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes></MemoryRouter></StrictMode>);
}
const chapitre = (i: number) => ({ type: 'post', raw: { content: `Texte du chapitre ${i}` } });

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.demo = false; mocks.resultProps = null; mocks.formatNextParams = null;
  mocks.photoRead.mockResolvedValue({ data: [], error: null });
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

// Arrive sur l'étape format avec un sujet, puis fait ce que fait useFormatNext
// quand l'angle choisi est « lancement ». Renvoie la promesse de la séquence.
async function ouvrirFormat() {
  saveFlowState({ step: 'format', ideaText: 'Mon atelier', objective: 'vente', selectedFormat: 'post' });
  mount();
  await waitFor(() => expect(mocks.formatNextParams?.handleLaunchSequence).toBeTypeOf('function'));
}
function lancer(): Promise<void> {
  act(() => { mocks.formatNextParams.setEditorialAngle('lancement'); mocks.formatNextParams.setStep('result'); });
  let done!: Promise<void>;
  act(() => { done = mocks.formatNextParams.handleLaunchSequence('post', 'lancement'); });
  return done;
}

describe('séquence de lancement', () => {
  it('génère 5 chapitres l’un après l’autre et affiche un onglet par chapitre', async () => {
    let n = 0;
    mocks.generate.mockImplementation(async () => chapitre(++n));
    await ouvrirFormat();
    await act(async () => { await lancer(); });
    expect(mocks.generate).toHaveBeenCalledTimes(5);
    for (let i = 1; i <= 5; i++) {
      expect(mocks.generate).toHaveBeenNthCalledWith(i, { format: 'post', subject: `Mon atelier — Chapitre ${i}/5`, objective: 'vente', editorialAngle: 'lancement' });
    }
    for (let i = 1; i <= 5; i++) expect(screen.getByRole('tab', { name: `Chapitre ${i}` })).toBeInTheDocument();
    expect(screen.getByTestId('result')).toHaveTextContent('Texte du chapitre 1');
    expect(mocks.resultProps.format).toBe('post');
    expect(mocks.resultProps.sourceAngle).toBe('lancement');
  });

  it('affiche le chapitre en cours pendant la génération et ignore un 2e lancement', async () => {
    const attentes: ((v: any) => void)[] = [];
    mocks.generate.mockImplementation(() => new Promise((resolve) => attentes.push(resolve)));
    await ouvrirFormat();
    const done = lancer();
    expect(await screen.findByText('Génération du chapitre 1/5…')).toBeInTheDocument();
    await act(async () => { await mocks.formatNextParams.handleLaunchSequence('post', 'lancement'); });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await act(async () => { attentes[0](chapitre(1)); });
    expect(await screen.findByText('Génération du chapitre 2/5…')).toBeInTheDocument();
    for (let i = 2; i <= 5; i++) await act(async () => { attentes[i - 1](chapitre(i)); });
    await act(async () => { await done; });
    expect(screen.queryByText(/Génération du chapitre/)).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('une erreur au 3e chapitre garde les 2 premiers et prévient', async () => {
    let n = 0;
    mocks.generate.mockImplementation(async () => { if (++n === 3) throw new Error('Plus de crédits'); return chapitre(n); });
    await ouvrirFormat();
    await act(async () => { await lancer(); });
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Chapitre 1', 'Chapitre 2']);
    expect(mocks.toast.error).toHaveBeenCalledWith('Plus de crédits');
    expect(screen.queryByText(/Génération du chapitre/)).toBeNull();
  });

  it('une retouche du texte ne change que son chapitre', async () => {
    let n = 0;
    mocks.generate.mockImplementation(async () => chapitre(++n));
    await ouvrirFormat();
    await act(async () => { await lancer(); });
    act(() => mocks.resultProps.onResultTextChange('Texte retouché'));
    expect(screen.getByTestId('result')).toHaveTextContent('Texte retouché');
    expect(JSON.parse(screen.getByTestId('result').textContent!)).toEqual({ content: 'Texte retouché', edited_text: 'Texte retouché' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Chapitre 2' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('Texte du chapitre 2'));
  });

  it('« Nouveau contenu » vide la séquence', async () => {
    let n = 0;
    mocks.generate.mockImplementation(async () => chapitre(++n));
    await ouvrirFormat();
    await act(async () => { await lancer(); });
    act(() => mocks.resultProps.onReset());
    await waitFor(() => expect(screen.queryAllByRole('tab')).toHaveLength(0));
    expect(screen.queryByTestId('result')).toBeNull();
  });
});
