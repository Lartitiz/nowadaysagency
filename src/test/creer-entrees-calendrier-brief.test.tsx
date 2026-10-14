import React, { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Lot A du découpage de CreerUnifie (docs/robustesse/gros-fichiers.md, fiche 1,
// tests 1 et 4) : on fige, en rendu réel, ce que /creer fait des entrées venues
// du calendrier et de « Créer à partir de ce brief ». La page reste réelle ; seuls
// les hooks de génération et les écrans secondaires sont remplacés (même
// frontière que creation-initial-draft.test.tsx).
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), generateQuestions: vi.fn(),
  db: [] as { table: string; method: string; args: any[] }[],
  resultProps: null as any,
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
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><p>Idée : {p.idea}</p></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps = p; return <pre data-testid="result">{JSON.stringify(p.result)}</pre>; } }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: () => null }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'not', 'is']) q[key] = (...args: any[]) => { mocks.db.push({ table, method: key, args }); return q; };
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: { id: 'nouveau-brief' }, error: null });
  return q;
} } }));

function Probe() { const l = useLocation(); return <output data-testid="location">{l.pathname + l.search}</output>; }
function mount(entry: any) {
  return render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes><Probe /></MemoryRouter></StrictMode>);
}
const urlParams = () => new URLSearchParams(screen.getByTestId('location').textContent!.split('?')[1] || '');
const ecritures = (table: string) => mocks.db.filter((c) => c.table === table && (c.method === 'insert' || c.method === 'update'));

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear(); mocks.db.length = 0; mocks.resultProps = null;
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

// ── Test 1 : contrat calendrier → /creer, en rendu réel ──
// Les formes de navigate state ci-dessous recopient celles de Calendar.tsx
// (handleQuickGenerate) et CalendarPostDialog.tsx (handleNavigateToDeepen,
// handleNavigateToGenerator, handleOpenAtelier). calendar-creer-contract.test.ts
// vérifie que les clés existent des deux côtés ; ici on vérifie ce qu'en fait la page.
describe('calendrier → /creer (rendu réel)', () => {
  it('Calendar › handleQuickGenerate (reel) : sujet enrichi du contenu existant, date et calendarPostId gardés, paramètres consommés', async () => {
    mount({
      pathname: '/creer',
      search: '?format=reel&calendar_id=cal-1&sujet=Mon+sujet&objectif=visibilite&from=%2Fcalendrier',
      state: { fromCalendar: true, postId: 'cal-1', calendarPostId: 'cal-1', theme: 'Mon sujet', objectif: 'visibilite', angle: '', format: 'reel', notes: '', postDate: '2026-11-03', existingContent: 'Brouillon du calendrier', canal: 'instagram' },
    });
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalledTimes(1));
    expect(mocks.formatNext).toHaveBeenCalledWith('reel', undefined, { overrideSubject: 'Mon sujet\n\n[Contenu existant à approfondir]\nBrouillon du calendrier' });
    await waitFor(() => expect(loadFlowState()).toMatchObject({ ideaText: 'Mon sujet', calendarPostId: 'cal-1', calendarPostDate: '2026-11-03' }));
    // Ordres de démarrage retirés de l'URL ; le lien vers le post et le retour restent.
    await waitFor(() => expect(urlParams().get('sujet')).toBeNull());
    expect(urlParams().get('format')).toBeNull();
    expect(urlParams().get('objectif')).toBeNull();
    expect(urlParams().get('calendar_id')).toBe('cal-1');
    expect(urlParams().get('from')).toBe('/calendrier');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('CalendarPostDialog › handleNavigateToDeepen (post_carrousel) : format canonique, angle du post, pas de détour par l’étape format', async () => {
    mount({
      pathname: '/creer',
      search: '?sujet=Carrousel+profond&objectif=vendre&format=post_carrousel&calendar_id=cal-2&from=%2Fcalendrier',
      state: { fromCalendar: true, calendarPostId: 'cal-2', theme: 'Carrousel profond', objectif: 'vendre', angle: 'coulisses', format: 'post_carrousel', notes: '', postDate: '2026-11-05', existingContent: 'Texte à approfondir', existingAccroche: null },
    });
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalledTimes(1));
    expect(mocks.formatNext).toHaveBeenCalledWith('carousel', 'coulisses', { overrideSubject: 'Carrousel profond\n\n[Contenu existant à approfondir]\nTexte à approfondir' });
    await waitFor(() => expect(loadFlowState()).toMatchObject({ selectedFormat: 'carousel', editorialAngle: 'coulisses', calendarPostId: 'cal-2', calendarPostDate: '2026-11-05' }));
    expect(screen.queryByText(/^Format :/)).toBeNull();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('CalendarPostDialog › handleNavigateToGenerator (LinkedIn, sans brouillon) : sujet seul, canal LinkedIn retenu', async () => {
    mount({
      pathname: '/creer',
      search: '?canal=linkedin&calendar_id=cal-4&sujet=Post+LinkedIn&objectif=visibilite&from=%2Fcalendrier',
      state: { fromCalendar: true, calendarPostId: 'cal-4', theme: 'Post LinkedIn', objectif: 'visibilite', angle: '', format: 'linkedin', notes: '', postDate: '2026-11-06', existingContent: '', existingAccroche: null },
    });
    await waitFor(() => expect(mocks.formatNext).toHaveBeenCalledTimes(1));
    expect(mocks.formatNext).toHaveBeenCalledWith('linkedin', undefined, { overrideSubject: 'Post LinkedIn' });
    await waitFor(() => expect(loadFlowState()).toMatchObject({ forcedChannel: 'linkedin', calendarPostId: 'cal-4', calendarPostDate: '2026-11-06' }));
    expect(urlParams().get('canal')).toBe('linkedin');
  });

  it('CalendarPostDialog › handleOpenAtelier avec resumeIdea : ouvre le contenu enregistré sans le régénérer et garde le retour au même post', async () => {
    const raw = { content: 'Texte enregistré dans le calendrier', caption: 'Légende' };
    mount({
      pathname: '/creer',
      search: '?canal=instagram',
      state: { resumeIdea: { format: 'post', raw }, fromCalendar: true, calendarPostId: 'cal-3', theme: 'Thème du post', objectif: 'vendre', angle: '', format: 'post_photo', notes: '', postDate: '2026-11-07', existingContent: 'Texte enregistré dans le calendrier', existingAccroche: null },
    });
    await screen.findByTestId('result');
    expect(mocks.resultProps.result).toEqual(raw);
    // fromCalendar = !!calendarPostId : le bouton renvoie dans le même post.
    expect(mocks.resultProps.publishOrScheduleLabel).toBe('Sauvegarder dans le calendrier');
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'result', selectedFormat: 'post', calendarPostId: 'cal-3', calendarPostDate: '2026-11-07', result: { raw } }));
    expect(mocks.formatNext).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.generateQuestions).not.toHaveBeenCalled();
    // L'atelier envoie le sujet du post dans `theme` (et pas `sujet`).
    expect(loadFlowState()?.ideaText).toBe('Thème du post');
  });

  it('CalendarPostDialog › handleOpenAtelier sans resumeIdea : ouvre l’étape format avec le sujet du post', async () => {
    mount({
      pathname: '/creer',
      search: '?canal=instagram',
      state: { resumeIdea: undefined, fromCalendar: true, calendarPostId: 'cal-5', theme: 'Mon thème', objectif: '', angle: '', format: 'post_carrousel', notes: '', postDate: '2026-11-08', existingContent: '', existingAccroche: null },
    });
    expect(await screen.findByText(/^Format :/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/^Idée :/)).toHaveTextContent('Idée : Mon thème'));
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'format', selectedFormat: 'carousel', calendarPostId: 'cal-5', calendarPostDate: '2026-11-08', ideaText: 'Mon thème' }));
    expect(mocks.formatNext).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

