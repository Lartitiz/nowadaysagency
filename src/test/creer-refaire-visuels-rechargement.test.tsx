import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';

// Chantier U (plan-simplicite-editeur.md, 18/10/2026) : « Refaire » et le
// rechargement ne font plus perdre les visuels. Vraie page /creer ;
// useGenerateVisuals est remplacé par un faux qui demande l'accord comme le
// vrai (confirmRedo, testé dans use-generate-visuals.test.tsx) puis pose de
// nouveaux visuels.
const mocks = vi.hoisted(() => ({
  rendus: 0,
  inserts: [] as any[],
  fiche: null as any,
  ficheLue: Promise.resolve() as Promise<void>,
  autosave: [] as boolean[],
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));
vi.mock('sonner', async (importOriginal) => ({ ...(await importOriginal<any>()), toast: mocks.toast }));
vi.mock('@/contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children, useAuth: () => ({ user: { id: 'owner' }, session: { user: { id: 'owner' } } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'owner', useWorkspaceReady: () => true, useIsOwnSpace: () => true, useWorkspaceFilter: () => ({ column: 'user_id', value: 'owner' }) }));
vi.mock('@/contexts/DemoContext', () => ({ DemoProvider: ({ children }: any) => children, useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-pending-brand-review', () => ({ usePendingBrandReview: () => ({ checking: false, pending: false }) }));
vi.mock('@/hooks/use-branding', () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock('@/hooks/use-activity-examples', () => ({ useActivityExamples: () => ({ activityText: '' }) }));
vi.mock('@/hooks/use-user-plan', () => ({ useUserPlan: () => ({ remainingWithBonus: () => 20, plan: 'free', verified: true, loading: false, usage: {}, refresh: () => {} }) }));
vi.mock('@/hooks/use-user-photos', () => ({ useUserPhotos: () => ({ data: [] }) }));
vi.mock('@/hooks/use-photo-wishlist', () => ({ usePhotoWishlistMutations: () => ({}) }));
vi.mock('@/hooks/use-carousel-autosave', () => ({ useCarouselAutosave: (o: any) => { mocks.autosave.push(o.enabled); return { enabled: o.enabled, flush: async () => true }; } }));
vi.mock('@/hooks/use-carousel-quality', () => ({ useCarouselQuality: () => ({}) }));
vi.mock('@/hooks/use-linkedin-carousel-caption', () => ({ useLinkedInCarouselCaption: () => ({}) }));
vi.mock('@/hooks/use-user-slides-generate', () => ({ useUserSlidesGenerate: () => ({}) }));
vi.mock('@/hooks/use-select-inspiration-proposal', () => ({ useSelectInspirationProposal: () => ({}) }));
vi.mock('@/hooks/use-do-generate', () => ({ useDoGenerate: () => ({ doGenerate: vi.fn() }) }));
vi.mock('@/hooks/use-generate-visuals', () => ({ useGenerateVisuals: (params: any) => {
  const handleGenerateVisuals = async (opts?: { confirmed?: boolean }) => {
    if (params.result?.raw?.carousel_editor_version && !opts?.confirmed) return params.confirmRedo(() => void handleGenerateVisuals({ ...opts, confirmed: true }));
    mocks.rendus += 1;
    params.setVisualLoading(true);
    await Promise.resolve();
    params.setVisualSlides([{ slide_number: 1, html: '<div>Nouveau design 1</div>' }, { slide_number: 2, html: '<div>Nouveau design 2</div>' }]);
    params.setVisualLoading(false);
  };
  return { handleGenerateVisuals };
} }));
vi.mock('@/hooks/use-open-in-canva', () => ({ useOpenInCanva: () => ({}) }));
vi.mock('@/hooks/use-social-connections', () => ({ useSocialConnections: () => ({ isConnected: () => false, getTokenExpiry: () => null, known: true }) }));
vi.mock('@/hooks/use-content-generator', () => ({ useContentGenerator: () => {
  const [result, setResult] = useState(null); const [questions, setQuestions] = useState([]);
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: vi.fn(), generateQuestions: vi.fn() };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: vi.fn() }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => (
  <div data-testid="result">
    <p data-testid="visuels">{(p.visualSlides || []).map((s: any) => s.html).join(' | ') || 'aucun visuel'}</p>
    {p.onGenerateVisuals && <button onClick={() => p.onGenerateVisuals()}>Refaire les visuels</button>}
    <button onClick={() => p.onRegenerate?.()}>Même sujet, même angle</button>
  </div>
) }));
vi.mock('@/components/creer/PublishOrScheduleDialog', () => ({ default: () => null }));
vi.mock('@/components/SaveToIdeasDialog', () => ({ SaveToIdeasDialog: () => null }));
vi.mock('@/lib/posthog-lazy', () => ({ posthog: { capture: () => {} } }));
vi.mock('@/lib/carousel-media', () => ({ externalizeCarouselMedia: async (v: any) => v }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const q: any = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
  for (const key of ['select', 'eq', 'in', 'order', 'limit', 'update', 'upsert', 'not', 'is', 'abortSignal']) q[key] = () => q;
  q.insert = (row: any) => { if (table === 'saved_ideas') mocks.inserts.push(row); return q; };
  q.single = () => Promise.resolve({ data: { updated_at: 'version' }, error: null });
  q.maybeSingle = () => mocks.ficheLue.then(() => ({ data: table === 'saved_ideas' ? mocks.fiche : null, error: null }));
  return q;
} } }));

const RETOUCHES = [{ slide_number: 1, html: '<div>Ma retouche 1</div>' }, { slide_number: 2, html: '<div>Ma retouche 2</div>' }];
const raw = (extra: Record<string, any> = {}) => ({ carousel_type: 'text', carousel_editor_version: 1, _carousel_document_id: 'doc-1', slides: [{ slide_number: 1, title: 'Couverture' }, { slide_number: 2, title: 'Fin' }], caption: 'Légende', ...extra });
const contexte = { ideaText: 'Trois gestes pour faire durer un savon', selectedFormat: 'carousel', editorialAngle: null, answers: {} };

function ouvrir(sub: 'text' | 'user_slides' | 'photo', extra: Record<string, any> = {}) {
  saveFlowState({ step: 'result', ...contexte, carouselSubMode: sub, result: { type: 'carousel', raw: raw(sub === 'user_slides' ? { user_slides: true } : {}) }, visualSlides: RETOUCHES, ...extra });
  render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /></Routes></MemoryRouter></StrictMode>);
}
const visuels = () => screen.getByTestId('visuels').textContent;

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.rendus = 0; mocks.inserts = []; mocks.fiche = null; mocks.autosave = []; mocks.ficheLue = Promise.resolve();
  setFlowUserId('owner'); setFlowWorkspaceId('owner');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('« Mes slides » › Refaire une version', () => {
  it('les visuels restent jusqu’à l’accord ; « Annuler » ne change rien et ne lance aucun rendu', async () => {
    ouvrir('user_slides');
    await screen.findByTestId('result');
    expect(visuels()).toContain('Ma retouche 1');
    fireEvent.click(screen.getByRole('button', { name: 'Même sujet, même angle' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(visuels()).toContain('Ma retouche 1');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(visuels()).toBe('<div>Ma retouche 1</div> | <div>Ma retouche 2</div>');
    expect(mocks.rendus).toBe(0);
    expect(loadFlowState()?.visualSlides).toEqual(RETOUCHES);
  });
});

describe('« Refaire les visuels » (choix C4)', () => {
  it('fenêtre de l’app, puis « Revenir à ma version précédente » rend les retouches', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    ouvrir('text');
    await screen.findByTestId('result');
    fireEvent.click(screen.getByRole('button', { name: 'Refaire les visuels' }));
    const fenetre = await screen.findByRole('alertdialog');
    expect(fenetre).toHaveTextContent('Tes retouches seront remplacées');
    expect(screen.getByRole('button', { name: 'Garder une copie dans Mes idées' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refaire quand même' }));
    await waitFor(() => expect(visuels()).toContain('Nouveau design 1'));
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.rendus).toBe(1);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Nouvelle version prête.', expect.objectContaining({ duration: 30000 })));
    const [, opts] = mocks.toast.success.mock.calls.find(([m]) => m === 'Nouvelle version prête.')!;
    expect(opts.action.label).toBe('Revenir à ma version précédente');
    act(() => opts.action.onClick());
    await waitFor(() => expect(visuels()).toBe('<div>Ma retouche 1</div> | <div>Ma retouche 2</div>'));
  });

  it('« Garder une copie dans Mes idées » enregistre la version retouchée à part, puis refait', async () => {
    ouvrir('text');
    await screen.findByTestId('result');
    fireEvent.click(screen.getByRole('button', { name: 'Refaire les visuels' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Garder une copie dans Mes idées' }));
    await waitFor(() => expect(visuels()).toContain('Nouveau design 1'));
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({ user_id: 'owner', workspace_id: null, format: 'carousel', titre: 'Trois gestes pour faire durer un savon (ma version retouchée)' });
    expect(mocks.inserts[0].content_data.visual_html).toEqual(RETOUCHES);
    expect(mocks.inserts[0].content_data._carousel_document_id).not.toBe('doc-1');
    expect(mocks.toast.success).toHaveBeenCalledWith('Ta version retouchée est gardée dans Mes idées.');
  });

  it('« Annuler » : rien ne bouge', async () => {
    ouvrir('text');
    await screen.findByTestId('result');
    fireEvent.click(screen.getByRole('button', { name: 'Refaire les visuels' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.rendus).toBe(0);
    expect(mocks.inserts).toHaveLength(0);
    expect(visuels()).toContain('Ma retouche 1');
  });
});

describe('Carrousel « Tes photos en fond » rechargé', () => {
  // Photos dans le HTML : plus lourd que la mémoire de l'onglet (~5 Mo).
  const LOURD = [{ slide_number: 1, html: `<img src="data:image/jpeg;base64,${'A'.repeat(6_000_000)}">` }];

  it('copie locale trop lourde : les visuels reviennent de Mes idées, sans message contradictoire ni bouton payant', async () => {
    saveFlowState({ step: 'result', ...contexte, carouselSubMode: 'photo', editingIdeaId: 'idee-1', result: { type: 'carousel', raw: raw({ carousel_type: 'photo', visual_html: LOURD }) }, visualSlides: LOURD });
    const local = loadFlowState();
    expect(local).toMatchObject({ step: 'result', visualsInCloud: true, editingIdeaId: 'idee-1', visualSlides: [] });
    expect(local?.result.raw.visual_html).toBeUndefined();
    expect(mocks.toast.warning).not.toHaveBeenCalled();

    let lire = () => {};
    mocks.ficheLue = new Promise((r) => { lire = r; });
    mocks.fiche = { content_data: raw({ carousel_type: 'photo', visual_html: [{ slide_number: 1, html: '<div>Photo retouchée UMOT</div>' }] }) };
    render(<StrictMode><MemoryRouter initialEntries={['/creer']}><Routes><Route path="/creer" element={<CreerUnifie />} /></Routes></MemoryRouter></StrictMode>);
    await screen.findByTestId('result');
    // Pendant la relecture : ni bouton payant, ni sauvegarde automatique (elle écraserait la fiche).
    expect(screen.queryByRole('button', { name: 'Refaire les visuels' })).toBeNull();
    expect(mocks.autosave[0]).toBe(false);
    expect(mocks.autosave).not.toContain(true);
    act(() => lire());
    await waitFor(() => expect(visuels()).toBe('<div>Photo retouchée UMOT</div>'));
    expect(mocks.autosave.at(-1)).toBe(true);
    expect(mocks.rendus).toBe(0);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    // Visuels légers (liens) : la copie locale les garde de nouveau.
    await waitFor(() => expect(loadFlowState()?.visualSlides).toHaveLength(1));
    expect(loadFlowState()?.visualsInCloud).toBeUndefined();
  });

  it('sans fiche dans Mes idées (éditeur jamais ouvert) : on prévient, comme avant', () => {
    saveFlowState({ step: 'result', ...contexte, carouselSubMode: 'photo', result: { type: 'carousel', raw: { ...raw({ carousel_type: 'photo' }), carousel_editor_version: undefined } }, visualSlides: LOURD });
    expect(loadFlowState()).toMatchObject({ step: 'result', visualsInCloud: false, visualSlides: [] });
    expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining('Mes idées'), expect.anything());
  });
});
