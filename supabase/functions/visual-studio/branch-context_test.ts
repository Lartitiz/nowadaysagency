import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { referencesAtVersion, referencesDiffer } from "./branch-context.ts";
import type { Reference } from "./media.ts";

const oldSubject: Reference = {
  id: "old", photo_id: "photo-old", path: "space/session/old",
  role: "product", name: "Sac rouge",
};
const newerStyle: Reference = {
  id: "new", photo_id: "photo-new", path: "space/session/new",
  role: "style", name: "Fond noir",
};

Deno.test("a saved version keeps its own references and detects later changes", () => {
  const snapshot = [oldSubject];
  assertEquals(referencesAtVersion({ reference_snapshot: snapshot }), snapshot);
  assertEquals(referencesDiffer(snapshot, [newerStyle]), true);
  assertEquals(referencesDiffer(snapshot, [{ ...oldSubject, name: "Autre nom" }]), true);
  assertEquals(referencesDiffer(snapshot, [{ ...oldSubject, role: "style" }]), true);
});

Deno.test("legacy versions rebuild the original subject without inheriting later roles", () => {
  const recovered = referencesAtVersion({
    original_path: oldSubject.path,
    viewed_reference_id: oldSubject.id,
    references: [newerStyle],
    subject_kind: "produit",
  });
  assertEquals(recovered.map((r) => [r.path, r.role]), [
    [oldSubject.path, "product"], [newerStyle.path, "style"],
  ]);
});
