// NON-RÉGRESSION pinterest-visual (chantier « séparation écriture / design ») :
// DEUX appels IA. Appel 1 « rédaction » = UNIQUEMENT le texte (pin_data + SEO).
// Appel 2 « mise en forme » = le HTML, à partir du texte FINAL, validé par le
// code : un mot changé, ajouté ou retiré → relance unique → repli construit
// par le code (texte complet, couleurs de la charte). Le PNG (pin_html) et le
// PPTX éditable (pin_data) affichent donc le même texte. Appels IA simulés.
//
// `serve()` de std/http : le handler est exporté (handlePinterestVisualRequest)
// et le serve() est derrière `import.meta.main` (patron branding-coaching).
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/pinterest-visual/index_test.ts

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
import { checkHtmlTextFidelity, pinDataTextSpec } from "../_shared/pinterest-two-step.ts";

setTestEnv();
const { handlePinterestVisualRequest } = await import("./index.ts");

const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/pinterest-visual`;

const PIN_DATA = {
  pin_type: "mini_tuto",
  main_title: "Organiser sa semaine de créatrice",
  badge_label: "TUTO",
  elements: [
    { number: 1, label: "Bloquer les créneaux", description: "Deux matinées pour créer." },
    { number: 2, label: "Préparer ses contenus", description: "Un lot le lundi." },
    { number: 3, label: "Célébrer ses victoires", description: "Noter trois réussites." },
  ],
  cta_text: "Enregistre pour plus tard",
  watermark: "Atelier Lune",
};

// HTML d'épingle SAIN et FIDÈLE : chaque texte de PIN_DATA, rien d'autre que
// des numéros et emojis ; tailles ≥ 20px, contrastes lisibles.
function healthyHtml(pd: typeof PIN_DATA = PIN_DATA): string {
  return `<style>@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville&display=swap');</style>` +
    `<div style="width:1000px;height:1500px;background:#FFF4F8;padding:60px 50px">` +
    `<span style="background:#FB3D80;color:#FFFFFF;font-size:22px">${pd.badge_label}</span>` +
    `<h1 style="color:#91014b;font-size:60px">${pd.main_title}</h1>` +
    pd.elements.map((el, i) =>
      `<div style="background:#FFFFFF;color:#1A1A2E;font-size:32px"><span>${el.number}</span> ${["🗓️", "✍️", "🎉"][i] ?? ""} ` +
      `<b>${el.label}</b><p style="font-size:28px">${el.description}</p></div>`
    ).join("") +
    `<p style="color:#1A1A2E;font-size:24px">${pd.cta_text}</p>` +
    `<p style="color:#1A1A2E;font-size:20px;opacity:0.5">${pd.watermark}</p>` +
    `</div>`;
}

const TEXT_OUT = {
  title: "Organiser sa semaine : la méthode",
  description: "Une méthode simple. Enregistre pour plus tard.",
  pin_data: PIN_DATA,
};

// deno-lint-ignore no-explicit-any
type Json = any;

/**
 * Faux appels IA : l'appel 1 (outil save_pinterest_text) renvoie `text`,
 * chaque appel 2 (save_pinterest_design) consomme la réponse suivante de
 * `designs` (objet = sortie de l'outil, "fail" = erreur API).
 */
