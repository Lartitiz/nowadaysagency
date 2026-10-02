import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStudioRequest } from "./index.ts";
import { imageInputPaths } from "./photo-preservation.ts";
import { generateImage, imagePrompt } from "./media.ts";
import { MARKETING_PROMPT_ERROR } from "./higgsfield-image.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  space = id(2),
  sessionId = id(3),
  proposalId = id(4);
const base = { studio_version: 2, session_id: sessionId, workspace_id: space };
Deno.test("oversized final Marketing prompt is kept for editing and refused before job claim or image upload", async () => {
  const f = fixture();
  const previous = Deno.env.get("HIGGSFIELD_API_KEY");
  Deno.env.set("HIGGSFIELD_API_KEY", "test:key");
  const pendingId = id(999);
  const mock = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/rest/v1/visual_studio_versions" && url.searchParams.get("id") === `eq.${pendingId}`) return Promise.resolve(new Response("null", { headers: { "Content-Type": "application/json" } }));
    return mock(input, init);
  };
  try {
    const proposal = { id: pendingId, operation: "edit", provider: "higgsfield", model: "marketing-studio/image/sunburst",
      summary: "Modifier uniquement la table.", image_prompt: "x".repeat(6000), input_path: "fixture/scene.jpg", cost: 1 };
    f.session.proposal = proposal as unknown as typeof f.session.proposal;
    const res = await handleStudioRequest(request({ ...base, action: "generate", proposal_id: pendingId }));
    assertEquals(res.status, 409);
    assertEquals((await res.json()).error, MARKETING_PROMPT_ERROR);
    assertEquals(JSON.stringify(f.session.proposal), JSON.stringify(proposal));
    assertEquals(f.requests.some(p => /studio_confirm_generation|studio_reserve_image_cost|generate-upload-url/.test(p)), false);
  } finally {
    previous === undefined ? Deno.env.delete("HIGGSFIELD_API_KEY") : Deno.env.set("HIGGSFIELD_API_KEY", previous);
    f.restore();
  }
});
function fixture(role = "owner", replay = false, legacyLarge = false) {
  const saved = globalThis.fetch,
    env = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "PHOTOROOM_API_KEY",
      "ANTHROPIC_API_KEY",
      "HIGGSFIELD_SOUL2_ENABLED",
      "HIGGSFIELD_DATA_USE_REVIEWED",
    ].map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", "https://studio.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("PHOTOROOM_API_KEY", "test-only");
  Deno.env.set("ANTHROPIC_API_KEY", "test-only");
  Deno.env.set("HIGGSFIELD_SOUL2_ENABLED", "true");
  Deno.env.set("HIGGSFIELD_DATA_USE_REVIEWED", "true");
  const memories: Record<string,unknown>[] = [];
  const compositions: Record<string, unknown>[] = [];
  const requests: string[] = [];
  const payloads: Record<string, unknown>[] = [];
  let intent: Record<string, unknown> = {
    operation: "advise",
    summary: "Une illustration adaptée à ton offre.",
  };
  const session = {
    id: sessionId,
    workspace_id: space,
    user_id: actor,
    source_photo_id: id(5) as string | null,
    references: [] as unknown[],
    brief: "",
    source_metadata: {},
    source_ready: true,
    composition: null as { design: Record<string, unknown>; background_path: string | null } | null,
    source_path: "original" as string | null,
    name: "Photo",
    archived_at: null as string | null,
    revision: 0,
    messages: [] as Array<{ id?: string; role: string; text: string }>,
    proposal: {
      id: proposalId,
      operation: "background",
      summary: "Fond crème",
      background_prompt: "cream",
      cost: 1,
    } as { id: string; operation: string; summary: string; background_prompt: string; cost: number } | null,
  };
  const version = {
    id: proposalId,
    session_id: sessionId,
    result_path: "space/session/version",
    created_at: new Date().toISOString(),
    status: "processing",
    proposal: session.proposal!,
  };
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url,
    );
    requests.push(url.pathname);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname === "/auth/v1/user") {
      return json({ id: actor, aud: "authenticated", role: "authenticated" });
    }
    if (url.pathname === "/rest/v1/workspace_members") return json({ role });
    if (url.pathname === "/rest/v1/visual_studio_sessions") {
      if (init?.method === "PATCH") {
        Object.assign(session, JSON.parse(String(init.body)));
      }
      return json(session);
    }
    if (url.pathname === "/rest/v1/rpc/studio_reserve_interpretation") {
      return json(true);
    }
    if (url.pathname === "/rest/v1/rpc/studio_set_session_archived") {
      const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body));
      session.archived_at = body.p_archive ? new Date().toISOString() : null;
      session.revision += 1;
      session.proposal = null;
      return json(session);
    }
    if (url.pathname === "/rest/v1/rpc/studio_save_composition") {
      const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body));
      if (body.p_revision !== session.revision) return json({ message: "studio_conflict" }, 409);
      const entry = {
        id: id(700 + compositions.length), session_id: sessionId,
        workspace_id: space, user_id: actor, design: body.p_design,
        title: body.p_design.title,
        background_path: body.p_background_path,
        created_at: new Date().toISOString(),
      };
      compositions.unshift(entry);
      session.composition = { design: body.p_design, background_path: body.p_background_path };
      session.revision += 1;
      return json(session);
    }
    if (url.pathname === "/rest/v1/visual_studio_compositions") {
      const selected = url.searchParams.get("id")?.replace("eq.", "");
      return json(selected ? compositions.find((entry) => entry.id === selected) : compositions);
    }
    if (url.pathname === "/rest/v1/studio_brand_memory") { assertEquals(url.searchParams.get("workspace_id"), `eq.${space}`); return json(memories); }
    if (url.pathname.startsWith("/rest/v1/brand_")) {
      return json({ mission: "Ateliers artisanaux" });
    }
    if (url.pathname === "/rest/v1/user_photos") {
      assertEquals(url.searchParams.get("removed_from_library_at"), "is.null");
      assertEquals(url.searchParams.get("workspace_id"), `eq.${space}`);
      return json([]);
    }
    if (url.pathname === "/v1/messages") {
      payloads.push(JSON.parse(String((init as { body?: unknown } | undefined)?.body)));
      return json({
        content: [
          { type: "tool_use", name: JSON.parse(String((init as { body?: unknown } | undefined)?.body)).tools?.[0]?.name || "prepare_photo_request", input: intent },
        ],
        stop_reason: "tool_use",
      });
    }
    if (url.pathname.startsWith("/storage/v1/render/image/authenticated/")) {
      return new Response(new Blob(["resized"], { type: "image/webp" }));
    }
    if (
      url.pathname.startsWith("/storage/v1/object/") &&
      !url.pathname.includes("/sign/")
    ) {
      return new Response(new Blob(
        [legacyLarge ? new Uint8Array(5_000_001) : "source"],
        { type: "image/jpeg" },
      ));
    }
    if (url.pathname === "/rest/v1/visual_studio_versions") {
      if (url.searchParams.get("id") === `eq.${proposalId}`) return json(version);
      return json(replay ? [version] : []);
    }
    if (url.pathname === "/rest/v1/rpc/has_role") return json(true);
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      return json({ signedURL: "/signed-original" });
    }
    throw new Error(
      "Unexpected network request " + url.pathname + " " + init?.method,
    );
  };
  return {
    requests,
    memories,
    compositions,
    session,
    version,
    payloads,
    setIntent: (value: Record<string, unknown>) => {
      intent = value;
    },
    restore: () => {
      globalThis.fetch = saved;
      for (const [k, v] of env) {
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
    },
  };
}
const request = (body: unknown, auth = true) =>
  new Request("https://studio.test/functions/v1/visual-studio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer test" } : {}),
    },
    body: JSON.stringify(body),
  });
