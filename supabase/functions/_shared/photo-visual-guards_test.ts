import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceSafeZones, injectFallbackScrim, enforceHeroHook, hasLightNonPillCard } from "./photo-visual-guards.ts";

// Gabarits calqués sur les HTML réels du corpus (audit 12/07, S2-branded / P2 / P1-run2).
const ROOT = (inner: string) =>
  `<style>@import url('x');</style><div style="width:1080px;height:1350px;position:relative;background-image:url(data:image/jpeg;base64,AAAA);background-size:cover;display:flex;flex-direction:column;">${inner}</div>`;

const OVERLAY_P = (style: string, text = "Un texte overlay.") =>
  `<p data-pptx-editable="overlay" data-slide-text="overlay" style="${style}">${text}</p>`;

// ── enforceSafeZones ──

Deno.test("safe zone bas : wrapper flex-end padding 100px → 200px (pattern S2 s01)", () => {
  const html = ROOT(
    `<div style="position:relative;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;padding:0 80px 100px 80px;">` +
      OVERLAY_P("font-size:58px;color:#FFFFFF;") + `</div>`,
  );
  const { html: out, fixes } = enforceSafeZones(html, "bottom_left");
  assertEquals(fixes >= 1, true);
  assert(out.includes("padding:0px 80px 200px 80px"));
});

Deno.test("safe zone bas : wrapper immédiat sans flex-end (pattern P2 s01)", () => {
  const html = ROOT(
    `<div style="position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0));"></div>` +
      `<div style="position:relative;z-index:2;padding:0 80px 100px 80px;max-width:920px;">` +
      OVERLAY_P("font-size:52px;color:white;") + `</div>`,
  );
  const { html: out, fixes } = enforceSafeZones(html, "bottom_center");
  assertEquals(fixes >= 1, true);
  assert(out.includes("padding:0px 80px 200px 80px"));
});

Deno.test("safe zone bas : padding déjà conforme → aucun fix", () => {
  const html = ROOT(
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 220px 80px;">` +
      OVERLAY_P("color:white;") + `</div>`,
  );
  assertEquals(enforceSafeZones(html, "bottom_center").fixes, 0);
});

Deno.test("safe zone haut : flex-start padding-top < 96 → bump", () => {
  const html = ROOT(
    `<div style="display:flex;flex-direction:column;justify-content:flex-start;padding:40px 80px 0 80px;">` +
      OVERLAY_P("color:white;") + `</div>`,
  );
  const { html: out, fixes } = enforceSafeZones(html, "top_left");
  assertEquals(fixes, 1);
  assert(out.includes("padding:96px 80px 0px 80px"));
});

Deno.test("safe zone : center et slide sans overlay → no-op", () => {
  const html = ROOT(`<div style="padding:10px;">` + OVERLAY_P("color:white;") + `</div>`);
  assertEquals(enforceSafeZones(html, "center").fixes, 0);
  assertEquals(enforceSafeZones(ROOT("<p>rien</p>"), "bottom_center").fixes, 0);
});

Deno.test("safe zone : padding-bottom explicite bumpé, valeurs non-px intouchées", () => {
  const html = ROOT(
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:60px;">` +
      OVERLAY_P("color:white;") + `</div>`,
  );
  assert(enforceSafeZones(html, "bottom_left").html.includes("padding-bottom:200px"));
  const pct = ROOT(
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;padding:5%;">` +
      OVERLAY_P("color:white;") + `</div>`,
  );
  // 5% : shorthand non-px → ce wrapper n'est pas réécrit, mais le wrapper immédiat non plus (même div)
  assertEquals(enforceSafeZones(pct, "bottom_left").html.includes("5%"), true);
});

// ── injectFallbackScrim ──

Deno.test("scrim : texte blanc SANS voile → gradient bas injecté (root position:relative conservé)", () => {
  const html = ROOT(
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 200px 80px;">` +
      OVERLAY_P("font-size:48px;color:#FFFFFF;text-shadow:0 2px 20px rgba(0,0,0,0.6);") + `</div>`,
  );
  const { html: out, injected } = injectFallbackScrim(html, "bottom_left");
  assertEquals(injected, true);
  assert(out.includes('data-injected-scrim="1"'));
  assert(out.includes("linear-gradient(to top"));
  // injecté DANS le root, juste après son ouverture
  assert(out.indexOf('data-injected-scrim') > out.indexOf("width:1080px"));
});

