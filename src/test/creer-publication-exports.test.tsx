import React, { StrictMode, useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Lot A du découpage de CreerUnifie (docs/robustesse/gros-fichiers.md, fiche 1,
// tests 7 et 8) : publication LinkedIn, programmation depuis la fenêtre
// « Publier ou programmer », réouverture après connexion, et exports. La page
// est réelle ; la sauvegarde calendrier (testée dans use-calendar-save.test.tsx),
// la publication LinkedIn et les exports de fichiers sont les frontières.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  confirmCalendar: vi.fn(), recordPublication: vi.fn(), publishLinkedIn: vi.fn(), refreshConnections: vi.fn(),
  connections: { known: true, connected: [] as string[], expiry: null as string | null },
  demo: false,
  exportPptx: vi.fn(), exportPng: vi.fn(), exportPdf: vi.fn(), exportHybrid: vi.fn(), resolve: vi.fn(),
  resultProps: null as any, publishProps: null as any,
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
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({ doGenerate: mocks.generate }) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: () => ({}) }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({
  isConnected: (canal: string) => mocks.connections.connected.includes(canal), getTokenExpiry: () => mocks.connections.expiry,
  known: mocks.connections.known, loading: false, refresh: mocks.refreshConnections,
}) }));
vi.mock('@/hooks/use-calendar-save', () => ({ useCalendarSave: () => ({
  savingToCalendar: false, handleConfirmCalendar: mocks.confirmCalendar, handleSaveBackToCalendar: vi.fn(),
  recordImmediatePublication: mocks.recordPublication, uploadVisualsToStorage: vi.fn(), resetPublishedTracking: vi.fn(),
}) }));
vi.mock('@/lib/linkedin-publish', async (importOriginal) => ({ ...(await importOriginal<any>()), publishTextToLinkedIn: (...args: any[]) => mocks.publishLinkedIn(...args) }));
vi.mock('@/lib/export-carousel-pptx', () => ({ exportCarouselPptx: (...args: any[]) => mocks.exportPptx(...args) }));
vi.mock('@/lib/export-carousel-png', () => ({ exportCarouselPng: (...args: any[]) => mocks.exportPng(...args), exportCarouselPdf: (...args: any[]) => mocks.exportPdf(...args) }));
vi.mock('@/lib/export-carousel-hybrid-pptx', () => ({ exportCarouselHybridPptx: (...args: any[]) => mocks.exportHybrid(...args) }));
vi.mock('@/lib/resolve-photo-index', () => ({ resolvePhotoIndexes: (...args: any[]) => mocks.resolve(...args) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: () => <p>Format :</p> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps = p; return <pre data-testid="result">{JSON.stringify(p.result)}</pre>; } }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: (p: any) => { mocks.publishProps = p; return null; } }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'not', 'is']) q[key] = () => q;
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return q;
} } }));

function Probe() { const l = useLocation(); return <output data-testid="location">{l.pathname + l.search}</output>; }
function mount(entry: any = '/creer') {
  return render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes><Probe /></MemoryRouter></StrictMode>);
}
const DEMO_TOAST = "Cette action est disponible dans l'outil complet. Crée ton compte gratuit !";
const VISUELS_PERIMES = 'Les visuels ne reflètent pas tes dernières éditions. Mets-les à jour pour un export fidèle.';

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.connections = { known: true, connected: [], expiry: null }; mocks.demo = false;
  mocks.resultProps = null; mocks.publishProps = null;
  mocks.confirmCalendar.mockResolvedValue(true); mocks.recordPublication.mockResolvedValue(undefined);
  mocks.exportPptx.mockResolvedValue(undefined); mocks.exportPdf.mockResolvedValue(undefined); mocks.exportHybrid.mockResolvedValue(undefined);
  mocks.exportPng.mockResolvedValue({ exported: 2, total: 2, failed: [] });
  mocks.resolve.mockImplementation((slides: any[]) => slides.map((s) => ({ ...s, photo_index_resolu: true })));
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

const ouvrirLinkedIn = async (content = 'Mon post LinkedIn') => {
  saveFlowState({ step: 'result', ideaText: 'Sujet LinkedIn', selectedFormat: 'linkedin', result: { type: 'linkedin', raw: { content } }, creationId: 'linkedin-creation' });
  mount();
  await screen.findByTestId('result');
  await waitFor(() => expect(mocks.publishProps.channel).toBe('linkedin'));
};

