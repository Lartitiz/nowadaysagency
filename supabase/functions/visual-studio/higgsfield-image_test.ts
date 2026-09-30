import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { higgsfieldImagesEnabled, imageInput, SOUL2_MODEL, soul2Enabled, soul2Eligible } from "./higgsfield-image.ts";
Deno.test("Soul2 accepts only source-free photographs without rendered text", () => {
  const photo = { operation: "create", visual_kind: "photo" as const, image_prompt: "Portrait éditorial", format: "portrait" };
  assertEquals(soul2Eligible(photo), true);
  assertEquals(imageInput({ ...photo, model: SOUL2_MODEL }, []), {
    prompt: imageInput({ ...photo, model: "marketing-studio/image/flare" }, []).prompt,
    batch_size: 1, resolution: "1080p", aspect_ratio: "2:3",
    enhance_prompt: false, image_urls: undefined,
  });
  assertEquals(soul2Eligible({ ...photo, exact_text: ["Atelier"] }), false);
  assertEquals(soul2Eligible({ ...photo, visual_kind: "graphic" }), false);
  assertEquals(soul2Eligible({ ...photo, references: [{ id: "r", photo_id: null, role: "style", path: "p", name: "Ambiance" }] }), false);
  assertEquals(soul2Eligible({ ...photo, input_path: "selected-version" }), false);
  assertThrows(() => imageInput({ ...photo, model: SOUL2_MODEL }, ["https://example.com/reference.png"]));
});
Deno.test("Higgsfield preserves our brief, reference order and disables preset rewriting", () => {
  const input = imageInput({
    operation: "product",
    model: "marketing-studio/image/sunburst",
    image_prompt: "Le sac bleu sur un mannequin",
    references: [{
      id: "r",
      photo_id: null,
      name: "Sac",
      path: "private",
      role: "product",
    }, {
      id: "detail", photo_id: null, name: "Détail du sac",
      path: "private-detail", role: "product",
    }],
    format: "portrait",
  }, ["https://example.com/bag.jpg", "https://example.com/bag-detail.jpg"]);
  assertEquals(input.enhance_prompt, false);
  assertEquals(input.image_urls, ["https://example.com/bag.jpg", "https://example.com/bag-detail.jpg"]);
  assertEquals(input.aspect_ratio, "2:3");
  assert(input.prompt.includes("exact product"));
  assert(input.prompt.includes("Image 2: product reference, Détail du sac"));
  assertThrows(() =>
    imageInput({ operation: "create", model: "arbitrary/endpoint" }, [])
  );
});
Deno.test("image provider activation requires the explicit data settings review", () => {
  const before = ["HIGGSFIELD_IMAGE_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED"]
    .map((k) => [k, Deno.env.get(k)]);
  try {
    Deno.env.set("HIGGSFIELD_IMAGE_ENABLED", "true");
    Deno.env.delete("HIGGSFIELD_DATA_USE_REVIEWED");
    assertEquals(higgsfieldImagesEnabled(), false);
    Deno.env.set("HIGGSFIELD_DATA_USE_REVIEWED", "true");
    assertEquals(higgsfieldImagesEnabled(), true);
  } finally {
    for (const [k, v] of before) {
      if (v === undefined) Deno.env.delete(k!);
      else Deno.env.set(k!, v);
    }
  }
});
Deno.test("Soul2 activation is separate from the legacy Higgsfield image switch", () => {
  const keys = ["HIGGSFIELD_SOUL2_ENABLED", "HIGGSFIELD_IMAGE_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED"];
  const before = keys.map((key) => Deno.env.get(key));
  try {
    Deno.env.set("HIGGSFIELD_SOUL2_ENABLED", "true");
    Deno.env.set("HIGGSFIELD_IMAGE_ENABLED", "false");
    Deno.env.set("HIGGSFIELD_DATA_USE_REVIEWED", "true");
    assertEquals(soul2Enabled(), true);
    assertEquals(higgsfieldImagesEnabled(), false);
  } finally {
    keys.forEach((key, index) => before[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, before[index]!));
  }
});

