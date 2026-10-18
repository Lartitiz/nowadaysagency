import React, { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import HomeCreatePanel from '@/components/dashboard/HomeCreatePanel';
import { loadFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';
import { ideaStartPlan } from '@/features/creer/idea-pick';
import { ideaCreateLink } from '@/lib/idea-create-link';

// Chantier S (plan-simplicite-idees.md, 18/10/2026) : les idées du diagnostic
// sont montrées sans repli sur « De quoi veux-tu parler ? », et un clic prend le
// même chemin que « Créer ce contenu » de Mes idées : titre, angle, format,
// canal, fiche reliée, droit aux questions. Même frontière que
// creer-entrees-calendrier-brief.test.tsx : page réelle, générateurs remplacés.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), generateQuestions: vi.fn(),
  db: [] as { table: string; method: string; args: any[] }[],
  resultProps: null as any,
  ideas: [] as any[],
}));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => ({ user: { id: 'owner' }, session: { user: { id: 'owner' } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'A', useWorkspaceReady: () => true, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'workspace_id', value: 'A' }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({ children }: any) => children, useDemoContext: () => ({ isDemoMode: false }) }));
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
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({ doGenerate: mocks.generate }) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: () => ({}) }));
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
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><p>Idée : {p.idea}</p><p>Format choisi : {p.initialFormat}</p></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps = p; return <pre data-testid="result">{JSON.stringify(p.result)}</pre>; } }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: () => null }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog-lazy', () => ({ posthog: { capture: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  let cols = '';
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: table === 'saved_ideas' && cols.includes('source_module') ? mocks.ideas : [], error: null }).then(resolve, reject) };
  q.select = (c: string) => { cols = c; mocks.db.push({ table, method: 'select', args: [c] }); return q; };
  for (const key of [ 'eq', 'in', 'order', 'limit', 'insert', 'update', 'not', 'is']) q[key] = (...args: any[]) => { mocks.db.push({ table, method: key, args }); return q; };
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: { id: 'nouveau-brief' }, error: null });
  return q;
} } }));


const DIAG = [
  { id: 'idee-1', titre: 'Ta peau tiraille après la douche ?', angle: 'Le savon industriel décape, le savon à froid garde la glycérine', format: 'carousel', canal: 'instagram', objectif: 'confiance', source_module: 'diagnostic' },
  { id: 'idee-2', titre: 'Je formule tout moi-même', angle: '', format: 'carousel', canal: 'instagram', objectif: 'visibilite', source_module: 'diagnostic' },
  { id: 'idee-3', titre: 'Pourquoi je refuse le parfum de synthèse', angle: 'Mon combat', format: 'linkedin', canal: 'linkedin', objectif: 'vente', source_module: 'diagnostic' },
  { id: 'idee-4', titre: 'Ce que je mets vraiment dans mes savons', angle: 'Transparence', format: 'post', canal: 'instagram', objectif: 'confiance', source_module: 'diagnostic' },
];