// ── Test 4 : « Créer à partir de ce brief » (IdeasPage › handleResumeBrief) ──
describe('« Créer à partir de ce brief »', () => {
  const brief = {
    pathname: '/creer',
    search: '?sujet=Mon+brief&format=post&angle=coulisses&objectif=vendre',
    state: { fromBrief: true, questions: [{ id: 'q1', question: 'Pour qui écris-tu ?' }, { id: 'q2', question: 'Quel exemple veux-tu donner ?' }], answers: { q1: 'Les fleuristes' }, briefId: 'brief-1', angle: 'coulisses' },
  };

  it('préremplit questions et réponses, nettoie l’URL, tient au refresh et met à jour le même brief', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const app = mount(brief);
    expect(await screen.findByLabelText('Pour qui écris-tu ?')).toHaveValue('Les fleuristes');
    await waitFor(() => expect(loadFlowState()).toMatchObject({
      step: 'questions', ideaText: 'Mon brief', selectedFormat: 'post', editorialAngle: 'coulisses',
      incomingBriefId: 'brief-1', answers: { q1: 'Les fleuristes' },
      questions: [{ id: 'q1', question: 'Pour qui écris-tu ?' }, { id: 'q2', question: 'Quel exemple veux-tu donner ?' }],
    }));
    // Les paramètres sujet/format rejoueraient l'init au refresh.
    expect(replaceState).toHaveBeenCalledWith({}, '', '/creer');
    expect(mocks.formatNext).not.toHaveBeenCalled();
    expect(mocks.generateQuestions).not.toHaveBeenCalled();

    // Refresh immédiat : mêmes questions, mêmes réponses, aucune nouvelle génération.
    app.unmount();
    mount('/creer');
    expect(await screen.findByLabelText('Pour qui écris-tu ?')).toHaveValue('Les fleuristes');
    expect(mocks.formatNext).not.toHaveBeenCalled();
    expect(mocks.generateQuestions).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();

    // Générer : le brief d'origine est mis à jour, jamais dupliqué.
    fireEvent.click(screen.getByTestId('creer-questions-next'));
    fireEvent.change(await screen.findByLabelText('Quel exemple veux-tu donner ?'), { target: { value: 'Un atelier de saison' } });
    fireEvent.click(screen.getByTestId('creer-questions-next'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledWith({ q1: 'Les fleuristes', q2: 'Un atelier de saison' });
    const briefs = ecritures('content_briefs');
    expect(briefs.map((c) => c.method)).toEqual(['update']);
    expect(briefs[0].args[0]).toMatchObject({ format: 'post', editorial_angle: 'coulisses', answers: { q1: 'Les fleuristes', q2: 'Un atelier de saison' } });
    expect(mocks.db).toContainEqual({ table: 'content_briefs', method: 'eq', args: ['id', 'brief-1'] });
  });

  it('sans brief d’origine, la génération crée un nouveau brief (contrôle)', async () => {
    mount({ ...brief, state: { ...brief.state, briefId: undefined } });
    await screen.findByLabelText('Pour qui écris-tu ?');
    fireEvent.click(screen.getByTestId('creer-generate-direct'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    const briefs = ecritures('content_briefs');
    expect(briefs.map((c) => c.method)).toEqual(['insert']);
    expect(briefs[0].args[0]).toMatchObject({ user_id: 'owner', workspace_id: 'A', subject: 'Mon brief' });
  });
});