Deno.test("Studio requires authentication before accessing media", async () => {
  const f = fixture();
  try {
    assertEquals(
      (await handleStudioRequest(request({ ...base, action: "read" }, false)))
        .status,
      401,
    );
    assertEquals(f.requests.length, 0);
  } finally {
    f.restore();
  }
});
Deno.test("archived sessions can be read and restored but not edited", async () => {
  const f = fixture();
  try {
    const archived = await handleStudioRequest(request({ ...base, action: "archive", revision: 0 }));
    assertEquals(archived.status, 200);
    assertEquals(f.session.archived_at !== null, true);
    assertEquals((await handleStudioRequest(request({ ...base, action: "read" }))).status, 200);
    assertEquals((await handleStudioRequest(request({ ...base, action: "message", revision: 1, request_id: id(6), message: "Bonjour" }))).status, 409);
    assertEquals(f.requests.includes("/v1/messages"), false);
    assertEquals((await handleStudioRequest(request({ ...base, action: "restore", revision: 1 }))).status, 200);
    assertEquals(f.session.archived_at, null);
  } finally { f.restore(); }
});
Deno.test("an old version asks which references to use before interpreting", async () => {
  const f = fixture();
  try {
    const oldRef = { id: id(71), photo_id: id(72), role: "product", path: `${space}/${sessionId}/old`, name: "Ancien produit" };
    const newRef = { id: id(73), photo_id: id(74), role: "style", path: `${space}/${sessionId}/new`, name: "Nouvelle direction" };
    f.session.references.push(newRef);
    f.session.messages.push({ role: "user", text: "Utilise désormais la nouvelle direction" });
    f.version.status = "ready";
    Object.assign(f.version.proposal, { brief: "Produit sur fond clair", reference_snapshot: [oldRef], preserve: ["Contour ondulé et motif floral orange"], product_placement: "Posé sur son fond", photo_treatment: "natural" });
    const body = { ...base, action: "message", revision: 0, request_id: id(75), viewed_version_id: proposalId, message: "Une autre prise" };
    const first = await handleStudioRequest(request(body));
    assertEquals(first.status, 409);
    assertEquals((await first.json()).code, "branch_reference_choice");
    assertEquals(f.requests.includes("/rest/v1/rpc/studio_reserve_interpretation"), false);
    assertEquals(f.payloads.length, 0);
    const chosen = await handleStudioRequest(request({ ...body, branch_reference_mode: "version" }));
    assertEquals(chosen.status, 200);
    const prompt = JSON.parse((f.payloads[0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages.at(-1)!.content.at(-1)!.text);
    assertEquals(prompt.references.map((r: { id: string }) => r.id), [oldRef.id]);
    assertEquals(prompt.historique, [{ role: "user", content: "Utilise désormais la nouvelle direction" }]);
    assertEquals(prompt.brief, "Produit sur fond clair");
    assertEquals(prompt.version_selectionnee.preserve, ["Contour ondulé et motif floral orange"]);
    assertEquals(prompt.version_selectionnee.product_placement, "Posé sur son fond");
    assertEquals(prompt.version_selectionnee.photo_treatment, "natural");
  } finally { f.restore(); }
});
Deno.test("an explicit current-reference choice excludes the old snapshot", async () => {
  const f = fixture();
  try {
    const oldRef = { id: id(81), photo_id: id(82), role: "product", path: `${space}/${sessionId}/old`, name: "Ancien produit" };
    const newRef = { id: id(83), photo_id: id(84), role: "style", path: `${space}/${sessionId}/new`, name: "Nouvelle direction" };
    f.session.references.push(newRef);
    f.version.status = "ready";
    Object.assign(f.version.proposal, { brief: "Fond clair", reference_snapshot: [oldRef] });
    const res = await handleStudioRequest(request({ ...base, action: "message", revision: 0,
      request_id: id(85), viewed_version_id: proposalId, message: "Une autre prise",
      branch_reference_mode: "current" }));
    assertEquals(res.status, 200);
    const prompt = JSON.parse((f.payloads[0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages.at(-1)!.content.at(-1)!.text);
    assertEquals(prompt.references.map((r: { id: string }) => r.id), [newRef.id]);
    assertEquals(prompt.historique, []);
  } finally { f.restore(); }
});
Deno.test("a proposed image retains the brand context actually sent to the interpreter", async () => {
  const f = fixture();
  try {
    f.memories.push({ id: id(90), workspace_id: space, kind: "preference", name: "Lumière naturelle", note: "Éviter l'effet plastique", revision: 2, references: [] });
    f.setIntent({ operation: "create", summary: "Scène d'atelier", image_prompt: "Une scène d'atelier" });
    const response = await handleStudioRequest(request({ ...base, action: "message", revision: 0, request_id: id(91), message: "Imagine un atelier" }));
    assertEquals(response.status, 200);
    const sent = JSON.parse((f.payloads[0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages.at(-1)!.content[0].text);
    const proposal = f.session.proposal as Record<string, unknown>;
    const snapshot = proposal.brand_context as Record<string, unknown>;
    assertEquals(snapshot.charter, sent.marque.charte);
    assertEquals(snapshot.identity, sent.marque.identite);
    assertEquals(snapshot.proposition, sent.marque.proposition);
    assertEquals(snapshot.strategy, sent.marque.strategy);
    assertEquals((snapshot.memory as Array<Record<string, unknown>>)[0].note, "Éviter l'effet plastique");
    assertEquals(typeof snapshot.captured_at, "string");
    assertEquals(typeof proposal.rules_version, "string");
  } finally { f.restore(); }
});
Deno.test(
  "viewer cannot ask the interpreter, generate, create or save",
  async () => {
    const f = fixture("viewer");
    try {
      for (const action of ["message", "generate", "create", "save"]) {
        assertEquals(
          (await handleStudioRequest(request({ ...base, action }))).status,
          403,
        );
      }
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "replaying an accepted confirmation returns job state with no provider request or second claim",
  async () => {
    const f = fixture("owner", true);
    try {
      const res = await handleStudioRequest(
        request({ ...base, action: "generate", proposal_id: proposalId }),
      );
      assertEquals(res.status, 200);
      assertEquals((await res.json()).versions[0].id, proposalId);
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "stale conversation revision fails before paying the interpreter",
  async () => {
    const f = fixture();
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Crème",
          request_id: id(6),
          revision: 2,
        }),
      );
      assertEquals(res.status, 409);
      assertEquals((await res.json()).code, "refresh_request");
      assertEquals(
        f.requests.some((p) => p.includes("studio_reserve")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "invalid source identifiers and oversized messages fail schema validation",
  async () => {
    const f = fixture();
    try {
      for (
        const body of [
          { ...base, action: "create", photo_id: "outside-storage/path" },
          { ...base, action: "message", message: "x".repeat(1001) },
        ]
      ) {
        assertEquals((await handleStudioRequest(request(body))).status, 400);
      }
    } finally {
      f.restore();
    }
  },
);

Deno.test(
  "question without a photo loads the brand, advises and never claims generation",
  async () => {
    const f = fixture();
    f.session.source_photo_id = null;
    f.session.source_path = null;
    f.session.proposal = null;
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Quel visuel pour mon atelier ?",
          revision: 0,
          request_id: id(80),
        }),
      );
      assertEquals(res.status, 200);
      const data = await res.json();
      assertEquals(data.session.proposal, null);
      assertEquals(data.session.source_url, null);
      assertEquals(data.session.messages.at(-1).operation, "advise");
      assertEquals(f.requests.includes("/rest/v1/brand_profile"), true);
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test("an old large photo is resized for interpretation", async () => {
  const f = fixture("owner", false, true);
  f.session.references = null as unknown as unknown[];
  try {
    const res = await handleStudioRequest(request({
      ...base, action: "message", message: "Éclaircis cette photo",
      revision: 0, request_id: id(86),
    }));
    assertEquals(res.status, 200);
    assertEquals(f.requests.some((p) => p.startsWith("/storage/v1/render/image/authenticated/")), true);
    const sent = f.payloads[0] as { messages: Array<{ content: Array<{ source?: { data: string; media_type: string } }> }> };
    const image = sent.messages.at(-1)!.content.find((part) => part.source);
    assertEquals(image?.source?.data, btoa("resized"));
    assertEquals(image?.source?.media_type, "image/webp");
  } finally { f.restore(); }
});
Deno.test("saved compositions remain recoverable with their original background", async () => {
  const f = fixture();
  f.version.status = "ready";
  const design = (title: string) => ({
    title, body: "Texte", footer: "Samedi 10 h–18 h", format: "portrait",
    background: "#ffffff", foreground: "#000000", accent: "#ff0000",
    font: "sans-serif", align: "left",
  });
  try {
    const first = await handleStudioRequest(request({
      ...base, action: "composition_save", revision: 0,
      composition: design("Marché de Noël"), viewed_version_id: proposalId,
    }));
    assertEquals(first.status, 200);
    const firstBody = await first.json();
    assertEquals(firstBody.composition_history.length, 1);
    assertEquals(firstBody.composition_history[0].design, undefined);
    assertEquals(f.compositions[0].background_path, f.version.result_path);
    const firstId = f.compositions[0].id;
    const opened = await handleStudioRequest(request({
      ...base, action: "composition_read", composition_history_id: firstId,
    }));
    assertEquals(opened.status, 200);
    assertEquals((await opened.json()).composition.design.title, "Marché de Noël");
    const second = await handleStudioRequest(request({
      ...base, action: "composition_save", revision: 1,
      composition: design("Nouvelle affiche"), composition_use_image: false,
    }));
    assertEquals(second.status, 200);
    assertEquals((await second.json()).composition_history.length, 2);
    const restored = await handleStudioRequest(request({
      ...base, action: "composition_save", revision: 2,
      composition: design("Marché de Noël corrigé"),
      composition_history_id: firstId, composition_use_image: true,
    }));
    assertEquals(restored.status, 200);
    assertEquals((await restored.json()).composition_history.length, 3);
    assertEquals(f.compositions[0].background_path, f.version.result_path);
    assertEquals((f.compositions[0].design as Record<string, unknown>).title, "Marché de Noël corrigé");
  } finally { f.restore(); }
});
Deno.test("a light adjustment routes to preparation without claiming image generation", async () => {
  const f = fixture();
  f.setIntent({
    operation: "existing_tool", existing_tool: "preparation",
    summary: "Je propose d’éclaircir ta photo sans redessiner le produit.",
    preparation: { exposure: 0.2, contrast: 1.04, format: "post" },
  });
  try {
    const res = await handleStudioRequest(request({
      ...base, action: "message", message: "Éclaircis ma photo pour un post 4:5",
      revision: 0, request_id: id(81),
    }));
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.session.proposal, null);
    assertEquals(data.session.messages.at(-1).existing_tool, "preparation");
    assertEquals(data.session.messages.at(-1).preparation,
      { exposure: 0.2, contrast: 1.04, format: "post" });
    assertEquals(f.requests.some((p) => p.includes("studio_confirm_generation")), false);
  } finally { f.restore(); }
});
Deno.test(
  "model cannot stage a real product without a subject reference",
  async () => {
    const f = fixture();
    f.session.source_photo_id = null;
    f.session.source_path = null;
    f.session.proposal = null;
    f.setIntent({
      operation: "product",
      summary: "Ton bol sur une table",
      image_prompt: "A real cup on a table",
      requires_real_subject: true,
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Mon bol sur une table",
          revision: 0,
          request_id: id(81),
        }),
      );
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal, null);
      assertEquals(data.session.messages.at(-1).operation, "clarify");
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "a selected subject is actually inspected and snapshotted in the proposal",
  async () => {
    const f = fixture();
    const ref = {
      id: id(82),
      photo_id: id(5),
      path: "source-ref",
      role: "subject",
      name: "Bol",
    };
    f.session.references = [ref];
    f.setIntent({
      operation: "product",
      summary: "Ton bol sur une table",
      image_prompt: "A real cup on a table",
      requires_real_subject: true,
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Mon bol sur une table",
          revision: 0,
          viewed_reference_id: ref.id,
          request_id: id(83),
        }),
      );
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal.references[0].path, "source-ref");
      const payload = f.payloads[0] as {
        messages: { content: { type: string }[] }[];
      };
      assertEquals(
        payload.messages.at(-1)!.content.some((b) => b.type === "image"),
        true,
      );
      assertEquals(data.session.proposal.original_path, "source-ref");
      assertEquals(data.session.proposal.cost, 1);
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);

Deno.test(
  "editing the second selected reference places it first without duplicating it",
  async () => {
    const f = fixture();
    const first = {
      id: id(84),
      photo_id: id(85),
      path: "first",
      role: "subject",
      name: "Premier",
    };
    const second = {
      id: id(86),
      photo_id: id(87),
      path: "second",
      role: "subject",
      name: "Second",
    };
    f.session.references = [first, second];
    f.setIntent({
      operation: "edit",
      summary: "Lumière plus douce",
      image_prompt: "Softer light on the selected second photo",
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Lumière plus douce",
          revision: 0,
          viewed_reference_id: second.id,
          request_id: id(88),
        }),
      );
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal.input_path, "second");
      assertEquals(
        data.session.proposal.references.map((r: { path: string }) => r.path),
        ["first"],
      );
      assertEquals(data.session.proposal.original_path, "second");
    } finally {
      f.restore();
    }
  },
);

Deno.test("v4 poster confirms the text sent to image generation and keeps older references out", async () => {
  const f = fixture();
  const product = { id: id(90), photo_id: id(91), path: "product", role: "style", name: "Bol" };
  const ambience = { id: id(92), photo_id: id(93), path: "ambience", role: "product", name: "Atelier" };
  const old = { id: id(94), photo_id: id(95), path: "old", role: "style", name: "Ancien décor" };
  f.session.references = [product, ambience, old];
  f.setIntent({
    operation: "product",
    summary: "Affiche portrait du bol dans l'atelier, avec le titre Atelier Céramique et la date 12 décembre.",
    product_placement: "Le bol repose sur son fond, ouverture vers le haut, sur la table de l'atelier.",
    image_prompt: "Scene: portrait poster of the bowl resting base-down on the workshop table. Text: Atelier Céramique, 12 décembre.",
    exact_text: ["Atelier Céramique", "12 décembre"],
    reference_use: [{ id: product.id, role: "product" }, { id: ambience.id, role: "style" }],
    requires_real_subject: true,
  });
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 4, action: "message", message: "Une affiche avec mon bol et l'atelier, titre Atelier Céramique, date 12 décembre",
      revision: 0, reference_ids: [product.id, ambience.id, old.id], request_id: id(96),
    }));
    const data = await res.json();
    assertEquals(res.status, 200);
    const proposal = data.session.proposal;
    assertEquals(proposal.image_prompt.startsWith("Scene: portrait poster"), true);
    const sent = imagePrompt(proposal);
    assertEquals(sent.includes(proposal.summary), true);
    assertEquals(sent.includes(proposal.image_prompt), true);
    assertEquals(sent.includes("do not introduce unconfirmed subjects"), true);
    assertEquals(proposal.exact_text, ["Atelier Céramique", "12 décembre"]);
    assertEquals(proposal.composition, undefined);
    assertEquals(proposal.reference_snapshot.map((r: { path: string; role: string }) => [r.path, r.role]), [["product", "product"], ["ambience", "style"]]);
    assertEquals(data.session.messages.at(-2).reference_ids, [product.id, ambience.id, old.id]);
    assertEquals(data.session.messages.at(-2).reference_snapshot.map((r: { path: string }) => r.path), ["product", "ambience"]);
  } finally { f.restore(); }
});

