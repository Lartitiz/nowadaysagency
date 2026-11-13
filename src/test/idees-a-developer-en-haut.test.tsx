import React from 'react';
// Choix I8 du chantier S (18/10/2026) : dans Mes idées, les idées encore sans
// contenu passent en haut (celles du diagnostic d'abord), puis les contenus.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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


const row = (id: string, titre: string, extra: Record<string, unknown>) => ({ id, titre, format: 'carousel', canal: 'instagram', status: 'to_explore', ...extra });
const IDEAS = [
  row('neuf', 'Carrousel tout neuf', { status: 'drafting', has_content: true, created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z' }),
  row('gardee', 'Idée gardée récente', { has_content: false, created_at: '2026-10-10T10:00:00Z' }),
  row('diag2', 'Deuxième idée du diagnostic', { has_content: false, source_module: 'diagnostic', created_at: '2026-08-01T10:05:00Z', updated_at: '2026-10-18T09:00:00Z' }),
  row('diag', 'Idée du diagnostic', { has_content: false, source_module: 'diagnostic', created_at: '2026-08-01T10:00:00Z' }),
  row('cal', 'Déjà au calendrier', { status: 'planned', calendar_post_id: 'p1', created_at: '2026-10-17T10:00:00Z' }),
];
const BRIEF = { id: 'brief', subject: 'Demande commencée', created_at: '2026-10-16T10:00:00Z' };
beforeEach(() => {
  state.ready = true; state.scope = 'A'; state.column = 'workspace_id'; state.selects = [];
  state.read.mockReset().mockImplementation((table: string) => ({ data: table === 'saved_ideas' ? IDEAS : [BRIEF], error: null }));
  state.rpc.mockReset().mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

it('met les idées à développer en haut, le diagnostic d’abord, puis les contenus commencés', async () => {
  render(<MemoryRouter initialEntries={['/idees?vue=all']}><IdeasPage /></MemoryRouter>);
  const list = await screen.findByTestId('ideas-list');
  const todo = screen.getByTestId('ideas-todo-list');
  const titles = (ul: HTMLElement) => Array.from(ul.children).filter((el) => el.tagName === 'LI').map((li) => li.querySelector('h3')?.textContent);
  await waitFor(() => expect(titles(list)).toHaveLength(3));
  expect(titles(todo)).toEqual(['Idée du diagnostic', 'Deuxième idée du diagnostic', 'Idée gardée récente']);
  expect(titles(list)).toEqual(['Demande commencée', 'Carrousel tout neuf', 'Déjà au calendrier']);
  expect(screen.getByTestId('ideas-todo-heading')).toHaveTextContent('Tes idées à développer (3)');
  expect(screen.getByTestId('ideas-contents-heading')).toHaveTextContent('Tes contenus (3)');
});

// Vignettes à la Canva (13/11/2026) : une idée sans contenu n'a pas de faux
// visuel ; un contenu montre sa slide 1, sa story 1 ou le début de son texte.
it('montre la slide 1 des contenus qui en ont une, une page texte sinon, rien pour les idées', async () => {
  state.read.mockReset().mockImplementation((table: string) => ({ data: table === 'saved_ideas' ? [
    row('slide', 'Carrousel avec visuels', { status: 'drafting', has_content: true, created_at: '2026-10-18T10:00:00Z', cover: { kind: 'slide', html: '<div>Slide 1</div>', count: 8 } }),
    row('texte', 'Post sans visuel', { format: 'post', status: 'drafting', has_content: true, created_at: '2026-10-17T10:00:00Z', preview_data: { body: 'Le début de mon post' } }),
    row('vide', 'Idée sans contenu', { has_content: false, created_at: '2026-10-16T10:00:00Z' }),
  ] : [], error: null }));
  render(<MemoryRouter initialEntries={['/idees?vue=all']}><IdeasPage /></MemoryRouter>);
  const list = await screen.findByTestId('ideas-list');
  await waitFor(() => expect(list.querySelectorAll('[data-testid="idea-cover"]')).toHaveLength(2));
  const covers = Array.from(list.querySelectorAll('[data-testid="idea-cover"]'));
  expect(covers.map((c) => c.getAttribute('data-cover'))).toEqual(['slide', 'text']);
  expect(covers[0]).toHaveTextContent('1/8');
  expect(covers[1]).toHaveTextContent('Le début de mon post');
  expect(screen.getByTestId('ideas-todo-list').querySelector('[data-testid="idea-cover"]')).toBeNull();
  expect(state.selects.some((c) => c.includes('cover'))).toBe(true);
});
