// NON-RÉGRESSION pinterest-photo-brief : l'overlay_html reçoit désormais les
// MÊMES gardes déterministes que pinterest-visual (contraste texte/fond,
// plancher de police) via _shared/pinterest-pin-guards.ts. Elles n'agissent
// que sur les cas cassés : un overlay sain ressort identique (hors <link>).
// Appel IA simulé (aucun réseau).
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/pinterest-photo-brief/index_test.ts

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicTextSuccess,
  authedRequest,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";
import { visibleTextOfHtml } from "../_shared/pinterest-pin-guards.ts";

setTestEnv();
const { handlePinterestPhotoBriefRequest, PHOTO_OVERLAY_MIN_FONT_PX } = await import("./index.ts");

const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/pinterest-photo-brief`;

const PHOTO_BRIEF = {
  what: "Un bureau lumineux avec un carnet ouvert",
  framing: "flat lay",
  lighting: "lumière naturelle",
  props: ["carnet", "tasse", "plante"],
  colors: "rose poudré, crème",
  mood: "chaleureux et professionnel",
};

const HEALTHY_OVERLAY =
  `<style>@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville&display=swap');</style>` +
  `<div style="width:1000px;height:1500px;background:#FFF4F8;padding:60px 50px">` +
  `<h1 style="color:#91014b;font-size:56px">Mon bureau de créatrice</h1>` +
  `<p style="color:#1A1A2E;font-size:18px">Trois astuces pour travailler sereinement</p>` +
  `<p style="color:#1A1A2E;font-size:14px;opacity:0.6">📷 Ajoute ta photo dans Canva ou PowerPoint</p>` +
  `</div>`;

async function run(overlay_html: unknown) {
  const payload = { photo_brief: PHOTO_BRIEF, overlay_html, title: "Bureau de créatrice", description: "Une description." };
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(JSON.stringify(payload)) });
  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(" ")); };
  try {
    const res = await handlePinterestPhotoBriefRequest(
      authedRequest(URL_FN, { subject: "Mon bureau", pin_type: "photo_lifestyle" }),
    );
    return { res, body: await res.json(), warns, mock };
  } finally {
    console.warn = realWarn;
    mock.restore();
  }
}

function assertAllWordsIn(text: string, html: string) {
  const visible = visibleTextOfHtml(html);
  for (const w of text.split(/\s+/)) assertStringIncludes(visible, w, `mot « ${w} » perdu`);
}

Deno.test("pinterest-photo-brief: overlay sain → identique (hors <link>), brief/titre/description intacts", async () => {
  const { res, body, warns, mock } = await run(HEALTHY_OVERLAY);
  assertEquals(res.status, 200);
  assertEquals(mock.aiUsageInserts.length, 1);
  const html: string = body.result.overlay_html;
  assert(html.startsWith("<link href=\"https://fonts.googleapis.com/css2?family="));
  assert(!/@import/.test(html));
  assertStringIncludes(html, HEALTHY_OVERLAY.replace(/<style>[\s\S]*?<\/style>/, ""));
  assertEquals(body.result.photo_brief, PHOTO_BRIEF);
  assertEquals(body.result.title, "Bureau de créatrice");
  assertEquals(warns.filter((w) => w.includes("gardes déterministes")).length, 0);
});

Deno.test("pinterest-photo-brief: overlay cassé (blanc sur blanc, 11px) → réparé, chaque mot présent", async () => {
  const broken =
    `<div style="width:1000px;height:1500px;background:#FFFFFF">` +
    `<h1 style="color:#FFFFFF;font-size:56px">Mon bureau de créatrice</h1>` +
    `<p style="color:#1A1A2E;font-size:11px">Trois astuces pour travailler sereinement</p>` +
    `</div>`;
  const { res, body, warns } = await run(broken);
  assertEquals(res.status, 200);
  const html: string = body.result.overlay_html;
  assert(!/color:#FFFFFF;font-size:56px/.test(html), "le titre blanc sur blanc doit être corrigé");
  assert(!/font-size:11px/.test(html), "11px doit être remonté");
  assertStringIncludes(html, `font-size:${PHOTO_OVERLAY_MIN_FONT_PX}px`);
  assertAllWordsIn("Mon bureau de créatrice", html);
  assertAllWordsIn("Trois astuces pour travailler sereinement", html);
  assert(warns.some((w) => w.includes("gardes déterministes")));
});

Deno.test("pinterest-photo-brief: plancher = contrat du prompt (18px), pas celui de pinterest-visual", () => {
  assertEquals(PHOTO_OVERLAY_MIN_FONT_PX, 18);
});
