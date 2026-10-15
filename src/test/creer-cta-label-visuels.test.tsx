import React, { StrictMode, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Lot 8b (docs/creation-contenu/CARTE.md, section 6, « Bouton d'appel à
// l'action du carrousel texte ») sur la VRAIE page /creer : le vrai
// useGenerateVisuals appelle carousel-visual (frontière : invokeWithHeartbeat),
// puis /creer range le libellé du bouton dessiné dans la slide (cta_label).
// La demande envoyée à carousel-visual ne porte jamais cta_label en texte.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), invoke: vi.fn(),
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
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/lib/invoke-with-heartbeat', () => ({ invokeWithHeartbeat: (...args: any[]) => mocks.invoke(...args) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: () => <p>Étape format</p> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => (
  <div>
    <button onClick={() => p.onGenerateVisuals?.()}>Mettre en forme</button>
    <output data-testid="visuels">{p.visualSlides?.length ?? 0}</output>
    <pre data-testid="result">{JSON.stringify(p.result)}</pre>
  </div>
) }));
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

const slideHtml = (n: number, inner: string) => `<div class="slide" data-slide-number="${n}"><p data-slide-text="body">Slide ${n}</p>${inner}</div>`;
const BOUTON = '<div data-slide-cta="1"><span data-slide-text="cta">Enregistre ce post</span></div>';

function mount() {
  return render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /></Routes></MemoryRouter></StrictMode>);
}
// L’écran de résultat reçoit le contenu du carrousel (result.raw).
const slidesAffichees = () => JSON.parse(screen.getByTestId('result').textContent || 'null').slides;

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('/creer : libellé du bouton du carrousel texte rangé à l’arrivée des visuels', () => {
  it('le bouton dessiné donne cta_label à sa slide, sans jamais partir vers carousel-visual', async () => {
    // La dernière slide garde un ancien libellé (rendu précédent) : il ne doit
    // pas être envoyé, et il est remplacé par celui que montre le visuel.
    saveFlowState({
      step: 'result', ideaText: 'Mes 3 erreurs de débutante', selectedFormat: 'carousel', carouselSubMode: 'text',
      result: { type: 'carousel', raw: { carousel_type: 'text', caption: 'Légende', slides: [
        { slide_number: 1, role: 'hook', title: 'Couverture', body: 'Accroche' },
        { slide_number: 2, role: 'body', title: 'Erreur 1', body: 'Tout dire' },
        { slide_number: 3, role: 'cta', title: 'À toi', body: 'Garde-le', cta_label: 'Ancien libellé' },
      ] } },
    });
    mocks.invoke.mockResolvedValue({ data: { result: { slides_html: [
      { slide_number: 1, html: slideHtml(1, '') },
      { slide_number: 2, html: slideHtml(2, '') },
      { slide_number: 3, html: slideHtml(3, BOUTON) },
    ] } }, error: null });

    mount();
    // Résultat restauré : aucun rendu payant sans clic.
    await screen.findByTestId('result');
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Mettre en forme'));
    await waitFor(() => expect(screen.getByTestId('visuels')).toHaveTextContent('3'));

    // Demande envoyée : carousel-visual, slides texte, aucun cta_label.
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    const [fonction, { body }] = mocks.invoke.mock.calls[0];
    expect(fonction).toBe('carousel-visual');
    expect(body.slides).toHaveLength(3);
    for (const s of body.slides) {
      expect(s.slide_type).toBe('text_only');
      expect(s).not.toHaveProperty('cta_label');
    }
    expect(JSON.stringify(body)).not.toContain('cta_label');

    // Résultat affiché : seule la dernière slide porte le libellé du visuel.
    await waitFor(() => expect(slidesAffichees()[2].cta_label).toBe('Enregistre ce post'));
    expect(slidesAffichees()[0]).not.toHaveProperty('cta_label');
    expect(slidesAffichees()[1]).not.toHaveProperty('cta_label');

    // Résultat sauvegardé, puis restauré à la réouverture de la page.
    await waitFor(() => expect(loadFlowState()?.result?.raw?.slides?.[2]?.cta_label).toBe('Enregistre ce post'));
    expect(loadFlowState()?.result?.raw?.slides?.[0]).not.toHaveProperty('cta_label');
    expect(loadFlowState()?.visualSlides?.[2]?.html).toContain('data-slide-cta');
    cleanup();
    mount();
    await screen.findByTestId('result');
    expect(slidesAffichees()[2].cta_label).toBe('Enregistre ce post');
    expect(screen.getByTestId('visuels')).toHaveTextContent('3');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
