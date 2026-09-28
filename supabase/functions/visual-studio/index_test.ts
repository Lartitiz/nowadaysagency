import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStudioRequest } from "./index.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  space = id(2),
  sessionId = id(3),
  proposalId = id(4);
const base = { studio_version: 2, session_id: sessionId, workspace_id: space };
function fixture(role = "owner", replay = false) {
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
    source_path: "original" as string | null,
    name: "Photo",
    archived_at: null as string | null,
    revision: 0,
    messages: [],
    proposal: {
      id: proposalId,
      operation: "background",
      summary: "Fond crème",
      background_prompt: "cream",
      cost: 1,
    },
  };
  const version = {
    id: proposalId,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    status: "processing",
    proposal: session.proposal,
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
      session.proposal = null as typeof session.proposal;
      return json(session);
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
    if (
      url.pathname.startsWith("/storage/v1/object/") &&
      !url.pathname.includes("/sign/")
    ) {
      return new Response(new Blob(["source"], { type: "image/jpeg" }));
    }
    if (url.pathname === "/rest/v1/visual_studio_versions") {
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
    session,
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
 f.setIntent({operation:"compose",summary:"Affiche éditable",composition:design});
 try{const res=await handleStudioRequest(request({...base,studio_version:3,action:"message",message:"Reprends exactement mes horaires",request_id:id(512),revision:0}));assertEquals(res.status,200);const body=await res.json();const saved=body.session.messages.at(-1).composition;assertEquals(saved.title,design.title);assertEquals(saved.footer,design.footer);assertEquals(f.requests.some(p=>p.includes("studio_confirm_generation")),false);}finally{f.restore();}
});

Deno.test("a mentioned stored mannequin cannot be used before its reference is explicitly attached",async()=>{
 const f=fixture();f.memories.push({id:id(601),kind:"casting",name:"Anna — cobalt",note:"Fictive",references:[{id:id(602),path:"private-casting",role:"casting"}]});
 f.setIntent({operation:"create",summary:"Je vais appliquer ce mannequin automatiquement",image_prompt:"Two photos with the saved mannequin"});
 try{const res=await handleStudioRequest(request({...base,studio_version:3,action:"message",message:"Je veux réutiliser Anna — cobalt",request_id:id(603),revision:0}));assertEquals(res.status,200);const body=await res.json();assertEquals(body.session.proposal,null);assertEquals(body.session.messages.at(-1).suggested_memory_ids,[id(601)]);assertEquals(body.session.references,[]);assertEquals(f.requests.some(p=>p.includes("studio_confirm_generation")),false);}finally{f.restore();}
});

Deno.test("pilot keeps only the first-shot brief and removes other shots' directions without generating", async () => {
  const f = fixture();
  const firstPrompt = "Portrait de profil, tête et épaules";
  Object.assign(f.session.proposal, {
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