async function run(opts: { text?: Json; designs: Array<Json | "fail">; pin_type?: string; reference?: boolean }) {
  const designs = [...opts.designs];
  const mock = installFetchMock({
    anthropic: (req: Json) => {
      const tool = req?.tools?.[0]?.name;
      if (tool === "save_pinterest_text") return anthropicToolSuccess("save_pinterest_text", structuredClone(opts.text ?? TEXT_OUT));
      if (tool === "save_pinterest_design") {
        const next = designs.shift();
        if (next === undefined) throw new Error("appel de mise en forme inattendu");
        return next === "fail" ? anthropicFailure() : anthropicToolSuccess("save_pinterest_design", next);
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
    const res = await handlePinterestVisualRequest(authedRequest(URL_FN, {
      subject: "Organiser sa semaine",
      pin_type: opts.pin_type ?? "mini_tuto",
      ...(opts.reference ? { reference_image_base64: "data:image/jpeg;base64,AAAA" } : {}),
    }));
    const body = await res.json();
    const reqs = mock.anthropicRequests;
    const textReq = reqs.find((r) => r?.tools?.[0]?.name === "save_pinterest_text");
    const designReqs = reqs.filter((r) => r?.tools?.[0]?.name === "save_pinterest_design");
    const designLog = logs.find((l) => l.startsWith("[pinterest:design]"));
    return { res, body, warns, mock, textReq, designReqs, designLog };
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

/** Chaque mot de `text` présent dans le texte visible du HTML. */
function assertAllWordsIn(text: string, html: string) {
  const visible = visibleTextOfHtml(html);
  for (const w of text.split(/\s+/)) assertStringIncludes(visible, w, `mot « ${w} » perdu`);
}

/** Le PNG (pin_html) et le PPTX (pin_data) affichent EXACTEMENT le même texte. */
function assertSameTextPngPptx(body: Json) {
  const pd = body.result.pin_data;
  const report = checkHtmlTextFidelity(body.result.pin_html, pinDataTextSpec(pd));
  assertEquals(report, { ok: true, missing: [], added: [] });
  for (const t of [pd.badge_label, pd.main_title, ...pd.elements.flatMap((e: Json) => [e.label, e.description]), pd.cta_text]) {
    if (t) assertAllWordsIn(t, body.result.pin_html);
  }
}

// ── (a) + (b) ───────────────────────────────────────────────────────────────

Deno.test("pinterest-visual (a): l'appel de rédaction ne demande ni HTML ni design", async () => {
  const { textReq } = await run({ designs: [{ pin_html: healthyHtml(), element_emojis: ["🗓️", "✍️", "🎉"] }] });
  const sys = systemText(textReq);
  const user = userText(textReq);
  for (const marker of ["pin_html", "HTML", "CSS", "@import", "DESIGN SYSTEM", "font-size", "border-radius", "Couleur principale", "#FB3D80", "pastille", "emoji"]) {
    assert(!sys.includes(marker), `le prompt système de rédaction contient « ${marker} »`);
    assert(!user.includes(marker), `le message de rédaction contient « ${marker} »`);
  }
  const schema = JSON.stringify(textReq.tools[0].input_schema);
  assert(!schema.includes("pin_html"), "le schéma de rédaction ne doit pas demander de HTML");
  assert(!schema.includes("emoji"), "l'emoji est un choix de design (appel 2)");
  // Les règles d'écriture SEO sont là, mot pour mot.
  assertStringIncludes(sys, "- Mot-clé principal dans les 3 premiers mots");
  assertStringIncludes(sys, "- Écriture inclusive point médian");
  assertStringIncludes(sys, "- Chaque item = texte court (max 8 mots)");
});

Deno.test("pinterest-visual (b): l'appel de mise en forme reçoit le texte FINAL (badge dérivé, emoji de rédaction retiré) et le design system", async () => {
  const pd = structuredClone(PIN_DATA) as Json;
  delete pd.badge_label;
  pd.elements[0].emoji = "🔥"; // la rédaction n'a pas à choisir d'emoji
  const { body, designReqs } = await run({
    text: { ...TEXT_OUT, pin_data: pd },
    designs: [{ pin_html: healthyHtml(), element_emojis: ["🗓️", "✍️", "🎉"] }],
  });
  assertEquals(designReqs.length, 1);
  const user = userText(designReqs[0]);
  const sys = systemText(designReqs[0]);
  // Textes définitifs transmis tels quels, y compris le badge dérivé par le code.
  assertStringIncludes(user, `"badge_label": "TUTO"`);
  for (const t of [PIN_DATA.main_title, ...PIN_DATA.elements.flatMap((e) => [e.label, e.description]), PIN_DATA.cta_text, PIN_DATA.watermark]) {
    assertStringIncludes(user, JSON.stringify(t));
  }
  assert(!user.includes("🔥"), "l'emoji de la rédaction ne doit pas être imposé au design");
  assert(!user.includes("SUJET"), "le design ne réécrit pas à partir du sujet");
  // Même système de design qu'avant.
  assertStringIncludes(sys, "═══ DESIGN SYSTEM (identique aux carrousels) ═══");
  assertStringIncludes(sys, "BADGES \"PILULES\" (élément signature)");
  assertStringIncludes(sys, "FIDÉLITÉ ABSOLUE");
  assertEquals(body.result.pin_data.badge_label, "TUTO");
  // L'emoji retenu = celui que la mise en forme a affiché.
  assertEquals(body.result.pin_data.elements[0].emoji, "🗓️");
});

Deno.test("pinterest-visual (b): image de référence transmise aux deux appels", async () => {
  const { textReq, designReqs } = await run({ reference: true, designs: [{ pin_html: healthyHtml() }] });
  for (const req of [textReq, designReqs[0]]) {
    assert(req.messages[0].content.some((b: Json) => b.type === "image"), "image de référence attendue");
  }
});

// ── (d) chemin nominal ──────────────────────────────────────────────────────

Deno.test("pinterest-visual (d): mise en forme fidèle → HTML IA gardé, chaque mot présent, 1 seul crédit pour 2 appels", async () => {
  const { res, body, warns, mock, designLog } = await run({ designs: [{ pin_html: healthyHtml(), element_emojis: ["🗓️", "✍️", "🎉"] }] });
  assertEquals(res.status, 200);
  assertEquals(mock.anthropicCallCount, 2);
  assertEquals(mock.aiUsageInserts.length, 1, "un seul débit, comme avant");
  assertEquals(mock.aiUsageInserts[0].tokens_used, 300, "tokens des deux appels cumulés");
  const html: string = body.result.pin_html;
  assert(html.startsWith("<link href=\"https://fonts.googleapis.com/css2?family="));
  assert(!/@import/.test(html), "le @import doit être retiré");
  assertStringIncludes(html, healthyHtml().replace(/<style>[\s\S]*?<\/style>/, ""));
  assertEquals(body.result.design_source, "ai");
  assertEquals(body.result.title, TEXT_OUT.title);
  assertEquals(body.result.description, TEXT_OUT.description);
  assertEquals(body.result.pin_data.main_title, PIN_DATA.main_title);
  assertEquals(body.result.pin_data.elements.map((e: Json) => e.label), PIN_DATA.elements.map((e) => e.label));
  assert(body.result.pin_invariants?.palette_used, "invariants toujours fournis");
  assertSameTextPngPptx(body);
  assertEquals(warns.filter((w) => w.includes("[pinterest:pin-data-mismatch]")).length, 0);
  assertStringIncludes(designLog!, `"outcome":"ai"`);
});

// ── (c) appel 2 infidèle → relance → repli ─────────────────────────────────

Deno.test("pinterest-visual (c): un mot modifié → rejeté, relance avec l'écart, 2e essai fidèle gardé", async () => {
  const reworded = healthyHtml().replace("Préparer ses contenus", "Préparer tes contenus");
  const { body, designReqs, designLog, mock } = await run({ designs: [{ pin_html: reworded }, { pin_html: healthyHtml() }] });
  assertEquals(designReqs.length, 2);
  const retryUser = userText(designReqs[1]);
  assertStringIncludes(retryUser, "CORRECTION OBLIGATOIRE");
  assertStringIncludes(retryUser, "« Préparer ses contenus »");
  assertStringIncludes(retryUser, "tes");
  assertEquals(body.result.design_source, "ai");
  assert(!body.result.pin_html.includes("tes contenus"));
  assertSameTextPngPptx(body);
  assertStringIncludes(designLog!, `"outcome":"ai_retry"`);
  assertEquals(mock.aiUsageInserts.length, 1);
});

Deno.test("pinterest-visual (c): un mot AJOUTÉ deux fois → repli construit par le code, texte complet et rien d'inventé", async () => {
  const added = healthyHtml().replace("</h1>", " en 3 étapes faciles</h1>");
  const { res, body, designReqs, designLog, mock } = await run({ designs: [{ pin_html: added }, { pin_html: added }] });
  assertEquals(res.status, 200);
  assertEquals(designReqs.length, 2, "une seule relance");
  assertEquals(body.result.design_source, "fallback");
  const visible = visibleTextOfHtml(body.result.pin_html);
  assert(!visible.includes("faciles"), "le texte inventé ne doit pas sortir");
  assertSameTextPngPptx(body);
  assertAllWordsIn(PIN_DATA.watermark, body.result.pin_html);
  // Couleurs de la charte (défaut neutre ici) et polices liées.
  assert(body.result.pin_html.startsWith("<link href=\"https://fonts.googleapis.com/css2?family="));
  assertStringIncludes(body.result.pin_html, "width:1000px;height:1500px");
  assertStringIncludes(designLog!, `"outcome":"fallback"`);
  assertStringIncludes(designLog!, `"reasons":["text_mismatch","text_mismatch"]`);
  assert(!designLog!.includes("faciles"), "la télémétrie ne transporte pas le texte");
  assertEquals(mock.aiUsageInserts.length, 1);
});

Deno.test("pinterest-visual (c): une description RETIRÉE deux fois → repli, la description est bien affichée", async () => {
  const dropped = healthyHtml().replace(`<p style="font-size:28px">Un lot le lundi.</p>`, "");
  const { body } = await run({ designs: [{ pin_html: dropped }, { pin_html: dropped }] });
  assertEquals(body.result.design_source, "fallback");
  assertAllWordsIn("Un lot le lundi.", body.result.pin_html);
  assertSameTextPngPptx(body);
});

Deno.test("pinterest-visual (c): mise en forme en erreur (API) → repli, épingle livrée quand même", async () => {
  const { res, body, mock, designLog } = await run({ designs: ["fail", "fail"] });
  assertEquals(res.status, 200);
  assertEquals(body.result.design_source, "fallback");
  assertSameTextPngPptx(body);
  assertStringIncludes(designLog!, "ai_error:400");
  assertEquals(mock.aiUsageInserts.length, 1);
});

Deno.test("pinterest-visual: rédaction en erreur → erreur claire, rien facturé, pas d'appel de mise en forme", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicFailure() });
  try {
    const res = await handlePinterestVisualRequest(authedRequest(URL_FN, { subject: "x", pin_type: "mini_tuto" }));
    assertEquals(res.status, 400);
    await res.body?.cancel();
    assertEquals(mock.aiUsageInserts.length, 0);
    assertEquals(mock.anthropicRequests.filter((r) => r?.tools?.[0]?.name === "save_pinterest_design").length, 0);
  } finally {
    mock.restore();
  }
});

// ── Gardes existantes (inchangées) ──────────────────────────────────────────

Deno.test("pinterest-visual: badge_label vide + pin_type invalide → type demandé + badge dérivé", async () => {
  const pd = { ...structuredClone(PIN_DATA), badge_label: "  ", pin_type: "tuto" };
  const { body } = await run({ text: { ...TEXT_OUT, pin_data: pd }, pin_type: "checklist", designs: [{ pin_html: healthyHtml({ ...PIN_DATA, badge_label: "CHECKLIST" }) }] });
  assertEquals(body.result.pin_data.pin_type, "checklist");
  assertEquals(body.result.pin_data.badge_label, "CHECKLIST");
  assertEquals(body.result.design_source, "ai");
});

Deno.test("pinterest-visual: badge_label fourni par la rédaction et valide → gardé tel quel", async () => {
  const pd = { ...structuredClone(PIN_DATA), badge_label: "MÉTHODE EXPRESS" };
  const { body } = await run({ text: { ...TEXT_OUT, pin_data: pd }, designs: [{ pin_html: healthyHtml(pd) }] });
  assertEquals(body.result.pin_data.badge_label, "MÉTHODE EXPRESS");
  assertEquals(body.result.design_source, "ai");
});

Deno.test("pinterest-visual: HTML cassé (texte invisible + 12px) → réparé, chaque mot présent", async () => {
  const broken = healthyHtml()
    .replace(`<div style="background:#FFFFFF;color:#1A1A2E;font-size:32px"><span>1</span>`, `<div style="background:#FFFFFF;color:#FFFFFF;font-size:12px"><span>1</span>`);
  const { body } = await run({ designs: [{ pin_html: broken }] });
  const html: string = body.result.pin_html;
  assertEquals(body.result.design_source, "ai");
  assert(!/font-size:12px/.test(html), "12px doit être remonté au plancher");
  assertStringIncludes(html, "font-size:20px");
  assert(!/background:#FFFFFF;color:#FFFFFF/.test(html), "blanc sur blanc doit être corrigé");
  assertSameTextPngPptx(body);
});

Deno.test("pinterest-visual: avant_apres → tags AVANT / APRÈS du design tolérés", async () => {
  const pd = {
    pin_type: "avant_apres",
    main_title: "Ton compte Pinterest",
    badge_label: "Transformation",
    elements: [
      { label: "Épingles au hasard", side: "before" },
      { label: "Tableaux thématiques", side: "after" },
    ],
  };
  const html = `<div style="width:1000px;height:1500px;background:#FFF4F8">` +
    `<span style="background:#FB3D80;color:#FFFFFF;font-size:22px">Transformation</span>` +
    `<h1 style="color:#91014b;font-size:60px">Ton compte Pinterest</h1>` +
    `<span style="background:#FB3D80;color:#FFFFFF;font-size:22px">AVANT</span><p style="font-size:30px;color:#1A1A2E">❌ Épingles au hasard</p>` +
    `<span style="background:#FB3D80;color:#FFFFFF;font-size:22px">APRÈS</span><p style="font-size:30px;color:#1A1A2E">✅ Tableaux thématiques</p></div>`;
  const { body } = await run({ text: { ...TEXT_OUT, pin_data: pd }, pin_type: "avant_apres", designs: [{ pin_html: html, element_emojis: ["❌", "✅"] }] });
  assertEquals(body.result.design_source, "ai");
  assertEquals(body.result.pin_data.elements.map((e: Json) => e.emoji), ["❌", "✅"]);
});
