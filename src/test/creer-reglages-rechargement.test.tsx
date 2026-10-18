import React, { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';
import { CREER_SETTINGS_KEYS, pickCreerSettings } from '@/hooks/use-creer-settings-persistence';

// Chantier J (18/10/2026) : sur la vraie page /creer, les réglages choisis
// (« Rédaction la plus soignée », photo du post, lien Pinterest, angle du
// reel…) survivent au rechargement (use-creer-settings-persistence.ts).
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), generateQuestions: vi.fn(),
  inserts: [] as any[], insertError: null as any, generating: false,
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<any>()), toast: mocks.toast }));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => ({ user: { id: 'owner' }, session: { user: { id: 'owner' } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'owner', useWorkspaceReady: () => true, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: 'owner' }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({ children }: any) => children, useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: false, pending: false }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock('@/hooks/use-activity-examples', () => ({ useActivityExamples: () => ({ activityText: '' }) }));
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => 20, plan: 'premium', verified: true, loading: false, usage: {}, refresh: () => {} }) }));
vi.mock('@/hooks/use-user-photos', () => ({ useUserPhotos: () => ({ data: [] }) }));
vi.mock('@/hooks/use-photo-wishlist', () => ({ usePhotoWishlistMutations: () => ({}) }));
vi.mock('@/hooks/use-carousel-autosave', () => ({ useCarouselAutosave: () => ({ flush: async () => true }) }));
vi.mock('@/hooks/use-carousel-quality', () => ({ useCarouselQuality: () => ({}) }));
vi.mock('@/hooks/use-linkedin-carousel-caption', () => ({ useLinkedInCarouselCaption: () => ({}) }));
vi.mock('@/hooks/use-user-slides-generate', () => ({ useUserSlidesGenerate: () => ({}) }));
vi.mock('@/hooks/use-select-inspiration-proposal', () => ({ useSelectInspirationProposal: () => ({}) }));
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({ doGenerate: mocks.generate }) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: () => ({ handleGenerateVisuals: async () => {} }) }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  return { result, setResult, questions, setQuestions, generating: mocks.generating, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate, generateQuestions: mocks.generateQuestions };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepIdea', () => ({ default: (p: any) => <div>
  <p>Étape idée</p>
  <button onClick={() => p.onNext('Un tout autre sujet')}>Nouveau sujet</button>
  <button onClick={() => p.onNext(p.initialIdea)}>Même sujet</button>
</div> }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div>
  <p>Étape format</p>
  <button onClick={() => { p.onSelectionChange({ channel: 'instagram', format: 'reel', carouselSubMode: null, slideLength: 'auto' }); p.onNext('reel'); }}>Passer au reel</button>
</div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => <div data-testid="result">Contenu {p.format}</div> }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CarouselAdvancedOptions', () => ({ default: (p: any) => <div>
  <p>Qualité max : {String(p.qualityMax)}</p><p>Illustration : {String(p.coverIllustration)}</p>
  <button onClick={() => p.onQualityMaxChange(false)}>Couper la qualité max</button>
</div> }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog-lazy', () => ({ posthog: { capture: () => {} } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'update', 'upsert', 'not', 'is']) q[key] = () => q;
  q.insert = (row: any) => { mocks.inserts.push({ table, row }); return q; };
  q.single = () => Promise.resolve(mocks.insertError ? { data: null, error: mocks.insertError } : { data: { id: 'copie-1', updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return q;
} } }));

const REGLAGES = {
  qualityMax: true, coverIllustration: true, photoMode: true, explicitTextFirstMix: true, photoDumpEnabled: false,
  pinterestData: { link: 'https://mon-site.fr/article', boardId: 'b1', boardName: 'Mes conseils' },
  existingCalendarContent: 'Texte prévu dans le calendrier', selectedReelHook: { id: 'h2', text: 'Mon angle choisi' },
  lastConfirmedStructure: [{ slide_number: 1, title: 'Couverture' }], lastScenarioOrigin: 'user_validated', lastNarrativeThread: 'Le fil',
};

function recharger(state: Record<string, unknown>) {
  saveFlowState({ step: 'questions', ideaText: 'Mes 3 erreurs de débutante', selectedFormat: 'carousel', carouselSubMode: 'text', questions: [{ id: 'q1', question: 'Pour qui ?' }], ...state } as any);
  render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /></Routes></MemoryRouter></StrictMode>);
}

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  setFlowUserId('owner'); setFlowWorkspaceId('owner');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('Réglages de /creer au rechargement', () => {
  it('chaque réglage gardé revient à l’ouverture et reste dans la copie de secours', async () => {
    recharger(REGLAGES);
    expect(await screen.findByText('Qualité max : true')).toBeInTheDocument();
    expect(screen.getByText('Illustration : true')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(pickCreerSettings(loadFlowState() as any)).toEqual(REGLAGES);
  });

  it('un réglage changé part dans la copie de secours', async () => {
    recharger(REGLAGES);
    fireEvent.click(await screen.findByText('Couper la qualité max'));
    expect(await screen.findByText('Qualité max : false')).toBeInTheDocument();
    await waitFor(() => expect(loadFlowState()).toMatchObject({ qualityMax: false, coverIllustration: true }));
  });

  it('sans copie de secours : réglages par défaut, rien d’inventé', async () => {
    recharger({});
    expect(await screen.findByText('Qualité max : false')).toBeInTheDocument();
    await waitFor(() => expect(loadFlowState()).toMatchObject({ qualityMax: false, pinterestData: null, selectedReelHook: null }));
  });

  it('la liste couvre les réglages du constat (une clé oubliée = perte silencieuse)', () => {
    for (const key of ['photoMode', 'pinterestData', 'qualityMax', 'selectedReelHook']) expect(CREER_SETTINGS_KEYS).toContain(key);
  });
});
