// NON-RÉGRESSION pinterest-photo-brief (chantier « séparation écriture /
// design ») : DEUX appels IA. Appel 1 = brief photo + TEXTE de l'overlay + SEO
// (aucun HTML). Appel 2 = overlay_html à partir de ce texte FINAL, validé par
// le code ; écart → relance unique → repli construit par le code. Les gardes
// déterministes (contraste, plancher 18px) s'appliquent toujours. Appels IA
// simulés (aucun réseau).
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/pinterest-photo-brief/index_test.ts

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicFailure,
  anthropicToolSuccess,
  authedRequest,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";
import { visibleTextOfHtml } from "../_shared/pinterest-pin-guards.ts";
import { checkHtmlTextFidelity, photoOverlayTextSpec } from "../_shared/pinterest-two-step.ts";

setTestEnv();
const { handlePinterestPhotoBriefRequest, PHOTO_OVERLAY_MIN_FONT_PX } = await import("./index.ts");

const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/pinterest-photo-brief`;

// deno-lint-ignore no-explicit-any
type Json = any;

const PHOTO_BRIEF = {
  what: "Un bureau lumineux avec un carnet ouvert",
  framing: "flat lay",
  lighting: "lumière naturelle",
  props: ["carnet", "tasse", "plante"],
  colors: "rose poudré, crème",
  mood: "chaleureux et professionnel",
};

const OVERLAY_TEXT = { title: "Mon bureau de créatrice", subtitle: "Trois astuces pour travailler sereinement" };

const TEXT_OUT = { photo_brief: PHOTO_BRIEF, overlay_text: OVERLAY_TEXT, title: "Bureau de créatrice", description: "Une description." };

const HEALTHY_OVERLAY =
  `<style>@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville&display=swap');</style>` +
  `<div style="width:1000px;height:1500px;background:#FFF4F8;padding:60px 50px">` +
  `<h1 style="color:#91014b;font-size:56px">Mon bureau de créatrice</h1>` +
  `<p style="color:#1A1A2E;font-size:18px">Trois astuces pour travailler sereinement</p>` +
  `<p style="color:#1A1A2E;font-size:14px;opacity:0.6">📷 Ajoute ta photo dans Canva ou PowerPoint</p>` +
  `</div>`;

async function run(opts: { designs: Array<string | "fail">; text?: Json; reference?: boolean }) {
  const designs = [...opts.designs];
  const mock = installFetchMock({
    anthropic: (req: Json) => {
      const tool = req?.tools?.[0]?.name;
      if (tool === "save_pinterest_photo_text") return anthropicToolSuccess(tool, structuredClone(opts.text ?? TEXT_OUT));
      if (tool === "save_pinterest_overlay") {
        const next = designs.shift();
        if (next === undefined) throw new Error("appel de mise en forme inattendu");
        return next === "fail" ? anthropicFailure() : anthropicToolSuccess(tool, { overlay_html: next });
      }
      throw new Error(`outil inattendu : ${tool}`);
    },
  });
  const warns: string[] = [];
  const logs: string[] = [];
  const realWarn = console.warn;
  const realLog = console.log;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(" ")); };
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
  try {
    const res = await handlePinterestPhotoBriefRequest(
      authedRequest(URL_FN, {
        subject: "Mon bureau",
        pin_type: "photo_lifestyle",
        ...(opts.reference ? { reference_image_base64: "data:image/jpeg;base64,AAAA" } : {}),
      }),
    );
    const reqs = mock.anthropicRequests;
    return {
      res,
      body: await res.json(),
      warns,
      mock,
      textReq: reqs.find((r) => r?.tools?.[0]?.name === "save_pinterest_photo_text"),
      designReqs: reqs.filter((r) => r?.tools?.[0]?.name === "save_pinterest_overlay"),
      designLog: logs.find((l) => l.startsWith("[pinterest:design]")),
    };
  } finally {
    console.warn = realWarn;
    console.log = realLog;
    mock.restore();
  }
}

