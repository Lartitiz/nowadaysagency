import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readIdeaList } from '@/lib/idea-list-read';

const state = vi.hoisted(() => ({ ready: true, scope: 'A', column: 'workspace_id', read: vi.fn(), rpc: vi.fn(), full: vi.fn(), selects: [] as string[] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({
  useWorkspaceReady: () => state.ready,
  useWorkspaceFilter: () => ({ column: state.column, value: state.scope }),
  useWorkspaceId: () => state.scope,
}));
vi.mock('@/components/AppHeader', () => ({ default: () => null }));
vi.mock('@/components/ContentPreview', () => ({ ContentPreview: () => null }));
vi.mock('@/components/calendar/CalendarIdeasSidebar', () => ({ AddIdeaDialog: () => null }));
vi.mock('@/components/ui/textarea-with-voice', () => ({ TextareaWithVoice: (props: any) => <textarea {...props} /> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: any[]) => state.rpc(...args), from: (table: string) => {
  const filters: any[] = [];
  const query: any = {
    select: (columns: string) => { state.selects.push(columns); return query; },
    not: () => query, neq: () => query,
    maybeSingle: () => state.full(filters),
    // Lectures « a-t-elle un contenu ? » (identifiants seulement).
    then: (ok: any, ko: any) => Promise.resolve({ data: [], error: null }).then(ok, ko),
    abortSignal: () => query,
    eq: (column: string, value: string) => { filters.push(['eq', column, value]); return query; },
    is: (column: string, value: null) => { filters.push(['is', column, value]); return query; },
    order: () => state.read(table, filters),
  };
  return query;
} } }));
import IdeasPage from '@/pages/IdeasPage';

const idea = { id: 'idea', titre: 'Idée conservée', format: 'post', canal: 'instagram', status: 'todo', created_at: '2026-09-16T10:00:00Z' };
const brief = { id: 'brief', subject: 'Brief conservé', created_at: '2026-09-16T10:00:00Z' };
const success = (table: string) => ({ data: table === 'saved_ideas' ? [idea] : [brief], error: null });
const page = () => <MemoryRouter><IdeasPage /></MemoryRouter>;
function deferred() { let resolve!: (value: any) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  state.ready = true; state.scope = 'A'; state.column = 'workspace_id'; state.selects = [];
  state.read.mockReset().mockImplementation(success);
  state.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('waits for the workspace instead of querying the temporary personal scope', async () => {
  state.ready = false; state.scope = 'user'; state.column = 'user_id';
  const view = render(page());
  expect(state.read).not.toHaveBeenCalled();
  expect(screen.getByTestId('ideas-summary')).toHaveTextContent('Chargement');
  state.ready = true; state.scope = 'A'; state.column = 'workspace_id'; view.rerender(page());
  await screen.findByRole('button', { name: idea.titre });
  expect(state.read).toHaveBeenCalledTimes(2);
  expect(state.read.mock.calls.every(([, filters]) => filters.some((f: any[]) => f.join('|') === 'eq|workspace_id|A'))).toBe(true);
});

it('recovers a transient error automatically, retrying only the failed collection', async () => {
  let ideasReads = 0;
  state.read.mockImplementation(table => table === 'saved_ideas' && ideasReads++ === 0
    ? { data: null, error: { message: 'Failed to fetch' } } : success(table));
  render(page());
  await screen.findByRole('button', { name: idea.titre }, { timeout: 2000 });
  expect(screen.getByRole('button', { name: brief.subject })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(state.read.mock.calls.filter(([table]) => table === 'saved_ideas')).toHaveLength(2);
  expect(state.read.mock.calls.filter(([table]) => table === 'content_briefs')).toHaveLength(1);
});

it('keeps a successful collection and offers manual retry after a permission error', async () => {
  state.read.mockImplementation(table => table === 'saved_ideas'
    ? { data: null, error: { message: 'permission denied', code: '42501' }, status: 403 } : success(table));
  render(page());
  expect(await screen.findByRole('alert')).toHaveTextContent('incomplète');
  expect(screen.getByRole('button', { name: brief.subject })).toBeVisible();
  expect(state.read).toHaveBeenCalledTimes(2);
  state.read.mockImplementation(success);
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await screen.findByRole('button', { name: idea.titre });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('distinguishes a real empty result from failed reads and preserves personal filters', async () => {
  state.column = 'user_id'; state.scope = 'user'; state.read.mockResolvedValue({ data: [], error: null });
  render(page());
  await screen.findByText('Une idée peut commencer par quelques mots');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  for (const [, filters] of state.read.mock.calls) expect(filters).toContainEqual(['is', 'workspace_id', null]);
});

it('late reads from A cannot replace a new visit after A → B → A', async () => {
  const old = deferred();
  state.read.mockImplementation(() => old.promise);
  const view = render(page());
  state.scope = 'B'; state.read.mockResolvedValue({ data: [], error: null }); view.rerender(page());
  await screen.findByText('Une idée peut commencer par quelques mots');
  state.scope = 'A'; state.read.mockImplementation(success); view.rerender(page());
  await screen.findByRole('button', { name: idea.titre });
  await act(async () => old.resolve({ data: [{ ...idea, titre: 'Ancienne visite A' }], error: null }));
  expect(screen.queryByText('Ancienne visite A')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: idea.titre })).toBeVisible();
});

it.each([
  { error: { code: '57014', message: 'statement cancelled' } },
  { error: { message: 'service unavailable' }, status: 503 },
  { error: { message: 'Lock acquire timed out' } },
  { error: { message: 'signal is aborted without reason' } },
])('bounds transient retries to two read attempts: %j', async failure => {
  vi.useFakeTimers(); const read = vi.fn().mockResolvedValue({ data: null, ...failure });
  const pending = readIdeaList(read, () => true);
  await vi.runAllTimersAsync();
  expect((await pending).error).toEqual(failure.error);
  expect(read).toHaveBeenCalledTimes(2);
});

it('cancels the pending automatic retry when the visit is no longer current', async () => {
  vi.useFakeTimers(); let current = true;
  const read = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  const pending = readIdeaList(read, () => current);
  await Promise.resolve(); current = false;
  await vi.runAllTimersAsync(); await pending;
  expect(read).toHaveBeenCalledOnce();
});

it('preserves the last successfully loaded list when a manual refresh fails', async () => {
  state.read.mockImplementation(table => table === 'content_briefs'
    ? { data: null, error: { code: '42501', message: 'permission denied' } } : success(table));
  render(page());
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: idea.titre })).toBeVisible();
  state.read.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: idea.titre })).toBeVisible();
});

