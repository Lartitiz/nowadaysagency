import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), lookup: vi.fn(), upload: vi.fn(), signed: vi.fn(), remove: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => ({ insert: (row: any) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
    select: () => { const q = { eq: () => q, is: () => q, single: mocks.lookup }; return q; } }),
  storage: { from: (bucket: string) => ({ upload: (...args: any[]) => mocks.upload(bucket,...args),
    createSignedUrl: (...args: any[]) => mocks.signed(bucket,...args), remove: (paths: string[]) => mocks.remove(bucket,paths) }) },
} }));
vi.mock('@/lib/invoke-with-timeout', () => ({ invokeWithTimeout: mocks.invoke }));
import { generateCrosspost } from '@/lib/crosspost-generation';
import { createCrosspostSession, crosspostScope, readCrosspost, saveCrosspostCalendar, saveCrosspostIdea } from '@/lib/crosspost-persistence';

const result = { versions: { linkedin: { full_text: 'Texte original' }, reel: { script: 'Script intégral' } } };
const scope = crosspostScope('manager', 'workspace-a');
const input = { userId: 'manager', workspaceId: 'workspace-a', sourceType: 'libre', text: 'texte', mode: 'both' as const,
  files: [{ id: 'f', file: new File(['PDF'], 'source.pdf', { type: 'application/pdf' }), name: 'source.pdf', type: 'pdf' as const, uploading: false }], targets: ['linkedin'] };
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.upload.mockResolvedValue({ error: null }); mocks.signed.mockResolvedValue({ data: { signedUrl: 'https://signed.example/file' }, error: null });
  mocks.remove.mockResolvedValue({ error: null }); mocks.invoke.mockResolvedValue({ data: { content: JSON.stringify(result) }, error: null });
  mocks.rpc.mockImplementation(async (_name: string, args: any) => ({ data: { id: args.p_post_id, replayed: false, updated_at: 'now' }, error: null }));
  mocks.insert.mockImplementation(async row => ({ data: { id: row.id }, error: null }));
});
describe('crosspost file inputs and cleanup', () => {
  it.each(['text','files','both'] as const)('only sends selected mode %s, keeps private originals', async mode => {
    const received = vi.fn(); await generateCrosspost({ ...input, mode }, received);
    const body = mocks.invoke.mock.calls[0][1].body;
    expect(body.sourceContent).toBe(mode === 'files' ? '' : 'texte');
    expect(body.fileUrls.length).toBe(mode === 'text' ? 0 : 1);
    expect(received.mock.calls[0][0]).toEqual(result);
    if (mode !== 'text') {
      expect(mocks.remove).toHaveBeenCalledWith('crosspost-uploads', [expect.stringContaining('manager/crosspost-')]);
      expect(mocks.remove).not.toHaveBeenCalledWith('crosspost-sources', expect.anything());
      const sources = received.mock.calls[0][1].source_files;
      expect(sources[0].path).toMatch(/^workspace\/workspace-a\//);
      expect(JSON.stringify(sources)).not.toContain('signed.example');
    }
  });
  it('cleans uploaded path even if signed URL fails', async () => {
    mocks.signed.mockResolvedValue({ error: new Error('sign failed') });
    await expect(generateCrosspost(input, vi.fn())).rejects.toThrow('sign failed');
    expect(mocks.remove).toHaveBeenCalledWith('crosspost-uploads', [expect.stringContaining('manager/crosspost-')]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('cleans original and temporary files after failed generation', async () => {
    mocks.invoke.mockResolvedValue({ error: new Error('failed') });
    await expect(generateCrosspost(input, vi.fn())).rejects.toThrow('failed');
    expect(mocks.remove).toHaveBeenCalledWith('crosspost-sources', [expect.any(String)]);
  });
  it('does not report a bad result as success', async () => {
    mocks.invoke.mockResolvedValue({ data: { content: '{"versions":{}}' } });
    const received = vi.fn(); await expect(generateCrosspost(input, received)).rejects.toThrow();
    expect(received).not.toHaveBeenCalled();
  });
});
describe('stable receipts without overwrite or regeneration', () => {
  it('persists before request and reuses the same ID after lost response + reload', async () => {
    const session = createCrosspostSession(result, { source_type: 'libre' });
    const rows = new Map();
    mocks.rpc.mockImplementation(async (_: string,args: any) => {
      expect(readCrosspost(scope)?.calendar.linkedin.id).toBe(args.p_post_id);
      if (!rows.has(args.p_post_id)) { rows.set(args.p_post_id,args.p_payload); return { error: new Error('network lost') }; }
      return { data: { id: args.p_post_id, replayed: true }, error: null };
    });
    await expect(saveCrosspostCalendar(session, scope, 'linkedin','2026-10-01','owner','workspace-a')).rejects.toThrow();
    const retry = readCrosspost(scope)!;
    retry.result.versions.linkedin.full_text = 'New text must not overwrite';
    const receipt = await saveCrosspostCalendar(retry, scope, 'linkedin','2026-10-03','owner','workspace-a');
    expect(rows.size).toBe(1); expect(receipt.date).toBe('2026-10-01');
    expect([...rows.values()][0].content_draft).toBe('Texte original');
    expect([...rows.values()][0].user_id).toBe('owner');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('an unconfirmed response is not marked saved', async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    const session = createCrosspostSession(result, {});
    await expect(saveCrosspostCalendar(session,scope,'reel','2026-10-01','owner','workspace-a')).rejects.toThrow();
    expect(session.calendar.reel.confirmed).not.toBe(true);
  });
  it('fails before request when owner unresolved', async () => {
    await expect(saveCrosspostCalendar(createCrosspostSession(result,{}),scope,'reel','2026-10-01','','workspace-a')).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('idea lost response reuses id and confirms an existing row without update', async () => {
    const session = createCrosspostSession(result, {});
    mocks.insert.mockResolvedValueOnce({ error: new Error('lost') }).mockResolvedValueOnce({ error: { code: '23505' } });
    await expect(saveCrosspostIdea(session,scope,'reel',{ content_data: result },'owner','workspace-a')).rejects.toThrow('lost');
    const id = session.ideas.reel.id; mocks.lookup.mockResolvedValue({ data: { id }, error: null });
    expect(await saveCrosspostIdea(readCrosspost(scope)!,scope,'reel',{ content_data: {} },'owner','workspace-a')).toBe(id);
    expect(mocks.insert.mock.calls[1][0].content_data).toEqual(result);
  });
  it('does not treat denied read or empty insert as confirmed', async () => {
    const session = createCrosspostSession(result, {});
    mocks.insert.mockResolvedValue({ data: null, error: null });
    await expect(saveCrosspostIdea(session,scope,'reel',{},'owner',null)).rejects.toThrow();
    expect(session.ideas.reel.confirmed).not.toBe(true);
  });
});