// ── Test 7 : publication LinkedIn et programmation ──
describe('publication LinkedIn', () => {
  it('compte non connecté → erreur avec un bouton « Connecter », rien d’enregistré', async () => {
    mocks.publishLinkedIn.mockRejectedValue(new Error('Aucun compte LinkedIn connecté à cet espace.'));
    await ouvrirLinkedIn();
    expect(mocks.publishProps.disabledReason).toBeNull();
    await act(async () => { await mocks.publishProps.onPublishNow(); });
    expect(mocks.publishLinkedIn).toHaveBeenCalledWith({ text: 'Mon post LinkedIn', workspaceId: 'A', userId: 'owner' });
    expect(mocks.toast.error).toHaveBeenCalledWith('Aucun compte LinkedIn connecté à cet espace.', { action: expect.objectContaining({ label: 'Connecter' }) });
    expect(mocks.recordPublication).not.toHaveBeenCalled();
  });

  it('autre erreur → message seul, sans bouton', async () => {
    mocks.publishLinkedIn.mockRejectedValue(new Error('LinkedIn ne répond pas.'));
    await ouvrirLinkedIn();
    await act(async () => { await mocks.publishProps.onPublishNow(); });
    expect(mocks.toast.error).toHaveBeenCalledWith('LinkedIn ne répond pas.');
  });

  it('succès → publication enregistrée puis lien « Voir sur LinkedIn »', async () => {
    mocks.publishLinkedIn.mockResolvedValue({ postId: 'urn:li:share:1', permalink: 'https://www.linkedin.com/feed/update/urn:li:share:1' });
    await ouvrirLinkedIn();
    await act(async () => { await mocks.publishProps.onPublishNow(); });
    expect(mocks.recordPublication).toHaveBeenCalledWith({ canal: 'linkedin', caption: 'Mon post LinkedIn', postId: 'urn:li:share:1' });
    expect(mocks.toast.success).toHaveBeenCalledWith('Publié sur LinkedIn ! Ouvre ton profil pour le voir.', { action: expect.objectContaining({ label: 'Voir sur LinkedIn' }) });
  });

  it('post vide → bloqué avec la raison, aucun appel LinkedIn', async () => {
    await ouvrirLinkedIn('');
    expect(mocks.publishProps.disabledReason).toBe('Génère ton post LinkedIn pour pouvoir le publier.');
    await act(async () => { await mocks.publishProps.onPublishNow(); });
    expect(mocks.toast.error).toHaveBeenCalledWith('Génère ton post LinkedIn pour pouvoir le publier.');
    expect(mocks.publishLinkedIn).not.toHaveBeenCalled();
  });
});

