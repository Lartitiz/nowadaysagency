import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
const m = vi.hoisted(() => ({ workspace: 'A', user: 'u', role: 'owner', ready: true, query: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn(), invoke: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: m.user ? { id: m.user } : null }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ activeRole: m.role }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceFilter: () => ({ column: m.workspace ? 'workspace_id' : 'user_id', value: m.workspace || m.user }), useWorkspaceReady: () => m.ready }));
vi.mock('@/hooks/use-branding', () => ({ useBrandProposition: () => ({ data: null }) }));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/SubPageHeader', () => ({ default: () => null }));
vi.mock('@/components/AiGeneratedMention', () => ({ default: () => null }));
vi.mock('@/components/ui/input-with-voice', () => ({ InputWithVoice: (p: any) => <input {...p} /> }));
vi.mock('@/components/ui/textarea-with-voice', () => ({ TextareaWithVoice: (p: any) => <textarea {...p} /> }));
vi.mock('@/lib/invoke-with-timeout', () => ({ invokeWithTimeout: m.invoke }));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: m.rpc, from: (table: string) => {
  const q = { table, filters: [] as any[], order: '' };
  const chain: any = { select: () => chain, maybeSingle: () => chain, gte: () => chain, lte: () => chain, eq: (k: string, v: any) => { q.filters.push([k,v]); return chain; }, is: (k: string, v: any) => { q.filters.push([k,v]); return chain; }, order: (key: string) => { q.order = key; return chain; }, then: (ok: any, fail: any) => Promise.resolve().then(() => m.query(q)).then(ok, fail) };
  return chain;
} } }));
import { usePinterestEditor } from '@/hooks/use-pinterest-editor';
import PinterestMotsCles from '@/pages/PinterestMotsCles';
import PinterestTableaux from '@/pages/PinterestTableaux';
import PinterestRoutine from '@/pages/PinterestRoutine';
import PinterestCompte from '@/pages/PinterestCompte';
import PinterestEpingles from '@/pages/PinterestEpingles';
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
const kw = (scope: string) => ({ id: `kw-${scope}`, user_id: 'u', workspace_id: scope, keywords_raw: `Mots ${scope}`, keywords_product: [], keywords_need: [], keywords_inspiration: ['Inspiration'], keywords_english: ['English'], checklist_bio: true });
const board = { id: 'board-A', user_id: 'u', workspace_id: 'A', name: 'Original', description: 'Description', board_type: 'coulisses', sort_order: 0 };
beforeEach(() => { vi.clearAllMocks(); m.workspace = 'A'; m.user = 'u'; m.role = 'owner'; m.ready = true; m.query.mockResolvedValue({ data: [], error: null }); m.rpc.mockImplementation((_name, p) => Promise.resolve({ data: p.p_rows, error: null })); });
afterEach(cleanup);
describe('Pinterest exact scope, requests and receipts', () => {
  it('R3 reloads A → B empty → A and never sends A id to B', async () => {
    m.query.mockImplementation(q => ({ data: q.filters.some(([k,v]: any) => k === 'workspace_id' && v === 'A') ? [kw('A')] : [], error: null }));
    const view = render(<PinterestMotsCles />); await screen.findByDisplayValue('Mots A');
    m.workspace = 'B'; view.rerender(<PinterestMotsCles />);
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mots B' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
    expect(m.rpc.mock.calls[0][1]).toMatchObject({ p_workspace_id: 'B', p_expected: [], p_rows: [{ keywords_raw: 'Mots B' }] });
    expect(m.rpc.mock.calls[0][1].p_rows[0].id).not.toBe('kw-A');
    m.workspace = 'A'; view.rerender(<PinterestMotsCles />); await screen.findByDisplayValue('Mots A');
  });
  it('restores unsaved A draft, including cleared fields, on A → B → A', async () => {
    m.query.mockResolvedValue({ data: [kw('A')], error: null });
    const view = render(<PinterestMotsCles />); await screen.findByDisplayValue('Mots A');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    m.workspace = 'B'; view.rerender(<PinterestMotsCles />); await waitFor(() => expect(m.query).toHaveBeenCalledTimes(2));
    m.workspace = 'A'; view.rerender(<PinterestMotsCles />); await waitFor(() => expect(m.query).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
  it('ignores late first A read after B and a new A visit', async () => {
    const slow = deferred(); m.query.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ data: [kw('B')], error: null }).mockResolvedValueOnce({ data: [kw('new-A')], error: null });
    const view = render(<PinterestMotsCles />); await waitFor(() => expect(m.query).toHaveBeenCalledTimes(1));
    m.workspace = 'B'; view.rerender(<PinterestMotsCles />); await screen.findByDisplayValue('Mots B');
    m.workspace = 'A'; view.rerender(<PinterestMotsCles />); await screen.findByDisplayValue('Mots new-A');
    await act(async () => slow.resolve({ data: [kw('old-A')], error: null }));
    expect(screen.getByRole('textbox')).toHaveValue('Mots new-A');
  });
  it.each(['error','reject'])('read %s blocks saving and supports retry', async mode => {
    m.query.mockImplementationOnce(() => mode === 'error' ? { data: null, error: { message: 'unavailable' } } : Promise.reject(new Error('unavailable')));
    render(<PinterestMotsCles />); await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer la lecture/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Enregistrer/ })).not.toBeDisabled());
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(['error','empty','reject'])('save %s preserves fields and reports no success', async mode => {
    m.query.mockResolvedValue({ data: [kw('A')], error: null });
    m.rpc.mockImplementationOnce(() => mode === 'reject' ? Promise.reject(new Error('failure')) : { data: mode === 'empty' ? [] : null, error: mode === 'error' ? { message: 'failure' } : null });
    render(<PinterestMotsCles />); await screen.findByDisplayValue('Mots A');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ })); await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(screen.getByRole('textbox')).toHaveValue('Draft'); expect(m.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ })); await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
    expect(m.rpc.mock.calls[1][1].p_rows).toEqual(m.rpc.mock.calls[0][1].p_rows);
  });
  it('retains inspiration-only and English categories with checklist on save', async () => {
    m.query.mockResolvedValue({ data: [kw('A')], error: null }); render(<PinterestMotsCles />);
    await screen.findByText('Inspiration'); expect(screen.getByText('English')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(m.rpc.mock.calls[0][1].p_rows[0]).toMatchObject({ keywords_inspiration: ['Inspiration'], keywords_english: ['English'], checklist_bio: true });
  });
  it('waits for workspace resolution and uses user+NULL for personal rows', async () => {
    m.ready = false; m.workspace = '';
    const view = renderHook(() => usePinterestEditor('pinterest_boards'));
    expect(m.query).not.toHaveBeenCalled(); m.ready = true; view.rerender();
    await waitFor(() => expect(m.query).toHaveBeenCalledTimes(1));
    expect(m.query.mock.calls[0][0].filters).toEqual([['user_id','u'],['workspace_id',null]]);
  });
  it.each(['viewer','editor'])('%s is read-only', async role => {
    m.role = role; render(<PinterestMotsCles />); await screen.findByText('Lecture seule');
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled(); expect(m.rpc).not.toHaveBeenCalled();
  });
  it('manager writes own creator rows in exact workspace', async () => {
    m.role = 'manager'; const view = renderHook(() => usePinterestEditor('pinterest_boards'));
    await waitFor(() => expect(view.result.current.disabled).toBe(false));
    await act(async () => { await view.result.current.save([{ id: 'new', name: 'Manager' }]); });
    expect(m.query.mock.calls[0][0].filters).toContainEqual(['user_id','u']); expect(m.rpc.mock.calls[0][1].p_workspace_id).toBe('A');
  });
  it('clears state and prevents old callbacks after account change', async () => {
    m.query.mockResolvedValueOnce({ data: [kw('A')], error: null }); const view = renderHook(() => usePinterestEditor('pinterest_keywords', { keywords_raw: '' }));
    await waitFor(() => expect(view.result.current.disabled).toBe(false)); const old = view.result.current;
    m.user = 'other'; view.rerender(); expect(view.result.current.rows[0].keywords_raw).toBe('');
    await act(async () => { await old.save(); }); expect(m.rpc).not.toHaveBeenCalled();
  });
  it('singletons with historical duplicates do not overwrite or delete them', async () => {
    m.query.mockResolvedValue({ data: [kw('A'), kw('A2')], error: null }); render(<PinterestMotsCles />);
    await screen.findByText(/Plusieurs fiches existent/); expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });
  it('a save receipt in A does not appear in B, returning A waits then rehydrates', async () => {
    const slow = deferred(); m.rpc.mockReturnValueOnce(slow.promise);
    const view = renderHook(() => usePinterestEditor('pinterest_boards'));
    await waitFor(() => expect(view.result.current.disabled).toBe(false));
    act(() => { void view.result.current.save([{ id: 'new-A', name: 'Draft A' }]); });
    m.workspace = 'B'; view.rerender(); await waitFor(() => expect(view.result.current.disabled).toBe(false));
    expect(view.result.current.rows).toEqual([]);
    await act(async () => slow.resolve({ data: [{ id: 'new-A', name: 'Draft A' }], error: null }));
    expect(view.result.current.rows).toEqual([]); expect(m.success).not.toHaveBeenCalled();
    m.query.mockResolvedValue({ data: [{ id: 'new-A', name: 'Draft A' }], error: null });
    m.workspace = 'A'; view.rerender(); await waitFor(() => expect(view.result.current.rows[0]?.id).toBe('new-A'));
  });
});
describe('Pinterest profile, boards, routine and pins', () => {
  it('boards preserve stable IDs, types and descriptions across edits/saves, deletion is staged', async () => {
    m.query.mockResolvedValue({ data: [board], error: null }); render(<PinterestTableaux />); await screen.findByDisplayValue('Original');
    fireEvent.change(screen.getByLabelText('Nom du tableau 1'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ })); await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Description du tableau 1'), { target: { value: 'Second description' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ })); await waitFor(() => expect(m.success).toHaveBeenCalledTimes(2));
    expect(m.rpc.mock.calls[1][1]).toMatchObject({ p_expected: [{ id: 'board-A', name: 'Updated' }], p_rows: [{ id: 'board-A', name: 'Updated', description: 'Second description', board_type: 'coulisses', sort_order: 0 }] });
    fireEvent.click(screen.getByRole('button', { name: /Supprimer le tableau 1/ })); expect(m.rpc).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ })); await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(3)); expect(m.rpc.mock.calls[2][1].p_rows).toEqual([]);
  });
  it('failed routine write keeps progress and retries same ID with workspace and month', async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } }); render(<PinterestRoutine />);
    await waitFor(() => expect(screen.getByRole('button', { name: /\+1 épingle/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /\+1 épingle/ })); await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(screen.getByText('1/5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer l’enregistrement/ })); await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
    expect(m.rpc.mock.calls[1][1]).toEqual(m.rpc.mock.calls[0][1]); expect(m.rpc.mock.calls[1][1].p_workspace_id).toBe('A'); expect(m.rpc.mock.calls[1][1].p_month).toMatch(/^\d{4}-\d{2}-01$/);
  });
  it('routine preserves already completed pins when changing rhythm', async () => {
    m.query.mockResolvedValue({ data: [{ id: 'routine', pins_done: 7, rhythm: '2h_biweekly' }], error: null }); render(<PinterestRoutine />);
    await screen.findByText('7/10'); fireEvent.click(screen.getByRole('button', { name: /2h par mois/ }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled()); expect(m.rpc.mock.calls[0][1].p_rows[0].pins_done).toBe(7);
  });
  it('profile keeps name, bio, URL and checklist in saved receipt', async () => {
    m.query.mockResolvedValue({ data: [{ id: 'profile', display_name: 'Name', bio: 'Bio', website_url: 'https://example.test', photo_done: true }], error: null });
    render(<PinterestCompte />); await screen.findByDisplayValue('Name'); fireEvent.change(screen.getByLabelText('Ta bio Pinterest'), { target: { value: 'Edited bio' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer mon profil/ })); await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(m.rpc.mock.calls[0][1].p_rows[0]).toMatchObject({ id: 'profile', bio: 'Edited bio', website_url: 'https://example.test', photo_done: true });
  });
  it('late AI alternatives from A never fill B or a later visit to A', async () => {
    const slow = deferred(); m.invoke.mockReturnValueOnce(slow.promise); const view = render(<PinterestCompte />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Suggérer un nom/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Suggérer un nom/ })); m.workspace = 'B'; view.rerender(<PinterestCompte />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Suggérer un nom/ })).not.toBeDisabled());
    m.workspace = 'A'; view.rerender(<PinterestCompte />);
    await act(async () => slow.resolve({ data: { content: '["Old suggestion"]' }, error: null }));
    expect(screen.queryByText('Old suggestion')).not.toBeInTheDocument();
  });
  it('pins generation draft stays scoped and existing links/variants/media survive deletion retry', async () => {
    const pin = { id: 'pin', title: 'Saved title', description: 'Text', link_url: 'https://example.test', variant_type: 'storytelling', media: { url: 'keep' } };
    m.query.mockImplementation(q => ({ data: q.table === 'pinterest_pins' ? [pin] : [board], error: null }));
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'failure' } }); render(<PinterestEpingles />); await screen.findByText('Saved title');
    fireEvent.click(screen.getByRole('button', { name: /Supprimer l'épingle/ })); await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.rpc.mock.calls[0][1].p_expected).toEqual([pin]); expect(screen.getByText('Saved title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Réessayer l’enregistrement/ })); await waitFor(() => expect(m.success).toHaveBeenCalled()); expect(screen.queryByText('Saved title')).not.toBeInTheDocument();
  });
});