Deno.test("a product scene prioritizes the product over a mood photo and confirms its support", async () => {
  const f = fixture();
  const mood = { id: id(530), photo_id: id(531), path: "provence", role: "style", name: "Cour provençale" };
  const plate = { id: id(532), photo_id: id(533), path: "plate", role: "product", name: "Céramique aux coquelicots" };
  f.session.references = [mood, plate];
  f.setIntent({
    operation: "product", visual_kind: "photo", source_reference_id: mood.id,
    summary: "La pièce en céramique repose à plat sur la table en pierre, vue de trois quarts, dans la cour provençale.",
    product_placement: "À plat sur la table en pierre ; le fond touche la table et le décor reste visible en vue de trois quarts.",
    image_prompt: "Scene: the ceramic dish lies flat on the stone table in the Provençal courtyard. Camera and perspective: three-quarter view, thin edge visible. Contact and light: the base touches the table, contact shadow consistent with the courtyard light.",
    reference_use: [{ id: mood.id, role: "style" }, { id: plate.id, role: "product" }],
    requires_real_subject: true,
  });
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 4, action: "message", message: "Mon produit dans ce décor, posé à plat sur la table",
      revision: 0, reference_ids: [mood.id, plate.id], request_id: id(534),
    }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.proposal.product_placement.includes("À plat"), true);
    assertEquals(data.session.proposal.references.map((r: { role: string }) => r.role), ["product"]);
    assertEquals(data.session.proposal.reference_snapshot.map((r: { role: string }) => r.role), ["style", "product"]);
    const proposal = data.session.proposal;
    assertEquals(proposal.image_prompt.includes("thin edge visible"), true);
    const content = (f.payloads[0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> }).messages.at(-1)!.content;
    assertEquals(content[0].text?.includes(`Référence jointe 1, ID ${mood.id}`), true);
    assertEquals(content[1].type, "image");
    assertEquals(content[2].text?.includes(`Référence jointe 2, ID ${plate.id}`), true);
    assertEquals(content[3].type, "image");
    assertEquals(JSON.parse(content.at(-1)!.text!).demande, "Mon produit dans ce décor, posé à plat sur la table");
    // Verify the persisted proposal, not just a hand-built prompt, at the provider boundary.
    let sentPrompt = "";
    let inputOrder: string[] = [];
    globalThis.fetch = async (_input, init) => {
      const form = (init as any)?.body as FormData;
      sentPrompt = String(form.get("prompt"));
      inputOrder = await Promise.all(form.getAll("image[]").map((part) => (part as Blob).text()));
      return new Response(JSON.stringify({ data: [{ b64_json: btoa("result") }] }), { headers: { "Content-Type": "application/json" } });
    };
    await generateImage(proposal, [proposal.input_path, ...proposal.references.map((ref: { path: string }) => ref.path)].map(path => new Blob([path], { type: "image/jpeg" })));
    assertEquals(inputOrder, ["provence", "plate"]);
    assertEquals(sentPrompt.includes("Image 2: product reference, Céramique aux coquelicots"), true);
    assertEquals(sentPrompt.includes("Image 1 is the selected version to edit"), true);
    assertEquals(sentPrompt.includes(proposal.summary), true);
    assertEquals(sentPrompt.includes(proposal.image_prompt), true);
    assertEquals(sentPrompt.indexOf("REFERENCE IMAGES") < sentPrompt.indexOf("SHOT INSTRUCTIONS"), true);
  } finally { f.restore(); }
});

Deno.test("a new product scene without a support decision asks before generation", async () => {
  const f = fixture();
  const product = { id: id(535), photo_id: id(536), path: "plate", role: "product", name: "Céramique" };
  f.session.references = [product];
  f.setIntent({
    operation: "product", summary: "Céramique au premier plan", image_prompt: "Céramique au premier plan",
    reference_use: [{ id: product.id, role: "product" }], requires_real_subject: true,
  });
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 4, action: "message", message: "Mets mon produit dans ce décor",
      revision: 0, reference_ids: [product.id], request_id: id(537),
    }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.proposal, null);
    assertEquals(data.session.messages.at(-1).operation, "clarify");
    assertEquals(data.session.messages.at(-1).text.includes("ce qui le soutient"), true);
  } finally { f.restore(); }
});

Deno.test("v4 series keeps each approved shot and its distinct technical prompt", async () => {
  const f = fixture();
  f.setIntent({
    operation: "create", visual_kind: "graphic", photo_treatment: "directed",
    summary: "Une table de travail vide vue de dessus.",
    image_prompt: "Scene: empty worktable. Camera and perspective: overhead view, entire tabletop visible.",
    shots: [{ summary: "La même table vue à hauteur du plateau.", image_prompt: "Scene: same empty worktable. Camera and perspective: table-level view, near edge visible.", format: "landscape" }],
  });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
      request_id: id(538), reference_ids: [], message: "Deux photos d'une table vide, une de dessus et une à hauteur du plateau" }));
    assertEquals(res.status, 200);
    const proposal = (await res.json()).session.proposal;
    assertEquals(proposal.cost, 2);
    assertEquals(proposal.image_prompt.includes("overhead view"), true);
    assertEquals(proposal.shots[0].image_prompt.includes("table-level view"), true);
    const secondPrompt = imagePrompt({ ...proposal, ...proposal.shots[0], series_size: 2, series_index: 1 });
    assertEquals(secondPrompt.includes(proposal.shots[0].summary), true);
    assertEquals(secondPrompt.includes("overhead view"), false);
    assertEquals(f.requests.some((path) => path.includes("studio_confirm")), false);
  } finally { f.restore(); }
});

Deno.test("v4 independent creation does not inherit references from the selected image", async () => {
  const f = fixture();
  f.version.status = "ready";
  f.session.references = [{ id: id(97), photo_id: id(98), path: "former-product", role: "product", name: "Ancien produit" }];
  f.setIntent({ operation: "create", summary: "Une affiche abstraite pour un nouveau projet", image_prompt: "Abstract poster" });
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 4, action: "message", message: "Nouvelle affiche abstraite sans mon ancien produit",
      viewed_version_id: proposalId, reference_ids: [], revision: 0, request_id: id(99),
    }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.proposal.references, []);
    assertEquals(data.session.proposal.reference_snapshot, []);
    assertEquals(data.session.proposal.viewed_version_id, null);
  } finally { f.restore(); }
});

Deno.test("v4 new take sends the selected version as a visible reference", async () => {
  const f = fixture();
  f.version.status = "ready";
  f.setIntent({ operation: "create", uses_selected_version: true,
    summary: "<summary>Nouvelle prise du même bol</summary>\n<parameter name=\"format\">square",
    image_prompt: "Same bowl from another angle" });
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 4, action: "message", message: "Une autre vue de ce bol",
      viewed_version_id: proposalId, reference_ids: [], revision: 0, request_id: id(100),
    }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.proposal.summary, "Nouvelle prise du même bol");
    assertEquals(data.session.proposal.references[0].path, f.version.result_path);
    assertEquals(data.session.proposal.viewed_version_id, proposalId);
    assertEquals(data.session.proposal.input_path, null);
  } finally { f.restore(); }
});