describe('programmation depuis la fenêtre « Publier ou programmer »', () => {
  const DATE = '2099-01-15T10:00';

  it('connexions pas encore connues → relance la vérification, ne programme rien', async () => {
    mocks.connections.known = false;
    await ouvrirLinkedIn();
    expect(mocks.publishProps.channelConnected).toBeNull();
    await act(async () => { await mocks.publishProps.onSchedule(DATE); });
    expect(mocks.refreshConnections).toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith('Connexion en cours de vérification. Réessaie de programmer dans un instant.');
    expect(mocks.confirmCalendar).not.toHaveBeenCalled();
  });

  it('compte non connecté → erreur avec « Connecter », ne programme rien', async () => {
    await ouvrirLinkedIn();
    expect(mocks.publishProps.channelConnected).toBe(false);
    await act(async () => { await mocks.publishProps.onSchedule(DATE); });
    expect(mocks.toast.error).toHaveBeenCalledWith('Compte LinkedIn non connecté', {
      description: "Connecte-le pour que ce contenu parte tout seul à l'heure prévue.",
      action: expect.objectContaining({ label: 'Connecter' }),
    });
    expect(mocks.confirmCalendar).not.toHaveBeenCalled();
  });

  it('date passée → refus, ne programme rien', async () => {
    mocks.connections.connected = ['linkedin'];
    await ouvrirLinkedIn();
    await act(async () => { await mocks.publishProps.onSchedule('2020-01-01T10:00'); });
    expect(mocks.toast.error).toHaveBeenCalledWith('Choisis une date/heure dans le futur.');
    expect(mocks.confirmCalendar).not.toHaveBeenCalled();
  });

  it('jeton qui expire avant la date → programmé, avec avertissement « Reconnecter »', async () => {
    mocks.connections = { known: true, connected: ['linkedin'], expiry: '2099-01-01T00:00:00.000Z' };
    await ouvrirLinkedIn();
    await act(async () => { await mocks.publishProps.onSchedule(DATE); });
    expect(mocks.confirmCalendar).toHaveBeenCalledWith({ date: '2099-01-15', scheduleAt: new Date(DATE) });
    expect(mocks.toast.warning).toHaveBeenCalledWith("Programmé : mais reconnecte ton compte d'ici là ⚠️", expect.objectContaining({
      duration: 12000,
      description: expect.stringContaining('Ta connexion LinkedIn expire le'),
      action: expect.objectContaining({ label: 'Reconnecter' }),
    }));
  });

  it('jeton valable après la date → programmé sans avertissement', async () => {
    mocks.connections = { known: true, connected: ['linkedin'], expiry: '2100-01-01T00:00:00.000Z' };
    await ouvrirLinkedIn();
    await act(async () => { await mocks.publishProps.onSchedule(DATE); });
    expect(mocks.confirmCalendar).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it('programmation refusée par la sauvegarde → pas d’avertissement de jeton', async () => {
    mocks.connections = { known: true, connected: ['linkedin'], expiry: '2099-01-01T00:00:00.000Z' };
    mocks.confirmCalendar.mockResolvedValue(false);
    await ouvrirLinkedIn();
    await act(async () => { await mocks.publishProps.onSchedule(DATE); });
    expect(mocks.confirmCalendar).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });
});

describe('réouverture automatique après connexion (?reopenPublish=1)', () => {
  it('rouvre la fenêtre une fois le résultat restauré, puis retire le paramètre', async () => {
    saveFlowState({ step: 'result', ideaText: 'Sujet LinkedIn', selectedFormat: 'linkedin', result: { type: 'linkedin', raw: { content: 'Mon post' } } });
    mount('/creer?reopenPublish=1');
    await screen.findByTestId('result');
    await waitFor(() => expect(mocks.publishProps.open).toBe(true));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/creer$/));
  });

  it('sans résultat, ne rouvre rien et garde le paramètre pour plus tard', async () => {
    saveFlowState({ step: 'idea', ideaText: 'Brouillon' });
    mount('/creer?reopenPublish=1');
    await screen.findByLabelText('Ton idée');
    expect(mocks.publishProps.open).toBe(false);
    expect(screen.getByTestId('location')).toHaveTextContent('/creer?reopenPublish=1');
  });
});

// ── Test 8 : exports ──
const SLIDES = [{ slide_number: 1, title: 'Couverture', photo_index: 2 }, { slide_number: 2, title: 'Fin' }];
const VISUELS = [{ slide_number: 1, html: '<div>Slide 1</div>' }, { slide_number: 2, html: '<div>Slide 2</div>' }];
const ouvrirCarrousel = async (carouselSubMode: any = 'text', extra: any = {}) => {
  saveFlowState({ step: 'result', ideaText: 'Sujet carrousel', selectedFormat: 'carousel', carouselSubMode, visualSlides: VISUELS,
    result: { type: 'carousel', raw: { carousel_type: carouselSubMode === 'user_slides' ? 'text' : carouselSubMode, slides: SLIDES, caption: { body: 'Légende' } } }, ...extra });
  mount();
  await screen.findByTestId('result');
};

