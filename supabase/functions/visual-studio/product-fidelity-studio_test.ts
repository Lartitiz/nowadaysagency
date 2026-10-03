import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyPreparedReferences, refineEligible, refineStudioResult, REFINE_LOCK_TTL_MS } from "./product-fidelity-studio.ts";
import type { Proposal } from "./media.ts";

/** In-memory stand-in for the Studio bucket (upload without upsert fails on an existing path). */
function fakeDb(files: Record<string, Blob> = {}) {
  const bucket = {
    download: (path: string) => Promise.resolve(files[path] ? { data: files[path], error: null } : { data: null, error: { message: "Object not found" } }),
    upload: (path: string, blob: Blob, opts: { upsert?: boolean }) => {
      if (files[path] && !opts.upsert) return Promise.resolve({ error: { message: "The resource already exists" } });
      files[path] = blob;
      return Promise.resolve({ error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return { files, db: { storage: { from: () => bucket } } as any };
}

const productRef = { id: "r1", photo_id: null, role: "product" as const, path: "ws/s/ring", name: "Bague argent" };
const integration = (extra: Partial<Proposal> = {}): Proposal => ({
  operation: "edit", provider: "higgsfield", model: "marketing-studio/image/sunburst",
  input_path: "ws/s/scene", references: [productRef],
  scene_workflow: { phase: "integration", scene_path: "ws/s/scene" } as Proposal["scene_workflow"],
  image_prompt: "Put the ring on her hand.", ...extra,
});

Deno.test("only Marketing Studio product integrations get the zoomed pass", () => {
  assert(refineEligible(integration()));
  assert(!refineEligible(integration({ provider: "openai", model: "gpt-image-2" })));
  assert(!refineEligible(integration({ references: [{ ...productRef, role: "person" }] })));
  assert(!refineEligible(integration({ scene_workflow: undefined })));
  assert(refineEligible(integration({ scene_workflow: undefined, operation: "product" })));
});

Deno.test("cached prepared reference replaces the product pixels and pins its geometry", async () => {
  const prepared = new Blob(["prepared"], { type: "image/jpeg" });
  const { db } = fakeDb({
    "ws/s/ring.fidelity.jpg": prepared,
    "ws/s/ring.fidelity.json": new Blob([JSON.stringify({ description: "three almond lobes", extraneous: "loose grains" })]),
  });
  const proposal = integration();
  const paths = ["ws/s/scene", "ws/s/ring"];
  const scene = new Blob(["scene"]);
  const inputs = [scene, new Blob(["raw ring"])];
  await applyPreparedReferences(db, proposal, paths, inputs);
  assertEquals(inputs[0], scene);
  assertEquals(inputs[1], prepared);
  assert(proposal.image_prompt!.startsWith("Put the ring on her hand.\nExact product geometry to reproduce: three almond lobes"));
});

Deno.test("geometry is dropped when the provider prompt would no longer fit", async () => {
  const { db } = fakeDb({
    "ws/s/ring.fidelity.jpg": new Blob(["prepared"], { type: "image/jpeg" }),
    "ws/s/ring.fidelity.json": new Blob([JSON.stringify({ description: "three almond lobes", extraneous: "" })]),
  });
  const proposal = integration();
  const inputs = [new Blob(["scene"]), new Blob(["raw"])];
  await applyPreparedReferences(db, proposal, ["ws/s/scene", "ws/s/ring"], inputs, () => false);
  assertEquals(proposal.image_prompt, "Put the ring on her hand.");
  assertEquals(await inputs[1].text(), "prepared"); // pixels still prepared
});

Deno.test("the edit base is never replaced, even if it is also tagged as product", async () => {
  const { db } = fakeDb({ "ws/s/scene.fidelity.jpg": new Blob(["x"]), "ws/s/scene.fidelity.json": new Blob(["{}"]) });
  const proposal = integration({ references: [{ ...productRef, path: "ws/s/scene" }] });
  const scene = new Blob(["scene"]);
  const inputs = [scene];
  await applyPreparedReferences(db, proposal, ["ws/s/scene"], inputs);
  assertEquals(inputs[0], scene);
});

Deno.test("a fresh refine lock makes a concurrent reconcile wait; a stale one delivers unrefined", async () => {
  const image = new Blob(["provider image"], { type: "image/png" });
  const version = { id: "v1", result_path: "ws/s/v1", proposal: integration(), user_id: "u1", workspace_id: "w1" };
  const busy = fakeDb({ "ws/s/v1.refine-lock": new Blob([String(Date.now())]) });
  assertEquals(await refineStudioResult(busy.db, version, image), null);
  const stale = fakeDb({ "ws/s/v1.refine-lock": new Blob([String(Date.now() - REFINE_LOCK_TTL_MS - 1)]) });
  assertEquals(await refineStudioResult(stale.db, version, image), image);
});

Deno.test("an ineligible version is stored as delivered, without taking a lock", async () => {
  const image = new Blob(["provider image"], { type: "image/png" });
  const { db, files } = fakeDb();
  const version = { id: "v1", result_path: "ws/s/v1", proposal: integration({ references: [] }) };
  assertEquals(await refineStudioResult(db, version, image), image);
  assertEquals(Object.keys(files), []);
});
