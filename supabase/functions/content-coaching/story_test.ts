// deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/content-coaching/story_test.ts
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GENERIC_STORY_QUESTIONS, fallbackStoryIdea, normalizeStoryIdea, normalizeStoryQuestions,
  readStoryAnswers, storyQuestionsSystem,
} from "./story.ts";

Deno.test("questions adaptées gardées dans l'ordre scène, paroles, ressenti, déclic", () => {
  const raw = { questions: [
    { id: "declic", question: "Qu'est-ce que tes clientes devraient en retenir ?", placeholder: "Une phrase." },
    { id: "scene", question: "Raconte-moi la dernière visite d'un bien qui t'a surprise.", placeholder: "Le bien, le moment." },
    { id: "paroles", question: "Qu'a dit le vendeur, mot pour mot ?", placeholder: "Sa phrase." },
    { id: "ressenti", question: "Qu'as-tu ressenti en sortant ?", placeholder: "Surprise, doute…" },
  ] };
  const out = normalizeStoryQuestions(raw);
  assertEquals(out.map((q) => q.id), ["scene", "paroles", "ressenti", "declic"]);
  assertEquals(out[0].question, "Raconte-moi la dernière visite d'un bien qui t'a surprise.");
});

Deno.test("question qui vouvoie, trop longue ou avec parenthèses : remplacée par la question générale", () => {
  const out = normalizeStoryQuestions({ questions: [
    { id: "scene", question: "Racontez-moi un moment qui vous a marqué dans votre travail ?", placeholder: "" },
    { id: "paroles", question: "Qu'a-t-elle dit (mot pour mot) ?", placeholder: "" },
    { id: "ressenti", question: "Qu'as-tu ressenti sur le moment quand elle t'a dit ça au téléphone ce mardi-là alors que tu étais en rendez-vous avec une autre cliente ?", placeholder: "" },
    { id: "declic", question: "", placeholder: "" },
  ] });
  assertEquals(out, GENERIC_STORY_QUESTIONS);
});

Deno.test("réponse IA vide ou illisible : 4 questions générales, jamais une fenêtre vide", () => {
  assertEquals(normalizeStoryQuestions(null), GENERIC_STORY_QUESTIONS);
  assertEquals(normalizeStoryQuestions({ questions: "x" }).length, 4);
});

Deno.test("les questions générales respectent la forme : tutoiement, courtes", () => {
  for (const q of GENERIC_STORY_QUESTIONS) {
    assert(!/\b(vous|votre|vos)\b/i.test(q.question), q.question);
    assert(q.question.split(/\s+/).length <= 20, q.question);
  }
});

Deno.test("le prompt demande les 4 temps et interdit d'affirmer un fait", () => {
  const s = storyQuestionsSystem();
  for (const id of ["scene", "paroles", "ressenti", "declic"]) assertStringIncludes(s, id);
  assertStringIncludes(s, "Ne suppose aucun fait");
  assertStringIncludes(s, "Tutoie");
});

Deno.test("réponses envoyées par le site : vides retirées, bornées à 4", () => {
  const pairs = readStoryAnswers([
    { question: "Q1", answer: " La scène. " }, { question: "Q2", answer: "" }, { question: "", answer: "x" },
    { question: "Q3", answer: "a" }, { question: "Q4", answer: "b" }, { question: "Q5", answer: "c" },
  ]);
  assertEquals(pairs.map((p) => p.question), ["Q1", "Q3"]);
  assertEquals(pairs[0].answer, "La scène.");
  assertEquals(readStoryAnswers("nope"), []);
});

Deno.test("idée de repli tirée de ses mots : 1re phrase de la scène, déclic en angle", () => {
  const idea = fallbackStoryIdea([
    { question: "scène", answer: "Une cliente m'appelle en pleurs. Son post n'a eu aucun like." },
    { question: "déclic", answer: "Les likes mesurent le bruit, les messages la confiance." },
  ]);
  assertEquals(idea.titre, "Une cliente m'appelle en pleurs.");
  assertEquals(idea.angle, "Les likes mesurent le bruit, les messages la confiance.");
});

Deno.test("idée IA sans titre : repli sur ses mots ; tirets longs retirés", () => {
  const pairs = [{ question: "scène", answer: "Zéro like, trois messages." }];
  assertEquals(normalizeStoryIdea({ titre: "" }, pairs).titre, "Zéro like, trois messages.");
  assertEquals(normalizeStoryIdea({ titre: "Zéro like — trois messages", angle: "x" }, pairs).titre, "Zéro like, trois messages");
});
