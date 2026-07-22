import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyTemplateAssignments } from "./photo-template-assign.ts";

const parsedWith = (slides: any[]) => ({ slides: JSON.parse(JSON.stringify(slides)) });

const BASE = [
  { slide_number: 1, overlay_text: "Ce salon, je l'ai trouvé comme ça." },
  { slide_number: 2, overlay_text: "Le temps de vente a chuté de -40 % après la mise en valeur du salon." },
  { slide_number: 3, overlay_text: "La propriétaire m'a dit : on a eu trois visites la première semaine." },
  { slide_number: 4, overlay_text: "Et vous, elle raconte quoi, votre pièce à vivre ?" },
];

Deno.test("pose les gabarits valides et les champs de matière ancrés dans le texte", () => {
  const parsed = parsedWith(BASE);
  const { applied, rejected } = applyTemplateAssignments(parsed, [
    { slide_number: 1, template: "couverture" },
    { slide_number: 2, template: "chiffre", big_number: "-40 %" },
    { slide_number: 3, template: "citation", attribution: "La propriétaire" },
    { slide_number: 4, template: "finale", cta_label: "Dites-le-moi en commentaire" },
  ]);
  assertEquals(applied, 4);
  assertEquals(rejected.length, 0);
  assertEquals(parsed.slides[1].template, "chiffre");
  assertEquals(parsed.slides[1].big_number, "-40 %");
  assertEquals(parsed.slides[2].attribution, "La propriétaire");
  assertEquals(parsed.slides[3].cta_label, "Dites-le-moi en commentaire");
});

Deno.test("anti-invention : big_number absent du texte → gabarit rejeté, slide intacte", () => {
  const parsed = parsedWith(BASE);
  const { applied, rejected } = applyTemplateAssignments(parsed, [
    { slide_number: 1, template: "chiffre", big_number: "3×" },
  ]);
  assertEquals(applied, 0);
  assertEquals(rejected.length, 1);
  assertEquals(parsed.slides[0].template, undefined);
  assertEquals(parsed.slides[0].big_number, undefined);
});

Deno.test("anti-invention : points de liste sans mots du texte → rejetés", () => {
  const parsed = parsedWith(BASE);
  const { applied } = applyTemplateAssignments(parsed, [
    { slide_number: 2, template: "liste", points: ["Recette de cuisine", "Voyage au Japon"] },
  ]);
  assertEquals(applied, 0);
});

Deno.test("cohérence de position : couverture hors slide 1 et finale hors dernière → rejetées", () => {
  const parsed = parsedWith(BASE);
  const { applied, rejected } = applyTemplateAssignments(parsed, [
    { slide_number: 2, template: "couverture" },
    { slide_number: 3, template: "finale" },
  ]);
  assertEquals(applied, 0);
  assertEquals(rejected.length, 2);
});

Deno.test("gabarit inconnu ou slide_number inconnu → ignorés sans casser", () => {
  const parsed = parsedWith(BASE);
  const { applied } = applyTemplateAssignments(parsed, [
    { slide_number: 1, template: "pavé_blanc_géant" },
    { slide_number: 99, template: "profonde" },
  ] as any);
  assertEquals(applied, 0);
});

Deno.test("ne réécrit jamais les textes", () => {
  const parsed = parsedWith(BASE);
  applyTemplateAssignments(parsed, [{ slide_number: 2, template: "profonde" }]);
  assertEquals(parsed.slides[1].overlay_text, BASE[1].overlay_text);
});

// ── assignTemplatesToProvidedSlides (type "assign_templates", mode « Mes slides ») ──

import { assignTemplatesToProvidedSlides } from "./photo-template-assign.ts";

const USER_SLIDES = [
  { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: "Ce salon, je l'ai trouvé comme ça.", photo_index: 1 },
  { slide_number: 2, role: "point", slide_type: "photo_full", overlay_text: "Le temps de vente a chuté de -40 %.", photo_index: 2 },
];

