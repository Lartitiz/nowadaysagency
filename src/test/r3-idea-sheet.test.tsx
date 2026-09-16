import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ navigate: vi.fn(), writes: [] as any[], rpc: vi.fn(), row: null as any }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/use-workspace-query', () => ({ useWorkspaceId: () => 'space' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/components/ui/input-with-voice', () => ({ InputWithVoice: (props: any) => <input {...props}/> }));
vi.mock('@/components/ui/textarea-with-voice', () => ({ TextareaWithVoice: (props: any) => <textarea {...props}/> }));
vi.mock('@/components/ui/dropdown-menu', () => ({ DropdownMenu: ({children}: any) => <div>{children}</div>, DropdownMenuTrigger: ({children}: any) => <div>{children}</div>, DropdownMenuContent: ({children}: any) => <div>{children}</div>, DropdownMenuItem: ({children, onClick}: any) => <button onClick={onClick}>{children}</button>, DropdownMenuSeparator: () => null }));
vi.mock('@/components/ui/calendar', () => ({ Calendar: ({ onSelect }: any) => <button onClick={() => onSelect(new Date(2026, 9, 25))}>25 octobre test</button> }));
vi.mock('@/components/ui/sheet', () => ({ Sheet: ({ children }: any) => <div>{children}</div>, SheetContent: ({ children }: any) => <div>{children}</div>, SheetHeader: ({ children }: any) => <div>{children}</div>, SheetTitle: ({ children }: any) => <h2>{children}</h2>, SheetDescription: ({ children }: any) => <p>{children}</p> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: any[]) => state.rpc(...args), from: (table: string) => {
 const q: any = { select: () => q, eq: () => q, update: (payload: any) => {state.writes.push({ table, payload }); return q;}, insert: (payload: any) => {state.writes.push({ table, payload }); return q;}, single: async () => ({ data: { id: 'post', ...state.row }, error: null }), maybeSingle: async () => ({ data: state.row, error: null }), then: (resolve: any) => Promise.resolve({ data: { id: 'idea', ...state.row }, error: null }).then(resolve) }; return q;
} } }));
import { IdeaDetailSheet } from '@/components/calendar/IdeaDetailSheet';
const idea: any = { id: 'idea', titre: 'R3 riche', format: 'carousel', objectif: 'confiance', notes: '', status: 'ready', canal: 'linkedin', content_draft: 'Texte <strong>riche</strong>', content_data: { slides: [{ id: 's2', title: 'Deux' }, { id: 's1', title: 'Un' }], visual_urls: ['https://example.test/2.jpg', 'https://example.test/1.jpg'], custom: 'R3' }, updated_at: '2026-09-15T10:00:00Z' };
beforeEach(() => {state.writes=[]; state.navigate.mockReset(); state.row=idea; state.rpc.mockResolvedValue({ data: { id: 'post', date: '2026-10-25', replayed: false }, error: null });});
afterEach(cleanup);
it('R3 sheet planning carries structured data and channel through one confirmed transaction', async () => {
 render(<IdeaDetailSheet idea={idea} open onOpenChange={vi.fn()} onUpdated={vi.fn()} onPlanned={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button', { name: /Poser|Planifier/ }));
 fireEvent.click(screen.getByText('25 octobre test'));
 fireEvent.click(screen.getByRole('button', { name: /Planifier le/ }));
 await waitFor(() => expect(state.rpc).toHaveBeenCalled());
 const payload=state.rpc.mock.calls[0][1].p_payload;
 expect(payload.story_sequence_detail.slides).toEqual(idea.content_data.slides);
 expect(payload.media_urls).toEqual(idea.content_data.visual_urls);
 expect(payload.canal).toBe('linkedin');
 expect(state.writes.filter(w=>w.table==='calendar_posts')).toEqual([]);
});
it('R3 sheet resumes generated content through Creer without regenerating', async () => {
 render(<IdeaDetailSheet idea={idea} open onOpenChange={vi.fn()} onUpdated={vi.fn()} onPlanned={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button', {name: /Ouvrir l’éditeur|Créer|Reprendre/}));
 await waitFor(()=>expect(state.navigate).toHaveBeenCalled());
 const [route, args]=state.navigate.mock.calls[0];
 expect(route).toContain('/creer');
 expect(args.state.resumeIdea.raw.slides).toEqual(idea.content_data.slides);
 expect(args.state.ideaId).toBe('idea');
});
it('R3 historical string scripts open without a map crash', () => {
 expect(() => render(<IdeaDetailSheet idea={{...idea, format:'reel', content_data:{script:'Ancien script chaîne'}}} open onOpenChange={vi.fn()} onUpdated={vi.fn()} onPlanned={vi.fn()}/>)).not.toThrow();
});

it('opening a structured idea without text does not save an empty draft over its rich content', async () => {
 state.row={...idea,content_draft:null};
 render(<IdeaDetailSheet idea={state.row} open onOpenChange={vi.fn()} onUpdated={vi.fn()} onPlanned={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Ouvrir l’éditeur'}));
 await waitFor(()=>expect(state.navigate).toHaveBeenCalled());
 expect(state.writes[0].payload).not.toHaveProperty('content_draft');
 expect(state.navigate.mock.calls[0][1].state.resumeIdea.raw).not.toHaveProperty('edited_text');
 expect(state.navigate.mock.calls[0][1].state.resumeIdea.raw.slides).toEqual(idea.content_data.slides);
});
