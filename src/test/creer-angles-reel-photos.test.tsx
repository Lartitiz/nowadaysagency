import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, loadPhotos, saveFlowState, savePhotos, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Lot A du découpage de CreerUnifie (docs/robustesse/gros-fichiers.md, fiche 1,
// tests 9 et 10) : angles d'attaque du reel (appel gratuit creative-flow,
// messages d'erreur) et photos (casting automatique, 1er contenu produits,
// photos qui n'ont pas pu être rechargées). La page est réelle ; l'appel réseau,
// le décodage des photos et l'écran des angles sont les frontières.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), invoke: vi.fn(), photoRead: vi.fn(), photoDecode: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  demo: false,
  setResult: null as any, doGenerateParams: null as any, hookProps: null as any, resultProps: null as any,
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
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
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

function mount(entry: any = '/creer') {
  return render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes></MemoryRouter></StrictMode>);
}
const ANGLES = [{ text: 'Angle A' }, { text: 'Angle B' }, { text: 'Angle C' }, { text: 'Angle D' }];

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.demo = false; mocks.hookProps = null; mocks.resultProps = null; mocks.doGenerateParams = null;
  mocks.invoke.mockResolvedValue({ data: { hooks: ANGLES }, error: null });
  mocks.photoRead.mockResolvedValue({ data: [], error: null });
  mocks.photoDecode.mockImplementation(async (photo: any) => ({ base64: `data:image/png;base64,${photo.id}`, name: photo.name, mimeType: 'image/png' }));
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