Deno.test("assign_templates : merge les gabarits SANS toucher aux textes (pas de gate)", async () => {
  // Stub de passe : pose des gabarits ET tente de réécrire un overlay — la
  // réécriture doit être écrasée par code (verbatim garanti).
  const stub = (content: string) => {
    const parsed = JSON.parse(content);
    parsed.slides[0].template = "couverture";
    parsed.slides[1].template = "chiffre";
    parsed.slides[1].big_number = "-40 %";
    parsed.slides[1].overlay_text = "Texte réécrit par le modèle (interdit)";
    return Promise.resolve(JSON.stringify(parsed));
  };
  const out = await assignTemplatesToProvidedSlides(USER_SLIDES, {
    model: "claude-haiku-4-5" as never,
    assignFn: stub as never,
  });
  assertEquals(out.length, 2);
  assertEquals(out[0].template, "couverture");
  assertEquals(out[1].template, "chiffre");
  assertEquals(out[1].big_number, "-40 %");
  // Verbatim par code : le texte source reprend TOUJOURS le dessus.
  assertEquals(out[0].overlay_text, USER_SLIDES[0].overlay_text);
  assertEquals(out[1].overlay_text, USER_SLIDES[1].overlay_text);
  // Les champs d'origine (photo_index, role) survivent au merge.
  assertEquals(out[1].photo_index, 2);
  assertEquals(out[0].role, "hook");
});

Deno.test("assign_templates : fail-open — la passe jette → slides retournées telles quelles", async () => {
  const boom = () => Promise.reject(new Error("modèle indisponible"));
  const out = await assignTemplatesToProvidedSlides(USER_SLIDES, {
    model: "claude-haiku-4-5" as never,
    assignFn: boom as never,
  });
  assertEquals(out, USER_SLIDES);
});

Deno.test("assign_templates : sortie malformée (mauvais nombre de slides) → slides inchangées", async () => {
  const bad = () => Promise.resolve(JSON.stringify({ slides: [{ slide_number: 1 }] }));
  const out = await assignTemplatesToProvidedSlides(USER_SLIDES, {
    model: "claude-haiku-4-5" as never,
    assignFn: bad as never,
  });
  assertEquals(out, USER_SLIDES);
});

Deno.test("assign_templates : entrée vide ou non-tableau → tableau vide, jamais d'erreur", async () => {
  const stub = (c: string) => Promise.resolve(c);
  assertEquals(await assignTemplatesToProvidedSlides([], { model: "m" as never, assignFn: stub as never }), []);
  assertEquals(await assignTemplatesToProvidedSlides(null, { model: "m" as never, assignFn: stub as never }), []);
  assertEquals(await assignTemplatesToProvidedSlides("nope", { model: "m" as never, assignFn: stub as never }), []);
});

// ── Audit photo 22/07 : re-confirmation + purge des champs périmés ──────────

Deno.test("chiffre : re-confirmation du big_number déjà posé (hors texte) → accepté", () => {
  const parsed = parsedWith([
    { slide_number: 1, overlay_text: "Le temps de vente a chuté après la mise en valeur.", big_number: "-40 %", template: "chiffre" },
    { slide_number: 2, overlay_text: "Une phrase de fil narratif qui continue le récit." },
  ]);
  const { applied, rejected } = applyTemplateAssignments(parsed, [
    { slide_number: 1, template: "chiffre", big_number: "-40 %" },
    { slide_number: 2, template: "profonde" },
  ]);
  assertEquals(rejected.length, 0);
  assertEquals(applied, 2);
  assertEquals(parsed.slides[0].big_number, "-40 %");
});

Deno.test("purge : slide réassignée en profonde perd son big_number périmé", () => {
  const parsed = parsedWith([
    { slide_number: 1, overlay_text: "Un texte sans plus aucun chiffre dedans.", big_number: "-40 %", template: "chiffre" },
    { slide_number: 2, overlay_text: "Une autre slide pour dépasser le seuil." },
  ]);
  const { applied } = applyTemplateAssignments(parsed, [
    { slide_number: 1, template: "profonde" },
    { slide_number: 2, template: "profonde" },
  ]);
  assertEquals(applied, 2);
  assertEquals(parsed.slides[0].big_number, undefined);
  assertEquals(parsed.slides[0].template, "profonde");
});

Deno.test("liste : re-confirmation de points identiques déjà posés → acceptée", () => {
  const parsed = parsedWith([
    { slide_number: 1, overlay_text: "Trois gestes qui changent la photo.", points: ["Ouvrir les volets", "Ranger le plan de travail", "Allumer une lampe"], template: "liste" },
    { slide_number: 2, overlay_text: "Une autre slide de fil narratif." },
  ]);
  const { rejected } = applyTemplateAssignments(parsed, [
    { slide_number: 1, template: "liste", points: ["Ouvrir les volets", "Ranger le plan de travail", "Allumer une lampe"] },
    { slide_number: 2, template: "profonde" },
  ]);
  assertEquals(rejected.length, 0);
  assertEquals(parsed.slides[0].points.length, 3);
});
