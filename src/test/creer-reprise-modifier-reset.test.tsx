import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CreerUnifie from '@/pages/CreerUnifie';
import { loadFlowState, saveFlowState, setFlowUserId, setFlowWorkspaceId } from '@/hooks/use-flow-persistence';
import { reelSourceKey } from '@/lib/reel-publication';

// Lot A du découpage de CreerUnifie (docs/robustesse/gros-fichiers.md, fiche 1,
// tests 2, 3, 5, 6 et 11) : étape rouverte au rechargement (safeStep), texte
// coupé récupéré (pendingStream), mise à plat pour « Modifier », « Repartir de
// zéro » et bandeau « derniers crédits ». La page et useCalendarSave restent réels.
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), formatNext: vi.fn(), generateQuestions: vi.fn(), capture: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  plan: 'free', remaining: 20, verified: true,
  setResult: null as any, resultProps: null as any, publishProps: null as any,
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
  mocks.setResult = setResult;
  return { result, setResult, questions, setQuestions, reset: () => { setResult(null); setQuestions([]); }, streamReset: () => {}, generate: mocks.generate, generateQuestions: mocks.generateQuestions };
} }));
vi.mock('@/hooks/use-format-next', () => ({ useFormatNext: () => ({ handleFormatNext: mocks.formatNext }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/dashboard/ContentCoachingDialog', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerTransformTab', () => ({ default: () => null }));
vi.mock('@/components/creer/CreerStepFormat', () => ({ default: (p: any) => <div><p>Format : {p.forcedChannel}</p><p>Idée : {p.idea}</p></div> }));
vi.mock('@/components/creer/CreerStepResult', () => ({ default: (p: any) => { mocks.resultProps = p; return <div><pre data-testid="result">{JSON.stringify(p.result)}</pre><button onClick={p.onReset}>Réinitialiser</button><button onClick={p.onEdit}>Éditer le résultat</button></div>; } }));
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

function Probe() { const l = useLocation(); return <output data-testid="location">{l.pathname + l.search}</output>; }
function mount(entry: any = '/creer') {
  return render(<StrictMode><MemoryRouter initialEntries={[entry]}><Routes><Route path="/creer" element={<CreerUnifie />} /><Route path="*" element={<p>Ailleurs</p>} /></Routes><Probe /></MemoryRouter></StrictMode>);
}

beforeEach(() => {
  cleanup(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); vi.clearAllMocks();
  sessionStorage.clear(); localStorage.clear();
  mocks.plan = 'free'; mocks.remaining = 20; mocks.verified = true; mocks.resultProps = null; mocks.publishProps = null;
  setFlowUserId('owner'); setFlowWorkspaceId('A');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

// ── Test 2 : table de safeStep (étape rouverte au rechargement) ──
type Etape = 'idea' | 'format' | 'questions' | 'result';
async function attendreEtape(etape: Etape, question?: string) {
  if (etape === 'idea') expect(await screen.findByLabelText('Ton idée')).toBeInTheDocument();
  if (etape === 'format') expect(await screen.findByText(/^Format :/)).toBeInTheDocument();
  if (etape === 'questions') expect(await screen.findByText(question!)).toBeInTheDocument();
  if (etape === 'result') expect(await screen.findByTestId('result')).toBeInTheDocument();
  await waitFor(() => expect(loadFlowState()?.step).toBe(etape));
}
const LONG_STREAM = '{"content":"Un texte déjà écrit avant la coupure, assez long pour être gardé';

describe('safeStep : étape rouverte après un rechargement', () => {
  it.each<[string, any, Etape, string?]>([
    ['structure_review avec format → format (la proposition n’est pas persistée)', { step: 'structure_review', ideaText: 'Sujet', selectedFormat: 'carousel', carouselSubMode: 'text' }, 'format'],
    ['structure_review sans format → idée', { step: 'structure_review', ideaText: 'Sujet' }, 'idea'],
    ['hook_selection avec format → format (les angles ne sont pas persistés)', { step: 'hook_selection', ideaText: 'Sujet', selectedFormat: 'reel' }, 'format'],
    ['hook_selection sans format → idée', { step: 'hook_selection', ideaText: 'Sujet' }, 'idea'],
    ['questions avec questions persistées → questions', { step: 'questions', ideaText: 'Sujet', selectedFormat: 'post', questions: [{ id: 'q1', question: 'Question gardée ?' }] }, 'questions', 'Question gardée ?'],
    ['questions sans questions → format', { step: 'questions', ideaText: 'Sujet', selectedFormat: 'post', questions: [] }, 'format'],
    ['questions du 1er contenu (autoFlow) sans questions → questions (récap)', { step: 'questions', ideaText: 'Sujet du diagnostic', selectedFormat: 'carousel', carouselSubMode: 'text', autoFlow: true, questions: [] }, 'questions', 'Sujet du diagnostic'],
    ['result sans résultat mais texte streamé > 40 caractères → result', { step: 'result', ideaText: 'Sujet', selectedFormat: 'post', pendingStream: { text: LONG_STREAM, format: 'post', ts: 1 } }, 'result'],
    ['result sans résultat et texte streamé trop court → format', { step: 'result', ideaText: 'Sujet', selectedFormat: 'post', pendingStream: { text: '{"content":"court', format: 'post', ts: 1 } }, 'format'],
    ['result sans résultat ni format → idée', { step: 'result', ideaText: 'Sujet' }, 'idea'],
  ])('%s', async (_nom, saved, etape, question) => {
    saveFlowState(saved);
    mount();
    await attendreEtape(etape, question);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.formatNext).not.toHaveBeenCalled();
    expect(mocks.generateQuestions).not.toHaveBeenCalled();
  });

  it('canal forcé différent du brouillon, avec un sujet → format sur le canal demandé', async () => {
    saveFlowState({ step: 'result', ideaText: 'Sujet Instagram', selectedFormat: 'post', result: { type: 'post', raw: { content: 'Post Instagram' } } });
    mount('/creer?canal=linkedin');
    expect(await screen.findByText('Format : linkedin')).toBeInTheDocument();
    expect(screen.getByText(/^Idée :/)).toHaveTextContent('Sujet Instagram');
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'format', forcedChannel: 'linkedin', selectedFormat: null }));
  });

  it('canal forcé différent du brouillon, sans sujet → idée', async () => {
    saveFlowState({ step: 'format', ideaText: '', selectedFormat: 'pinterest_visual' });
    mount('/creer?canal=instagram');
    await attendreEtape('idea');
    expect(loadFlowState()).toMatchObject({ forcedChannel: 'instagram', selectedFormat: null });
  });
});

// ── Test 3 : récupération d'un texte coupé en plein streaming ──
describe('pendingStream : texte coupé récupéré au rechargement', () => {
  const restaurer = async (text: string, format = 'post') => {
    saveFlowState({ step: 'result', ideaText: 'Sujet', selectedFormat: format, pendingStream: { text, format, ts: 1 } });
    mount();
    await screen.findByTestId('result');
  };

  it('JSON tronqué → seul le champ content est affiché, avec un toast, et le texte partiel est purgé', async () => {
    await restaurer('{"content":"Voici le début du texte, coupé au milieu d\\u2019une phrase\\navec un \\"mot\\" cité', 'post');
    const attendu = 'Voici le début du texte, coupé au milieu d’une phrase\navec un "mot" cité';
    expect(mocks.resultProps.result).toEqual({ content: attendu });
    expect(mocks.toast).toHaveBeenCalledWith("💾 J'ai récupéré le texte généré avant l'interruption.", {
      description: "Vérifie-le : il peut être incomplet. « Regénérer » en refait une version (1 crédit).",
    });
    await waitFor(() => expect(loadFlowState()?.pendingStream).toBeNull());
    expect(loadFlowState()?.result).toEqual({ type: 'post', raw: { content: attendu } });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('JSON complet → objet repris tel quel, type pris du format du stream', async () => {
    await restaurer('{"full_text":"Post LinkedIn complet","hashtags":["#a","#b"]}', 'linkedin');
    expect(mocks.resultProps.result).toEqual({ full_text: 'Post LinkedIn complet', hashtags: ['#a', '#b'] });
    await waitFor(() => expect(loadFlowState()?.result).toMatchObject({ type: 'linkedin' }));
  });

  it('texte brut sans JSON → bloc de code retiré, texte gardé', async () => {
    await restaurer('```json\nUn texte brut sans accolade, rendu par le modèle avant la coupure\n```');
    expect(mocks.resultProps.result).toEqual({ content: 'Un texte brut sans accolade, rendu par le modèle avant la coupure\n' });
  });
});

// ── Test 5 : mise à plat du résultat pour l'étape « Modifier » ──
describe('« Modifier » : texte à plat par format', () => {
  const ouvrir = async (selectedFormat: string, raw: any) => {
    saveFlowState({ step: 'result', ideaText: 'Sujet', selectedFormat, result: { type: selectedFormat, raw } });
    mount();
    await screen.findByTestId('result');
    fireEvent.click(screen.getByText('Éditer le résultat'));
  };
  const attendreTexte = async (texte: string) => {
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'edit', editContent: texte, editBaseline: texte }));
  };

  it('reel en sections', async () => {
    await ouvrir('reel', { sections: [
      { label: 'Accroche', timing: '0-3 s', texte_parle: 'Tu perds des clientes ?', texte_overlay: 'STOP', action: 'Regard caméra' },
      { section_number: 2, texte_parle: 'Voici pourquoi.' },
    ] });
    await attendreTexte('--- Accroche (0-3 s) ---\nTu perds des clientes ?\nSTOP\nRegard caméra\n\n--- Section 2 () ---\nVoici pourquoi.');
  });

  it('LinkedIn accroche + corps + appel, puis hashtags', async () => {
    await ouvrir('linkedin', { hook: 'Accroche', body: 'Corps', cta: 'Appel', hashtags: ['#marque', '#com'] });
    await attendreTexte('Accroche\n\nCorps\n\nAppel\n\n#marque #com');
  });

  it('LinkedIn full_text prioritaire, puis hashtags', async () => {
    await ouvrir('linkedin', { full_text: 'Texte complet', hook: 'Ignorée', hashtags: ['#a'] });
    await attendreTexte('Texte complet\n\n#a');
  });

  it('Pinterest visuel', async () => {
    await ouvrir('pinterest_visual', { title: 'Titre épingle', description: 'Description épingle' });
    await attendreTexte('📌 TITRE :\nTitre épingle\n\n📝 DESCRIPTION :\nDescription épingle');
  });

  it('Pinterest photo avec brief', async () => {
    await ouvrir('pinterest_photo', { title: 'T', description: 'D', photo_brief: { what: 'Un bol', framing: 'Plongée', lighting: 'Naturelle', props: ['lin', 'bois'], colors: 'Crème', mood: 'Calme' } });
    await attendreTexte('📌 TITRE :\nT\n\n📝 DESCRIPTION :\nD\n\n📷 BRIEF PHOTO :\n• Sujet : Un bol\n• Cadrage : Plongée\n• Lumière : Naturelle\n• Accessoires : lin, bois\n• Couleurs : Crème\n• Ambiance : Calme');
  });

  it('newsletter sans body → content', async () => {
    await ouvrir('newsletter', { subject: 'Objet', content: 'Corps via content' });
    await attendreTexte('Corps via content');
  });

  it('post au champ post', async () => {
    await ouvrir('post', { post: 'Texte du post' });
    await attendreTexte('Texte du post');
  });

  it('forme inconnue → JSON indenté', async () => {
    await ouvrir('post', { foo: 'bar' });
    await attendreTexte('{\n  "foo": "bar"\n}');
  });

  it('texte vide → repli sur le contenu existant du calendrier', async () => {
    mount({ pathname: '/creer', search: '?canal=instagram', state: { resumeIdea: { format: 'post', raw: { content: '   ' } }, fromCalendar: true, calendarPostId: 'cal-9', existingContent: 'Brouillon du calendrier' } });
    await screen.findByTestId('result');
    fireEvent.click(screen.getByText('Éditer le résultat'));
    await attendreTexte('Brouillon du calendrier');
  });
});