Deno.test("v4 routes new photos to Soul and preserves OpenAI text posters", async () => {
  const keys = ["HIGGSFIELD_SOUL2_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED"];
  const before = keys.map((key) => Deno.env.get(key));
  keys.forEach((key) => Deno.env.set(key, "true"));
  try {
    for (const [intent, expected] of [
      [{ operation: "create", visual_kind: "photo", photo_treatment: "natural", summary: "Portrait photographique naturel d'un mannequin fictif", image_prompt: "Portrait photographique" }, "higgsfield-ai/soul/v2/standard"],
      [{ operation: "create", visual_kind: "photo", summary: "Affiche photo avec le titre Atelier", image_prompt: "Affiche photo", exact_text: ["Atelier"] }, "gpt-image-2.5-flare"],
    ] as const) {
      const f = fixture();
      f.session.source_photo_id = null;
      f.session.source_path = null;
      f.setIntent(intent);
      try {
        const res = await handleStudioRequest(request({
          ...base, studio_version: 4, action: "message", message: intent.summary,
          revision: 0, reference_ids: [], request_id: id("exact_text" in intent ? 109 : 108),
        }));
        const data = await res.json();
        assertEquals(res.status, 200);
        assertEquals(data.session.proposal.model, expected);
        assertEquals(data.session.proposal.provider, expected.includes("soul") ? "higgsfield" : "default");
        if (intent.photo_treatment === "natural") {
          assertEquals(data.session.proposal.photo_treatment, "natural");
          assertEquals(data.session.proposal.image_prompt, intent.image_prompt);
        }
      } finally { f.restore(); }
    }
  } finally {
    keys.forEach((key, index) => before[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, before[index]!));
  }
});

Deno.test("a completed Studio image can be joined as a reference without copying it into the library", async () => {
  const f = fixture();
  f.version.status = "ready";
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 4, action: "reference", version_id: proposalId,
      reference_role: "style", revision: 0,
    }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.references.length, 1);
    assertEquals(data.session.references[0].version_id, proposalId);
    assertEquals(data.session.references[0].path, f.version.result_path);
    assertEquals(data.session.references[0].role, "style");
    assertEquals(f.requests.some((path) => path === "/rest/v1/user_photos"), false);
  } finally { f.restore(); }
});

Deno.test(
  "a detailed edit preserves all eight invariants instead of rejecting or truncating them",
  async () => {
    const f = fixture();
    const preserve = [
      "Bol",
      "Forme",
      "Cobalt",
      "Cadrage",
      "Table rouge",
      "Ombres",
      "Style",
      "Angle",
    ];
    f.session.references = [
      {
        id: id(90),
        photo_id: id(5),
        path: "reference",
        role: "subject",
        name: "Bol",
      },
    ];
    f.setIntent({
      operation: "edit",
      summary: "Enlever seulement le citron",
      image_prompt: "Same scene without the lemon",
      preserve,
      change: ["Enlever le citron"],
    });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Enlève seulement le citron",
          revision: 0,
          request_id: id(91),
        }),
      );
      assertEquals(res.status, 200);
      assertEquals((await res.json()).session.proposal.preserve, preserve);
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test(
  "an invalid interpretation permits a deliberate fresh request without writing a message or generating",
  async () => {
    const f = fixture();
    f.setIntent({ operation: "invalid", summary: "Invalid response" });
    try {
      const res = await handleStudioRequest(
        request({
          ...base,
          action: "message",
          message: "Une illustration",
          revision: 0,
          request_id: id(92),
        }),
      );
      assertEquals(res.status, 503);
      assertEquals((await res.json()).code, "refresh_request");
      assertEquals(f.session.messages, []);
      assertEquals(f.session.revision, 0);
      assertEquals(
        f.requests.some((p) => p.includes("studio_confirm")),
        false,
      );
    } finally {
      f.restore();
    }
  },
);
Deno.test('series confirmation snapshots stable child ids and displays the full charge',async()=>{
 const f=fixture();f.session.source_photo_id=null;f.session.source_path=null;
 f.setIntent({operation:'create',summary:'Premier plan',image_prompt:'Illustration du service',shots:[{summary:'Détail',image_prompt:'Un détail graphique',format:'square'},{summary:'Bannière',image_prompt:'Une bannière graphique',format:'landscape'}]});
 try{
  const res=await handleStudioRequest(request({...base,studio_version:3,action:'message',message:'Trois images pour mon site',request_id:id(510),revision:0}));
  assertEquals(res.status,200);const body=await res.json();assertEquals(body.session.proposal.cost,3);assertEquals(body.session.proposal.shots.length,2);
  assertEquals(new Set([body.session.proposal.id,...body.session.proposal.shots.map((s:{id:string})=>s.id)]).size,3);
  assertEquals(f.requests.some(p=>p.includes('studio_confirm_generation')),false);
 }finally{f.restore();}
});
Deno.test('a legacy client never receives hidden extra charged images',async()=>{
 const f=fixture();f.setIntent({operation:'create',summary:'Une illustration',image_prompt:'Une illustration',shots:[{summary:'Autre',image_prompt:'Un autre plan',format:'square'}]});
 try{const res=await handleStudioRequest(request({...base,action:'message',message:'Deux images',request_id:id(511),revision:0}));const body=await res.json();assertEquals(res.status,200);assertEquals(body.session.proposal.cost,1);assertEquals(body.session.proposal.shots,[]);}finally{f.restore();}
});

Deno.test("composition preserves supplied time ranges and titles without style cleanup",async()=>{
 const f=fixture();const design={title:"Noël — atelier",body:"Céramiques faites main",footer:"19 décembre · 10 h – 18 h · Lyon",format:"portrait"};
 f.session.composition={design:{...design,layout:"image_full"},background_path:"saved-poster"};
 f.setIntent({operation:"compose",summary:"Affiche éditable",composition:design});
 try{const res=await handleStudioRequest(request({...base,studio_version:3,action:"message",message:"Reprends exactement mes horaires",request_id:id(512),revision:0}));assertEquals(res.status,200);const body=await res.json();const saved=body.session.messages.at(-1).composition;assertEquals(saved.title,design.title);assertEquals(saved.footer,design.footer);assertEquals(saved.layout,"image_full");assertEquals(f.requests.some(p=>p.includes("studio_confirm_generation")),false);}finally{f.restore();}
});

