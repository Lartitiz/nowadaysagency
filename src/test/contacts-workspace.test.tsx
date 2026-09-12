import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const m = vi.hoisted(() => ({ workspace: 'A', userId: 'user-test', ready: true, query: vi.fn(), success: vi.fn(), error: vi.fn(), toast: vi.fn(), invoke: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: m.userId ? { id: m.userId } : null }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceFilter: () => ({ column: m.workspace ? 'workspace_id' : 'user_id', value: m.workspace || m.userId }), useWorkspaceId: () => m.workspace || m.userId, useWorkspaceReady: () => m.ready }));
vi.mock('sonner', () => ({ toast: Object.assign(m.toast, { success: m.success, error: m.error }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/Confetti', () => ({ default: () => null }));
vi.mock('@/components/ui/input-with-voice', () => ({ InputWithVoice: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} /> }));
vi.mock('@/components/ui/textarea-with-voice', () => ({ TextareaWithVoice: (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} /> }));
vi.mock('@/lib/invoke-with-timeout', () => ({ invokeWithTimeout: m.invoke }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const q = { table, op: 'select', payload: undefined as unknown, filters: [] as string[][], columns: '' };
  const chain = {
    select: (columns: string) => { q.columns = columns; return chain; },
    eq: (key: string, value: string) => { q.filters.push([key, value]); return chain; },
    is: (key: string, value: string) => { q.filters.push([key, value]); return chain; },
    order: () => chain,
    update: (payload: unknown) => { q.op = 'update'; q.payload = payload; return chain; },
    insert: (payload: unknown) => { q.op = 'insert'; q.payload = payload; return chain; },
    delete: () => { q.op = 'delete'; return chain; },
    single: () => chain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve().then(() => m.query(q)).then(resolve, reject),
  };
  return chain;
} } }));
import ContactsPage from '@/pages/ContactsPage';
const contact = (id: string, type = 'network') => ({ id, user_id: 'user-test', workspace_id: id[0], username: `fiction_${id}`, display_name: `Contact ${id}`, contact_type: type, network_category: 'pair', prospect_stage: 'to_contact', created_at: '2026-01-01', last_interaction_at: null, notes: 'note conservée', target_offer: 'offre-A', next_followup_at: '2026-01-02', next_followup_text: 'Relance conservée' });
const deferred = () => { let resolve!: (v: unknown) => void; let reject!: (e: unknown) => void; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setupRead(rows = [contact('A')]) {
  m.query.mockImplementation(q => ({ data: q.table === 'contacts' && q.op === 'select' ? rows : [], error: null }));
}
async function switchProspects() { await userEvent.click(screen.getByRole('tab', { name: 'Mes prospects' })); }
beforeEach(() => { m.workspace = 'A'; m.userId = 'user-test'; m.ready = true; vi.clearAllMocks(); setupRead(); });
afterEach(cleanup);
describe('Contacts: isolation et confirmation réelle', () => {
  it('recharge A → B vide → A sans réutiliser la liste précédente', async () => {
    m.query.mockImplementation(q => ({ data: q.filters.some(([k,v]: string[]) => k === 'workspace_id' && v === 'B') ? [] : [contact('A')], error: null }));
    const view = render(<ContactsPage />);
    await screen.findAllByText(/Contact A/);
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await waitFor(() => expect(m.query).toHaveBeenCalledTimes(2));
    expect(screen.queryAllByText(/Contact A/)).toHaveLength(0);
    m.workspace = 'A'; view.rerender(<ContactsPage />);
    await screen.findAllByText(/Contact A/);
    expect(m.query).toHaveBeenCalledTimes(3);
  });
  it('ne confirme pas Fait après refus de l’écriture', async () => {
    m.query.mockImplementation(q => q.op === 'update' ? { data: null, error: { message: 'refus fixture' } } : { data: [contact('A')], error: null });
    render(<ContactsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fait' }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.success).not.toHaveBeenCalled();
    expect(screen.getByText('Dernière interaction : jamais')).toBeInTheDocument();
  });
});

describe('Contacts: réponses tardives et erreurs', () => {
  it('écarte la première réponse A après B puis une nouvelle visite A', async () => {
    const slow = deferred();
    let reads = 0;
    m.query.mockImplementation(() => ++reads === 1 ? slow.promise : { data: [contact(reads === 2 ? 'B' : 'A_recharge')], error: null });
    const view = render(<ContactsPage />);
    await waitFor(() => expect(m.query).toHaveBeenCalledTimes(1));
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await screen.findAllByText(/Contact B/);
    m.workspace = 'A'; view.rerender(<ContactsPage />);
    await screen.findAllByText(/Contact A_recharge/);
    await act(async () => slow.resolve({ data: [contact('A_ancien')], error: null }));
    expect(screen.queryAllByText(/Contact A_ancien/)).toHaveLength(0);
    expect(screen.getAllByText(/Contact A_recharge/).length).toBeGreaterThan(0);
  });
  it.each(['error', 'reject'])('affiche un échec de lecture (%s), pas une liste vide, et permet de reprendre', async mode => {
    const view = render(<ContactsPage />);
    await screen.findAllByText(/Contact A/);
    m.query.mockImplementationOnce(() => mode === 'reject' ? Promise.reject(new Error('fixture')) : { data: null, error: { message: 'fixture' } });
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await screen.findByRole('alert');
    expect(screen.queryAllByText(/Contact A/)).toHaveLength(0);
    setupRead([contact('B')]);
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findAllByText(/Contact B/);
  });
  it('attend la résolution des espaces et masque la page à la déconnexion', async () => {
    m.ready = false;
    const view = render(<ContactsPage />);
    expect(m.query).not.toHaveBeenCalled();
    m.ready = true; view.rerender(<ContactsPage />);
    await screen.findAllByText(/Contact A/);
    m.userId = ''; view.rerender(<ContactsPage />);
    expect(screen.queryAllByText(/Contact A/)).toHaveLength(0);
  });
  it.each(['empty', 'reject'])('ne confirme pas une écriture %s', async mode => {
    m.query.mockImplementation(q => q.op === 'update' ? mode === 'reject' ? Promise.reject(new Error('fixture')) : { data: null, error: null } : { data: [contact('A')], error: null });
    render(<ContactsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fait' }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.success).not.toHaveBeenCalled();
  });
  it('filtre la modification par espace et utilise le reçu sans perdre notes/offre/relance', async () => {
    const saved = { ...contact('A'), last_interaction_at: new Date().toISOString() };
    m.query.mockImplementation(q => ({ data: q.op === 'update' ? saved : [contact('A')], error: null }));
    render(<ContactsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fait' }));
    await waitFor(() => expect(m.success).toHaveBeenCalledWith('✅ Fait !'));
    const query = m.query.mock.calls.find(([q]) => q.op === 'update')![0];
    expect(query.filters).toEqual([['id', 'A'], ['workspace_id', 'A']]);
    expect(Object.keys(query.payload)).toEqual(['last_interaction_at']);
    expect(screen.getByText('Dernière interaction : il y a 0 jour')).toBeInTheDocument();
  });
  it('ignore un reçu tardif et empêche le double clic pendant une écriture', async () => {
    const slow = deferred();
    m.query.mockImplementation(q => q.op === 'update' ? slow.promise : { data: [contact(m.workspace)], error: null });
    const view = render(<ContactsPage />);
    const button = await screen.findByRole('button', { name: 'Fait' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(m.query.mock.calls.filter(([q]) => q.op === 'update')).toHaveLength(1));
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await screen.findAllByText(/Contact B/);
    await act(async () => slow.resolve({ data: contact('A'), error: null }));
    expect(m.success).not.toHaveBeenCalled();
    expect(screen.queryAllByText(/Contact A/)).toHaveLength(0);
  });
  it('conserve le formulaire après un refus d’ajout puis le réinitialise au changement d’espace', async () => {
    m.query.mockImplementation(q => q.op === 'insert' ? { data: null, error: { message: 'fixture' } } : { data: [], error: null });
    const view = render(<ContactsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter' }));
    await userEvent.type(screen.getByLabelText('Username Instagram'), 'fiction_test');
    await userEvent.click(screen.getAllByRole('button', { name: 'Ajouter' }).at(-1)!);
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(screen.getByLabelText('Username Instagram')).toHaveValue('fiction_test');
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await screen.findByRole('button', { name: 'Ajouter' });
    expect(screen.queryByLabelText('Username Instagram')).not.toBeInTheDocument();
    expect(m.success).not.toHaveBeenCalled();
  });
});

function setupProspect() {
  const row = { ...contact('A', 'prospect'), relevant_offer: 'Offre pertinente conservée' };
  m.query.mockImplementation(q => ({ data: q.table === 'contacts' ? q.op === 'update' ? { ...row, ...q.payload } : [row] : q.table === 'offers' ? [{ id: 'offre-A', name: 'Offre A', offer_type: 'paid' }] : q.op === 'insert' ? { id: 'interaction-test' } : [{ id: 'history-A', content: 'Historique conservé', interaction_type: 'dm_received', created_at: '2026-01-01' }], error: null }));
}
async function openDetail() {
  await screen.findByRole('tab', { name: 'Mes prospects' }); await switchProspects();
  await userEvent.click(screen.getByText('Contact A'));
  await screen.findByText('INFOS');
}
async function openGenerator() {
  await screen.findByRole('tab', { name: 'Mes prospects' }); await switchProspects();
  await userEvent.click(screen.getAllByRole('button', { name: 'DM' })[0]);
  await screen.findByLabelText(/Copie-colle ici/);
}
async function generate() {
  await userEvent.click(screen.getByRole('button', { name: /Suivant/ }));
  await userEvent.click(screen.getByRole('button', { name: /Suivant/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Générer le message' }));
}
describe('Contacts: dialogues réels, historique et DM fictif', () => {
  it('garde historique/offre/relance, actualise le détail sauvegardé, puis ferme le détail en B', async () => {
    setupProspect();
    const view = render(<ContactsPage />); await openDetail();
    await screen.findByText(/Historique conservé/);
    expect(screen.getByText('Offre pertinente conservée')).toBeInTheDocument();
    expect(screen.getByText(/2 janvier/)).toHaveTextContent('Relance conservée');
    await userEvent.click(screen.getByRole('button', { name: /Prête/ }));
    await waitFor(() => expect(m.query.mock.calls.some(([q]) => q.op === 'update')).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: /Offre proposée/ }));
    await waitFor(() => expect(m.query.mock.calls.filter(([q]) => q.op === 'update')).toHaveLength(2));
    expect(m.query.mock.calls.filter(([q]) => q.op === 'update').at(-1)![0].payload).toEqual({ prospect_stage: 'offer_proposed' });
    expect(screen.getByRole('button', { name: /Offre proposée/ })).toHaveClass('bg-primary');
    m.workspace = 'B'; setupRead([]); view.rerender(<ContactsPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('un détail refusé conserve le brouillon et n’altère pas la fiche', async () => {
    setupProspect(); render(<ContactsPage />); await openDetail();
    await userEvent.click(screen.getByText('Offre pertinente conservée'));
    fireEvent.change(screen.getByLabelText('Offre pertinente'), { target: { value: 'Brouillon' } });
    m.query.mockImplementationOnce(() => ({ data: null, error: { message: 'refus fixture' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(screen.getByLabelText('Offre pertinente')).toHaveValue('Brouillon');
  });
  it('ne transforme pas un échec d’historique en absence d’interactions', async () => {
    setupProspect(); const original = m.query.getMockImplementation()!;
    m.query.mockImplementation(q => q.table === 'contact_interactions' ? { data: null, error: { message: 'fixture' } } : original(q));
    render(<ContactsPage />); await openDetail();
    await screen.findByRole('alert');
    expect(screen.queryByText(/Pas encore d'interaction/)).not.toBeInTheDocument();
    expect(m.query.mock.calls.some(([q]) => q.table === 'prospect_interactions')).toBe(false);
  });
  it('écarte un historique DM tardif après A → B → A', async () => {
    setupProspect(); const original = m.query.getMockImplementation()!; const slow = deferred();
    m.query.mockImplementation(q => q.table === 'contact_interactions' ? slow.promise : original(q));
    const view = render(<ContactsPage />);
    await screen.findByRole('tab', { name: 'Mes prospects' }); await switchProspects();
    await userEvent.click(screen.getAllByRole('button', { name: 'DM' })[0]);
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await screen.findByRole('tab', { name: 'Mes prospects' });
    m.workspace = 'A'; view.rerender(<ContactsPage />);
    await screen.findByRole('tab', { name: 'Mes prospects' });
    await act(async () => slow.resolve({ data: [], error: null }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('écarte une génération tardive et les offres de A après changement d’espace', async () => {
    setupProspect(); const slow = deferred(); m.invoke.mockReturnValue(slow.promise);
    const view = render(<ContactsPage />); await openGenerator(); await generate();
    expect(m.invoke.mock.calls[0][1].body.workspace_id).toBe('A');
    m.workspace = 'B'; setupRead([]); view.rerender(<ContactsPage />);
    await act(async () => slow.resolve({ data: { variant_a: 'Message fictif A', variant_b: 'Autre message fictif A' }, error: null }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Message fictif A')).not.toBeInTheDocument();
    expect(m.success).not.toHaveBeenCalled();
  });
  it('enregistre le contexte DM dans contacts et attend le reçu de l’historique et de la relance', async () => {
    setupProspect(); m.invoke.mockResolvedValue({ data: { variant_a: 'Message fictif A', variant_b: 'Autre message fictif A' }, error: null });
    render(<ContactsPage />); await openGenerator();
    await userEvent.type(screen.getByLabelText(/Copie-colle ici/), 'Conversation fictive');
    await generate();
    await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
    await waitFor(() => expect(m.success).toHaveBeenCalledWith('✅ Message noté !'));
    const queries = m.query.mock.calls.map(([q]) => q);
    expect(queries.some(q => q.table === 'prospects')).toBe(false);
    expect(queries.find(q => q.op === 'update').payload).toEqual({ last_conversation: 'Conversation fictive' });
    expect(queries.find(q => q.op === 'insert').payload).toMatchObject({ contact_id: 'A', workspace_id: 'A', content: 'Message fictif A' });
    expect(queries.filter(q => q.op === 'update').at(-1).payload).toMatchObject({ prospect_stage: 'in_conversation', next_followup_text: 'Vérifier si @fiction_A a répondu' });
  });
  it('garde le DM ouvert si son historique est refusé, sans mettre à jour la relance', async () => {
    setupProspect(); const original = m.query.getMockImplementation()!;
    m.query.mockImplementation(q => q.op === 'insert' ? { data: null, error: { message: 'fixture' } } : original(q));
    m.invoke.mockResolvedValue({ data: { variant_a: 'Message fictif A', variant_b: 'Variante' }, error: null });
    render(<ContactsPage />); await openGenerator(); await generate();
    await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.success).not.toHaveBeenCalled();
    expect(m.query.mock.calls.some(([q]) => q.op === 'update')).toBe(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('reprend la relance après un succès partiel sans dupliquer l’historique', async () => {
    setupProspect(); const original = m.query.getMockImplementation()!; let fail = true;
    m.query.mockImplementation(q => q.op === 'update' && fail ? { data: null, error: { message: 'fixture' } } : original(q));
    m.invoke.mockResolvedValue({ data: { variant_a: 'Message fictif A', variant_b: 'Variante' }, error: null });
    render(<ContactsPage />); await openGenerator(); await generate();
    await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith(expect.stringContaining('relance non enregistrée')));
    expect(m.success).not.toHaveBeenCalled();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Message envoyé' }));
    await waitFor(() => expect(m.success).toHaveBeenCalledWith('✅ Message noté !'));
    expect(m.query.mock.calls.filter(([q]) => q.op === 'insert')).toHaveLength(1);
  });
});

describe('Contacts: portée personnelle et conservation', () => {
  it('limite le mode personnel aux lignes sans espace et les mutations au contact demandé', async () => {
    m.workspace = '';
    m.query.mockImplementation(q => ({ data: q.op === 'update' ? contact('legacy') : [contact('legacy')], error: null }));
    render(<ContactsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Fait' }));
    await waitFor(() => expect(m.success).toHaveBeenCalled());
    expect(m.query.mock.calls[0][0].filters).toEqual([['user_id', 'user-test'], ['workspace_id', null]]);
    expect(m.query.mock.calls[1][0].filters).toEqual([['id', 'legacy'], ['user_id', 'user-test'], ['workspace_id', null]]);
  });
  it('garde les contacts ayant reçu une ressource visibles dans le pipeline', async () => {
    setupRead([{ ...contact('A', 'prospect'), prospect_stage: 'resource_sent' }]);
    render(<ContactsPage />);
    await screen.findByRole('tab', { name: 'Mes prospects' }); await switchProspects();
    expect(screen.getByText('Contact A')).toBeInTheDocument();
    expect(screen.getByText('Ressource envoyée')).toBeInTheDocument();
  });
  it('ne supprime pas la fiche si aucune ligne ne confirme la suppression', async () => {
    setupProspect(); const original = m.query.getMockImplementation()!;
    m.query.mockImplementation(q => q.op === 'delete' ? { data: null, error: null } : original(q));
    render(<ContactsPage />); await openDetail();
    const dialog = screen.getByRole('dialog');
    const button = Array.from(dialog.querySelectorAll('button')).find(b => b.querySelector('.lucide-trash2'))!;
    await userEvent.click(button);
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const query = m.query.mock.calls.find(([q]) => q.op === 'delete')![0];
    expect(query.filters).toEqual([['id', 'A'], ['workspace_id', 'A']]);
  });
  it('ajoute l’historique dans l’espace du contact sans toucher les autres champs', async () => {
    setupProspect(); render(<ContactsPage />); await openDetail();
    await screen.findByText(/Historique conservé/);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une interaction' }));
    await userEvent.type(screen.getByLabelText('Détail de l’interaction (optionnel)'.replace('’', "'")), 'Note fictive');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(m.query.mock.calls.some(([q]) => q.op === 'update')).toBe(true));
    const query = m.query.mock.calls.find(([q]) => q.op === 'insert')![0];
    expect(query.payload).toMatchObject({ contact_id: 'A', workspace_id: 'A', content: 'Note fictive' });
    expect(Object.keys(m.query.mock.calls.find(([q]) => q.op === 'update')![0].payload)).toEqual(['last_interaction_at']);
  });
  it('ne reprend pas un formulaire ou un DM en revenant de B vers A', async () => {
    setupProspect(); const view = render(<ContactsPage />); await openGenerator();
    await userEvent.type(screen.getByLabelText(/Copie-colle ici/), 'Brouillon A');
    m.workspace = 'B'; view.rerender(<ContactsPage />);
    await screen.findByRole('tab', { name: 'Mes prospects' });
    m.workspace = 'A'; view.rerender(<ContactsPage />);
    await openGenerator();
    expect(screen.getByLabelText(/Copie-colle ici/)).toHaveValue('');
  });
});

it('une confirmation DM tardive ne ferme pas le nouveau dialogue du même espace', async () => {
  setupProspect(); const original = m.query.getMockImplementation()!; const slow = deferred();
  m.query.mockImplementation(q => q.table === 'contacts' && q.op === 'select' ? { data: [contact('A', 'prospect'), contact('A2', 'prospect')], error: null } : q.op === 'insert' ? slow.promise : original(q));
  m.invoke.mockResolvedValue({ data: { variant_a: 'Message fictif A', variant_b: 'Variante' }, error: null });
  render(<ContactsPage />); await openGenerator(); await generate();
  await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
  await waitFor(() => expect(m.query.mock.calls.some(([q]) => q.op === 'insert')).toBe(true));
  await userEvent.click(screen.getByRole('button', { name: /Close|Fermer/ }));
  await userEvent.click(screen.getAllByRole('button', { name: 'DM' })[1]);
  await screen.findByLabelText(/Copie-colle ici/);
  expect(screen.getByText(/DM pour @fiction_A2/)).toBeInTheDocument();
  await act(async () => slow.resolve({ data: { id: 'interaction-fixture' }, error: null }));
  expect(screen.getByText(/DM pour @fiction_A2/)).toBeInTheDocument();
  expect(m.success).not.toHaveBeenCalled();
  expect(m.query.mock.calls.some(([q]) => q.op === 'update')).toBe(false);
});

it('conserve le reçu d’historique accepté après fermeture pour reprendre sans doublon', async () => {
  setupProspect(); const original = m.query.getMockImplementation()!; const slow = deferred();
  m.query.mockImplementation(q => q.op === 'insert' ? slow.promise : original(q));
  m.invoke.mockResolvedValue({ data: { variant_a: 'Message fictif A', variant_b: 'Variante' }, error: null });
  render(<ContactsPage />); await openGenerator(); await generate();
  await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
  await waitFor(() => expect(m.query.mock.calls.some(([q]) => q.op === 'insert')).toBe(true));
  await userEvent.click(screen.getByRole('button', { name: /Close|Fermer/ }));
  await act(async () => slow.resolve({ data: { id: 'interaction-fixture' }, error: null }));
  await userEvent.click(screen.getAllByRole('button', { name: 'DM' })[0]);
  await screen.findByLabelText(/Copie-colle ici/); await generate();
  await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
  await waitFor(() => expect(m.success).toHaveBeenCalledWith('✅ Message noté !'));
  expect(m.query.mock.calls.filter(([q]) => q.op === 'insert')).toHaveLength(1);
});

it('deux messages réellement confirmés avec le même texte gardent chacun leur historique', async () => {
  setupProspect(); m.invoke.mockResolvedValue({ data: { variant_a: 'Message fictif A', variant_b: 'Variante' }, error: null });
  render(<ContactsPage />); await openGenerator(); await generate();
  await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
  await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getAllByRole('button', { name: 'DM' })[0]);
  await screen.findByLabelText(/Copie-colle ici/); await generate();
  await userEvent.click(await screen.findByRole('button', { name: 'Message envoyé' }));
  await waitFor(() => expect(m.success).toHaveBeenCalledTimes(2));
  expect(m.query.mock.calls.filter(([q]) => q.op === 'insert')).toHaveLength(2);
});