// ── Test 9 : angles d'attaque du reel ──
describe('angles d’attaque du reel', () => {
  const ouvrirQuestions = async (extra: any = {}) => {
    saveFlowState({ step: 'questions', ideaText: 'Mon reel', objective: 'visibilite', selectedFormat: 'reel', questions: [{ id: 'q1', question: 'Pour qui ?' }], ...extra });
    mount();
  };

  it('questions → choix de l’angle (appel gratuit), 3 angles gardés, génération seulement après le choix', async () => {
    await ouvrirQuestions();
    fireEvent.change(await screen.findByLabelText('Pour qui ?'), { target: { value: 'Les artisanes' } });
    fireEvent.click(screen.getByTestId('creer-questions-next'));
    await waitFor(() => expect(mocks.hookProps?.hooks).toHaveLength(3));
    expect(screen.getByTestId('angles')).toHaveTextContent('Angle AAngle BAngle C');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith('creative-flow', { body: {
      step: 'hooks', contentType: 'reel', context: 'Mon reel', objective: 'visibilite', face_cam: 'oui',
      answers: [{ question: 'Pour qui ?', answer: 'Les artisanes' }], workspace_id: 'A',
    } }, 60000);
    await waitFor(() => expect(loadFlowState()?.step).toBe('hook_selection'));
    expect(mocks.generate).not.toHaveBeenCalled();

    await act(async () => { await mocks.hookProps.onSelect(ANGLES[1]); });
    expect(mocks.generate).toHaveBeenCalledWith({ q1: 'Les artisanes' }, ANGLES[1]);
  });

  it('« Continuer sans choisir » → génération sans angle imposé', async () => {
    await ouvrirQuestions();
    fireEvent.click(await screen.findByText('Passer les questions, générer directement'));
    await waitFor(() => expect(mocks.hookProps?.hooks).toHaveLength(3));
    expect(mocks.invoke.mock.calls[0][1].body.answers).toBeNull();
    await act(async () => { await mocks.hookProps.onSkip(); });
    expect(mocks.generate).toHaveBeenCalledWith({});
  });

  it('1er contenu (autoFlow) → pas d’étape des angles, génération directe', async () => {
    await ouvrirQuestions({ autoFlow: true, questions: [] });
    fireEvent.click(await screen.findByText('Générer mon premier contenu'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({}));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.hookProps).toBeNull();
  });

  it('mode démo → pas d’étape des angles, génération directe', async () => {
    mocks.demo = true;
    await ouvrirQuestions();
    fireEvent.click(await screen.findByText('Passer les questions, générer directement'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith({}));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it.each<[string, () => void, string]>([
    ['erreur du serveur', () => mocks.invoke.mockRejectedValue(new Error('Le service est saturé')), 'Le service est saturé'],
    ['erreur renvoyée par invoke', () => mocks.invoke.mockResolvedValue({ data: null, error: new Error('Session expirée') }), 'Session expirée'],
    ['réponse vide (« empty » jamais affiché)', () => mocks.invoke.mockResolvedValue({ data: { hooks: [] }, error: null }), "Je n'ai pas réussi à préparer les angles d'attaque."],
  ])('1er appel en échec (%s) → message dédié', async (_nom, preparer, message) => {
    preparer();
    await ouvrirQuestions();
    fireEvent.click(await screen.findByText('Passer les questions, générer directement'));
    await waitFor(() => expect(mocks.hookProps?.error).toBe(message));
    expect(mocks.hookProps.hooks).toEqual([]);
    expect(mocks.hookProps.loading).toBe(false);
  });

  it.each<[string, () => void, string]>([
    ['erreur du serveur', () => mocks.invoke.mockRejectedValueOnce(new Error('Quota atteint')), 'Pas de nouveaux angles : quota atteint'],
    ['réponse vide', () => mocks.invoke.mockResolvedValueOnce({ data: { hooks: [] }, error: null }), "Je n'ai pas réussi à trouver 3 autres angles. Ceux-ci restent valables."],
  ])('rafraîchissement en échec (%s) → message différent, anciens angles gardés', async (_nom, preparer, message) => {
    await ouvrirQuestions();
    fireEvent.click(await screen.findByText('Passer les questions, générer directement'));
    await waitFor(() => expect(mocks.hookProps?.hooks).toHaveLength(3));
    preparer();
    await act(async () => { await mocks.hookProps.onRefresh(); });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    // Les angles affichés sont exclus de la nouvelle proposition (au plus 3 : la
    // limite de 12 de exclude_hooks n'est pas atteignable depuis cet écran).
    expect(mocks.invoke.mock.calls[1][1].body.exclude_hooks).toEqual(['Angle A', 'Angle B', 'Angle C']);
    expect(mocks.hookProps.error).toBe(message);
    expect(mocks.hookProps.hooks.map((h: any) => h.text)).toEqual(['Angle A', 'Angle B', 'Angle C']);
    expect(mocks.hookProps.refreshing).toBe(false);
  });
});

// ── Test 10 : photos ──
describe('photos', () => {
  it('casting automatique : library_photo_index → photo_index + cast_source « library_auto »', async () => {
    saveFlowState({ step: 'result', ideaText: 'Actu', selectedFormat: 'carousel', carouselSubMode: 'mix',
      result: { type: 'carousel', raw: { carousel_type: 'mix', slides: [{ slide_number: 1, title: 'Couverture' }], caption: { body: 'Légende' } } } });
    mount();
    await screen.findByTestId('result');
    // Lignes de la bibliothèque photographiées au moment de la génération (useDoGenerate).
    mocks.doGenerateParams.carousel.textFirstRowsSnapshotRef.current = [{ id: 'lib-a', name: 'Atelier' }, { id: 'lib-b', name: 'Boutique' }];
    act(() => mocks.setResult({ type: 'carousel', raw: { carousel_type: 'mix', caption: { body: 'Légende' }, slides: [
      { slide_number: 1, title: 'Couverture' },
      { slide_number: 2, library_photo_index: 2, overlay_text: 'Ma boutique' },
      { slide_number: 3, library_photo_index: 2, overlay_text: 'Encore elle' },
      { slide_number: 4, library_photo_index: 1, photo_index: 5, overlay_text: 'Déjà castée' },
      { slide_number: 5, library_photo_index: 7, overlay_text: 'Hors catalogue' },
    ] } }));
    await waitFor(() => expect(mocks.resultProps.result.slides[1]).toMatchObject({ photo_index: 1, cast_source: 'library_auto' }));
    const slides = mocks.resultProps.result.slides;
    expect(slides[2]).toMatchObject({ photo_index: 1, cast_source: 'library_auto' });
    expect(slides[3]).toEqual({ slide_number: 4, library_photo_index: 1, photo_index: 5, overlay_text: 'Déjà castée' });
    expect(slides[4]).toEqual({ slide_number: 5, library_photo_index: 7, overlay_text: 'Hors catalogue' });
    expect(mocks.photoDecode).toHaveBeenCalledTimes(1);
    expect(mocks.photoDecode).toHaveBeenCalledWith({ id: 'lib-b', name: 'Boutique' });
    expect(mocks.resultProps.photos).toMatchObject([{ id: 'lib-b', userPhotoId: 'lib-b', base64: 'data:image/png;base64,lib-b' }]);
    await waitFor(() => expect(loadPhotos()).toMatchObject([{ userPhotoId: 'lib-b' }]));
  });

  it('1er contenu produits : photos en double retirées, 6 au plus, puis une seule génération', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `lib-${i + 1}`, name: `Produit ${i + 1}` }));
    mocks.photoRead.mockResolvedValue({ data: rows, error: null });
    // lib-2 est le même fichier que lib-1 (deux URL du site, une seule image).
    mocks.photoDecode.mockImplementation(async (photo: any) => ({ base64: `data:image/png;base64,${photo.id === 'lib-2' ? 'lib-1' : photo.id}`, name: photo.name, mimeType: 'image/png' }));
    mount('/creer?format=carousel&carouselSubMode=photo&firstProduct=1&auto=1');
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(loadPhotos().map((p) => p.userPhotoId)).toEqual(['lib-1', 'lib-3', 'lib-4', 'lib-5', 'lib-6', 'lib-7']);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it('photothèque → /creer : une photo illisible est signalée, les autres sont gardées', async () => {
    mocks.photoRead.mockResolvedValue({ data: [{ id: 'library-1', name: 'Portrait de face' }, { id: 'library-2', name: 'Paysage' }], error: null });
    mocks.photoDecode.mockImplementation(async (photo: any) => {
      if (photo.id === 'library-2') throw new Error('illisible');
      return { base64: `data:image/png;base64,${photo.id}`, name: photo.name, mimeType: 'image/png' };
    });
    mount({ pathname: '/creer', search: '', state: { libraryPhotoIds: ['library-1', 'library-2'] } });
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith("1 photo n'a pas pu être chargée. Vérifie ta sélection avant de créer le contenu."));
    await waitFor(() => expect(loadPhotos().map((p) => p.userPhotoId)).toEqual(['library-1']));
    // Le nom de la photo, assez descriptif, devient le sujet.
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'format', ideaText: 'Portrait de face' }));
  });

  it('rechargement : des photos de la photothèque introuvables sont signalées, leurs places gardées', async () => {
    saveFlowState({ step: 'idea', ideaText: '', photoEntry: true });
    await savePhotos([{ id: 'p1', userPhotoId: 'library-1', name: 'Portrait' }, { id: 'p2', userPhotoId: 'library-2', name: 'Paysage' }]);
    mocks.photoRead.mockResolvedValue({ data: [{ id: 'library-1', name: 'Portrait' }], error: null });
    mount();
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalledWith("Certaines photos n'ont pas pu être rechargées."));
    expect(screen.getByTestId('photos')).toHaveTextContent('Portrait,Paysage');
    expect(loadPhotos()).toMatchObject([{ userPhotoId: 'library-1' }, { userPhotoId: 'library-2' }]);
  });
});
