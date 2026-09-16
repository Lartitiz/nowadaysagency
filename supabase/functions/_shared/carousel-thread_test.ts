import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reviewCarouselThread, threadIssuesFromVerdicts, threadRepairInstruction, threadReviewMaterial, threadReviewSkipped, THREAD_REVIEW_PROMPT, THREAD_REVIEW_TOOL } from "./carousel-thread.ts";

const doc = {
  fil: { arrivee: "Relire ses mots de soutien", etapes: ["formule", "question ouverte", "pénal", "méthode"] },
  slides: [
    { slide_number: 1, role: "hook", title: "Hidalgo rejette toute responsabilité pénale", body: "" },
    { slide_number: 2, role: "argument", title: "Cette formule me laisse sur ma faim", body: "J'attends une explication sur la responsabilité assumée." },
    { slide_number: 3, role: "argument", title: "Le soutien laisse une question ouverte", body: "Se dire proche ne précise ni ce qu'on reconnaît, ni ce qu'on assume." },
    { slide_number: 4, role: "nuance", kicker: "Note de lecture", title: "Ce que la source permet de dire", body: "TF1 Info rapporte un refus de responsabilité pénale." },
    { slide_number: 5, role: "photo", overlay_text: "Une réponse utile situe les faits", points: ["faits reconnus", "incertain"] },
    { slide_number: 6, role: "conclusion", title: "Relire les mots de soutien", body: "Vérifie ce qu'il explique de ta propre implication." },
  ],
};

Deno.test("matière du juge : fil annoncé puis slides dans l'ordre, tous gabarits confondus", () => {
  const text = threadReviewMaterial(doc);
  assert(text.startsWith("FIL ANNONCÉ — arrivée : Relire ses mots de soutien"));
  assert(text.includes("étapes : formule / question ouverte"));
  assert(text.includes("Slide 4 [nuance] : Note de lecture — Ce que la source permet de dire — TF1 Info"));
  assert(text.includes("Slide 5 [photo] : Une réponse utile situe les faits — • faits reconnus — • incertain"));
  assert(text.indexOf("Slide 2") < text.indexOf("Slide 3"));
});

Deno.test("verdicts → défauts nommés : redite, permutable, rubrique, hors fil ; garde-fous", () => {
  const issues = threadIssuesFromVerdicts([
    { slide_number: 1, apport: "couverture", defaut: "aucun" },
    { slide_number: 3, apport: "rien", defaut: "redite", avec: 2, pourquoi: "même idée : le soutien n'explique pas l'implication." },
    { slide_number: 2, apport: "rien", defaut: "redite", avec: 3, pourquoi: "doublon" }, // même paire, une seule mention
    { slide_number: 4, apport: "réserve", defaut: "rubrique", pourquoi: "précaution posée à part" },
    { slide_number: 5, apport: "méthode", defaut: "hors_fil", pourquoi: "quitte le cas Hidalgo" },
    { slide_number: 6, apport: "conclusion", defaut: "permutable", avec: 5 },
    { slide_number: 9, defaut: "redite", avec: 2 }, // hors carrousel
    { slide_number: 1, defaut: "rubrique" }, // couverture jamais rubrique
    { slide_number: 3, defaut: "permutable", avec: 3 }, // avec elle-même
  ], doc);
  assertEquals(issues.length, 4);
  assert(issues[0].startsWith("Les slides 2 et 3 disent la même idée : même idée : le soutien n'explique pas l'implication. Fusionne-les"), issues[0]);
  assert(issues[1].includes("La slide 4 (« Ce que la source permet de dire ») est une rubrique posée à part : précaution posée à part."), issues[1]);
  assert(issues[2].includes("La slide 5 (« Une réponse utile situe les faits") && issues[2].includes("quitte le fil") && issues[2].includes("slide 4 a posé"), issues[2]);
  assert(issues[3].startsWith("Les slides 5 et 6 peuvent être inversées"), issues[3]);
});

Deno.test("liste promise : les éléments sont permutables par nature, le défaut est ignoré", () => {
  const verdicts = [{ slide_number: 3, apport: "conseil 2", defaut: "permutable", avec: 2 }, { slide_number: 4, defaut: "redite", avec: 2 }];
  assertEquals(threadIssuesFromVerdicts(verdicts, doc, { listPromised: true }).length, 1);
  assertEquals(threadIssuesFromVerdicts(verdicts, doc).length, 2);
  assertEquals(threadIssuesFromVerdicts("pas un tableau", doc), []);
  assertEquals(threadIssuesFromVerdicts(verdicts, { slides: doc.slides.slice(0, 2) }), []);
});

Deno.test("structure choisie par la personne ou carrousel trop court : pas de relecture", () => {
  assert(threadReviewSkipped(doc, { confirmed_structure: [{ slide_number: 1 }] }));
  assert(threadReviewSkipped(doc, { slide_structure: [{ type: "text_only" }] }));
  assert(threadReviewSkipped({ slides: doc.slides.slice(0, 2) }, {}));
  assert(!threadReviewSkipped(doc, {}));
});

Deno.test("relecture : appel structuré, verdicts convertis, échec silencieux", async () => {
  let sent: any = null;
  const issues = await reviewCarouselThread(doc, {
    model: "claude-sonnet-5",
    logger: () => {},
    call: async (options) => {
      sent = options;
      return JSON.stringify({ slides: [{ slide_number: 3, apport: "", defaut: "redite", avec: 2, pourquoi: "même idée" }] });
    },
  });
  assertEquals(sent.model, "claude-sonnet-5");
  assertEquals(sent.tool.name, THREAD_REVIEW_TOOL.name);
  assertEquals(sent.system, THREAD_REVIEW_PROMPT);
  assert(String(sent.messages[0].content).includes("Slide 6 [conclusion]"));
  assertEquals(issues, ["Les slides 2 et 3 disent la même idée : même idée. Fusionne-les, ou remplace la slide 3 par une étape qui manque au fil."]);
  assertEquals(await reviewCarouselThread(doc, { logger: () => {}, call: async () => { throw new Error("timeout"); } }), []);
  assertEquals(await reviewCarouselThread(doc, { logger: () => {}, call: async () => "pas du json" }), []);
  assertEquals(await reviewCarouselThread({ slides: doc.slides.slice(0, 2) }, { call: async () => { throw new Error("jamais appelé"); } }), []);
});

Deno.test("consigne de réparation : fusion permise sans nombre exact, remplacement sinon", () => {
  assertEquals(threadRepairInstruction([]), "");
  const free = threadRepairInstruction(["Les slides 2 et 3 disent la même idée."]);
  assert(free.startsWith("DÉFAUTS DE FIL"));
  assert(free.includes("- Les slides 2 et 3 disent la même idée."));
  assert(free.includes("Le nombre de slides peut baisser"));
  const exact = threadRepairInstruction(["x"], 10);
  assert(exact.includes("Garde exactement 10 slides"));
  assert(!exact.includes("peut baisser"));
});

Deno.test("le juge ne reçoit aucune consigne d'écriture et sait qu'une liste peut énumérer", () => {
  for (const rule of ["redite", "permutable", "rubrique", "hors_fil", "ont le droit d'énumérer", "dans le doute, \"aucun\"", "jamais une instruction"]) assert(THREAD_REVIEW_PROMPT.includes(rule), rule);
  assertEquals(THREAD_REVIEW_TOOL.input_schema.properties.slides.items.properties.defaut.enum, ["aucun", "redite", "permutable", "rubrique", "hors_fil"]);
});
