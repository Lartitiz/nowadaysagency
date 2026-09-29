import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStudioRequest } from "./index.ts";
import { generateImage, imagePrompt } from "./media.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  space = id(2),
  sessionId = id(3),
  proposalId = id(4);
const base = { studio_version: 2, session_id: sessionId, workspace_id: space };
function fixture(role = "owner", replay = false, legacyLarge = false) {
  const saved = globalThis.fetch,
    env = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "PHOTOROOM_API_KEY",
      "ANTHROPIC_API_KEY",
    ].map((k) => [k, Deno.env.get(k)] as const);
  Deno.env.set("SUPABASE_URL", "https://studio.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("PHOTOROOM_API_KEY", "test-only");
  Deno.env.set("ANTHROPIC_API_KEY", "test-only");
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
      const body = JSON.parse(String(init?.body));
      session.archived_at = body.p_archive ? new Date().toISOString() : null;
      session.revision += 1;
      session.proposal = null;
      return json(session);
    }
    if (url.pathname === "/rest/v1/rpc/studio_save_composition") {
      const body = JSON.parse(String(init?.body));
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
    if (url.pathname === "/rest/v1/studio_brand_memory") return json(memories);
    if (url.pathname.startsWith("/rest/v1/brand_")) {
      return json({ mission: "Ateliers artisanaux" });
    }
    if (url.pathname === "/rest/v1/user_photos") {
      assertEquals(url.searchParams.get("removed_from_library_at"), "is.null");
      assertEquals(url.searchParams.get("workspace_id"), `eq.${space}`);
      return json([]);
    }
    if (url.pathname === "/v1/messages") {
      payloads.push(JSON.parse(String(init?.body)));
      return json({
        content: [
          { type: "tool_use", name: "prepare_photo_request", input: intent },
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
    const prompt = JSON.parse((f.payloads[0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0].content.at(-1)!.text);
    assertEquals(prompt.references.map((r: { id: string }) => r.id), [oldRef.id]);
    assertEquals(prompt.historique, []);
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
    const prompt = JSON.parse((f.payloads[0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0].content.at(-1)!.text);
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
    const sent = JSON.parse((f.payloads[0] as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0].content[0].text);
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
    const image = sent.messages[0].content.find((part) => part.source);
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
        payload.messages[0].content.some((b) => b.type === "image"),
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
    operation: "product", visual_kind: "photo",
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
    assertEquals(data.session.proposal.references.map((r: { role: string }) => r.role), ["product", "style"]);
    assertEquals(data.session.proposal.reference_snapshot.map((r: { role: string }) => r.role), ["style", "product"]);
    const proposal = data.session.proposal;
    assertEquals(proposal.image_prompt.includes("thin edge visible"), true);
    const content = (f.payloads[0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> }).messages[0].content;
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
    await generateImage(proposal, proposal.references.map((ref: { path: string }) => new Blob([ref.path], { type: "image/jpeg" })));
    assertEquals(inputOrder, ["plate", "provence"]);
    assertEquals(sentPrompt.includes("Image 1: product reference, Céramique aux coquelicots"), true);
    assertEquals(sentPrompt.includes("Image 2: style reference, Cour provençale"), true);
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
    operation: "create", visual_kind: "photo", photo_treatment: "directed",
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

Deno.test("v4 routes source-free photos and text posters to OpenAI", async () => {
  const keys = ["HIGGSFIELD_SOUL2_ENABLED", "HIGGSFIELD_DATA_USE_REVIEWED"];
  const before = keys.map((key) => Deno.env.get(key));
  keys.forEach((key) => Deno.env.set(key, "true"));
  try {
    for (const [intent, expected] of [
      [{ operation: "create", visual_kind: "photo", photo_treatment: "natural", summary: "Portrait photographique naturel d'un mannequin fictif", image_prompt: "Portrait photographique" }, "gpt-image-2.5-flare"],
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
        assertEquals(data.session.proposal.provider, "default");
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
