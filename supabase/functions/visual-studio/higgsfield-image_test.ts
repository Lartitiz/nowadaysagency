import {
  assert,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { higgsfieldImagesEnabled, imageInput } from "./higgsfield-image.ts";
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
    }],
    format: "portrait",
  }, ["https://example.com/bag.jpg"]);
  assertEquals(input.enhance_prompt, false);
  assertEquals(input.image_urls, ["https://example.com/bag.jpg"]);
  assertEquals(input.aspect_ratio, "2:3");
  assert(input.prompt.includes("exact product"));
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

import { getServiceClient } from "../_shared/plan-limiter.ts";
import {
  reconcileHiggsfieldImage,
  submitHiggsfieldImage,
} from "./higgsfield-image.ts";
function lifecycle() {
  const savedFetch = globalThis.fetch;
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "HIGGSFIELD_API_KEY",
    "HIGGSFIELD_IMAGE_ENABLED",
    "HIGGSFIELD_DATA_USE_REVIEWED",
    "HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD",
  ];
  const env = keys.map((k) => [k, Deno.env.get(k)]);
  ["https://studio.test", "service", "test:secret", "true", "true", "10"]
    .forEach((v, i) => Deno.env.set(keys[i], v));
  const id = "10000000-0000-4000-8000-000000000001",
    providerId = "20000000-0000-4000-8000-000000000001";
  let job: Record<string, unknown> | null = null,
    versionStatus = "processing",
    stored = false,
    charges = 0,
    submits = 0,
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
    const method = init?.method || req?.method || "GET";
    const raw = init?.body ||
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
    if (url.pathname === "/marketing-studio/image/flare") {
      submits++;
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
        model: "marketing-studio/image/flare",
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
    restore() {
      globalThis.fetch = savedFetch;
      for (const [k, v] of env) {
        if (v === undefined) Deno.env.delete(k!);
        else Deno.env.set(k!, v);
      }
    },
  };
}
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
