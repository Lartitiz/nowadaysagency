import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildVideoPrompt, prepareVideo, signPreparation, verifyPreparation } from "./prepare.ts";

Deno.test("Claude receives the image roles and returns separate summary and provider prompt", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String((init as { body?: unknown } | undefined)?.body)));
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: requests.length === 1 ? "prepare_video_clip" : "audit_video_grounding", input: requests.length === 1 ? {
        summary: "Le produit apparaît dans le décor choisi, puis la caméra avance lentement.",
        scene: "Un seul produit dans le décor de référence. La caméra avance doucement.",
        invariants: ["Le produit conserve sa couleur et sa forme visibles."],
        allowed_changes: "La caméra avance lentement.",
        forbidden_changes: "Aucun changement du produit ou du décor.",
      } : { verdict: "ok" },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await prepareVideo({ idea: "Montre mon produit" }, [{
      name: "Produit", role: "product", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    }]);
    assert(result.summary.includes("produit"));
    assert(result.scene.includes("caméra avance"));
    const prompt = buildVideoPrompt(result, 5, [{ role: "product" }]);
    assert(prompt.includes("@Image 1 = produit à préserver"));
    assert(prompt.includes("conserver leur identité, leur forme"));
    const content = (requests[0] as unknown as { messages: Array<{ content: Array<Record<string, unknown>> }> }).messages[0].content;
    assertEquals(content[1].text, "Image 1 : Produit, rôle product");
    assertEquals((content[2].source as { data: string }).data, "AQID");
    assertEquals(requests.length, 2);
    assert(JSON.stringify(requests[1]).includes('"type":"image"'));
    const audit = requests[1] as { max_tokens: number; tools: Array<{ input_schema: { required: string[] } }> };
    assert(audit.max_tokens >= 512);
    assertEquals(audit.tools[0].input_schema.required, ["verdict"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
});

Deno.test("overlong change rules get one text-only repair without dropping the support rule", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  const requests: Array<Record<string, unknown>> = [];
    const compactAllowed = "Les mains et le bol bougent pendant le geste, puis reviennent au repos sur la même surface rouge. Les ombres suivent naturellement ce mouvement. La caméra garde le cadrage du début à la fin du plan.";
    const first = {
    summary: "Le mannequin prend le bol bleu et le repose sur la même surface rouge.",
    scene: "Le mannequin prend le bol bleu, le soulève puis le repose sur la même surface rouge.",
    invariants: ["Le bol bleu et la surface rouge restent inchangés."],
    allowed_changes: "Les mains et le bol bougent pendant le geste. ".repeat(10),
    forbidden_changes: "Ne pas changer le bol bleu ni la surface rouge. ".repeat(12),
  };
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String((init as { body?: unknown } | undefined)?.body)));
    const input = requests.length === 1 ? first : requests.length === 2 ? {
      allowed_changes: compactAllowed,
      forbidden_changes: "Le bol bleu et la même surface rouge restent inchangés ; aucune seconde table.",
    } : { verdict: "ok", reason: "Même surface rouge." };
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: requests.length === 1 ? "prepare_video_clip" :
        requests.length === 2 ? "condense_video_changes" : "audit_video_grounding", input,
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await prepareVideo({ idea: "Le mannequin prend le bol" }, [{
      name: "Bol bleu", role: "product", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    }]);
    assertEquals(requests.length, 3);
    assert(JSON.stringify(requests[0]).includes('"type":"image"'));
    assert(!JSON.stringify(requests[1]).includes('"type":"image"'));
    assert(JSON.stringify(requests[2]).includes('"type":"image"'));
    assertEquals(result.summary, first.summary);
    assertEquals(result.invariants, first.invariants);
    assert(compactAllowed.length > 180);
    assertEquals(result.allowed_changes, compactAllowed);
    assert(result.forbidden_changes.includes("même surface rouge"));
    assert(buildVideoPrompt(result, 5, [{ role: "product" }]).includes("même surface rouge"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
});

Deno.test("image grounding audit blocks an invented second support but permits an explicit move", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  const requests: Array<Record<string, unknown>> = [];
  const image = { name: "Bol bleu sur support rouge", role: "product",
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) };
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String((init as { body?: unknown } | undefined)?.body));
    requests.push(request);
    const isAudit = requests.length % 2 === 0;
    const input = isAudit ? {
      verdict: requests.length === 2 ? "conflict" : "ok",
      reason: requests.length === 2 ? "La table claire n'est pas demandée." : "Seconde table demandée.",
    } : {
      summary: "Le bol bleu est soulevé de la surface rouge puis posé sur une table claire.",
      scene: "Le bol quitte la surface rouge et est posé sur une table claire dans le même plan.",
      invariants: ["Le bol bleu reste identique pendant le déplacement."],
      allowed_changes: "Le bol se déplace vers la table claire.",
      forbidden_changes: "Ne pas déformer le bol bleu.",
    };
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: isAudit ? "audit_video_grounding" : "prepare_video_clip", input,
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await assertRejects(() => prepareVideo({ idea: "Soulève le bol et repose-le sur la table" }, [image]),
      Error, "studio_video_grounding_conflict");
    assertEquals(requests.length, 2);
    const explicit = await prepareVideo({ idea: "Déplace le bol de la surface rouge vers une seconde table claire" }, [image]);
    assert(explicit.scene.includes("table claire"));
    assertEquals(requests.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
});