it('later same-visit read wins over an earlier manual refresh', async () => {
  const slow = deferred();
  const view = renderHook(() => usePinterestEditor('pinterest_boards'));
  await waitFor(() => expect(view.result.current.disabled).toBe(false));
  m.query.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ data: [{ ...board, name: 'Latest' }], error: null });
  act(() => { void view.result.current.load(); });
  await waitFor(() => expect(m.query).toHaveBeenCalledTimes(2));
  await act(async () => { await view.result.current.load(); });
  await act(async () => slow.resolve({ data: [{ ...board, name: 'Old' }], error: null }));
  expect(view.result.current.rows[0].name).toBe('Latest');
});
it('pin retry keeps its ID, two separately confirmed saves remain distinct actions', async () => {
  m.invoke.mockResolvedValue({ data: { content: '[{"title":"Variant","description":"Description"}]' }, error: null });
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'failure' } });
  render(<PinterestEpingles />);
  await waitFor(() => expect(screen.getByLabelText("Sujet de l'épingle")).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Sujet de l'épingle"), { target: { value: 'Subject' } });
  fireEvent.click(screen.getByRole('button', { name: /Générer/ }));
  const save = await screen.findByRole('button', { name: /Sauvegarder cette épingle/ });
  fireEvent.click(save); await waitFor(() => expect(m.error).toHaveBeenCalled());
  const firstId = m.rpc.mock.calls[0][1].p_rows[0].id;
  fireEvent.click(save); await waitFor(() => expect(m.success).toHaveBeenCalledTimes(1));
  expect(m.rpc.mock.calls[1][1].p_rows[0].id).toBe(firstId);
  fireEvent.click(save); await waitFor(() => expect(m.success).toHaveBeenCalledTimes(2));
  expect(m.rpc.mock.calls[2][1].p_rows).toHaveLength(2);
  expect(m.rpc.mock.calls[2][1].p_rows[0].id).not.toBe(firstId);
});
