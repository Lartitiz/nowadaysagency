// Tests unitaires des épingles Pinterest en deux appels (pinterest-two-step.ts).
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/pinterest-two-step_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  addUsage,
  applyDesignEmojis,
  buildFallbackOverlayHtml,
  buildFallbackPinHtml,
  checkHtmlTextFidelity,
  designWithTextFidelity,
  photoOverlayTextSpec,
  pinDataTextSpec,
  PIN_DESIGN_MIN_ATTEMPT_MS,
  stripWriterDesignFields,
} from "./pinterest-two-step.ts";
import { finalizePinHtml, PIN_TYPES, visibleTextOfHtml } from "./pinterest-pin-guards.ts";
import type { UsageSink } from "./anthropic.ts";

const CH = {
  color_primary: "#FB3D80",
  color_secondary: "#91014b",
  color_background: "#FFF4F8",
  color_text: "#1A1A2E",
  font_title: "Libre Baskerville",
  font_body: "IBM Plex Mono",
  border_radius: "12px",
};

const SPEC = pinDataTextSpec({
  pin_type: "mini_tuto",
  badge_label: "TUTO",
  main_title: "Créer sa vitrine Pinterest l’été",
  elements: [{ number: 1, label: "Choisir ses tableaux", description: "Trois thèmes clairs." }],
  cta_text: "Enregistre-la",
  watermark: "Atelier Lune",
});

Deno.test("fidélité: casse, accents, entités, mot coupé par une balise, numéros, emojis, watermark → OK", () => {
  const html = `<div><span style="text-transform:uppercase">tuto</span>` +
    `<h1>CR&Eacute;ER sa <b>vitr</b>ine&nbsp;Pinterest l&rsquo;&eacute;t&eacute;</h1>` +
    `<div><span>01</span> 🗂️ Choisir ses tableaux</div><p>Trois thèmes clairs.</p>` +
    `<p>Enregistre-la →</p><small>Atelier Lune</small></div>`;
  assertEquals(checkHtmlTextFidelity(html, SPEC), { ok: true, missing: [], added: [] });
});

Deno.test("fidélité: mot ajouté → signalé (même s'il est court et même via content: CSS)", () => {
  const base = `<span>TUTO</span><h1>Créer sa vitrine Pinterest l'été</h1><p>Choisir ses tableaux</p><p>Trois thèmes clairs.</p><p>Enregistre-la</p>`;
  assertEquals(checkHtmlTextFidelity(base + "<p>Étape bonus</p>", SPEC).added, ["etape", "bonus"]);
  const css = `<style>.x::before{content:"Astuce"}</style>` + base;
  assertEquals(checkHtmlTextFidelity(css, SPEC).added, ["astuce"]);
  assert(checkHtmlTextFidelity(base, SPEC).ok);
});

Deno.test("fidélité: mot remplacé par un mot présent ailleurs, texte réordonné ou retiré → signalé", () => {
  const html = (label: string) => `<span>TUTO</span><h1>Créer sa vitrine Pinterest l'été</h1><p>${label}</p><p>Trois thèmes clairs.</p><p>Enregistre-la</p>`;
  // « sa » existe dans le titre : la présence mot à mot ne suffit pas, l'ordre du champ compte.
  assertEquals(checkHtmlTextFidelity(html("Choisir sa tableaux"), SPEC).missing, [{ field: "elements[0].label", words: ["ses"] }]);
  assertEquals(checkHtmlTextFidelity(html("Tableaux choisir ses"), SPEC).missing, [{ field: "elements[0].label", words: [] }]);
  assertEquals(checkHtmlTextFidelity(html(""), SPEC).missing.map((m) => m.field), ["elements[0].label"]);
  // Le texte d'un <style> ne compte pas comme affiché.
  const hidden = `<style>/* Choisir ses tableaux */</style>` + html("");
  assert(!checkHtmlTextFidelity(hidden, SPEC).ok);
});

Deno.test("stripWriterDesignFields: retire l'emoji de la rédaction, garde tout le texte", () => {
  const pd = { main_title: "T", elements: [{ number: 1, label: "A", description: "B", emoji: "🔥", side: "before" }] };
  assertEquals(stripWriterDesignFields(pd), { main_title: "T", elements: [{ number: 1, label: "A", description: "B", side: "before" }] });
});

Deno.test("applyDesignEmojis: seuls les emojis valides ET affichés sont reportés dans pin_data", () => {
  const pd = { elements: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }] };
  const out = applyDesignEmojis(pd, ["🗓️", "abc", "✅", ""], "<p>🗓️ A</p><p>B</p><p>C</p>");
  assertEquals(out.elements.map((e: { emoji?: string }) => e.emoji), ["🗓️", undefined, undefined, undefined]);
});

Deno.test("addUsage: les tokens des deux appels sont cumulés (un seul débit)", () => {
  const total: UsageSink = {};
  addUsage(total, { input_tokens: 100, output_tokens: 50, total_tokens: 150, model: "claude-opus-5-5" });
  addUsage(total, { input_tokens: 200, output_tokens: 70, total_tokens: 270, model: "claude-sonnet-4-6" });
  assertEquals(total, { input_tokens: 300, output_tokens: 120, total_tokens: 420, model: "claude-opus-5-5" });
});