Deno.test("an illustrated poster keeps its editable text with the AI image proposal", async () => {
  const f = fixture();
  f.session.source_photo_id = null;
  f.session.source_path = null;
  const composition = {
    title: "Marché de Noël", body: "Céramiques artisanales",
    footer: "12 décembre · Lyon", format: "portrait",
  };
  f.setIntent({
    operation: "create", summary: "Une affiche illustrée pour le marché",
    image_prompt: "Illustration artisanale sans texte, espace libre pour le titre",
    format: "portrait", composition,
  });
  try {
    const res = await handleStudioRequest(request({
      ...base, studio_version: 3, action: "message",
      message: "Crée une affiche illustrée pour mon marché de Noël du 12 décembre à Lyon",
      request_id: id(513), revision: 0,
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.session.proposal.operation, "create");
    assertEquals(body.session.proposal.composition.title, composition.title);
    assertEquals(body.session.proposal.composition.footer, composition.footer);
    assertEquals(body.session.proposal.composition.layout, "image_full");
    assertEquals(body.session.proposal.cost, 1);
  } finally { f.restore(); }
});

Deno.test("a mentioned stored mannequin cannot be used before its reference is explicitly attached",async()=>{
 const f=fixture();f.memories.push({id:id(601),kind:"casting",name:"Anna — cobalt",note:"Fictive",references:[{id:id(602),path:"private-casting",role:"casting"}]});
 f.setIntent({operation:"create",summary:"Je vais appliquer ce mannequin automatiquement",image_prompt:"Two photos with the saved mannequin"});
 try{const res=await handleStudioRequest(request({...base,studio_version:3,action:"message",message:"Je veux réutiliser Anna — cobalt",request_id:id(603),revision:0}));assertEquals(res.status,200);const body=await res.json();assertEquals(body.session.proposal,null);assertEquals(body.session.messages.at(-1).suggested_memory_ids,[id(601)]);assertEquals(body.session.references,[]);assertEquals(f.requests.some(p=>p.includes("studio_confirm_generation")),false);}finally{f.restore();}
});

Deno.test("pilot keeps only the first-shot brief and removes other shots' directions without generating", async () => {
  const f = fixture();
  const firstPrompt = "Portrait de profil, tête et épaules";
  Object.assign(f.session.proposal!, {
    operation: "create", cost: 2, image_prompt: firstPrompt,
    summary: "Deux portraits : profil puis face",
    preserve: ["Visage approuvé", "veste cobalt"],
    change: ["Profil pour la première", "Face pour la seconde"],
    shots: [{id:id(702),image_prompt:"Portrait de face",summary:"Face",format:"portrait"}],
  });
  try {
    const res = await handleStudioRequest(request({...base,studio_version:3,action:"pilot",proposal_id:proposalId,revision:0}));
    assertEquals(res.status,200);
    const plan = (await res.json()).session.proposal;
    assertEquals(plan.cost,1);
    assertEquals(plan.shots,[]);
    assertEquals(plan.change,[]);
    assertEquals(plan.image_prompt,firstPrompt);
    assertEquals(plan.preserve,["Visage approuvé", "veste cobalt"]);
    assertEquals(plan.id === proposalId,false);
    assertEquals(f.requests.some(p=>p.includes("studio_confirm_generation")),false);
  } finally { f.restore(); }
});

const fictionalPerson = (mode: "sheet" | "scene" = "sheet", memory_ids: string[] = []) => ({
  mode, name: "Nora fictive", stable_traits: "42 ans, peau brune, yeux noisette, nez droit, bouche large, boucles courtes, silhouette élancée, mains fines, bague argent à l'index gauche",
  variable_details: mode === "sheet" ? "T-shirt bleu uni, fond clair, lumière neutre" : "Veste rouge, bibliothèque, lumière du jour",
  views: mode === "sheet" ? ["face", "trois quarts", "profil", "sourire"] : [],
  memory_ids, uses_existing_identity: mode === "scene",
});
Deno.test("reference identity method reaches interpreter for short, detailed and ordinary requests", async () => {
  for (const [n, message] of ["Je veux générer une personne de référence pour ma marque", "Créer mon égérie fictive : 42 ans, peau brune, boucles courtes", "Photographie mon mannequin dans cette tenue", "Un mannequin de vitrine blanc", "Un paysage marin"].entries()) {
    const f = fixture(); f.session.proposal = null;
    try {
      const res = await handleStudioRequest(request({...base, studio_version:4, action:"message", message, reference_ids:[], request_id:id(800+n), revision:0}));
      assertEquals(res.status, 200);
      const payload = JSON.stringify(f.payloads[0]);
      assertEquals(payload.includes("COMPÉTENCE : IDENTITÉ VISUELLE RÉUTILISABLE"), true);
      assertEquals(payload.includes("person_reference"), true);
      assertEquals((await res.json()).session.proposal, null);
    } finally { f.restore(); }
  }
});
Deno.test("detailed reference sheet retains identity separately and suppresses brand scenery at provider", async () => {
  const f = fixture();
  f.setIntent({operation:"create", summary:"Nora fictive en quatre vues sur fond clair", image_prompt:"Technical reference", person_reference:fictionalPerson()});
  try {
    const res = await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"Créer cette personne fictive",reference_ids:[],request_id:id(810),revision:0}));
    const plan = (await res.json()).session.proposal;
    assertEquals(plan.person_reference.stable_traits, fictionalPerson().stable_traits);
    assertEquals(plan.cost,1);
    assertEquals(plan.shots,[]);
    const prompt = imagePrompt({...plan, brand_context:{charter:{photo_style:"Jardin tropical violet"}}});
    assertEquals(prompt.startsWith("photorealistic character reference sheet"),true);
    assertEquals(prompt.includes("Jardin tropical violet"),false);
    assertEquals(prompt.endsWith("No text or labels."),true);
    assertEquals(prompt.includes("42 ans"),true);
  } finally { f.restore(); }
});
Deno.test("named casting reuse selects only that workspace identity and retains it for corrections", async () => {
  const f=fixture();
  f.memories.push(
    {id:id(820),kind:"casting",name:"Nora",note:"Identité Nora, bague gauche",references:[{id:id(821),path:"nora.jpg",role:"casting"}]},
    {id:id(822),kind:"casting",name:"Iris",note:"Autre personne",references:[{id:id(823),path:"iris.jpg",role:"casting"}]},
  );
  f.session.references=[{id:id(824),path:"old-mood.jpg",role:"style",name:"Ancien décor"}];
  f.setIntent({operation:"create",summary:"Nora fictive en veste rouge dans la bibliothèque",image_prompt:"Nora scene",person_reference:fictionalPerson("scene",[id(820)])});
  try {
    const res=await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"Nora en veste rouge dans la bibliothèque",reference_ids:[],request_id:id(825),revision:0}));
    const result=await res.json(), plan=result.session.proposal;
    assertEquals(plan.references.map((r: {path:string})=>r.path),["nora.jpg"]);
    assertEquals(plan.reference_snapshot[0].role,"casting");
    assertEquals(plan.references[0].description,"Identité Nora, bague gauche");
    assertEquals(result.session.references.length,2);
    assertEquals(imagePrompt(plan).includes("photorealistic character reference sheet"),false);
    assertEquals(imagePrompt(plan).includes("Identité Nora, bague gauche"),true);
    assertEquals(f.requests.some(p=>p.includes("studio_confirm_generation")),false);
  } finally { f.restore(); }
});
Deno.test("unknown or ambiguous saved person never produces a proposal",async()=>{
  for (const duplicate of [false,true]) {
    const f=fixture();
    if(duplicate) f.memories.push(...[830,831].map(n=>({id:id(n),kind:"casting",name:"Nora",note:"Fictive",references:[{id:id(n+10),path:`${n}.jpg`,role:"casting"}]})));
    f.setIntent({operation:"create",summary:"Scène Nora",image_prompt:"Nora",person_reference:fictionalPerson("scene",[id(830)])});
    try {
      const res=await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"Réutilise Nora",reference_ids:[],request_id:id(835),revision:0}));
      const body=await res.json();assertEquals(body.session.proposal,null);assertEquals(body.session.messages.at(-1).operation,"clarify");
    } finally { f.restore(); }
  }
});
Deno.test("a mood reference cannot anchor a scene or a complementary sheet",async()=>{
  for (const mode of ["sheet","scene"] as const) {
    const f=fixture();f.session.references=[{id:id(850),path:"mood.jpg",role:"style",name:"Ambiance"}];
    f.setIntent({operation:"create",summary:"Même personne",image_prompt:"Same person",person_reference:{...fictionalPerson(mode),uses_existing_identity:true},reference_use:[{id:id(850),role:"style"}]});
    try {const res=await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"Reprends la même personne",reference_ids:[id(850)],request_id:id(851),revision:0}));assertEquals((await res.json()).session.proposal,null);}finally{f.restore();}
  }
});
Deno.test("a supplied fictional image anchors the complementary sheet with its original bytes",async()=>{
  const f=fixture();f.session.references=[{id:id(860),path:"approved-face.jpg",role:"casting",name:"Nora approuvée"}];
  f.setIntent({operation:"create",summary:"Silhouette et mains de Nora",image_prompt:"Body and hands",person_reference:{...fictionalPerson(),uses_existing_identity:true,views:["en pied","mains"]},reference_use:[{id:id(860),role:"casting"}]});
  try {const res=await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"Planche complémentaire en pied et mains",reference_ids:[id(860)],request_id:id(861),revision:0}));const plan=(await res.json()).session.proposal;assertEquals(plan.references[0].path,"approved-face.jpg");assertEquals(plan.person_reference.views,["en pied","mains"]);assertEquals(f.requests.some(path=>path.includes("approved-face.jpg")),true);}finally{f.restore();}
});
Deno.test("independently generated reference sheets cannot masquerade as anchored complementary views",async()=>{
  const f=fixture();f.setIntent({operation:"create",summary:"Deux planches",image_prompt:"Face",person_reference:fictionalPerson(),shots:[{summary:"Corps",image_prompt:"Body",format:"portrait"}]});
  try{const res=await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"Crée deux références cohérentes",reference_ids:[],request_id:id(870),revision:0}));assertEquals((await res.json()).session.proposal,null);}finally{f.restore();}
});
Deno.test("a new scene from the selected sheet actually forwards that image to the provider",async()=>{
 const f=fixture();f.version.status="ready";Object.assign(f.version.proposal,{person_reference:fictionalPerson(),references:[]});
 f.setIntent({operation:"create",summary:"Nora dans un café",image_prompt:"New scene",person_reference:fictionalPerson("scene")});
 try{const res=await handleStudioRequest(request({...base,studio_version:4,action:"message",message:"La même personne dans un café",viewed_version_id:proposalId,reference_ids:[],request_id:id(880),revision:0}));const plan=(await res.json()).session.proposal;assertEquals(plan.references[0].path,f.version.result_path);assertEquals(plan.references[0].role,"casting");assertEquals(plan.input_path,null);}finally{f.restore();}
});


Deno.test("scene preparation sees originals but sends neither product nor identity to Soul", async () => {
  const keys = ["HIGGSFIELD_SOUL2_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED"];
  const old = keys.map(key => Deno.env.get(key));
  keys.forEach(key => Deno.env.set(key, "true"));
  try {
    for (const includePerson of [false, true]) {
      const f = fixture();
      const product = { id: id(810), photo_id: id(811), path: "original-plate", role: "product", name: "Assiette" };
      const person = { id: id(812), photo_id: id(813), path: "person", role: "person", name: "Personne" };
      f.session.references = includePerson ? [product, person] : [product];
      f.setIntent({ operation: "create", visual_kind: "photo", summary: "Scène vue de haut, à 75°, sans assiette pour la valider d'abord.",
        scene_workflow: { phase: "scene", camera_match: "75° pour respecter la vue de l'assiette" },
        image_prompt: "Summer table, high angle at 75 degrees, clear space for a plate, no plate or text.",
        reference_use: includePerson ? [{ id: person.id, role: "person" }] : [] });
      try {
        const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
          request_id: id(814), reference_ids: f.session.references.map((r: any) => r.id), message: "Prépare la scène avant mon produit" }));
        const data = await res.json();
        assertEquals(res.status, 200);
        const p = data.session.proposal;
        assertEquals(p.provider, "higgsfield");
        assertEquals(p.model, "higgsfield-ai/soul/v2/standard");
        assertEquals(p.references.map((r: any) => r.path), []);
        assertEquals(p.planning_references.map((r: any) => r.path), includePerson ? ["original-plate", "person"] : ["original-plate"]);
        assertEquals(p.reference_snapshot.some((r: any) => r.role === "product"), false);
        assertEquals(p.viewed_reference_id === product.id, false);
        assertEquals(imagePrompt(p).includes("75 degrees"), true);
        assertEquals(imagePrompt(p).includes("product reference, Assiette"), false);
        assertEquals((f.payloads[0] as { messages: { content: { text?: string }[] }[] }).messages.at(-1)!.content.some((c) => c.text?.includes(product.id)), true);
        assertEquals(f.requests.some(path => path.includes("studio_confirm")), false);
      } finally { f.restore(); }
    }
  } finally { keys.forEach((key, i) => old[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, old[i]!)); }
});

Deno.test("integration resumes selected scene with ORIGINAL product and sends scene first to image edits", async () => {
  const f = fixture();
  const product = { id: id(820), photo_id: id(821), path: "original-plate", role: "product", name: "Assiette" };
  f.version.status = "ready";
  Object.assign(f.version.proposal, { scene_workflow: { phase: "scene", camera_match: "Vue de haut" }, planning_references: [product], reference_snapshot: [] });
  f.session.references = [product];
  f.setIntent({ operation: "product", visual_kind: "photo", uses_selected_version: true,
    scene_workflow: { phase: "integration", camera_match: "Conserver la vue de haut" },
    summary: "Insérer l'assiette à plat dans la scène sélectionnée, conserver le reste.", product_placement: "À plat sur le bois, centre libre.",
    image_prompt: "Insert only the original plate, flat on the table, preserve approved scene.", reference_use: [{ id: product.id, role: "product" }] });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
      request_id: id(822), reference_ids: [], viewed_version_id: proposalId, message: "La scène me plaît, ajoute mon assiette" }));
    const data = await res.json();
    assertEquals(res.status, 200);
    const p = data.session.proposal;
    assertEquals(p.provider, "default");
    assertEquals(p.model, "gpt-image-2.5-sunburst");
    assertEquals(p.input_path, f.version.result_path);
    assertEquals(p.references.map((r: any) => r.path), ["original-plate"]);
    let paths: string[] = [];
    let prompt = "";
    globalThis.fetch = async (_input, init) => {
      const form = (init as RequestInit | undefined)?.body as FormData;
      paths = await Promise.all(form.getAll("image[]").map(part => (part as Blob).text()));
      prompt = String(form.get("prompt"));
      return new Response(JSON.stringify({ data: [{ b64_json: btoa("image") }] }));
    };
    await generateImage(p, [p.input_path, ...p.references.map((r: any) => r.path)].map(path => new Blob([path], { type: "image/jpeg" })));
    assertEquals(paths, [f.version.result_path, "original-plate"]);
    assertEquals(prompt.includes("Image 1 is the exact base image"), true);
    assertEquals(prompt.includes("Image 2: product reference, Assiette"), true);
  } finally { f.restore(); }
});

