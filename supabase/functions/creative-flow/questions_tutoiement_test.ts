// Questions posées avant le contenu : l'outil tutoie l'utilisatrice, même
// quand sa marque vouvoie son public (QA du 12/11/2026 : « votre savoir-faire »).
// Passe IA remplacée par une fausse passe.
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/questions_tutoiement_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function fakeTuPass() {
  const seen: string[] = [];
  // deno-lint-ignore no-explicit-any
  const pass = async (c: string, addr: string, ..._rest: any[]) => {
    seen.push(addr);
    return c.replace(/\bvotre\b/g, "ton").replace(/\bVous avez\b/g, "Tu as").replace(/\bvous\b/g, "tu");
  };
  return { pass, seen };
}

const BASE = {
  isLinkedIn: false, isPhotoMode: false, isNewsletter: false, isReel: true, isPinterest: false, isStories: false,
  context: "x", body: {}, rawContent: "", corsHeaders: {}, fullContext: "", researchSource: "",
  previousHooks: [], storiesPhotoCatalog: [],
};

Deno.test("questions : tutoiement forcé sur la question, quel que soit le réglage de la marque", async () => {
  const { _deps } = await import("./shared.ts");
  const { finishGenerated } = await import("./postprocess.ts");
  const original = _deps.audienceAddressPass;
  const fake = fakeTuPass();
  _deps.audienceAddressPass = fake.pass as typeof original;
  try {
    for (const audienceAddress of ["vous", null] as const) {
      const parsed: any = {
        questions: [
          { question: "Qu'est-ce qui rend votre savoir-faire unique sur ce marché ?", placeholder: "Je dis à mes clients : vous gagnez du temps." },
          { question: "Tu as un exemple de chantier récent ?", placeholder: "Le dernier, à Lyon." },
        ],
      };
      await finishGenerated(parsed, { ...BASE, step: "questions", audienceAddress } as any);
      assertEquals(parsed.questions[0].question, "Qu'est-ce qui rend ton savoir-faire unique sur ce marché ?");
      // L'exemple de réponse est dans SA voix (elle peut vouvoyer ses clients) : intact.
      assertEquals(parsed.questions[0].placeholder, "Je dis à mes clients : vous gagnez du temps.");
      assertEquals(parsed.questions[1].question, "Tu as un exemple de chantier récent ?");
    }
    const followUp: any = { follow_up_questions: [{ question: "Vous avez dit « jamais » : pourquoi ?", placeholder: "…", why: "…" }] };
    await finishGenerated(followUp, { ...BASE, step: "follow-up", audienceAddress: "vous" } as any);
    assertEquals(followUp.follow_up_questions[0].question, "Tu as dit « jamais » : pourquoi ?");
    assertEquals(fake.seen.every((a) => a === "tu"), true);
    // Questions déjà au tu : aucune passe.
    const before = fake.seen.length;
    await finishGenerated({ questions: [{ question: "Tu fais comment ?", placeholder: "" }] }, { ...BASE, step: "questions", audienceAddress: "vous" } as any);
    assertEquals(fake.seen.length, before);
  } finally {
    _deps.audienceAddressPass = original;
  }
});