it('StrictMode still finishes loading without duplicate rows', async () => {
  render(<React.StrictMode>{page()}</React.StrictMode>);
  await screen.findByRole('button', { name: idea.titre });
  expect(screen.getByTestId('ideas-summary')).toHaveTextContent('2 élément');
  expect(screen.getAllByRole('button', { name: idea.titre })).toHaveLength(1);
});

it.each([400, 401, 403, 404])('does not automatically retry HTTP %s even with timeout wording', async status => {
  const read = vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' }, status });
  await readIdeaList(read, () => true);
  expect(read).toHaveBeenCalledOnce();
});

it('times out stuck reads, aborts each request and never mistakes a late response for success', async () => {
  vi.useFakeTimers(); const first = deferred(); const second = deferred();
  const read = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const pending = readIdeaList(read, () => true);
  await vi.advanceTimersByTimeAsync(30800);
  const result = await pending;
  expect(result.data).toBeNull(); expect(result.error).toBeInstanceOf(Error);
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls.every(([signal]) => signal.aborted)).toBe(true);
  first.resolve({ data: [idea], error: null }); second.resolve({ data: [idea], error: null });
  await Promise.resolve();
  expect(result.data).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it('the list never downloads idea contents and shows the server-side preview', async () => {
  state.rpc.mockResolvedValue({ data: [{ id: 'idea', preview: { slides: [{ title: 'Aperçu calculé par la base' }] }, draft_head: null }], error: null });
  render(page());
  expect(await screen.findByText(/Aperçu calculé par la base/)).toBeVisible();
  const listSelect = state.selects.find(c => c.includes('titre'))!;
  expect(listSelect).not.toMatch(/content_data|content_draft|\*/);
  expect(state.rpc).toHaveBeenCalledWith('saved_idea_previews', { p_ids: ['idea'] });
});

it('a failing preview read keeps the list visible without error', async () => {
  state.rpc.mockResolvedValue({ data: null, error: { message: 'function missing' } });
  render(page());
  expect(await screen.findByRole('button', { name: idea.titre })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('opening an idea reads its full content once, by id', async () => {
  state.full.mockResolvedValue({ data: { ...idea, content_draft: 'Texte complet', content_data: null }, error: null });
  render(page());
  fireEvent.click(await screen.findByRole('button', { name: idea.titre }));
  await waitFor(() => expect(state.full).toHaveBeenCalledTimes(1));
  expect(state.full.mock.calls[0][0]).toContainEqual(['eq', 'id', 'idea']);
  expect(await screen.findByRole('dialog')).toBeVisible();
});
