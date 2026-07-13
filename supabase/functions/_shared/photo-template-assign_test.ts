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
