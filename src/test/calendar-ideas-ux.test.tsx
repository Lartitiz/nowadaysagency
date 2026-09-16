import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'user' }, scope: 'A', list: vi.fn(), rpc: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/contexts/DemoContext', () => ({ useDemoContext: () => ({ isDemoMode: false }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceFilter: () => ({ column: 'workspace_id', value: state.scope }), useWorkspaceId: () => state.scope }));
vi.mock('@/components/ui/input-with-voice', () => ({ InputWithVoice: (props: any) => <input {...props}/> }));
vi.mock('@/components/ui/textarea-with-voice', () => ({ TextareaWithVoice: (props: any) => <textarea {...props}/> }));
vi.mock('@/components/ui/calendar', () => ({ Calendar: ({ onSelect }: any) => <button onClick={() => onSelect(new Date(2026, 9, 25))}>25 octobre test</button> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
 rpc: (...args: any[]) => state.rpc(...args),
 from: () => {
  let scope: string;
  const q: any = { select: () => q, eq: (_: string, value: string) => { scope = value; return q; }, is: () => q, order: () => state.list(scope) };
  return q;
 }
} }));
import { CalendarIdeasSidebar } from '@/components/calendar/CalendarIdeasSidebar';
const idea = { id: 'rich', titre: 'Carrousel enregistré', format: 'carousel', canal: 'linkedin', status: 'ready', content_draft: null, content_data: { slides: [{ id: 's2', title: 'Deux' }, { id: 's1', title: 'Un' }], visual_urls: ['https://example.test/2.png'], custom: 'keep' }, updated_at: '2026-09-16T10:00:00Z' };
function deferred() { let resolve!: (v: any) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function App({ refreshed = 0, onPlanned = vi.fn(), onOpen = vi.fn() }) { return <MemoryRouter><CalendarIdeasSidebar refreshKey={refreshed} onIdeaPlanned={onPlanned} onIdeaClick={onOpen}/></MemoryRouter>; }
beforeEach(() => { state.scope = 'A'; state.list.mockReset().mockResolvedValue({ data: [idea], error: null }); state.rpc.mockReset(); });
afterEach(cleanup);
it('desktop click placement preserves rich content and only refreshes after a confirmed receipt', async () => {
 const pending = deferred(); state.rpc.mockReturnValue(pending.promise);
 const onPlanned = vi.fn(), onOpen = vi.fn(); render(<App onPlanned={onPlanned} onOpen={onOpen}/>);
 fireEvent.click(await screen.findByRole('button', { name: idea.titre }));
 expect(onOpen).toHaveBeenCalledWith(idea); expect(state.rpc).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Placer' }));
 fireEvent.click(screen.getByText('25 octobre test'));
 fireEvent.click(screen.getByRole('button', { name: 'Placer le 25 octobre' }));
 expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
 expect(onPlanned).not.toHaveBeenCalled();
 const [method, payload] = state.rpc.mock.calls[0];
 expect(method).toBe('plan_saved_idea'); expect(payload.p_idea_id).toBe('rich'); expect(payload.p_date).toBe('2026-10-25');
 expect(payload.p_expected_updated_at).toBe(idea.updated_at);
 expect(payload.p_payload.story_sequence_detail.slides).toEqual(idea.content_data.slides);
 expect(payload.p_payload.media_urls).toEqual(idea.content_data.visual_urls);
 expect(payload.p_payload.canal).toBe('linkedin');
 await act(async () => pending.resolve({ data: { id: 'post', date: '2026-10-25', replayed: false }, error: null }));
 await waitFor(() => expect(onPlanned).toHaveBeenCalledTimes(1));
});
it('a rejected placement keeps the date and idea available for retry', async () => {
 state.rpc.mockResolvedValue({ error: new Error('offline') }); const onPlanned = vi.fn(); render(<App onPlanned={onPlanned}/>);
 fireEvent.click(await screen.findByRole('button', { name: 'Placer' }));
 fireEvent.click(screen.getByText('25 octobre test'));
 fireEvent.click(screen.getByRole('button', { name: 'Placer le 25 octobre' }));
 await waitFor(() => expect(screen.getByRole('button', { name: 'Placer le 25 octobre' })).toBeEnabled());
 expect(onPlanned).not.toHaveBeenCalled(); expect(screen.getByRole('dialog')).toBeVisible();
});
it('failed reads are errors, not an empty list; retry restores the list', async () => {
 state.list.mockResolvedValueOnce({ data: null, error: new Error('offline') }); render(<App/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
 expect(screen.queryByText('Aucune idée en attente')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
 expect(await screen.findByRole('button', { name: idea.titre })).toBeVisible();
});
it('late refresh and A → B → A responses cannot replace the current list', async () => {
 const old = deferred(), newest = deferred(); state.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(newest.promise);
 const view = render(<App/>); view.rerender(<App refreshed={1}/>);
 await act(async () => newest.resolve({ data: [{ ...idea, titre: 'Version récente' }] }));
 await act(async () => old.resolve({ data: [{ ...idea, titre: 'Version ancienne' }] }));
 expect(screen.queryByText('Version ancienne')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Version récente' })).toBeVisible();
 const lateA = deferred(); state.list.mockReturnValueOnce(lateA.promise);
 view.rerender(<App refreshed={2}/>);
 state.scope = 'B'; state.list.mockResolvedValueOnce({ data: [] }); view.rerender(<App/>);
 await screen.findByText('Aucune idée en attente');
 state.scope = 'A'; state.list.mockResolvedValueOnce({ data: [{ ...idea, titre: 'Nouvelle visite A' }] }); view.rerender(<App/>);
 await screen.findByRole('button', { name: 'Nouvelle visite A' });
 await act(async () => lateA.resolve({ data: [{ ...idea, titre: 'Ancienne visite A' }] }));
 expect(screen.queryByText('Ancienne visite A')).not.toBeInTheDocument();
});