Deno.test("text-only preparation uses no image grounding pass", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{
      type: "tool_use", name: "prepare_video_clip", input: {
        summary: "Un galet bleu tourne lentement sur un fond rose uni.",
        scene: "Le galet bleu tourne lentement au centre d'un fond rose uni.",
        invariants: ["Le galet bleu garde sa forme et sa couleur."],
        allowed_changes: "Seule la rotation du galet est demandée.",
        forbidden_changes: "Aucun autre objet ou texte n'apparaît.",
      },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const result = await prepareVideo({ idea: "Galet bleu sur fond rose" }, []);
    assertEquals(calls, 1);
    assert(result.summary.includes("galet bleu"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) Deno.env.delete("ANTHROPIC_API_KEY");
    else Deno.env.set("ANTHROPIC_API_KEY", originalKey);
  }
});

Deno.test("preparation token is bound to the user, images, settings and Claude prompt", async () => {
  const input = { workspace_id: "space", source_kind: "references", references: [
    { kind: "photo", id: "a", role: "product" }, { kind: "photo", id: "b", role: "background" },
  ], duration: 5, resolution: "480p", aspect_ratio: "9:16", prompt: "Slow camera push",
    idea: "Un bol bouge sur sa table.",
    summary: "Le bol reste sur sa table pendant tout le plan.",
    continuity: ["La table rouge reste de la même couleur."],
    allowed_changes: "Les mains se déplacent.", forbidden_changes: "La table ne change pas." };
  const token = await signPreparation(input, "user-a", "secret");
  assert(await verifyPreparation(token, input, "user-a", "secret"));
  assertEquals(await verifyPreparation(token, { ...input, prompt: "Different scene" }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, idea: "Une autre idée." }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, references: [...input.references].reverse() }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, { ...input, continuity: ["Une table blanche apparaît."] }, "user-a", "secret"), false);
  assertEquals(await verifyPreparation(token, input, "user-b", "secret"), false);
});

Deno.test("the final prompt keeps the same table across the whole shot without inventing its material", () => {
  const prompt = buildVideoPrompt({
    summary: "Un mannequin fictif prend un bol bleu sur une surface rouge, puis le repose sur cette même surface.",
    scene: "Le mannequin fictif prend le bol bleu et le repose doucement sur la même surface rouge. Caméra fixe et lumière stable.",
    invariants: ["Bol bleu brillant inchangé.", "Même surface rouge du premier au dernier photogramme ; matière non établie par l'image."],
    allowed_changes: "Les mains et le bol bougent pendant le geste.",
    forbidden_changes: "Pas de seconde table beige, de recoloration ni de coupe.",
  }, 5, [{ role: "product" }, { role: "casting" }]);
  assert(prompt.includes("Même surface rouge du premier au dernier photogramme"));
  assert(prompt.includes("matière non établie"));
  assert(prompt.includes("@Image 1 = produit à préserver ; @Image 2 = mannequin fictif"));
  assert(prompt.length <= 3000);
});

Deno.test("a surface continuity rule survives even if Claude omits the support from its invariants", () => {
  const prompt = buildVideoPrompt({
    summary: "Une personne soulève un produit et le repose doucement.",
    scene: "La personne prend le produit puis le repose dans le même décor.",
    invariants: ["Le produit garde sa forme et sa couleur."],
    allowed_changes: "Les mains et le produit se déplacent.",
    forbidden_changes: "Aucun objet supplémentaire.",
  }, 5, [{ role: "product" }]);
  assert(prompt.includes("celui visible au départ reste le même, de la même couleur et matière apparentes"));
  assert(prompt.includes("après avoir soulevé puis reposé l'objet"));
});

Deno.test("an explicitly requested move to a second surface remains possible", () => {
  const prompt = buildVideoPrompt({
    summary: "Une tasse passe volontairement d'un comptoir à une seconde table.",
    scene: "La personne soulève la tasse du comptoir et la pose sur la table voisine dans le même plan.",
    invariants: ["La tasse conserve sa forme et sa couleur."],
    allowed_changes: "Le déplacement de la tasse du comptoir vers la seconde table est demandé.",
    forbidden_changes: "Pas de table supplémentaire ni de changement de couleur inattendu.",
  }, 5, [{ role: "product" }, { role: "background" }]);
  assert(prompt.includes("Sans demande de changer de support"));
  assert(prompt.includes("Le déplacement de la tasse du comptoir vers la seconde table est demandé"));
  assert(prompt.includes("@Image 1 = produit à préserver ; @Image 2 = décor"));
});

Deno.test("existing product lettering survives while undesired new text is excluded", () => {
  const prompt = buildVideoPrompt({
    summary: "Le pot étiqueté reste identique pendant que la caméra avance.",
    scene: "Le pot étiqueté reste au centre ; la caméra avance lentement vers lui.",
    invariants: ["Le pot bleu et son étiquette NOW restent visibles et inchangés."],
    allowed_changes: "La caméra avance lentement.",
    forbidden_changes: "Aucun nouveau texte sur la scène.",
  }, 5, [{ role: "product" }]);
  assert(prompt.includes("son étiquette NOW restent visibles"));
  assert(prompt.includes("inscriptions et logos déjà présents"));
  assert(prompt.includes("nouvel objet, texte ou logo non demandé"));
});

Deno.test("the maximum structured preparation fits the stored prompt limit", () => {
  const prompt = buildVideoPrompt({
    summary: "s".repeat(1200), scene: "s".repeat(900),
    invariants: Array(4).fill("i".repeat(180)),
    allowed_changes: "a".repeat(180), forbidden_changes: "f".repeat(250),
  }, 10, Array(4).fill({ role: "composition" }));
  assert(prompt.length <= 3000);
  assertThrows(() => buildVideoPrompt({
    summary: "s".repeat(1200), scene: "s".repeat(900),
    invariants: Array(4).fill("i".repeat(180)),
    allowed_changes: "a".repeat(400), forbidden_changes: "f".repeat(500),
  }, 10, Array(4).fill({ role: "composition" })), Error, "studio_video_prompt_too_long");
});