function systemText(req: Json): string {
  return (req?.system ?? []).map((b: Json) => b.text).join("\n");
}

function userText(req: Json): string {
  const c = req?.messages?.[0]?.content;
  return typeof c === "string" ? c : (c ?? []).filter((b: Json) => b.type === "text").map((b: Json) => b.text).join("\n");
}

function assertAllWordsIn(text: string, html: string) {
  const visible = visibleTextOfHtml(html);
  for (const w of text.split(/\s+/)) assertStringIncludes(visible, w, `mot « ${w} » perdu`);
}

function assertOverlayFaithful(body: Json) {
  const report = checkHtmlTextFidelity(body.result.overlay_html, photoOverlayTextSpec(body.result.overlay_text));
  assertEquals(report, { ok: true, missing: [], added: [] });
  for (const t of Object.values(body.result.overlay_text) as string[]) assertAllWordsIn(t, body.result.overlay_html);
}

Deno.test("pinterest-photo-brief (a): la rédaction ne demande ni HTML ni design", async () => {
  const { textReq } = await run({ designs: [HEALTHY_OVERLAY] });
  const sys = systemText(textReq);
  for (const marker of ["overlay_html", "HTML", "CSS", "@import", "dégradé", "DÉGRADÉ", "border-radius", "1000px"]) {
    assert(!sys.includes(marker), `le prompt système de rédaction contient « ${marker} »`);
  }
  assert(!userText(textReq).includes("HTML"));
  assert(!JSON.stringify(textReq.tools[0].input_schema).includes("html"));
  // Règles d'écriture conservées.
  assertStringIncludes(sys, "- what : quoi photographier exactement (décris la scène)");
  assertStringIncludes(sys, "- Écriture inclusive point médian");
});

Deno.test("pinterest-photo-brief (b): la mise en forme reçoit le texte FINAL de l'overlay + le système de design", async () => {
  const { designReqs } = await run({ designs: [HEALTHY_OVERLAY], reference: true });
  assertEquals(designReqs.length, 1);
  const user = userText(designReqs[0]);
  assertStringIncludes(user, JSON.stringify(OVERLAY_TEXT.title));
  assertStringIncludes(user, JSON.stringify(OVERLAY_TEXT.subtitle));
  assert(!user.includes("SUJET"), "le design ne repart pas du sujet");
  assert(designReqs[0].messages[0].content.some((b: Json) => b.type === "image"), "image de référence transmise");
  const sys = systemText(designReqs[0]);
  assertStringIncludes(sys, "═══ VISUEL OVERLAY ═══");
  assertStringIncludes(sys, "- Lisibilité mobile : titre min 36px, corps min 18px");
  assertStringIncludes(sys, "FIDÉLITÉ ABSOLUE");
});

Deno.test("pinterest-photo-brief (d): overlay fidèle et sain → identique (hors <link>), brief/titre/description intacts, 1 crédit", async () => {
  const { res, body, warns, mock, designLog } = await run({ designs: [HEALTHY_OVERLAY] });
  assertEquals(res.status, 200);
  assertEquals(mock.anthropicCallCount, 2);
  assertEquals(mock.aiUsageInserts.length, 1);
  assertEquals(mock.aiUsageInserts[0].tokens_used, 300);
  const html: string = body.result.overlay_html;
  assert(html.startsWith("<link href=\"https://fonts.googleapis.com/css2?family="));
  assert(!/@import/.test(html));
  assertStringIncludes(html, HEALTHY_OVERLAY.replace(/<style>[\s\S]*?<\/style>/, ""));
  assertEquals(body.result.photo_brief, PHOTO_BRIEF);
  assertEquals(body.result.title, "Bureau de créatrice");
  assertEquals(body.result.description, "Une description.");
  assertEquals(body.result.overlay_text, OVERLAY_TEXT);
  assertEquals(body.result.design_source, "ai");
  assertOverlayFaithful(body);
  assertEquals(warns.filter((w) => w.includes("gardes déterministes")).length, 0);
  assertStringIncludes(designLog!, `"outcome":"ai"`);
});