// ── Test 6 : « Repartir de zéro » (handleReset) ──
describe('handleReset', () => {
  const video = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/reels-montes/owner/reel.mp4`;

  const raw = { sections: [{ label: 'Accroche', texte_parle: 'Bonjour' }] };

  it('au rechargement, la vidéo montée du reel est reprise avec son script', async () => {
    // Le résultat n'est restauré qu'après le premier rendu : la vidéo se rattache
    // au script sauvegardé (avant le 14/10/2026, elle était perdue).
    saveFlowState({ step: 'result', ideaText: 'Reel', selectedFormat: 'reel', result: { type: 'reel', raw }, creationId: 'reel-creation', reelMp4Url: video, reelSourceKey: reelSourceKey(raw) });
    mount();
    await screen.findByTestId('result');
    await waitFor(() => expect(mocks.resultProps.reelMp4Url).toBe(video));
    await waitFor(() => expect(loadFlowState()).toMatchObject({ reelMp4Url: video, reelSourceKey: reelSourceKey(raw) }));
  });

  it('au rechargement, une vidéo sauvegardée pour un autre script n’est pas reprise', async () => {
    saveFlowState({ step: 'result', ideaText: 'Reel', selectedFormat: 'reel', result: { type: 'reel', raw }, creationId: 'reel-creation', reelMp4Url: video, reelSourceKey: reelSourceKey({ sections: [{ texte_parle: 'Ancien script' }] }) });
    mount();
    await screen.findByTestId('result');
    await waitFor(() => expect(loadFlowState()).toMatchObject({ reelMp4Url: null, reelSourceKey: reelSourceKey(raw) }));
    expect(mocks.resultProps.reelMp4Url).toBeNull();
  });

  it('vide le brouillon, la copie du résultat, le suivi de publication et la vidéo du reel', async () => {
    saveFlowState({ step: 'result', ideaText: 'Reel', selectedFormat: 'reel', result: { type: 'reel', raw }, creationId: 'reel-creation',
      publishedCalendarId: 'ancien-post', calendarPostId: 'cal-ancien', calendarPostDate: '2026-11-01', incomingBriefId: 'brief', editingIdeaId: 'idee' });
    mount();
    await screen.findByTestId('result');
    // Vidéo montée pendant la visite (ReelResult → onReelMp4Change).
    act(() => mocks.resultProps.onReelMp4Change(video));
    await waitFor(() => expect(mocks.resultProps.reelMp4Url).toBe(video));
    await waitFor(() => expect(loadFlowState()?.reelMp4Url).toBe(video));
    const cleResultat = 'creer_unifie_result:owner:A:reel-creation';
    await waitFor(() => expect(sessionStorage.getItem(cleResultat)).not.toBeNull());

    fireEvent.click(screen.getByText('Réinitialiser'));
    fireEvent.click(screen.getByRole('button', { name: 'Repartir de zéro' }));

    expect(await screen.findByLabelText('Ton idée')).toHaveValue('');
    expect(sessionStorage.getItem(cleResultat)).toBeNull();
    await waitFor(() => expect(loadFlowState()).toMatchObject({ step: 'idea', ideaText: '', selectedFormat: null, reelMp4Url: null, calendarPostId: null, calendarPostDate: null, incomingBriefId: null, editingIdeaId: null }));
    const apres = loadFlowState()!;
    expect(apres.result).toBeUndefined();
    expect(apres.publishedCalendarId).toBeUndefined();
    expect(apres.creationId).not.toBe('reel-creation');
  });

  it('contrôle : sans remise à zéro, le contenu déjà publié est signalé « déjà enregistré »', async () => {
    saveFlowState({ step: 'result', ideaText: 'Post', selectedFormat: 'post', result: { type: 'post', raw: { content: 'Déjà publié' } }, creationId: 'post-creation', publishedCalendarId: 'ancien-post' });
    mount();
    await screen.findByTestId('result');
    await act(async () => { await mocks.publishProps.onDraft('2026-11-20'); });
    expect(mocks.toast.info).toHaveBeenCalledWith('Ce contenu est déjà enregistré dans ton calendrier.');
  });

  it('après « Repartir de zéro », la création suivante ne reçoit pas « déjà enregistré »', async () => {
    saveFlowState({ step: 'result', ideaText: 'Post', selectedFormat: 'post', result: { type: 'post', raw: { content: 'Déjà publié' } }, creationId: 'post-creation', publishedCalendarId: 'ancien-post' });
    mount();
    await screen.findByTestId('result');
    fireEvent.click(screen.getByText('Réinitialiser'));
    fireEvent.click(screen.getByRole('button', { name: 'Repartir de zéro' }));
    await screen.findByLabelText('Ton idée');
    // Nouveau contenu généré dans le même onglet.
    act(() => mocks.setResult({ type: 'post', raw: { content: 'Nouveau contenu' } }));
    await waitFor(() => expect(loadFlowState()?.result?.raw?.content).toBe('Nouveau contenu'));
    await act(async () => { await mocks.publishProps.onDraft('2026-11-20'); });
    expect(mocks.toast.info).not.toHaveBeenCalledWith('Ce contenu est déjà enregistré dans ton calendrier.');
    expect(screen.getByTestId('location')).not.toHaveTextContent('post=ancien-post');
  });
});

// ── Test 11 : bandeau « derniers crédits » ──
describe('LowCreditsBanner', () => {
  it.each<[string, number, boolean]>([
    ['free', 4, true],
    ['free', 1, true],
    ['free', 5, false],
    ['free', 0, false],
    ['premium', 2, false],
  ])('plan %s avec %i crédit(s) → visible : %s', async (plan, remaining, visible) => {
    mocks.plan = plan; mocks.remaining = remaining;
    mount();
    await screen.findByLabelText('Ton idée');
    const libelle = `Plus que ${remaining} crédit${remaining > 1 ? 's' : ''}`;
    if (!visible) {
      expect(screen.queryByText(/^Plus que/)).toBeNull();
      expect(mocks.capture).not.toHaveBeenCalledWith('low_credits_banner_shown', expect.anything());
      return;
    }
    expect(screen.getByText(libelle)).toBeVisible();
    expect(mocks.capture).toHaveBeenCalledWith('low_credits_banner_shown', { remaining, plan });
    fireEvent.click(screen.getByText('Découvrir le Premium'));
    expect(mocks.capture).toHaveBeenCalledWith('low_credits_banner_cta_clicked', { remaining, plan });
  });

  it('caché tant que le plan n’est pas vérifié', async () => {
    mocks.remaining = 2; mocks.verified = false;
    mount();
    await screen.findByLabelText('Ton idée');
    expect(screen.queryByText(/^Plus que/)).toBeNull();
  });

  it('se masque au clic sur la croix', async () => {
    mocks.remaining = 3;
    mount();
    expect(await screen.findByText('Plus que 3 crédits')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Masquer cette invitation'));
    expect(screen.queryByText('Plus que 3 crédits')).toBeNull();
  });
});
