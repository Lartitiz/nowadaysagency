import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import ts from 'typescript';
import { isDurableReelUrl as clientGuard } from '@/lib/reel-publication';


// Execute the actual path expression used by the archive handler. The separate
// PostgreSQL recipe applies the deployed INSERT policy to this same expression.
function archivePath(userId: string) {
  const source = readFileSync('supabase/functions/reel-render/index.ts', 'utf8');
  const expression = source.match(/const path = (`[^`]+`);/)![1];
  return new Function('userId', 'crypto', `return ${expression}`)(userId, { randomUUID: () => 'qa-output' }) as string;
}
it('stores rendered MP4 under the authenticated owner and keeps both durable guards compatible', () => {
  const owner = '92a833dd-74e6-40f2-88c2-da8b7ca4aa48';
  const path = archivePath(owner);
  expect(path.split('/')[0]).toBe(owner);
  expect(path).toBe(`${owner}/reels-montes/qa-output.mp4`);
  const origin = import.meta.env.VITE_SUPABASE_URL;
  const serverSource = readFileSync('supabase/functions/_shared/reel-publication.ts', 'utf8');
  const ast = ts.createSourceFile('guard.ts', serverSource, ts.ScriptTarget.Latest);
  const guard = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isDurableReelUrl')!;
  const js = ts.transpile(guard.getText(ast).replace('export ', ''), { target: ts.ScriptTarget.ES2022 });
  const serverGuard = new Function('Deno', `${js}; return isDurableReelUrl`)({ env: { get: () => origin } });
  {
    const url = `${origin}/storage/v1/object/public/calendar-media/${path}`;
    expect(clientGuard(url)).toBe(true);
    expect(serverGuard(url)).toBe(true);
    expect(clientGuard(url + '?token=temporary')).toBe(false);
    expect(serverGuard(url + '?token=temporary')).toBe(false);
  }
});