Deno.test("imported scene is the edit input; missing or hallucinated references prevent integration", async () => {
  for (const mode of ["valid", "missing-scene", "unknown-reference"]) {
    const f = fixture();
    const product = { id: id(830), photo_id: id(831), path: "product", role: "product", name: "Produit" };
    const scene = { id: id(832), photo_id: id(833), path: "imported-scene", role: "composition", name: "Décor" };
    f.session.references = [product, scene];
    f.setIntent({ operation: "product", visual_kind: "photo", summary: "Produit dans la scène importée.",
      scene_workflow: { phase: "integration", camera_match: "Même vue" }, image_prompt: "Keep the imported scene, add only product.", product_placement: "Posé à plat sur la table",
      ...(mode === "missing-scene" ? {} : { source_reference_id: scene.id }),
      reference_use: [{ id: product.id, role: "product" }, { id: mode === "unknown-reference" ? id(899) : scene.id, role: "composition" }] });
    try {
      const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
        request_id: id(834), reference_ids: [product.id, scene.id], message: "Ajoute mon produit à mon décor" }));
      const p = (await res.json()).session.proposal;
      assertEquals(res.status, 200);
      if (mode === "valid") { assertEquals(p.input_path, "imported-scene"); assertEquals(p.references.map((r: any) => r.path), ["product"]); }
      else assertEquals(p, null);
    } finally { f.restore(); }
  }
});

Deno.test("scene corrections keep originals reserved; new scenes never fall back to the editor", async () => {
  for (const correction of [false, true]) {
    const f = fixture();
    const product = { id: id(850), photo_id: id(851), path: "product", role: "product", name: "Produit" };
    const person = { id: id(852), photo_id: id(853), path: "person", role: "person", name: "Personne" };
    const place = { id: id(854), photo_id: id(855), path: "place", role: "composition", name: "Lieu exact" };
    f.session.references = [product, person, place];
    if (correction) {
      f.version.status = "ready";
      Object.assign(f.version.proposal, { scene_workflow: { phase: "scene", camera_match: "Vue de haut" }, planning_references: [product], reference_snapshot: [person, place] });
    }
    f.setIntent({ operation: correction ? "edit" : "create", visual_kind: "photo", summary: "Scène avec cette personne dans le lieu fourni, sans produit.",
      scene_workflow: { phase: "scene", camera_match: "Conserver le point de vue compatible" }, image_prompt: "Preserve person and place; leave the product area clear.",
      reference_use: (correction ? [person, place] : [product, person, place]).map(r => ({ id: r.id, role: r.role })) });
    try {
      const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
        request_id: id(856), reference_ids: [product.id, person.id, place.id], ...(correction ? { viewed_version_id: proposalId } : {}), message: "Prépare ou corrige cette scène avec mes références" }));
      const p = (await res.json()).session.proposal;
      assertEquals(res.status, 200);
      assertEquals(p.provider, correction ? "default" : "higgsfield");
      assertEquals(p.planning_references.map((r: any) => r.path).sort(), ["person", "place", "product"]);
      assertEquals(p.references.map((r: any) => r.path), []);
      assertEquals(p.input_path, correction ? f.version.result_path : null);
    } finally { f.restore(); }
  }
});

Deno.test("a correction after integration keeps the ORIGINAL product without duplicating it", async () => {
  const f = fixture();
  const product = { id: id(870), photo_id: id(871), path: "original-product", role: "product", name: "Original" };
  f.version.status = "ready";
  Object.assign(f.version.proposal, { operation: "edit", input_path: "soul-original", scene_workflow: { phase: "integration", scene_path: "soul-original", approved_scene_id: id(869), camera_match: "Vue de haut" }, planning_references: [], reference_snapshot: [product] });
  f.session.references = [product];
  f.setIntent({ operation: "edit", visual_kind: "photo", summary: "Réduire seulement l'ombre sous l'assiette intégrée.",
    scene_workflow: { phase: "integration", camera_match: "Conserver la caméra" }, image_prompt: "Reduce only the plate contact shadow, preserve everything else.", reference_use: [] });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
      request_id: id(872), reference_ids: [], viewed_version_id: proposalId, message: "L'ombre du produit est trop forte, réduis-la" }));
    const p = (await res.json()).session.proposal;
    assertEquals(res.status, 200);
    assertEquals(p.input_path, f.version.result_path);
    assertEquals(p.references.map((r: any) => r.path), ["original-product"]);
    assertEquals(p.photo_source_path, "soul-original");
    assertEquals(imageInputPaths(p), [f.version.result_path, "original-product", "soul-original"]);
    assertEquals(imagePrompt(p).includes("never add a duplicate"), true);
    assertEquals(p.scene_workflow.phase, "integration");
  } finally { f.restore(); }
});

Deno.test("even explicit direct photo requests prepare a Soul scene before integration", async () => {
  const f = fixture();
  const product = { id: id(880), photo_id: id(881), path: "original", role: "product", name: "Assiette" };
  f.session.references = [product];
  f.setIntent({ operation: "product", visual_kind: "photo", summary: "Créer une scène et y placer l'assiette en une passe.",
    scene_workflow: { phase: "direct", camera_match: "Vue de haut" }, image_prompt: "Create a summer lunch scene with the exact original plate lying flat on the table.",
    product_placement: "À plat au centre de la table", reference_use: [{ id: product.id, role: "product" }] });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
      request_id: id(882), reference_ids: [product.id], message: "Je veux explicitement une génération directe, sans scène séparée" }));
    const p = (await res.json()).session.proposal;
    assertEquals(res.status, 200);
    assertEquals(p.input_path, null);
    assertEquals(p.provider, "higgsfield");
    assertEquals(p.references, []);
    assertEquals(p.planning_references.map((r: any) => r.path), ["original"]);
    assertEquals(p.scene_workflow.phase, "scene");
    assertEquals(imagePrompt(p).includes("Image 1 is the approved scene"), false);
  } finally { f.restore(); }
});

Deno.test("selected version ID resolves as composition source while unknown references still fail", async () => {
  for (const sourceOnly of [true, false]) {
    const f = fixture();
    f.version.status = "ready";
    Object.assign(f.version.proposal, { scene_workflow: { phase: "scene", camera_match: "Vue de haut" }, planning_references: [] });
    f.setIntent({ operation: "edit", visual_kind: "photo", summary: "Réduire la lavande dans la scène sélectionnée, sans produit.",
      scene_workflow: { phase: "scene", camera_match: "Conserver le point de vue" },
      source_reference_id: proposalId, image_prompt: "Reduce lavender in selected scene; preserve all other elements.",
      reference_use: sourceOnly ? [] : [{ id: proposalId, role: "composition" }] });
    try {
      const response = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
        request_id: id(910), reference_ids: [], viewed_version_id: proposalId, message: "Réduis la lavande dans cette scène" }));
      const proposal = (await response.json()).session.proposal;
      assertEquals(response.status, 200);
      assertEquals(proposal.input_path, f.version.result_path);
      assertEquals(proposal.references, []);
      assertEquals(proposal.scene_workflow.phase, "scene");
    } finally { f.restore(); }
  }
});

Deno.test("retouch preserves scene workflow and original when the interpreter omits its optional phase", async () => {
  for (const phase of ["scene", "integration"]) {
    const f = fixture();
    const product = { id: id(920), photo_id: id(921), path: "original-product", role: "product", name: "Original" };
    f.version.status = "ready";
    Object.assign(f.version.proposal, { scene_workflow: { phase, camera_match: "Vue de haut" }, format: "portrait",
      planning_references: phase === "scene" ? [product] : [], reference_snapshot: phase === "integration" ? [product] : [] });
    f.session.references = [product];
    f.setIntent({ operation: "edit", visual_kind: "photo", summary: "Corriger seulement les ombres dans la version sélectionnée.",
      image_prompt: "Adjust only the selected image shadows.", reference_use: [] });
    try {
      const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
        request_id: id(922), reference_ids: [], viewed_version_id: proposalId, message: "Corrige les ombres" }));
      const proposal = (await res.json()).session.proposal;
      assertEquals(res.status, 200);
      assertEquals(proposal.scene_workflow.phase, phase);
      assertEquals(proposal.input_path, f.version.result_path);
      assertEquals((phase === "scene" ? proposal.planning_references : proposal.references).map((r: {path:string}) => r.path), ["original-product"]);
      assertEquals((f.payloads[0] as { messages: { content: { text?: string }[] }[] }).messages.at(-1)!.content.some(c => c.text?.includes('"format":"portrait"')), true);
    } finally { f.restore(); }
  }
});

Deno.test("a modest summary overrun remains intact for confirmation without launching an image", async () => {
  const f = fixture();
  const summary = "Conserver la scène et le produit original. ".repeat(60);
  f.setIntent({ operation: "create", summary, image_prompt: "Create the confirmed scene with every preserved detail." });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0,
      request_id: id(940), reference_ids: [], message: "Prépare cette scène" }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.proposal.summary, summary.trim());
    assertEquals(f.requests.some(path => path.includes("studio_confirm")), false);
  } finally { f.restore(); }
});