// ── Repli construit par le code ─────────────────────────────────────────────

const LONG = "Une phrase volontairement longue pour vérifier que tout tient dans le visuel sans être coupé";

for (const pinType of PIN_TYPES) {
  Deno.test(`repli ${pinType}: texte complet, rien d'ajouté, polices ≥ 20px, HTML échappé`, () => {
    const elements = Array.from({ length: 8 }, (_, i) => ({
      number: pinType === "schema_visuel" ? i : i + 1,
      label: `Élément <${i + 1}> & co`,
      description: `${LONG} ${i + 1}.`,
      ...(pinType === "avant_apres" ? { side: i < 4 ? "before" : "after" } : {}),
    }));
    const pd = {
      pin_type: pinType,
      badge_label: "Méthode",
      main_title: "Un titre assez long pour l'épingle de démonstration complète",
      elements,
      cta_text: "Enregistre pour plus tard",
      watermark: "Atelier Lune",
    };
    const html = finalizePinHtml(buildFallbackPinHtml(pd, CH), { title: CH.font_title, body: CH.font_body }, 20).html;
    assertEquals(checkHtmlTextFidelity(html, pinDataTextSpec(pd)), { ok: true, missing: [], added: [] });
    assert(visibleTextOfHtml(html).includes("Atelier Lune"));
    assert(!html.includes("<1>"), "le texte doit être échappé");
    for (const m of html.matchAll(/font-size:(\d+)px/g)) assert(Number(m[1]) >= 20, `police ${m[1]}px`);
    assert(html.includes("width:1000px;height:1500px"));
  });
}

Deno.test("repli overlay photo: texte complet + indication photo, dégradé de la charte", () => {
  const ot = { badge: "Bureau", title: "Mon bureau de créatrice", subtitle: "Trois astuces", cta: "Enregistre" };
  const html = buildFallbackOverlayHtml(ot, CH);
  assertEquals(checkHtmlTextFidelity(html, photoOverlayTextSpec(ot)), { ok: true, missing: [], added: [] });
  assert(html.includes("linear-gradient(160deg, #FFF4F8 0%, #FB3D8020 50%, #91014b30 100%)"));
});

Deno.test("repli: une charte invalide (couleur, police) ne casse pas le HTML", () => {
  const html = buildFallbackPinHtml(
    { pin_type: "checklist", main_title: "T", elements: [{ label: "A" }] },
    { ...CH, color_primary: "red;}</style><script>", font_title: "X'><script>" },
  );
  assert(!html.includes("<script>"));
});

// ── Orchestration : relance, budget de temps ────────────────────────────────

const FAITHFUL = `<span>TUTO</span><h1>Créer sa vitrine Pinterest l'été</h1><p>Choisir ses tableaux</p><p>Trois thèmes clairs.</p><p>Enregistre-la</p>`;

function opts(callDesign: (gap: string | null, timeoutMs: number) => Promise<{ html: string }>, deadline: number, now?: () => number) {
  return {
    source: "test",
    pinType: "mini_tuto",
    spec: SPEC,
    callDesign,
    finalize: (h: string) => h,
    fallback: () => "<p>REPLI</p>",
    deadline,
    now,
  };
}

Deno.test("orchestration: plus assez de temps → pas d'appel 2, repli direct", async () => {
  let calls = 0;
  const r = await designWithTextFidelity(opts(async () => { calls++; return { html: FAITHFUL }; }, Date.now() + PIN_DESIGN_MIN_ATTEMPT_MS - 1));
  assertEquals(calls, 0);
  assertEquals(r.outcome, "fallback");
  assertEquals(r.html, "<p>REPLI</p>");
});

Deno.test("orchestration: relance seulement s'il reste le temps d'un 2e essai", async () => {
  let t = 0;
  const now = () => t;
  let calls = 0;
  // 1er essai : 80 s et infidèle ; il ne reste que 55 s → pas de relance.
  const r = await designWithTextFidelity(opts(async () => { calls++; t += 80_000; return { html: "<p>autre chose</p>" }; }, 135_000, now));
  assertEquals(calls, 1);
  assertEquals(r.outcome, "fallback");
});

Deno.test("orchestration: relance reçoit l'écart et un plafond de temps borné par l'échéance", async () => {
  let t = 0;
  const seen: Array<{ gap: string | null; timeoutMs: number }> = [];
  const r = await designWithTextFidelity(opts(async (gap, timeoutMs) => {
    seen.push({ gap, timeoutMs });
    t += 20_000;
    return { html: seen.length === 1 ? FAITHFUL.replace("ses", "tes") : FAITHFUL };
  }, 100_000, () => t));
  assertEquals(r.outcome, "ai_retry");
  assertEquals(seen[0].gap, null);
  assert(seen[1].gap?.includes("« Choisir ses tableaux »"));
  assert(seen[1].timeoutMs <= 100_000 - 20_000);
});