import { getServiceClient } from "../_shared/plan-limiter.ts";
import {
  reconcileHiggsfieldImage,
  submitHiggsfieldImage,
} from "./higgsfield-image.ts";
function lifecycle(model: string = "marketing-studio/image/flare") {
  const savedFetch = globalThis.fetch;
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "HIGGSFIELD_API_KEY",
    "HIGGSFIELD_IMAGE_ENABLED",
    "HIGGSFIELD_SOUL2_ENABLED",
    "HIGGSFIELD_DATA_USE_REVIEWED",
    "HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD",
  ];
  const env = keys.map((k) => [k, Deno.env.get(k)]);
  ["https://studio.test", "service", "test:secret", "true", "true", "true", "10"]
    .forEach((v, i) => Deno.env.set(keys[i], v));
  const id = "10000000-0000-4000-8000-000000000001",
    providerId = "20000000-0000-4000-8000-000000000001";
  let job: Record<string, unknown> | null = null,
    versionStatus = "processing",
    stored = false,
    charges = 0,
    submits = 0,
    submittedInput: Record<string, unknown> | null = null,
    loseSubmit = false,
    pollStatus = 200;
  const json = (x: unknown, status = 200) =>
    new Response(JSON.stringify(x), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input));
    const opts = init as { method?: string; body?: unknown } | undefined;
    const method = opts?.method || req?.method || "GET";
    const raw = opts?.body ||
      (req && method !== "GET" ? await req.text() : null);
    const body = typeof raw === "string" && raw ? JSON.parse(raw) : {};
    if (url.pathname === "/rest/v1/studio_image_requests") {
      if (method === "POST") {
        if (job) return json({ code: "23505" }, 409);
        job = {
          ...body,
          callback_token: id,
          status: "preparing",
          provider_id: null,
        };
      }
      if (method === "PATCH" && job) {
        const filter = url.searchParams.get("status");
        if (!filter || filter.includes(String(job.status))) {
          Object.assign(job, body);
        }
      }
      return json(job);
    }
    if (url.pathname === "/rest/v1/visual_studio_versions") {
      if (method === "PATCH" && versionStatus === "processing") {
        versionStatus = body.status;
      }
      return json({ status: versionStatus, result_path: "result.jpg" });
    }
    if (url.pathname === "/rest/v1/rpc/studio_reserve_image_cost") {
      if (job) job.status = "submitting";
      return json(true);
    }
    if (url.pathname === "/rest/v1/rpc/studio_complete_generation") {
      if (versionStatus === "processing") {
        charges++;
        versionStatus = "ready";
      }
      return json(true);
    }
    if (url.pathname.startsWith("/estimate/")) return json({ usd: .3 });
    if (url.pathname === `/${model}`) {
      submits++;
      submittedInput = body;
      if (loseSubmit) throw new TypeError("lost response");
      return json({ request_id: providerId });
    }
    if (url.pathname === `/requests/${providerId}/status`) {
      return pollStatus === 200
        ? json({
          request_id: providerId,
          status: "completed",
          images: [{ url: "https://cdn.higgsfield.ai/image.png" }],
        })
        : json({ error: "temporary" }, pollStatus);
    }
    if (url.hostname === "cdn.higgsfield.ai") {
      return new Response(new Blob(["image"], { type: "image/png" }));
    }
    if (url.pathname.includes("/storage/v1/object/info/")) {
      return stored
        ? json({ name: "result.jpg" })
        : json({ message: "Object not found" }, 404);
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      stored = true;
      return json({ Key: "result.jpg" });
    }
    throw new Error(`Unexpected ${method} ${url.pathname}`);
  };
  return {
    db: getServiceClient(),
    version: {
      id,
      workspace_id: id,
      proposal: {
        operation: "create",
        model,
        visual_kind: model === SOUL2_MODEL ? "photo" as const : "graphic" as const,
        image_prompt: "An illustration",
      },
    },
    providerId,
    loseSubmit: () => {
      loseSubmit = true;
    },
    poll: (status: number) => {
      pollStatus = status;
    },
    counts: () => ({
      submits,
      charges,
      versionStatus,
      stored,
      status: job?.status,
    }),
    submittedInput: () => submittedInput,
    restore() {
      globalThis.fetch = savedFetch;
      for (const [k, v] of env) {
        if (v === undefined) Deno.env.delete(k!);
        else Deno.env.set(k!, v);
      }
    },
  };
}
Deno.test("Soul2 submission uses the text-only endpoint and one image", async () => {
  const f = lifecycle(SOUL2_MODEL);
  try {
    await submitHiggsfieldImage(f.db, f.version, []);
    const input = f.submittedInput();
    assertEquals(input?.batch_size, 1);
    assertEquals(input?.resolution, "1080p");
    assertEquals("image_urls" in (input || {}), false);
    assertEquals(f.counts().charges, 1);
  } finally { f.restore(); }
});
Deno.test("Soul2 rejects image inputs before uploading or submitting", async () => {
  const f = lifecycle(SOUL2_MODEL);
  try {
    await submitHiggsfieldImage(f.db, f.version, [new Blob(["reference"], { type: "image/png" })]);
    assertEquals(f.counts().submits, 0);
    assertEquals(f.counts().charges, 0);
    assertEquals(f.counts().versionStatus, "failed");
  } finally { f.restore(); }
});
Deno.test("provider completion archives and charges once; repeated launch and callback never regenerate", async () => {
  const f = lifecycle();
  try {
    await submitHiggsfieldImage(f.db, f.version, []);
    await reconcileHiggsfieldImage(f.db, f.version.id, f.providerId);
    await submitHiggsfieldImage(f.db, f.version, []);
    assertEquals(f.counts(), {
      submits: 1,
      charges: 1,
      versionStatus: "ready",
      stored: true,
      status: "completed",
    });
  } finally {
    f.restore();
  }
});
Deno.test("lost submit receipt stays uncertain and is recovered by callback without paid retry", async () => {
  const f = lifecycle();
  try {
    f.loseSubmit();
    await submitHiggsfieldImage(f.db, f.version, []);
    await submitHiggsfieldImage(f.db, f.version, []);
    assertEquals(f.counts().status, "uncertain");
    assertEquals(f.counts().charges, 0);
    await reconcileHiggsfieldImage(f.db, f.version.id, f.providerId);
    assertEquals(f.counts().submits, 1);
    assertEquals(f.counts().charges, 1);
  } finally {
    f.restore();
  }
});
Deno.test("a status 404 after accepted submission never marks it failed or permits another generation", async () => {
  const f = lifecycle();
  try {
    f.poll(404);
    await submitHiggsfieldImage(f.db, f.version, []);
    assertEquals(f.counts().versionStatus, "processing");
    assertEquals(f.counts().charges, 0);
    f.poll(200);
    await reconcileHiggsfieldImage(f.db, f.version.id);
    assertEquals(f.counts().submits, 1);
    assertEquals(f.counts().charges, 1);
  } finally {
    f.restore();
  }
});


Deno.test("Soul identity i2i accepts exactly one identity image, never product or multiple references", () => {
  const p = { operation: "create", visual_kind: "photo" as const, model: "higgsfield-ai/soul/v2/image-to-image",
    scene_workflow: { phase: "scene" as const, camera_match: "Vue compatible" },
    references: [{ id: "person", photo_id: null, path: "person", role: "person" as const, name: "Personne" }] };
  const input = imageInput(p, ["https://example.com/person.jpg"]);
  assertEquals(input.image_url, "https://example.com/person.jpg");
  assertEquals(input.image_urls, undefined);
  assertEquals(input.enhance_prompt, true);
  assertThrows(() => imageInput(p, []));
  assertThrows(() => imageInput(p, ["https://example.com/person.jpg", "https://example.com/place.jpg"]));
  assertThrows(() => imageInput({ ...p, references: [{ ...p.references[0], role: "product" }] }, ["https://example.com/product.jpg"]));
  assertThrows(() => imageInput({ ...p, exact_text: ["Atelier"] }, ["https://example.com/person.jpg"]));
});