Deno.test("mixed originals cannot trigger implicit direct OpenAI creation", async () => {
  const f = fixture();
  const product = { id: id(920), photo_id: null, path: "plate-original", role: "product", name: "Assiette" };
  const person = { id: id(921), photo_id: null, path: "face-original", role: "person", name: "Personne" };
  f.session.references = [product, person];
  f.setIntent({ operation: "product", visual_kind: "photo", summary: "La personne présente son assiette en une passe.",
    image_prompt: "A person holding a plate", scene_workflow: { phase: "direct", camera_match: "À hauteur du visage" },
    reference_use: [product, person].map(r => ({ id: r.id, role: r.role })) });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", message: "Moi présentant cette assiette", revision: 0, request_id: id(922), reference_ids: [product.id, person.id] }));
    const p = (await res.json()).session.proposal;
    assertEquals(p.provider, "higgsfield"); assertEquals(p.model, "higgsfield-ai/soul/v2/standard");
    assertEquals(p.references, []); assertEquals(p.planning_references.map((r: any) => r.path), [product.path, person.path]);
    assertEquals(p.scene_workflow.targets.length, 2);
    assertEquals(p.summary.includes("provisoires"), true);
    assertEquals(f.requests.some(path => path.includes("studio_confirm_generation")), false);
  } finally { f.restore(); }
});
Deno.test("Soul unavailability refuses new photography without silently switching provider", async () => {
  const f = fixture(); Deno.env.set("HIGGSFIELD_SOUL2_ENABLED", "false");
  f.setIntent({ operation: "create", visual_kind: "photo", summary: "Un paysage", image_prompt: "Landscape" });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", message: "Une photo de paysage", revision: 0, request_id: id(923), reference_ids: [] }));
    assertEquals(res.status, 503); assertEquals(f.requests.some(path => path.includes("images/")), false);
  } finally { f.restore(); }
});
Deno.test("integration action rejects stale revision, wrong scene approval and changed references before any claim", async () => {
  const { integrationProposal, referenceSignature } = await import("./integration-proposal.ts");
  for (const mode of ["revision", "approval", "references"]) {
    const f = fixture();
    const person = { id: id(924), photo_id: null, path: "person-original", role: "person" as const, name: "Personne" };
    f.session.references = [person]; f.version.status = "ready";
    Object.assign(f.version.proposal, { operation: "create", planning_references: [person],
      scene_reference_signature: referenceSignature([person]),
      scene_workflow: { phase: "scene", camera_match: "Face", targets: [{ role: "person", reference_ids: [person.id], location: "Au centre", instruction: "Intégrer cette identité" }] } });
    const preview = (await integrationProposal(f.version))!;
    if (mode === "references") f.session.references = [];
    try {
      const res = await handleStudioRequest(request({ ...base, action: "integrate", version_id: proposalId, proposal_id: preview.id,
        approved_scene_id: mode === "approval" ? id(925) : proposalId, revision: mode === "revision" ? 99 : 0 }));
      assertEquals(res.status, 409);
      assertEquals(f.requests.some(path => path.includes("studio_confirm_generation")), false);
    } finally { f.restore(); }
  }
});

Deno.test("integration confirmation persists the exact approved scene before one atomic claim", async () => {
  const { integrationProposal } = await import("./integration-proposal.ts");
  const f = fixture(); const savedFetch = globalThis.fetch; const key = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "test-only");
  const person = { id: id(950), photo_id: null, path: "original-person", role: "person" as const, name: "Portrait" };
  f.session.references = [person]; f.version.status = "ready";
  Object.assign(f.version.proposal, { planning_references: [person], scene_workflow: { phase: "scene", camera_match: "Face",
    targets: [{ role: "person", reference_ids: [person.id], location: "Au centre", instruction: "Intégrer cette identité" }] } });
  const preview = (await integrationProposal(f.version))!;
  f.setIntent({ image_prompt: "Replace the provisional person in Image 1 with the exact identity of Image 2. Keep the workshop and pose.", targets: preview.scene_workflow.targets, blocked_reason: "" });
  let claims = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("visual_studio_versions") && url.searchParams.get("id") === `eq.${preview.id}`) return new Response("null", { headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("studio_confirm_generation")) {
      claims++;
      const confirmed = f.session.proposal as any;
      assertEquals(confirmed.input_path, f.version.result_path);
      assertEquals(confirmed.scene_workflow.approved_scene_id, f.version.id);
      assertEquals(confirmed.references[0].path, person.path);
      assertEquals(JSON.parse(String((init as RequestInit | undefined)?.body)).p_proposal, preview.id);
      return new Response(JSON.stringify({ claimed: false }), { headers: { "Content-Type": "application/json" } });
    }
    return savedFetch(input, init);
  };
  try {
    const body = { ...base, action: "integrate", version_id: f.version.id, proposal_id: preview.id, approved_scene_id: f.version.id, revision: 0 };
    assertEquals((await handleStudioRequest(request(body))).status, 200);
    assertEquals(claims, 1);
    assertEquals((await handleStudioRequest(request(body))).status, 409);
    assertEquals(claims, 1);
    assertEquals(f.requests.filter(path => path.includes("/v1/messages")).length, 1);
    assertEquals(f.requests.some(path => path.includes("images/")), false);
  } finally { if (key === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", key); f.restore(); }
});

Deno.test("ambiguous multiple identities keep the specific grouping question instead of a generic scene error", async () => {
  const f = fixture();
  const refs = [{ id: id(960), path: "first", role: "person", name: "Portrait 1", photo_id: null },
    { id: id(961), path: "second", role: "casting", name: "Portrait 2", photo_id: null }];
  f.session.references = refs;
  f.setIntent({ operation: "create", visual_kind: "photo", summary: "Deux portraits", image_prompt: "People in a workshop", reference_use: refs.map(({id, role}) => ({id, role})) });
  try {
    const res = await handleStudioRequest(request({ ...base, action: "message", studio_version: 4, revision: 0, request_id: id(962), reference_ids: refs.map(r => r.id), message: "Fais une photo avec ces portraits" }));
    const data = await res.json(); assertEquals(res.status, 200); assertEquals(data.session.proposal, null);
    assertEquals(data.session.messages.at(-1).text.includes("même personne"), true);
    assertEquals(f.requests.some(path => path.includes("studio_confirm_generation")), false);
  } finally { f.restore(); }
});

Deno.test("advice answers the latest turn and preserves proposal, decisions and pixels despite invalid generation metadata", async()=>{
 const f=fixture(); const original=f.session.proposal;
 f.session.references=[{id:id(2001),photo_id:null,path:'plate',role:'product',name:'img_5751'}];
 f.session.source_metadata={studio_context:{reference_ids:[id(2001)],branch_id:null,start_index:0,decisions:{pose:'Dans les mains'}}};
 f.session.brief='Pose choisie : dans les mains.';
 f.session.messages=[{role:'user',text:'Je tiens mon assiette'},{role:'assistant',text:'Je propose une lumière douce.'}];
 f.setIntent({operation:'advise',reply:'Une lumière douce rend le motif lisible et évite une ombre forte sur ton visage.',reference_use:[{id:id(2999),role:'person'}],requires_real_subject:true,brief:'Un résumé qui oublie la pose'});
 try {
  const res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message:'Pourquoi cette lumière ?',revision:0,request_id:id(2002)}));
  const data=await res.json();assertEquals(res.status,200);assertEquals(data.session.proposal,original);
  assertEquals(data.session.brief,'Pose choisie : dans les mains.');assertEquals(data.session.active_reference_ids,[id(2001)]);
  assertEquals(data.session.messages.at(-1).operation,'advise');assertEquals(data.session.messages.at(-1).text.startsWith('Une lumière douce'),true);
  const body=f.payloads[0] as any;assertEquals(body.messages[0].content,'Je tiens mon assiette');assertEquals(body.messages.at(-1).role,'user');
  assertEquals(body.messages.at(-1).content.filter((c:any)=>c.type==='image').length,1);
  assertEquals(body.tools[0].input_schema.required,['operation','reply']);
  assertEquals(f.requests.some(p=>p.includes('studio_confirm')),false);
 } finally {f.restore();}
});
Deno.test("exact plate and person message repairs library roles and an incomplete target before scene preparation",async()=>{
 const f=fixture(); const a=id(2011),b=id(2012);
 f.session.references=[{id:a,photo_id:null,path:'plate',role:'style',name:'img_5751'},{id:b,photo_id:null,path:'face',role:'subject',name:'img_5174'}];
 f.setIntent({operation:'create',visual_kind:'photo',summary:'Tu présentes ton assiette dans un jardin.',image_prompt:'Person holding a provisional plate in a garden.',reference_use:[{id:a,role:'style'},{id:b,role:'person'}],scene_workflow:{phase:'scene',camera_match:'À hauteur du visage',targets:[{role:'person',reference_ids:[b],location:'Tenant le produit',instruction:'Reprendre cette identité'}]}});
 try {
  const res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message:"J'aimerais qu'on puisse me voir dans un beau décor présentant ma nouvelle assiette. Donc, mon assiette, image 1, et moi, je suis dans l'image 2.",reference_ids:[a,b],revision:0,request_id:id(2013)}));
  const data=await res.json();assertEquals(res.status,200);assertEquals(data.session.proposal.provider,'higgsfield');
  assertEquals(data.session.references.map((r:any)=>r.role),['product','person']);assertEquals(data.session.proposal.scene_workflow.targets.length,2);
  assertEquals(data.session.active_reference_ids,[a,b]);assertEquals(f.requests.some(p=>p.includes('studio_confirm')),false);
 }finally{f.restore();}
});
Deno.test("selection persists explicit empty, resets fresh context and rejects stale or foreign references",async()=>{
 const f=fixture(); f.session.references=[{id:id(2021),photo_id:null,path:'plate',role:'product',name:'Assiette'}];
 f.session.messages=[{role:'user',text:'Une première demande'}];f.session.brief='Ancien brief';
 try{
  const bad=await handleStudioRequest(request({...base,action:'selection',reference_ids:[id(2999)],revision:0}));assertEquals(bad.status,409);
  const res=await handleStudioRequest(request({...base,action:'selection',reference_ids:[],new_request:true,revision:0}));
  const data=await res.json();assertEquals(res.status,200);assertEquals(data.session.active_reference_ids,[]);assertEquals(data.session.proposal,null);assertEquals(data.session.brief,'');
  const stale=await handleStudioRequest(request({...base,action:'selection',reference_ids:[id(2021)],revision:0}));assertEquals(stale.status,409);
  assertEquals(f.payloads.length,0);
 }finally{f.restore();}
});
Deno.test("new independent request does not send old pixels or retain approval",async()=>{
 const f=fixture();f.session.references=[{id:id(2031),photo_id:null,path:'old-person',role:'person',name:'Portrait'}];
 f.session.messages=[{role:'user',text:'Mon portrait'}];f.session.source_metadata={studio_context:{reference_ids:[id(2031)],branch_id:null,start_index:0}};
 f.setIntent({operation:'create',summary:'Une illustration abstraite',image_prompt:'Abstract illustration'});
 try{
 const res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message:'Nouvelle idée sans les anciennes photos : une illustration abstraite',reference_ids:[id(2031)],revision:0,request_id:id(2032)}));
 const data=await res.json();assertEquals(res.status,200);assertEquals(data.session.active_reference_ids,[]);assertEquals(data.session.proposal.references,[]);
 assertEquals((f.payloads[0] as any).messages.at(-1).content.some((c:any)=>c.type==='image'),false);
 }finally{f.restore();}
});
Deno.test("fresh session's new-photo wording retains explicitly attached originals",async()=>{
 const f=fixture();f.session.messages=[];f.session.proposal=null;
 const ref={id:id(2041),photo_id:null,path:'new-plate',role:'product',name:'Assiette'};f.session.references=[ref];
 f.setIntent({operation:'clarify',reply:'Tu préfères la présenter dans tes mains ou sur la table ?',decisions:{produit:'Assiette de l’image 1'}});
 try{
 const res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message:'Une nouvelle photo de mon produit',reference_ids:[ref.id],revision:0,request_id:id(2042)}));
 const data=await res.json();assertEquals(res.status,200);assertEquals(data.session.active_reference_ids,[ref.id]);
 assertEquals((f.session.source_metadata as any).studio_context.decisions.produit,'Assiette de l’image 1');
 assertEquals((f.payloads[0] as any).messages.at(-1).content.some((c:any)=>c.type==='image'),true);
 }finally{f.restore();}
});
Deno.test("manual roles survive interpretation and reordered selection survives reads",async()=>{
 const f=fixture(); const a=id(2051),b=id(2052);
 f.session.proposal=null;f.session.references=[{id:a,photo_id:null,path:'plate',role:'product',role_source:'user',name:'Assiette'},{id:b,photo_id:null,path:'face',role:'person',role_source:'user',name:'Portrait'}];
 f.setIntent({operation:'clarify',reply:'Tu préfères une présentation assise ou debout ?',reference_use:[{id:a,role:'style'},{id:b,role:'style'}]});
 try{
 let res=await handleStudioRequest(request({...base,action:'selection',reference_ids:[b,a],revision:0}));assertEquals(res.status,200);
 res=await handleStudioRequest(request({...base,action:'read'}));assertEquals((await res.json()).session.active_reference_ids,[b,a]);
 res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message:'Je veux préparer la mise en scène',revision:1,request_id:id(2053)}));
 const data=await res.json();assertEquals(res.status,200);assertEquals(data.session.references.map((r:any)=>r.role),['product','person']);
 assertEquals(data.session.messages.at(-2).reference_ids,[b,a]);
 res=await handleStudioRequest(request({...base,action:'selection',reference_ids:[b],revision:2}));assertEquals((await res.json()).session.active_reference_ids,[b]);
 res=await handleStudioRequest(request({...base,action:'read'}));assertEquals((await res.json()).session.active_reference_ids,[b]);
 }finally{f.restore();}
});