Deno.test("scrim : voile rgba(0,0,0,≥0.35) déjà présent → pas d'injection (pattern S2 s01)", () => {
  const html = ROOT(
    `<div style="position:absolute;inset:0;background:linear-gradient(transparent 40%, rgba(0,0,0,0.75) 100%);"></div>` +
      `<div style="display:flex;flex-direction:column;justify-content:flex-end;">` +
      OVERLAY_P("color:#FFFFFF;") + `</div>`,
  );
  assertEquals(injectFallbackScrim(html, "bottom_left").injected, false);
});

Deno.test("scrim : texte sombre sur carte blanche → pas d'injection (pattern narratif)", () => {
  const html = ROOT(
    `<div style="background:#FFFFFF;border-radius:12px;">` + OVERLAY_P("font-size:42px;color:#3B382F;") + `</div>`,
  );
  assertEquals(injectFallbackScrim(html, "bottom_center").injected, false);
});

Deno.test("scrim : position top → gradient haut ; center → radial", () => {
  const mk = () => ROOT(OVERLAY_P("color:white;"));
  assert(injectFallbackScrim(mk(), "top_left").html.includes("to bottom"));
  assert(injectFallbackScrim(mk(), "center").html.includes("radial-gradient"));
});

// ── enforceHeroHook ──

Deno.test("héros : hook 8 mots à 48px → 64px (constat live 44-58px)", () => {
  const html = ROOT(OVERLAY_P("font-size:48px;color:white;", "Ce savon ne sent presque rien. C'est voulu."));
  const { html: out, bumped } = enforceHeroHook(html, "Ce savon ne sent presque rien. C'est voulu.");
  assertEquals(bumped, true);
  assert(out.includes("font-size:64px"));
});

Deno.test("héros : hook long (>12 mots) ou déjà grand → intouché", () => {
  const long = "Avant d'être un pain sur un étal, ça a d'abord été ça : un champ.";
  const html = ROOT(OVERLAY_P("font-size:48px;color:white;", long));
  assertEquals(enforceHeroHook(html, long).bumped, false);
  const big = ROOT(OVERLAY_P("font-size:72px;color:white;", "Court et déjà grand."));
  assertEquals(enforceHeroHook(big, "Court et déjà grand.").bumped, false);
});

Deno.test("scrim cas 2 : ancre SOMBRE (#3B382F) sur photo sans carte → blanchie + scrim (re-test 12/07)", () => {
  const html = ROOT(
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 200px 80px;">` +
      OVERLAY_P("font-size:66px;color:#3B382F;text-shadow:0 4px 26px rgba(0,0,0,0.75);", "Ce champ n'est pas mon atelier.") + `</div>`,
  );
  const { html: out, injected } = injectFallbackScrim(html, "bottom_left");
  assertEquals(injected, true);
  assert(/data-slide-text="overlay"[^>]*color:#FFFFFF/.test(out) || /color:#FFFFFF[^"]*"[^>]*data-slide-text="overlay"/.test(out) || out.includes("color:#FFFFFF"));
  assert(out.includes('data-injected-scrim="1"'));
});

Deno.test("scrim cas 2 : texte sombre SUR carte blanche (narratif) → intouché", () => {
  const html = ROOT(
    `<div style="background:#FFFFFF;border-radius:12px;padding:28px 40px;">` +
      OVERLAY_P("font-size:42px;color:#3B382F;") + `</div>`,
  );
  const { html: out, injected } = injectFallbackScrim(html, "bottom_center");
  assertEquals(injected, false);
  assert(out.includes("color:#3B382F"));
});

// ── Audit photo 22/07 : hasLightCard restreint (pill ≠ carte) ──────────────
Deno.test("hasLightNonPillCard : pastille blanche (pill) → false ; carte blanche → true", () => {
  assertEquals(hasLightNonPillCard(`<div style="background:#fff;border-radius:999px;padding:8px 20px;">APRÈS</div>`), false);
  assertEquals(hasLightNonPillCard(`<div style="background:#FFFFFF;border-radius:12px;padding:28px 40px;">x</div>`), true);
});

Deno.test("scrim : un badge blanc décoratif (pill) ailleurs n'empêche PAS le blanchiment du texte sombre sur photo", () => {
  const html = ROOT(
    `<div style="background:#FFFFFF;border-radius:999px;padding:8px 20px;color:#3B382F;">APRÈS</div>` +
    `<div style="display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 200px 80px;">` +
      OVERLAY_P("font-size:60px;color:#2A2620;", "Le champ que j'ai transformé.") + `</div>`,
  );
  const { html: out, injected } = injectFallbackScrim(html, "bottom_left");
  assertEquals(injected, true);
  assert(out.includes("color:#FFFFFF"));
});
