import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAllowedVisibleText, slideSourceText, stripInventedSlideText, stripInventedTextFromHtml } from "./invented-text-guard.ts";

// TEXTE INVENTÉ sur un carrousel texte (décision de Laetitia du 04/10/2026) :
// tout mot visible vient de la slide ; le texte ancré n'est jamais touché.
const plain = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const SRC = { slide_number: 2, title: "Si je n'utilisais pas l'IA, voici ce que je devrais facturer.", body: "Le plan de com' dès 1 000 € + le site vitrine en médiane 5 000 € + les e-mails dès 1 500 € = au moins 7 500 €. Source : La Fabrique du Net, 2026" };

Deno.test("texte inventé : bulles et labels absents du texte retirés, avec leur cadre", () => {
  const html = `<div data-pptx-shape="background" style="width:1080px;height:1350px">`
    + `<div style="background:#fff;border-radius:24px"><span>Comment tu travailles avec l'IA ?</span></div>`
    + `<span data-pptx-editable="caption">LE VRAI COÛT</span>`
    + `<h1 data-slide-text="title">Si je n'utilisais pas l'IA, voici ce que je devrais facturer.</h1>`
    + `<p data-slide-text="body">${SRC.body}</p></div>`;
  const out = stripInventedTextFromHtml(html, slideSourceText(SRC));
  assertEquals(out.removed, 2);
  assert(!out.html.includes("Comment tu travailles") && !out.html.includes("LE VRAI COÛT"));
  assert(!out.html.includes("border-radius:24px"), "la bulle vidée part aussi");
  assert(out.html.includes(`<p data-slide-text="body">${SRC.body}</p>`), "texte ancré intact");
  assert(out.html.includes('data-pptx-shape="background"'), "fond de slide intact");
});

Deno.test("texte inventé : extraits exacts, chiffres dupliqués, numéros d'ordre et symboles gardés", () => {
  const source = slideSourceText(SRC);
  for (const ok of ["7 500 €", "7&nbsp;500 €", "au moins", "Le plan de com'", "dès", "en médiane", "Source : La Fabrique du Net, 2026", "1", "02", "+", "=", "→", "  "]) assert(isAllowedVisibleText(ok, source), ok);
  for (const ko of ["8 000 €", "Grosses structures", "Projets engagés", "SLIDE"]) assert(!isAllowedVisibleText(ko, source), ko);
  const html = `<div><div style="transform:rotate(-3deg);background:#FFE561"><span>7 500 €</span></div><span>1</span><span>→</span><p data-slide-text="body">${SRC.body}</p></div>`;
  assertEquals(stripInventedTextFromHtml(html, source), { html, removed: 0 });
});

Deno.test("texte inventé : mise en forme validée (étapes, motifs) et styles jamais touchés", () => {
  const html = `<style>@import url('https://fonts.googleapis.com/css2?family=Fraunces');</style><div><div data-format-block="1"><span data-photo-step-label="1">Étape 2 · Le tour</span><svg data-photo-format="motif"><text>Semaine après semaine</text></svg></div><h1 data-slide-text="title">Titre</h1></div>`;
  assertEquals(stripInventedTextFromHtml(html, slideSourceText({ title: "Titre" })).removed, 0);
});

Deno.test("texte inventé : appel à l'action inventé retiré ; celui de la rédaction gardé", () => {
  const cta = (t: string) => `<div><h1 data-slide-text="title">Et toi ?</h1><div data-slide-cta style="background:#FB3D80;border-radius:99px"><span data-slide-text="cta">${t}</span></div></div>`;
  const invented = stripInventedTextFromHtml(cta("Enregistre ce post"), slideSourceText({ title: "Et toi ?" }));
  assertEquals(invented.removed, 1);
  assert(!invented.html.includes("data-slide-cta"));
  assertEquals(stripInventedTextFromHtml(cta("Réponds en commentaire"), slideSourceText({ title: "Et toi ?", cta_label: "Réponds en commentaire" })).removed, 0);
});

Deno.test("texte inventé : photo, mixte et schémas jamais touchés ; aucune slide sans texte", () => {
  const slides = [
    { slide_number: 1, title: "Accroche", body: "" },
    { slide_number: 2, title: "Titre", body: "Texte.", visual_schema: { type: "before_after", before: { label: "Avant" } } },
    { slide_number: 3, title: "Autre", body: "Encore." },
  ];
  const html = (n: number, extra: string) => ({ slide_number: n, html: `<div>${extra}<h1 data-slide-text="title">${slides[n - 1].title}</h1>${slides[n - 1].body ? `<p data-slide-text="body">${slides[n - 1].body}</p>` : ""}</div>` });
  const make = () => ({ slides_html: [html(1, "<span>Glisse →</span>"), html(2, "<span>VS</span>"), html(3, "<span>Inventé ici</span>")] });
  for (const isText of [false]) { const r = make(); const before = JSON.stringify(r); stripInventedSlideText(r, { isText, slides }); assertEquals(JSON.stringify(r), before); }
  const r = make();
  stripInventedSlideText(r, { isText: true, slides });
  assert(!r.slides_html[0].html.includes("Glisse") && !r.slides_html[2].html.includes("Inventé"));
  assert(r.slides_html[1].html.includes("VS"), "schéma hors champ");
  for (const [i, s] of r.slides_html.entries()) {
    assert(plain(s.html).includes(slides[i].title), `slide ${i + 1} sans son titre`);
    if (slides[i].body) assert(plain(s.html).includes(slides[i].body), `slide ${i + 1} sans son texte`);
  }
});
