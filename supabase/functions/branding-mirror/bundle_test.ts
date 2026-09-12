import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Lovable packages an edge's own directory plus _shared, never sibling edges.
// Exercise the real local import graph rather than just the entry-point import.
for (const name of ["generate-voice-guide", "branding-mirror"]) {
  Deno.test(`${name}: local imports are available in an isolated edge bundle`, async () => {
    const own = new URL(`../${name}/`, import.meta.url);
    const shared = new URL("../_shared/", import.meta.url);
    const visited = new Set<string>();
    async function visit(file: URL) {
      if (visited.has(file.href)) return;
      assert(file.href.startsWith(own.href) || file.href.startsWith(shared.href), `Unavailable sibling module in ${name}: ${file.href}`);
      visited.add(file.href);
      const source = await Deno.readTextFile(file);
      for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g)) {
        await visit(new URL(match[1], file));
      }
    }
    await visit(new URL("index.ts", own));
    assert(visited.has(new URL("branding-generation-owner.ts", shared).href));
  });
}
