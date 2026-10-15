import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';
import { isInterruptedGeneration, resolveSafeStep } from '@/features/creer/creer-step';

// Bug du 14/10/2026 (compte gratuit neuf) : idée LinkedIn → « Passer les
// questions, générer directement » → rechargement 15 s plus tard, pendant
// « Derniers ajustements… ». Retour muet à l'étape 2, aucun texte, crédit parti.
// LinkedIn, newsletter et carrousel n'envoient AUCUN texte avant la fin : le
// filet `pendingStream` ne voyait rien, et l'étape résultat sans résultat
// retombait sur « format ». Ces tests simulent le rechargement en pleine
// génération : état sauvegardé pendant la phase non streamée → restauration.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), generateQuestions: vi.fn(), capture: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  plan: 'free', remaining: 20, verified: true,
  setResult: null as any, resultProps: null as any, publishProps: null as any,
  setGenerating: null as any, setStreaming: null as any, setStreamingContent: null as any,
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<any>()), toast: mocks.toast }));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => ({ user: { id: 'owner' }, session: { user: { id: 'owner' } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'A', useWorkspaceReady: () => true, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: 'A' }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({ children }: any) => children, useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: false, pending: false }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock('@/hooks/use-activity-examples', () => ({ useActivityExamples: () => ({ activityText: '' }) }));
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => mocks.remaining, plan: mocks.plan, verified: mocks.verified, loading: false, usage: {}, refresh: () => {} }) }));
vi.mock('@/hooks/use-user-photos', () => ({ useUserPhotos: () => ({ data: [] }) }));
vi.mock('@/hooks/use-photo-wishlist', () => ({ usePhotoWishlistMutations: () => ({}) }));
vi.mock('@/hooks/use-carousel-autosave', () => ({ useCarouselAutosave: () => ({}) }));
vi.mock('@/hooks/use-carousel-quality', () => ({ useCarouselQuality: () => ({}) }));
vi.mock('@/hooks/use-linkedin-carousel-caption', () => ({ useLinkedInCarouselCaption: () => ({}) }));
vi.mock('@/hooks/use-user-slides-generate', () => ({ useUserSlidesGenerate: () => ({}) }));
vi.mock('@/hooks/use-select-inspiration-proposal', () => ({ useSelectInspirationProposal: () => ({}) }));
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({ doGenerate: mocks.generate }) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: () => ({}) }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  mocks.setResult = setResult; mocks.setGenerating = setGenerating; mocks.setStreaming = setStreaming; mocks.setStreamingContent = setStreamingContent;
  return { result, setResult, questions, setQuestions, generating, streaming, streamingContent, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate, generateQuestions: mocks.generateQuestions };
} }));
vi.mock('@/components/creer/CreerStepQuestions', () => ({ default: (p: any) => <button onClick={p.onSkip}>Passer les questions, générer directement</button> }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><p>Idée : {p.idea}</p></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps = p; return <div><pre data-testid="result">{p.generating ? 'Derniers ajustements…' : JSON.stringify(p.result)}</pre><button onClick={p.onReset}>Réinitialiser</button><button onClick={p.onEdit}>Éditer le résultat</button></div>; } }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: (p: any) => { mocks.publishProps = p; return null; } }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog', () => ({ posthog: { capture: (...args: any[]) => mocks.capture(...args) } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'not', 'is']) q[key] = () => q;
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return q;
} } }));


function mount(entry = '/creer') {
  return render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes></MemoryRouter></StrictMode>);
}

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.resultProps = null;
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

const CAS = [
  { nom: 'post LinkedIn', format: 'linkedin', canal: 'linkedin', extra: {} },
  { nom: 'post Instagram', format: 'post', canal: 'instagram', extra: {} },
  { nom: 'newsletter', format: 'newsletter', canal: 'newsletter', extra: {} },
  { nom: 'carrousel texte', format: 'carousel', canal: 'instagram', extra: { carouselSubMode: 'text' as const } },
];