describe('exports du carrousel', () => {
  it('mode démo → chaque export est remplacé par le message d’invitation', async () => {
    mocks.demo = true;
    await ouvrirCarrousel();
    for (const handler of ['onExportPptx', 'onExportVisualPng', 'onExportHybridPptx', 'onSave', 'onPublishOrSchedule']) {
      mocks.toast.mockClear();
      await act(async () => { await mocks.resultProps[handler](); });
      expect(mocks.toast).toHaveBeenCalledWith(DEMO_TOAST);
    }
    expect(mocks.resultProps.onOpenInCanva).toBeUndefined();
    expect(mocks.exportPptx).not.toHaveBeenCalled();
    expect(mocks.exportPng).not.toHaveBeenCalled();
    expect(mocks.exportHybrid).not.toHaveBeenCalled();
  });

  it('visuels périmés → avertissement sans export (PNG, PowerPoint éditable, Canva)', async () => {
    await ouvrirCarrousel();
    act(() => mocks.resultProps.onCarouselStaleChange(true));
    await act(async () => { await mocks.resultProps.onExportVisualPng(); });
    await act(async () => { await mocks.resultProps.onExportHybridPptx(); });
    await act(async () => { await mocks.resultProps.onOpenInCanva(); });
    expect(mocks.toast.warning).toHaveBeenCalledWith(VISUELS_PERIMES);
    expect(mocks.toast.warning).toHaveBeenCalledWith('Mets à jour les visuels avant de les ouvrir dans Canva.');
    expect(mocks.exportPng).not.toHaveBeenCalled();
    expect(mocks.exportHybrid).not.toHaveBeenCalled();
  });

  it('comportement actuel : visuels périmés → le PPTX texte part quand même, avec les anciens visuels', async () => {
    await ouvrirCarrousel();
    act(() => mocks.resultProps.onCarouselStaleChange(true));
    await act(async () => { await mocks.resultProps.onExportPptx(); });
    expect(mocks.exportPptx).toHaveBeenCalledTimes(1);
    expect(mocks.exportPptx.mock.calls[0][2]).toEqual(VISUELS);
  });

  it('carrousel LinkedIn : visuels périmés → pas de PDF', async () => {
    await ouvrirCarrousel('text', { isLinkedInCarousel: true });
    act(() => mocks.resultProps.onCarouselStaleChange(true));
    await act(async () => { await mocks.resultProps.onExportVisualPdf(); });
    expect(mocks.toast.warning).toHaveBeenCalledWith(VISUELS_PERIMES);
    expect(mocks.exportPdf).not.toHaveBeenCalled();
  });

  it('carrousel texte → le filet resolvePhotoIndexes s’applique avant le PPTX', async () => {
    await ouvrirCarrousel('text');
    await act(async () => { await mocks.resultProps.onExportPptx(); });
    expect(mocks.resolve).toHaveBeenCalledWith(SLIDES, 0);
    expect(mocks.exportPptx).toHaveBeenCalledWith(SLIDES.map((s) => ({ ...s, photo_index_resolu: true })), 'Sujet carrousel', VISUELS, null, undefined);
    expect(mocks.toast.success).toHaveBeenCalledWith('PPTX éditable téléchargé !');
  });

  it('Mes slides → pas de resolvePhotoIndexes : l’association photo ↔ slide est celle de l’utilisatrice', async () => {
    await ouvrirCarrousel('user_slides');
    await act(async () => { await mocks.resultProps.onExportPptx(); });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.exportPptx).toHaveBeenCalledWith(SLIDES, 'Sujet carrousel', VISUELS, null, undefined);
  });

  it('PNG partiel → message « x/y slides exportées » avec les slides ratées', async () => {
    mocks.exportPng.mockResolvedValue({ exported: 1, total: 2, failed: [2] });
    await ouvrirCarrousel();
    await act(async () => { await mocks.resultProps.onExportVisualPng(); });
    expect(mocks.exportPng).toHaveBeenCalledWith(VISUELS, 'Sujet carrousel', null);
    expect(mocks.toast.info).toHaveBeenCalledWith('Export PNG en cours…');
    expect(mocks.toast.warning).toHaveBeenCalledWith("1/2 slides exportées. La slide 2 n'a pas pu être rendue — régénère les visuels puis réessaie.");
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it('PNG complet → ZIP téléchargé', async () => {
    await ouvrirCarrousel();
    await act(async () => { await mocks.resultProps.onExportVisualPng(); });
    expect(mocks.toast.success).toHaveBeenCalledWith('ZIP des images téléchargé !');
  });

  it('échec d’export → message d’erreur', async () => {
    mocks.exportPng.mockRejectedValue(new Error('Rendu impossible'));
    await ouvrirCarrousel();
    await act(async () => { await mocks.resultProps.onExportVisualPng(); });
    expect(mocks.toast.error).toHaveBeenCalledWith('Rendu impossible');
  });
});
