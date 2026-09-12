import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Temporary isolated deployment: no sibling-function imports supported by hosting.
// Exact file parity prevents testing a policy other than the one being promoted.
for (const file of ["index.ts", "writing-contract.ts", "variant-writing.ts"]) {
  Deno.test(`candidate is byte-identical to production source: ${file}`, async () => {
    assertEquals(await Deno.readTextFile(new URL(file, import.meta.url)), await Deno.readTextFile(new URL("../carousel-ai/" + file, import.meta.url)));
  });
}
