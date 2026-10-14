import React, { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Lot B du découpage de CreerUnifie : la fenêtre « photos manquantes »
// (PhotoMissingDialog) branchée sur la vraie page. useGenerateVisuals est
// remplacé par un faux qui l'ouvre comme le vrai hook (setPhotoMissingDialog
// reçu en paramètre), sauf quand on lui demande forceText.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), generateQuestions: vi.fn(), generateVisuals: vi.fn(),
  rawType: 'mix' as 'mix' | 'photo',
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<any>()), toast: mocks.toast }));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => ({ user: { id: 'owner' }, session: { user: { id: 'owner' } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'A', useWorkspaceReady: () => true, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: 'A' }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({ children }: any) => children, useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: false, pending: false }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock('@/hooks/use-activity-examples', () => ({ useActivityExamples: () => ({ activityText: '' }) }));
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => 20, plan: 'free', verified: true, loading: false, usage: {}, refresh: () => {} }) }));
vi.mock('@/hooks/use-user-photos', () => ({ useUserPhotos: () => ({ data: [] }) }));
vi.mock('@/hooks/use-photo-wishlist', () => ({ usePhotoWishlistMutations: () => ({}) }));
vi.mock('@/hooks/use-carousel-autosave', () => ({ useCarouselAutosave: () => ({}) }));
vi.mock('@/hooks/use-carousel-quality', () => ({ useCarouselQuality: () => ({}) }));
vi.mock('@/hooks/use-linkedin-carousel-caption', () => ({ useLinkedInCarouselCaption: () => ({}) }));
vi.mock('@/hooks/use-user-slides-generate', () => ({ useUserSlidesGenerate: () => ({}) }));
vi.mock('@/hooks/use-select-inspiration-proposal', () => ({ useSelectInspirationProposal: () => ({}) }));
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({ doGenerate: mocks.generate }) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: (params: any) => ({
  handleGenerateVisuals: async (opts?: { forceText?: boolean }) => {
    mocks.generateVisuals(opts);
    // Comme le vrai hook : carrousel photo/mixte sans photo → la fenêtre décide.
    if (!opts?.forceText) params.setPhotoMissingDialog({ open: true, rawType: mocks.rawType });
  },
}) }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate, generateQuestions: mocks.generateQuestions };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Étape format</p><p>Idée : {p.idea}</p><p>Sous-mode : {p.initialCarouselSubMode}</p><p>Format choisi : {p.initialFormat}</p></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => <div data-testid="result"><button onClick={() => p.onGenerateVisuals?.()}>Mettre en forme</button></div> }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: () => null }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog', () => ({ posthog: { capture: () => {} } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'not', 'is']) q[key] = () => q;
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return q;
} } }));

const TITRE = 'Ce carrousel gagnerait à avoir des photos';
const contexte = { ideaText: 'Mes 3 erreurs de débutante', selectedFormat: 'carousel', carouselSubMode: 'text' as const, editorialAngle: 'coulisses', answers: { q1: 'Réponse gardée' } };

async function ouvrirFenetre(rawType: 'mix' | 'photo' = 'mix') {
  mocks.rawType = rawType;
  saveFlowState({ step: 'result', ...contexte, result: { type: 'carousel', raw: { carousel_type: rawType, slides: [{ slide_number: 1, title: 'Couverture' }], caption: 'Légende' } } });
  render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /></Routes></MemoryRouter></StrictMode>);
  await screen.findByTestId('result');
  fireEvent.click(screen.getByText('Mettre en forme'));
  expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  expect(screen.getByText(TITRE)).toBeVisible();
  mocks.generateVisuals.mockClear();
}

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('Fenêtre « photos manquantes » sur /creer', () => {
  it.each<['mix' | 'photo', string]>([
    ['mix', 'mixte (texte + photos)'],
    ['photo', 'photo'],
  ])('carrousel %s sans photo → la fenêtre nomme le type « %s »', async (rawType, libelle) => {
    await ouvrirFenetre(rawType);
    expect(screen.getByRole('alertdialog').querySelector('strong')).toHaveTextContent(new RegExp(`^${libelle.replace(/[()+]/g, '\\$&')}$`));
  });

  it('« Continuer en texte » relance la mise en forme en texte et ferme la fenêtre', async () => {
    await ouvrirFenetre();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer en texte' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.generateVisuals).toHaveBeenCalledTimes(1);
    expect(mocks.generateVisuals).toHaveBeenCalledWith({ forceText: true });
    expect(screen.getByTestId('result')).toBeInTheDocument();
  });

  it('« Ajouter des photos » ramène à l’étape format en mixte, sans rien perdre', async () => {
    await ouvrirFenetre('photo');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter des photos' }));
    expect(await screen.findByText('Étape format')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(/^Idée :/)).toHaveTextContent('Mes 3 erreurs de débutante');
    expect(screen.getByText(/^Sous-mode :/)).toHaveTextContent('mix');
    expect(screen.getByText(/^Format choisi :/)).toHaveTextContent('carousel');
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'format', ...contexte, carouselSubMode: 'mix' }));
    expect(mocks.generateVisuals).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.formatNext).not.toHaveBeenCalled();
  });

  it('« Annuler » ferme seulement, sans rien lancer', async () => {
    await ouvrirFenetre();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByTestId('result')).toBeInTheDocument();
    expect(mocks.generateVisuals).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'result', ...contexte }));
  });
});
