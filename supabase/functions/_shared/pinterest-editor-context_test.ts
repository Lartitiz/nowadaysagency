import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { canUsePinterestEditor, loadPinterestKeywords } from "./pinterest-editor-context.ts";
function client(rows: any[], error: any = null) {
  const filters: [string, unknown][] = [];
  const q: any = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k,v]); return q; }, is: (k: string, v: unknown) => { filters.push([k,v]); return q; }, maybeSingle: () => {
    const found = rows.filter(row => filters.every(([k,v]) => row[k] === v));
    return { data: found.length === 1 ? found[0] : null, error: error || (found.length > 1 ? 'cardinality' : null) };
  } };
  return { from: () => q, filters };
}
Deno.test('Pinterest keywords use creator and workspace, including NULL personal', async () => {
  const rows = [{ user_id:'u',workspace_id:'A',keywords_raw:'A' },{ user_id:'u',workspace_id:'B',keywords_raw:'B' },{ user_id:'u',workspace_id:null,keywords_raw:'personal' },{ user_id:'owner',workspace_id:'B',keywords_raw:'other creator' }];
  for (const ws of ['A','B',null]) assertEquals(await loadPinterestKeywords(client(rows),'u',ws),ws || 'personal');
  assertEquals(await loadPinterestKeywords(client(rows),'missing','B'),'');
});
Deno.test('Pinterest keyword errors and duplicate history do not silently become empty context', async () => {
  await assertRejects(() => loadPinterestKeywords(client([], 'read failure'),'u','A'));
  await assertRejects(() => loadPinterestKeywords(client([{ user_id:'u',workspace_id:'A' },{ user_id:'u',workspace_id:'A' }]),'u','A'));
});
Deno.test('Pinterest generation allows owner and manager, denies viewer/editor/nonmember/error before AI', async () => {
  for (const role of ['owner','manager','viewer','editor']) assertEquals(await canUsePinterestEditor(client([{ user_id:'u',workspace_id:'A',role }]),'u','A'),['owner','manager'].includes(role));
  assertEquals(await canUsePinterestEditor(client([]),'u','A'),false);
  assertEquals(await canUsePinterestEditor(client([], 'error'),'u','A'),false);
  assertEquals(await canUsePinterestEditor(client([]),'u',null),true);
});
Deno.test('Pinterest entrypoint scopes keywords and checks rights before quota and generation', async () => {
  const source = await Deno.readTextFile(new URL('../pinterest-ai/index.ts', import.meta.url));
  assertEquals(source.includes('profileUserId'),false);
  assertEquals(source.indexOf('await canUsePinterestEditor') < source.indexOf('await checkQuota'),true);
  assertEquals(source.includes('await loadPinterestKeywords(supabase, user.id, workspace_id)'),true);
});
