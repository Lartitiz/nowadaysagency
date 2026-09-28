import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  isIdentity,
  referenceInstruction,
  searchTerms,
} from "./competencies.ts";
Deno.test("references distinguish product, person and inspiration", () => {
  for (const role of ["product", "person", "casting", "subject"]) {
    assert(isIdentity(role));
  }
  for (const role of ["style", "composition", "logo"]) {
    assertEquals(isIdentity(role), false);
  }
  assert(referenceInstruction("product").includes("exact product"));
  assert(referenceInstruction("casting").includes("fictional"));
  assert(referenceInstruction("logo").includes("Do not invent or redraw"));
});
Deno.test("catalogue search never interpolates raw filter syntax or endless messages", () => {
  const words = searchTerms(
    "Cherche mon bijou, montre les photos dans la bibliothèque; x),workspace_id.neq.secret",
  );
  assert(words.includes("bijou"));
  assert(words.every((w) => /^[\p{L}\p{N}]+$/u.test(w)));
  assert(words.length <= 6);
});
import { intentSchema } from "./contract.ts";
Deno.test("series and editable compositions preserve intent without inventing provider operations", () => {
  assertEquals(
    intentSchema.parse({
      operation: "create",
      summary: "Trois plans",
      image_prompt: "Premier plan",
      shots: [{
        summary: "Détail",
        image_prompt: "Détail des matières",
        format: "square",
      }],
    }).shots.length,
    1,
  );
  assertEquals(
    intentSchema.safeParse({ operation: "compose", summary: "Une affiche" })
      .success,
    false,
  );
  assertEquals(
    intentSchema.safeParse({
      operation: "compose",
      summary: "Une affiche",
      composition: { title: "Marché", body: "", footer: "Adresse confirmée" },
    }).success,
    true,
  );
  assertEquals(
    intentSchema.safeParse({
      operation: "compose",
      summary: "Affiche",
      composition: {
        title: "X",
        body: "Y",
        footer: "Z",
        background: "url(https://evil)",
      },
    }).success,
    false,
  );
});
