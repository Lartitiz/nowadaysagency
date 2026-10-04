// NON-RÉGRESSION pinterest-visual (chantier « séparation écriture / design ») :
// l'IA rédige pin_html + pin_data ; le CODE complète la structure manquante
// (badge_label, pin_type), répare le HTML cassé (contraste, police < 20px) et
// mesure la cohérence texte pin_data ↔ pin_html — sans jamais réécrire ni
// raccourcir un texte. Appel IA simulé (aucun réseau).
//
// `serve()` de std/http : le handler est exporté (handlePinterestVisualRequest)
// et le serve() est derrière `import.meta.main` (patron branding-coaching).
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/pinterest-visual/index_test.ts

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicToolSuccess,
  authedRequest,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";
import { visibleTextOfHtml } from "../_shared/pinterest-pin-guards.ts";

setTestEnv();
const { handlePinterestVisualRequest } = await import("./index.ts");

const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/pinterest-visual`;

// HTML d'épingle SAIN : tailles ≥ 20px, contrastes lisibles.
const HEALTHY_HTML =
  `<style>@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville&display=swap');</style>` +
  `<div style="width:1000px;height:1500px;background:#FFF4F8;padding:60px 50px">` +
  `<span style="background:#FB3D80;color:#FFFFFF;font-size:22px">TUTO</span>` +
  `<h1 style="color:#91014b;font-size:60px">Organiser sa semaine de créatrice</h1>` +
  `<div style="background:#FFFFFF;color:#1A1A2E;font-size:32px">1 Bloquer les créneaux</div>` +
  `<div style="background:#FFFFFF;color:#1A1A2E;font-size:32px">2 Préparer ses contenus</div>` +
  `<div style="background:#FFFFFF;color:#1A1A2E;font-size:32px">3 Célébrer ses victoires</div>` +
  `</div>`;

const PIN_DATA = {
  pin_type: "mini_tuto",
  main_title: "Organiser sa semaine de créatrice",
  badge_label: "TUTO",
  elements: [
    { number: 1, label: "Bloquer les créneaux" },
    { number: 2, label: "Préparer ses contenus" },
    { number: 3, label: "Célébrer ses victoires" },
  ],
};

// deno-lint-ignore no-explicit-any
async function run(input: any, pin_type = "mini_tuto") {
  const mock = installFetchMock({ anthropic: () => anthropicToolSuccess("save_pinterest_pin", input) });
  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(" ")); };
  try {
    const res = await handlePinterestVisualRequest(authedRequest(URL_FN, { subject: "Organiser sa semaine", pin_type }));
    const body = await res.json();
    return { res, body, warns, mock };
  } finally {
    console.warn = realWarn;
    mock.restore();
  }
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    pin_html: HEALTHY_HTML,
    title: "Organiser sa semaine : la méthode",
    description: "Une méthode simple. Enregistre pour plus tard.",
    pin_data: structuredClone(PIN_DATA),
    ...overrides,
  };
}

/** Chaque mot de `text` présent dans le texte visible du HTML. */
function assertAllWordsIn(text: string, html: string) {
  const visible = visibleTextOfHtml(html);
  for (const w of text.split(/\s+/)) assertStringIncludes(visible, w, `mot « ${w} » perdu`);
}

Deno.test("pinterest-visual: épingle saine → HTML inchangé (hors <link> polices), pin_data intact, aucun mismatch", async () => {
  const { res, body, warns, mock } = await run(base());
  assertEquals(res.status, 200);
  assertEquals(mock.aiUsageInserts.length, 1);
  const html: string = body.result.pin_html;
  assert(html.startsWith("<link href=\"https://fonts.googleapis.com/css2?family="));
  assert(!/@import/.test(html), "le @import doit être retiré");
  // Gardes muettes : le corps du HTML est exactement celui de l'IA (sans @import).
  assertStringIncludes(html, HEALTHY_HTML.replace(/<style>[\s\S]*?<\/style>/, ""));
  assertEquals(body.result.pin_data, PIN_DATA);
  assertEquals(warns.filter((w) => w.includes("[pinterest:pin-data-mismatch]")).length, 0);
  assertEquals(warns.filter((w) => w.includes("gardes déterministes")).length, 0);
});

Deno.test("pinterest-visual: badge_label absent → dérivé du type par le code (TUTO), textes intacts", async () => {
  const pd = structuredClone(PIN_DATA) as Record<string, unknown>;
  delete pd.badge_label;
  const { body } = await run(base({ pin_data: pd }));
  assertEquals(body.result.pin_data.badge_label, "TUTO");
  assertEquals(body.result.pin_data.main_title, PIN_DATA.main_title);
  assertEquals(body.result.pin_data.elements, PIN_DATA.elements);
});

Deno.test("pinterest-visual: badge_label vide + pin_type invalide → type demandé + badge dérivé", async () => {
  const pd = { ...structuredClone(PIN_DATA), badge_label: "  ", pin_type: "tuto" };
  const { body } = await run(base({ pin_data: pd }), "checklist");
  assertEquals(body.result.pin_data.pin_type, "checklist");
  assertEquals(body.result.pin_data.badge_label, "CHECKLIST");
});

Deno.test("pinterest-visual: badge_label fourni par l'IA et valide → gardé tel quel", async () => {
  const pd = { ...structuredClone(PIN_DATA), badge_label: "MÉTHODE EXPRESS" };
  const { body } = await run(base({ pin_data: pd }));
  assertEquals(body.result.pin_data.badge_label, "MÉTHODE EXPRESS");
});

Deno.test("pinterest-visual: HTML cassé (texte invisible + 12px) → réparé, chaque mot présent", async () => {
  const broken = HEALTHY_HTML
    .replace(`color:#1A1A2E;font-size:32px">1 Bloquer`, `color:#FFFFFF;font-size:12px">1 Bloquer`);
  const { body } = await run(base({ pin_html: broken }));
  const html: string = body.result.pin_html;
  assert(!/font-size:12px/.test(html), "12px doit être remonté au plancher");
  assertStringIncludes(html, "font-size:20px");
  assert(!/background:#FFFFFF;color:#FFFFFF/.test(html), "blanc sur blanc doit être corrigé");
  for (const t of [PIN_DATA.main_title, ...PIN_DATA.elements.map((e) => e.label)]) assertAllWordsIn(t, html);
});

Deno.test("pinterest-visual: pin_data ≠ pin_html → télémétrie [pinterest:pin-data-mismatch], rien bloqué ni réécrit", async () => {
  const pd = structuredClone(PIN_DATA);
  pd.elements[1].label = "Planifier ses publications";
  const { res, body, warns } = await run(base({ pin_data: pd }));
  assertEquals(res.status, 200);
  assertEquals(body.result.pin_data.elements[1].label, "Planifier ses publications");
  const log = warns.find((w) => w.includes("[pinterest:pin-data-mismatch]"));
  assert(log, "le mismatch doit être journalisé");
  assertStringIncludes(log!, "elements[1].label");
  // Le log ne transporte pas le texte de l'utilisatrice.
  assert(!log!.includes("Planifier"));
});