Deno.test("a quoted explicit conversational correction can replace a manual role",async()=>{
 const f=fixture();const ref={id:id(2061),photo_id:null,path:'photo',role:'product',role_source:'user',name:'Photo'};f.session.references=[ref];
 const message="Ce n’est pas le produit que je veux reprendre : sur cette photo, garde seulement mon visage.";
 f.setIntent({operation:'clarify',reply:'Je garde cette photo pour ton identité. Quel produit veux-tu présenter ?',reference_use:[{id:ref.id,role:'person',explicit_change:message}]});
 try{
 const res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message,reference_ids:[ref.id],revision:0,request_id:id(2062)}));const data=await res.json();
 assertEquals(res.status,200);assertEquals(data.session.references[0].role,'person');assertEquals(data.session.references[0].role_explicit,true);
 }finally{f.restore();}
});
Deno.test("an incomplete preparation is repaired once with the same pixels instead of asking the user to resend",async()=>{
 const f=fixture();f.session.messages=[{role:'assistant',text:'Quelle image veux-tu créer ?'}];f.session.proposal=null;
 const ref={id:id(2071),photo_id:null,path:'plate',role:'product',name:'Assiette'};f.session.references=[ref];
 f.setIntent({operation:'create',summary:'Une scène lumineuse',visual_kind:'photo'});
 let attempts=0;
 const currentFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  if(String(input).includes('api.anthropic.com/v1/messages') && ++attempts===2) f.setIntent({operation:'create',summary:'Une scène lumineuse',visual_kind:'photo',image_prompt:'A ceramic plate displayed on a table in a bright workshop.'});
  return currentFetch(input,init);
 };
 try{
 const res=await handleStudioRequest(request({...base,studio_version:4,action:'message',message:'Prépare une photo de cette assiette',reference_ids:[ref.id],revision:0,request_id:id(2072)}));const data=await res.json();
 assertEquals(res.status,200);assertEquals(attempts,2);assertEquals(data.session.proposal.provider,'higgsfield');
 const second=f.payloads[1] as any;assertEquals(second.messages.at(-1).content.some((c:any)=>c.type==='image'),true);
 assertEquals(second.tools[0].input_schema.required.includes('image_prompt'),true);
 assertEquals(f.requests.some(p=>p.includes('studio_confirm')),false);
 }finally{f.restore();}
});

// Décor généré + mannequin + produit : le produit exact n'est jamais perdu en silence.
Deno.test("originals attached after a scene integrate into it instead of staying provisional", async () => {
  const f = fixture();
  const mannequin = { id: id(1300), photo_id: null, version_id: id(1301), path: "mannequin", role: "style", name: "Planche mannequin" };
  const product = { id: id(1302), photo_id: id(1303), path: "product", role: "product", name: "Bougie" };
  f.version.status = "ready";
  Object.assign(f.version.proposal, { operation: "create", visual_kind: "photo", scene_workflow: { phase: "scene", camera_match: "Vue de face" }, planning_references: [], reference_snapshot: [] });
  f.session.references = [mannequin, product];
  f.setIntent({ operation: "edit", visual_kind: "photo", summary: "Le mannequin assis dans ce salon tient ma bougie.", image_prompt: "Add the model seated on the sofa holding the candle.",
    change: ["Ajouter le mannequin assis sur le canapé", "Le mannequin tient la bougie"], product_placement: "Tenue à deux mains",
    reference_use: [{ id: mannequin.id, role: "casting" }, { id: product.id, role: "product" }] });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0, request_id: id(1304),
      viewed_version_id: proposalId, reference_ids: [mannequin.id, product.id], message: "Mets mon mannequin dans ce décor, il tient mon produit" }));
    const p = (await res.json()).session.proposal;
    assertEquals(res.status, 200);
    assertEquals(p.scene_workflow.phase, "integration");
    assertEquals(p.input_path, f.version.result_path);
    assertEquals(p.references.map((r: any) => r.path).sort(), ["mannequin", "product"]);
  } finally { f.restore(); }
});

Deno.test("an unconfirmed or forgotten original asks before generating", async () => {
  for (const mode of ["auto", "forgotten"]) {
    const f = fixture();
    const decor = { id: id(1310), photo_id: id(1311), path: "decor", role: "scene", name: "Décor" };
    const product = { id: id(1312), photo_id: id(1313), path: "product", role: mode === "auto" ? "auto" : "product", name: "IMG_1234.jpg" };
    f.session.references = [decor, product];
    f.setIntent({ operation: "edit", visual_kind: "photo", summary: "Mon produit posé dans le décor.", image_prompt: "Add the product on the table.",
      change: ["Ajouter le produit sur la table"], product_placement: "Posé sur la table",
      reference_use: mode === "auto" ? [{ id: decor.id, role: "scene" }, { id: product.id, role: "auto" }] : [{ id: decor.id, role: "scene" }] });
    try {
      const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0, request_id: id(1314),
        reference_ids: [decor.id, product.id], message: "Pose mon produit dans ce décor" }));
      const data = await res.json();
      assertEquals(res.status, 200);
      assertEquals(data.session.proposal, null);
      assertEquals(data.session.messages.at(-1).text.includes("IMG_1234.jpg"), true);
    } finally { f.restore(); }
  }
});

Deno.test("a decor generated without references keeps the model and product added since, without asking", async () => {
  const f = fixture();
  const mannequin = { id: id(1320), photo_id: null, version_id: id(1321), path: "mannequin", role: "casting", name: "Planche mannequin" };
  const product = { id: id(1322), photo_id: id(1323), path: "product", role: "product", name: "Bougie" };
  f.version.status = "ready";
  Object.assign(f.version.proposal, { operation: "create", visual_kind: "photo", scene_workflow: { phase: "scene", camera_match: "Vue de face" }, planning_references: [], reference_snapshot: [] });
  f.session.references = [mannequin, product];
  f.session.source_metadata = { studio_context: { reference_ids: [mannequin.id, product.id], branch_id: null, start_index: 0 } };
  f.setIntent({ operation: "edit", visual_kind: "photo", summary: "Le mannequin tient ma bougie dans ce salon.", image_prompt: "Add the model holding the candle.",
    change: ["Ajouter le mannequin tenant la bougie"], product_placement: "Tenue à deux mains",
    reference_use: [{ id: mannequin.id, role: "casting" }, { id: product.id, role: "product" }] });
  try {
    const res = await handleStudioRequest(request({ ...base, studio_version: 4, action: "message", revision: 0, request_id: id(1324),
      viewed_version_id: proposalId, message: "Mets mon mannequin dans ce décor, il tient mon produit" }));
    const data = await res.json();
    assertEquals(res.status, 200);
    assertEquals(data.session.proposal.scene_workflow.phase, "integration");
    assertEquals(data.session.proposal.references.map((r: any) => r.path).sort(), ["mannequin", "product"]);
  } finally { f.restore(); }
});