describe('rechargement en pleine génération (phase non streamée)', () => {
  it.each(CAS)('$nom : la création interrompue est annoncée, avec un bouton pour relancer', async ({ format, canal, extra }) => {
    // 1) Étape « Précisions » restaurée, la cliente passe les questions.
    saveFlowState({ step: 'questions', ideaText: 'Mon idée', selectedFormat: format, questions: [{ id: 'q_0', question: 'Une anecdote ?' }], ...extra });
    mocks.generate.mockImplementation(() => { mocks.setGenerating(true); return new Promise(() => {}); });
    mount(`/creer?canal=${canal}`);
    fireEvent.click(await screen.findByRole('button', { name: /Passer les questions/ }));
    expect(await screen.findByText('Derniers ajustements…')).toBeInTheDocument();
    // 2) Pendant la génération, la copie de secours sait qu'elle est en cours.
    await waitFor(() => expect(loadFlowState()?.generationInFlight?.format).toBe(format));
    expect(loadFlowState()?.step).toBe('result');

    // 3) Rechargement : la page repart de zéro, la génération est perdue.
    cleanup();
    mocks.generate.mockReset();
    mount(`/creer?canal=${canal}`);
    expect(await screen.findByText('Ta création a été interrompue par le rechargement de la page.')).toBeInTheDocument();
    expect(screen.queryByText(/^Format :/)).toBeNull();

    // 4) « Relancer la création » relance la génération avec les mêmes réponses.
    mocks.generate.mockImplementation(() => { mocks.setGenerating(true); return new Promise(() => {}); });
    fireEvent.click(screen.getByRole('button', { name: /Relancer la création/ }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({}));
    expect(await screen.findByText('Derniers ajustements…')).toBeInTheDocument();
    expect(screen.queryByText('Ta création a été interrompue par le rechargement de la page.')).toBeNull();
  });

  it('génération terminée (résultat reçu) : la marque « en cours » disparaît', async () => {
    saveFlowState({ step: 'questions', ideaText: 'Mon idée', selectedFormat: 'linkedin', questions: [{ id: 'q_0', question: 'Une anecdote ?' }] });
    mocks.generate.mockImplementation(() => { mocks.setGenerating(true); return new Promise(() => {}); });
    mount('/creer?canal=linkedin');
    fireEvent.click(await screen.findByRole('button', { name: /Passer les questions/ }));
    await waitFor(() => expect(loadFlowState()?.generationInFlight).toBeTruthy());
    act(() => { mocks.setResult({ type: 'linkedin', raw: { content: 'Texte final' } }); mocks.setGenerating(false); });
    await waitFor(() => expect(loadFlowState()?.generationInFlight).toBeNull());
    cleanup();
    mount('/creer?canal=linkedin');
    expect(await screen.findByTestId('result')).toHaveTextContent('Texte final');
    expect(screen.queryByText(/interrompue par le rechargement/)).toBeNull();
  });

  it('génération en échec (pas de résultat) : au rechargement, retour à l’étape format comme avant', async () => {
    saveFlowState({ step: 'questions', ideaText: 'Mon idée', selectedFormat: 'linkedin', questions: [{ id: 'q_0', question: 'Une anecdote ?' }] });
    mocks.generate.mockImplementation(() => { mocks.setGenerating(true); return new Promise(() => {}); });
    mount('/creer?canal=linkedin');
    fireEvent.click(await screen.findByRole('button', { name: /Passer les questions/ }));
    await waitFor(() => expect(loadFlowState()?.generationInFlight).toBeTruthy());
    act(() => { mocks.setGenerating(false); });
    await waitFor(() => expect(loadFlowState()?.generationInFlight).toBeNull());
    cleanup();
    mount('/creer?canal=linkedin');
    expect(await screen.findByText(/^Format :/)).toBeInTheDocument();
  });

  it('post Instagram : la fin du texte reçu est sauvée même dans la dernière seconde', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      saveFlowState({ step: 'questions', ideaText: 'Mon idée', selectedFormat: 'post', questions: [{ id: 'q_0', question: 'Une anecdote ?' }] });
      mocks.generate.mockImplementation(() => { mocks.setStreaming(true); return new Promise(() => {}); });
      mount('/creer?canal=instagram');
      fireEvent.click(await screen.findByRole('button', { name: /Passer les questions/ }));
      const debut = '{"content":"Un premier morceau de texte assez long pour compter';
      act(() => { mocks.setStreamingContent(debut); });
      await waitFor(() => expect(loadFlowState()?.pendingStream?.text).toBe(debut));
      const fin = debut + ' et la fin du texte arrivée juste avant la relecture."}';
      act(() => { mocks.setStreamingContent(fin); });
      await act(async () => { vi.advanceTimersByTime(1600); });
      await waitFor(() => expect(loadFlowState()?.pendingStream?.text).toBe(fin));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isInterruptedGeneration / resolveSafeStep', () => {
  const now = 1_000_000_000;
  it.each([
    ['génération en cours récente, rien reçu → result', { step: 'result', selectedFormat: 'linkedin', generationInFlight: { format: 'linkedin', ts: now - 60_000 } }, true],
    ['marque trop ancienne (> 30 min) → format', { step: 'result', selectedFormat: 'linkedin', generationInFlight: { format: 'linkedin', ts: now - 31 * 60_000 } }, false],
    ['sans marque → format (échec ou ancienne version)', { step: 'result', selectedFormat: 'linkedin' }, false],
    ['résultat déjà là → pas d’interruption', { step: 'result', selectedFormat: 'linkedin', result: { raw: {} }, generationInFlight: { format: 'linkedin', ts: now } }, false],
    ['texte streamé > 40 caractères → récupéré, pas d’interruption', { step: 'result', selectedFormat: 'post', pendingStream: { text: 'x'.repeat(50), format: 'post', ts: now }, generationInFlight: { format: 'post', ts: now } }, false],
    ['autre étape → pas d’interruption', { step: 'questions', selectedFormat: 'linkedin', generationInFlight: { format: 'linkedin', ts: now } }, false],
  ])('%s', (_nom, ps: any, attendu) => {
    expect(isInterruptedGeneration(ps, now)).toBe(attendu);
  });
  it('resolveSafeStep rouvre l’étape résultat pour une génération interrompue', () => {
    const ps: any = { step: 'result', selectedFormat: 'newsletter', generationInFlight: { format: 'newsletter', ts: Date.now() } };
    expect(resolveSafeStep(ps, { canalConflict: false, hasIdea: true, photoCount: 0 })).toBe('result');
    expect(resolveSafeStep({ ...ps, generationInFlight: null }, { canalConflict: false, hasIdea: true, photoCount: 0 })).toBe('format');
  });
});