Deno.test("pinterest-photo-brief (c): mot modifié → relance avec l'écart → 2e essai fidèle gardé", async () => {
  const reworded = HEALTHY_OVERLAY.replace("Trois astuces", "Cinq astuces");
  const { body, designReqs, designLog } = await run({ designs: [reworded, HEALTHY_OVERLAY] });
  assertEquals(designReqs.length, 2);
  assertStringIncludes(userText(designReqs[1]), "CORRECTION OBLIGATOIRE");
  assertStringIncludes(userText(designReqs[1]), "« Trois astuces pour travailler sereinement »");
  assertEquals(body.result.design_source, "ai");
  assertOverlayFaithful(body);
  assertStringIncludes(designLog!, `"outcome":"ai_retry"`);
});

Deno.test("pinterest-photo-brief (c): texte ajouté / retiré deux fois → repli par le code, texte complet, rien d'inventé", async () => {
  const added = HEALTHY_OVERLAY.replace("</h1>", "</h1><p style=\"font-size:24px;color:#1A1A2E\">Le secret des pros</p>");
  const dropped = HEALTHY_OVERLAY.replace(`<p style="color:#1A1A2E;font-size:18px">Trois astuces pour travailler sereinement</p>`, "");
  const { res, body, mock, designLog } = await run({ designs: [added, dropped] });
  assertEquals(res.status, 200);
  assertEquals(body.result.design_source, "fallback");
  assert(!visibleTextOfHtml(body.result.overlay_html).includes("secret"));
  assertOverlayFaithful(body);
  assertStringIncludes(body.result.overlay_html, "Ajoute ta photo dans Canva ou PowerPoint");
  assertStringIncludes(body.result.overlay_html, "linear-gradient(160deg");
  assertStringIncludes(designLog!, `"outcome":"fallback"`);
  assertEquals(mock.aiUsageInserts.length, 1);
});

Deno.test("pinterest-photo-brief (c): mise en forme en erreur → repli, overlay livré", async () => {
  const { res, body } = await run({ designs: ["fail", "fail"] });
  assertEquals(res.status, 200);
  assertEquals(body.result.design_source, "fallback");
  assertOverlayFaithful(body);
});

Deno.test("pinterest-photo-brief: rédaction en erreur → erreur claire (plus de 500 générique), rien facturé", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicFailure() });
  try {
    const res = await handlePinterestPhotoBriefRequest(authedRequest(URL_FN, { subject: "x", pin_type: "photo_lifestyle" }));
    assertEquals(res.status, 400);
    await res.body?.cancel();
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("pinterest-photo-brief: overlay cassé (blanc sur blanc, 11px) → réparé, chaque mot présent", async () => {
  const broken =
    `<div style="width:1000px;height:1500px;background:#FFFFFF">` +
    `<h1 style="color:#FFFFFF;font-size:56px">Mon bureau de créatrice</h1>` +
    `<p style="color:#1A1A2E;font-size:11px">Trois astuces pour travailler sereinement</p>` +
    `</div>`;
  const { res, body, warns } = await run({ designs: [broken] });
  assertEquals(res.status, 200);
  const html: string = body.result.overlay_html;
  assertEquals(body.result.design_source, "ai");
  assert(!/color:#FFFFFF;font-size:56px/.test(html), "le titre blanc sur blanc doit être corrigé");
  assert(!/font-size:11px/.test(html), "11px doit être remonté");
  assertStringIncludes(html, `font-size:${PHOTO_OVERLAY_MIN_FONT_PX}px`);
  assertOverlayFaithful(body);
  assert(warns.some((w) => w.includes("gardes déterministes")));
});

Deno.test("pinterest-photo-brief: plancher = contrat du prompt (18px), pas celui de pinterest-visual", () => {
  assertEquals(PHOTO_OVERLAY_MIN_FONT_PX, 18);
});
