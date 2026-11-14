// Fil du récit continu lu à voix haute (14/11/2026, carrousel photo « fatigue
// synthétique » : slides qui commencent à froid, « Pour moi » deux fois,
// revue de presse en slide 2, fin « oui ou non ? »).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-ai/narrative-thread_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  narrativeNewsWriting, narrativeThreadDefects, narrativeThreadFix, RECIT_ACTU_SUR_SLIDE, RECIT_FIL_A_VOIX_HAUTE, threadDefectCount,
} from "./narrative-thread.ts";
import { createContinuousNarrative } from "./continuous-narrative.ts";

// Le carrousel réel jugé « incompréhensible à voix haute » (slides 2 à 6).
const REEL = [
  "Des analyses de tendances com' 2026 relayées par CBC 35 décrivent une « fatigue synthétique » : on se lasserait des contenus trop lisses et automatisés, au profit des coulisses sans filtre.",
  "Pour moi, se montrer authentique et vulnérable, c'est important, parce que dans la vie de tous les jours, ce sont ces personnes-là auxquelles on fait confiance, finalement.",
  "Le lisse, ce n'est pas qu'un visuel trop parfait, c'est aussi la phrase pour tout le monde.",
  "Cette phrase ne décrit aucun moment vécu, alors personne ne s'y reconnaît.",
  "Pour moi, ne pas être synthétique, c'est nommer un moment que quelqu'un vit vraiment. Votre dernier post nommait-il une situation précise, oui ou non ?",
];

Deno.test("fil : le carrousel réel est mesuré (amorce répétée, fin en sondage)", () => {
  const d = narrativeThreadDefects(REEL);
  assertEquals(d.repeatedOpeners, [{ opener: "pour moi", paragraphs: [2, 5] }]);
  assertEquals(d.yesNoEnding, true);
  assertEquals(threadDefectCount(d), 2);
  const fix = narrativeThreadFix(d);
  assert(fix.includes("« pour moi » ouvre les paragraphes 2, 5"), fix);
  assert(fix.includes("sondage « oui ou non ? »"), fix);
});

Deno.test("fil : un texte relié, sans répétition ni sondage, n'a aucun défaut", () => {
  const d = narrativeThreadDefects([
    "Je suis tombée sur ce mot en lisant les tendances de l'année.",
    "Et j'ai souri, parce que je le dis depuis longtemps.",
    "Mais le lisse, ce n'est pas qu'une photo trop parfaite.",
    "Alors je préfère montrer mes coulisses. Et vous, ce mot vous parle ?",
  ]);
  assertEquals(threadDefectCount(d), 0);
  assertEquals(narrativeThreadFix(d), "");
});

Deno.test("fil : même mot de liaison deux paragraphes de suite, pas à distance", () => {
  assertEquals(narrativeThreadDefects(["Et un.", "Et deux.", "Mais trois.", "Et quatre."]).sameLiaison, [2]);
  assertEquals(narrativeThreadDefects(["Mais un.", "Alors deux.", "Mais trois."]).sameLiaison, []);
});

Deno.test("actu du récit continu : plus de sondage oui/non, source dite simplement", () => {
  const news = narrativeNewsWriting({ carousel_type: "photo", news_context: "Étude" });
  assert(!news.includes("un oui ou non, un choix entre deux"), news);
  assert(news.includes("jamais un sondage « oui ou non ? »"));
  assert(news.endsWith(RECIT_ACTU_SUR_SLIDE));
});

const draft = (paragraphs: string[]) => ({
  idea: "Le lisse ne crée pas de confiance",
  hook: "« Fatigue synthétique » : on l'appelle comme ça maintenant ?",
  paragraphs,
  caption: { hook: "", body: "", cta: "", hashtags: [] },
});
const base = {
  body: { carousel_type: "photo", scenario_origin: "automatic", slide_count: 6, photo_contexts: [{ context: "Bureau" }] },
  brandingContext: "Je suis communicante.",
  photoContext: "Bureau",
  newsContext: "",
  authoredText: "",
  startedAt: Date.now(),
  usage: {},
  emitStatus: () => {},
};

Deno.test("récit continu : la consigne du fil est dans le système, en photo comme en mixte", async () => {
  for (const carousel_type of ["photo", "mix"]) {
    let system = "";
    await createContinuousNarrative({ ...base, body: { ...base.body, carousel_type }, write: async (o) => { system ||= o.system || ""; return JSON.stringify(draft(["Un.", "Et deux.", "Mais trois.", "Alors quatre.", "Du coup cinq."])); } });
    assert(system.includes(RECIT_FIL_A_VOIX_HAUTE), carousel_type);
    assert(!system.includes("ACTU DITE SIMPLEMENT"), "sans actu, pas de consigne d'actu");
  }
});

Deno.test("récit continu : fil cassé → UNE réécriture, gardée si elle fait mieux", async () => {
  const feedbacks: string[] = [];
  let writes = 0;
  const fixed = ["Je suis tombée sur ce mot.", "Et j'ai souri.", "Mais le lisse, c'est aussi une phrase.", "Alors personne ne s'y reconnaît.", "Du coup, je préfère nommer un moment vécu. Et vous ?"];
  const result = await createContinuousNarrative({
    ...base,
    write: async (o) => {
      writes++;
      const sent = JSON.parse((o.messages[0].content as any)[0].text);
      if (sent.feedback) feedbacks.push(sent.feedback);
      return JSON.stringify(draft(writes === 1 ? REEL : fixed));
    },
  });
  assertEquals(writes, 2);
  assert(feedbacks[0].startsWith("Fil à voix haute :") || feedbacks[0].includes("Fil à voix haute :"), feedbacks[0]);
  const texts = result!.doc.slides.map((s: any) => s.overlay_text || "").join(" ");
  assert(!/oui ou non/.test(texts), texts);
});

Deno.test("récit continu : réécriture qui ne répare pas le fil → texte d'origine gardé", async () => {
  let writes = 0;
  const result = await createContinuousNarrative({
    ...base,
    write: async () => { writes++; return JSON.stringify(draft(REEL)); },
  });
  assertEquals(writes, 2);
  assertEquals(result!.doc.narrative_draft.paragraphs, REEL);
});
