// « 💡 » des actus : l'outil tutoie l'utilisatrice, même si sa marque vouvoie
// son public (QA du 12/11/2026). Passe IA remplacée par une fausse passe.
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/newsjacking-ai/pertinence-tu_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tutoyerPertinences } from "./pertinence-tu.ts";

function fakeTuPass() {
  let calls = 0;
  // deno-lint-ignore no-explicit-any
  const pass = async (c: string, _addr: string, ..._rest: any[]) => {
    calls++;
    return c.replace(/\bvos\b/g, "tes").replace(/\bvotre\b/g, "ta").replace(/\bvous achetez\b/g, "tu achètes").replace(/\bvous permet\b/g, "te permet");
  };
  return { pass, calls: () => calls };
}

Deno.test("pertinence au vous → tu ; titre, résumé et source intacts", async () => {
  const fake = fakeTuPass();
  const parsed: any = { actus: [
    { titre: "DPE 2027", resume: "Le coefficient passe de 1,9 à 1,7. Vous pouvez lire l'article.", source: "Média", pertinence: "Cette réforme touche les biens que vous achetez : votre expertise vous permet de décrypter." },
    { titre: "Autre", resume: "r", source: "s", pertinence: "Tu peux réagir comme témoin de ton époque." },
  ] };
  await tutoyerPertinences(parsed, fake.pass as any);
  assertEquals(parsed.actus[0].pertinence, "Cette réforme touche les biens que tu achètes : ta expertise te permet de décrypter.");
  assertEquals(parsed.actus[0].resume, "Le coefficient passe de 1,9 à 1,7. Vous pouvez lire l'article.");
  assertEquals(parsed.actus[1].pertinence, "Tu peux réagir comme témoin de ton époque.");
  assertEquals(fake.calls(), 1);
});

Deno.test("pertinences déjà au tu : aucun appel", async () => {
  const fake = fakeTuPass();
  const parsed: any = { actus: [{ titre: "t", resume: "r", pertinence: "Tu peux rebondir sur ton métier." }] };
  await tutoyerPertinences(parsed, fake.pass as any);
  assertEquals(fake.calls(), 0);
});

Deno.test("passe en échec : les actus partent telles quelles", async () => {
  const parsed: any = { actus: [{ titre: "t", resume: "r", pertinence: "Votre réseau va adorer." }] };
  await tutoyerPertinences(parsed, (async () => { throw new Error("boom"); }) as any);
  assertEquals(parsed.actus[0].pertinence, "Votre réseau va adorer.");
});