function mount() {
  return render(<StrictMode><MemoryRouter initialEntries={['/creer?new=1']}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes></MemoryRouter></StrictMode>);
}

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear(); mocks.db.length = 0; mocks.ideas = DIAG;
  setFlowUserId('owner'); setFlowWorkspaceId('A');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('/creer : une idée du diagnostic, un clic, le chemin de Mes idées', () => {
  it('montre les idées sans repli et va droit aux questions avec l’angle, le format et la fiche', async () => {
    mount();
    const pick = await screen.findByRole('button', { name: DIAG[0].titre });
    expect(screen.queryByText('Retrouver mes idées du diagnostic')).toBeNull();
    expect(screen.getAllByTestId('creer-idea-pick')).toHaveLength(3);
    fireEvent.click(pick);
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalledTimes(1));
    expect(mocks.formatNext).toHaveBeenCalledWith('carousel', DIAG[0].angle, { overrideSubject: DIAG[0].titre });
    await waitFor(() => expect(loadFlowState()).toMatchObject({ ideaText: DIAG[0].titre, editingIdeaId: 'idee-1', selectedFormat: 'carousel', editorialAngle: DIAG[0].angle, objective: 'confiance', forcedChannel: 'instagram' }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('un carrousel sans angle passe par l’écran Format, format déjà choisi, fiche reliée', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: DIAG[1].titre }));
    expect(await screen.findByText('Format choisi : carousel')).toBeTruthy();
    expect(mocks.formatNext).not.toHaveBeenCalled();
    await waitFor(() => expect(loadFlowState()).toMatchObject({ editingIdeaId: 'idee-2', selectedFormat: 'carousel' }));
  });

  it('une idée LinkedIn garde son canal', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: DIAG[2].titre }));
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalledWith('linkedin', 'Mon combat', { overrideSubject: DIAG[2].titre }));
    await waitFor(() => expect(loadFlowState()).toMatchObject({ editingIdeaId: 'idee-3', forcedChannel: 'linkedin' }));
  });

  it('sur téléphone, les idées sont juste sous le champ, avant « Continuer »', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    mount();
    const picks = await screen.findByTestId('creer-idea-picks');
    expect(within(picks).getAllByTestId('creer-idea-pick')).toHaveLength(3);
    const field = screen.getByTestId('creer-idea-input');
    const next = screen.getByTestId('creer-idea-next');
    expect(field.compareDocumentPosition(picks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picks.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sans idée gardée, les exemples restent dans « Essayer avec un exemple »', async () => {
    mocks.ideas = [];
    mount();
    expect(await screen.findByText('Essayer avec un exemple')).toBeTruthy();
    expect(screen.queryByTestId('creer-idea-picks')).toBeNull();
  });
});

describe('même chemin partout', () => {
  it('le plan de départ suit les règles de l’arrivée par Mes idées', () => {
    expect(ideaStartPlan({ id: 'a', titre: '📱 Mon sujet', angle: ' ', format: 'post', canal: 'instagram' })).toMatchObject({ subject: 'Mon sujet', next: 'format', angle: null });
    expect(ideaStartPlan({ id: 'a', titre: 'Mon sujet', angle: 'Un angle', format: 'reel', canal: 'instagram' })).toMatchObject({ next: 'questions', format: 'reel' });
    expect(ideaStartPlan({ id: 'a', titre: 'Mon sujet', format: 'inconnu' })).toMatchObject({ next: 'format', format: null });
    expect(ideaStartPlan({ id: 'a', titre: 'Mon sujet', angle: 'x', format: 'carousel', canal: 'linkedin' })).toMatchObject({ linkedinCarousel: true, canal: 'linkedin' });
  });

  it('« Créer ce contenu » transmet titre, angle, format, canal et fiche', () => {
    const link = ideaCreateLink({ id: 'idee-1', titre: '✨ Ta peau tiraille', angle: 'Un angle', format: 'carousel', canal: 'instagram', objectif: 'confiance' });
    expect(link.to).toBe('/creer?sujet=Ta+peau+tiraille&angle=Un+angle&format=carousel&canal=instagram&objectif=confiance&idea_id=idee-1');
    expect(link.state).toEqual({ resumeIdea: null, ideaId: 'idee-1' });
  });
});

describe('accueil : « Ta prochaine idée »', () => {
  const create = vi.fn();
  it('montre la prochaine idée et la crée d’un clic', () => {
    const onCreateIdea = vi.fn();
    render(<MemoryRouter><HomeCreatePanel onCreate={create} incompleteBrand={false} nextIdea={DIAG[0]} onCreateIdea={onCreateIdea} /></MemoryRouter>);
    expect(screen.getByTestId('home-next-idea')).toHaveTextContent('Ta prochaine idée : Ta peau tiraille après la douche ?');
    fireEvent.click(screen.getByRole('button', { name: /Créer ce contenu/ }));
    expect(onCreateIdea).toHaveBeenCalledWith(DIAG[0]);
  });
  it('rien quand il ne reste aucune idée', () => {
    render(<MemoryRouter><HomeCreatePanel onCreate={create} incompleteBrand={false} nextIdea={null} onCreateIdea={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByTestId('home-next-idea')).toBeNull();
  });
});
