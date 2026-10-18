import React, { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Chantier J (18/10/2026) : sur la vraie page /creer, un contenu déjà écrit
// n'est plus effacé sans le choix de l'utilisatrice (changement de format,
// de sujet, « Créer le carrousel » d'un post LinkedIn), et fermer l'onglet
// pendant une génération demande confirmation.
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
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => 20, plan: 'free', verified: true, loading: false, usage: {}, refresh: () => {} }) }));
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

const POST = { type: 'post', raw: { hook: 'Mon accroche à garder', body: 'Le corps du post', cta: 'Dis-moi en commentaire' } };

function ouvrir(state: Record<string, unknown>) {
  saveFlowState({ step: 'result', ideaText: 'Mes 3 erreurs de débutante', objective: 'visibilite', selectedFormat: 'post', result: POST, ...state });
  render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /></Routes></MemoryRouter></StrictMode>);
}
const etape = (n: number) => screen.getByRole('button', { name: new RegExp(`Étape ${n} sur 4`) });
const fenetre = () => screen.findByTestId('keep-content-dialog');

async function changerFormat() {
  ouvrir({});
  await screen.findByTestId('result');
  fireEvent.click(etape(2));
  fireEvent.click(await screen.findByText('Passer au reel'));
}
async function changerSujet(state: Record<string, unknown> = {}) {
  ouvrir(state);
  await screen.findByTestId('result');
  fireEvent.click(etape(1));
  fireEvent.click(await screen.findByText('Nouveau sujet'));
}

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.inserts = []; mocks.insertError = null; mocks.generating = false;
  setFlowUserId('owner'); setFlowWorkspaceId('owner');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('Changer de format après un contenu', () => {
  it('demande avant d’effacer ; « Le remplacer » continue', async () => {
    await changerFormat();
    expect(await fenetre()).toHaveTextContent('Tu as déjà un contenu');
    expect(mocks.formatNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('keep-content-replace'));
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalledWith('reel', undefined, expect.anything()));
    expect(mocks.inserts).toHaveLength(0);
  });

  it('« Le garder dans mes idées » range une copie avant de continuer', async () => {
    await changerFormat();
    fireEvent.click(within(await fenetre()).getByTestId('keep-content-keep'));
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalled());
    expect(mocks.inserts).toHaveLength(1);
    const { table, row } = mocks.inserts[0];
    expect(table).toBe('saved_ideas');
    expect(row).toMatchObject({ user_id: 'owner', workspace_id: null, format: 'post', canal: 'instagram', status: 'to_explore', source_module: 'creer' });
    expect(row.titre).toContain('Mes 3 erreurs de débutante');
    expect(row.content_data.hook).toBe('Mon accroche à garder');
  });

  it('copie impossible : rien n’est effacé', async () => {
    mocks.insertError = { message: 'réseau' };
    await changerFormat();
    fireEvent.click(within(await fenetre()).getByTestId('keep-content-keep'));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Rien n'a été effacé/)));
    expect(mocks.formatNext).not.toHaveBeenCalled();
    expect(screen.getByTestId('keep-content-dialog')).toBeInTheDocument();
  });

  it('« Annuler » ramène au contenu, dans son format d’origine', async () => {
    await changerFormat();
    fireEvent.click(within(await fenetre()).getByRole('button', { name: 'Annuler' }));
    expect(await screen.findByTestId('result')).toHaveTextContent('Contenu post');
    expect(mocks.formatNext).not.toHaveBeenCalled();
  });
});

describe('Changer de sujet après un contenu', () => {
  it('demande avant d’effacer ; « Le remplacer » repart du nouveau sujet', async () => {
    await changerSujet();
    await fenetre();
    expect(screen.getByText('Étape idée')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('keep-content-replace'));
    expect(await screen.findByText('Étape format')).toBeInTheDocument();
    expect(mocks.inserts).toHaveLength(0);
  });

  it('« Le garder dans mes idées » range une copie, puis repart du nouveau sujet', async () => {
    await changerSujet();
    fireEvent.click(within(await fenetre()).getByTestId('keep-content-keep'));
    expect(await screen.findByText('Étape format')).toBeInTheDocument();
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0].row.content_data.body).toBe('Le corps du post');
  });

  it('même sujet : rien à demander', async () => {
    ouvrir({});
    await screen.findByTestId('result');
    fireEvent.click(etape(1));
    fireEvent.click(await screen.findByText('Même sujet'));
    expect(await screen.findByText('Étape format')).toBeInTheDocument();
    expect(screen.queryByTestId('keep-content-dialog')).toBeNull();
  });

  it('carrousel déjà rangé dans sa fiche : rien à demander, la fiche reste intacte', async () => {
    await changerSujet({ selectedFormat: 'carousel', editingIdeaId: 'fiche-1', result: { type: 'carousel', raw: { slides: [{ slide_number: 1, title: 'A' }], _carousel_cloud: { status: 'saved' } } } });
    expect(await screen.findByText('Étape format')).toBeInTheDocument();
    expect(screen.queryByTestId('keep-content-dialog')).toBeNull();
    expect(mocks.inserts).toHaveLength(0);
  });
});

describe('« Créer le carrousel » sous un post LinkedIn', () => {
  const LINKEDIN = { selectedFormat: 'linkedin', result: { type: 'linkedin', raw: { content: 'Mon post LinkedIn entier' } } };

  it('dit son coût et demande avant de remplacer le post', async () => {
    ouvrir(LINKEDIN);
    expect(await screen.findByTestId('linkedin-carousel-invite')).toHaveTextContent('Compte pour 1 carrousel du mois.');
    fireEvent.click(screen.getByRole('button', { name: /Créer le carrousel/ }));
    expect(await fenetre()).toHaveTextContent('1 carrousel du mois');
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('keep-content-replace'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ format: 'carousel', subject: 'Mon post LinkedIn entier', channel: 'linkedin' })));
  });

  it('« Le garder dans mes idées » range le post LinkedIn avant de créer le carrousel', async () => {
    ouvrir(LINKEDIN);
    fireEvent.click(await screen.findByRole('button', { name: /Créer le carrousel/ }));
    fireEvent.click(within(await fenetre()).getByTestId('keep-content-keep'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    expect(mocks.inserts[0].row).toMatchObject({ canal: 'linkedin', format: 'linkedin' });
  });
});

describe('Fermer l’onglet', () => {
  const fermer = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

  it('pendant une génération : le navigateur demande confirmation', async () => {
    mocks.generating = true;
    ouvrir({});
    await screen.findByTestId('creer-stepper');
    await waitFor(() => expect(fermer()).toBe(true));
  });

  it('sans génération en cours : on ferme sans question', async () => {
    ouvrir({});
    await screen.findByTestId('result');
    expect(fermer()).toBe(false);
  });
});

