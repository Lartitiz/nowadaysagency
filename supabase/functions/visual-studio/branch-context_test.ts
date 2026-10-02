import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { preferredProductReference, referencesAtVersion, referencesDiffer } from "./branch-context.ts";
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

import { onlyAdditions as _onlyAdditions } from "./branch-context.ts";
Deno.test("onlyAdditions: scene refs kept, extra photo added", () => {
  const casting = { id: "c", photo_id: null, path: "c.png", role: "casting", name: "Mannequin brutaliste urbain" } as never;
  const product = { id: "p", photo_id: null, path: "p.png", role: "product", name: "dino1 (2)" } as never;
  const extra = { id: "x", photo_id: null, path: "x.png", role: "product", name: "bag dino+S (2)" } as never;
  if (!_onlyAdditions([casting, product], [extra, product, casting])) throw new Error("addition should pass");
  if (_onlyAdditions([casting, product], [extra, casting])) throw new Error("removal must ask");
  if (_onlyAdditions([casting, product], [casting, { ...(product as object), role: "decor" } as never])) throw new Error("role change must ask");
  if (_onlyAdditions([], [casting])) throw new Error("empty version must ask");
});

Deno.test("clean product shot takes priority over a worn product photo", () => {
  const worn = { id: "w", photo_id: null, path: "w.png", role: "product", kind: "produit_porte", name: "Bague portée" } as Reference;
  const clean = { id: "p", photo_id: null, path: "p.png", role: "product", kind: "produit", name: "Bague seule" } as Reference;
  assertEquals(preferredProductReference([worn, clean]), { reference: clean, ambiguous: false });
  assertEquals(preferredProductReference([worn]), { reference: null, ambiguous: false });
});

Deno.test("distinct clean products require a choice", () => {
  const first = { id: "p1", photo_id: null, path: "p1.png", role: "product", kind: "produit", name: "Bague une" } as Reference;
  const second = { id: "p2", photo_id: null, path: "p2.png", role: "product", kind: "produit", name: "Bague deux" } as Reference;
  assertEquals(preferredProductReference([first, second]), { reference: null, ambiguous: true });
  const groupedSecond = { ...second, subject_group: first.id };
  assertEquals(preferredProductReference([{ ...first, subject_group: first.id }, groupedSecond]), { reference: groupedSecond, ambiguous: false });
});
