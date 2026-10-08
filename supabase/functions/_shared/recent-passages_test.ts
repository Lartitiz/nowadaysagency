import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  carouselRowText,
  fetchRecentContentTexts,
  findRecentEchoes,
  previewText,
  recentPassagesPrompt,
} from "./recent-passages.ts";

// Cas réel du bilan hebdo 05/10/2026 (cinq carrousels photo, même présentation).
const before = "Je travaille surtout la faïence, parfois le grès. Je vis dans la Drôme, entourée d'arbres et de nature.";

Deno.test("redite : 7 mots consécutifs repris d'un contenu récent sont trouvés, un passage une seule fois", () => {
  const text = "Des pavots peints à main levée. Je travaille surtout la faïence, parfois le grès, et je décore chaque pièce.";
  assertEquals(findRecentEchoes(text, [before, before]), ["Je travaille surtout la faïence, parfois le grès"]);
});

Deno.test("redite : vocabulaire métier partagé ou phrase courte ≠ redite", () => {
  assertEquals(findRecentEchoes("La faïence et le grès, deux terres pour la table.", [before]), []);
  assertEquals(findRecentEchoes("", [before]), []);
  assertEquals(findRecentEchoes("Je travaille surtout la faïence, parfois le grès.", []), []);
});

Deno.test("redite : une phrase fournie dans la demande du jour n'est pas comptée", () => {
  const text = "Je vis dans la Drôme, entourée d'arbres et de nature, et ça se voit.";
  assertEquals(findRecentEchoes(text, [before]).length, 1);
  assertEquals(findRecentEchoes(text, [before], "Raconte que je vis dans la Drôme, entourée d'arbres et de nature"), []);
});

Deno.test("textes récents : carrousel gardé (slides photo/texte + légende JSON) et extrait de génération", () => {
  assertEquals(
    carouselRowText({
      hook_text: "Accroche",
      slides: [{ overlay_text: "Slide photo" }, { title: "Titre", body: "Corps" }, "brute"],
      caption: JSON.stringify({ hook: "Légende", body: "suite", cta: "" }),
    }),
    "Accroche\nSlide photo\nTitre Corps\nbrute\nLégende suite",
  );
  assertEquals(previewText({ hook: "H", apercu_slides: ["a", "b"], caption: "c" }), "H\na\nb\nc");
  assertEquals(previewText(null), "");
});

Deno.test("rappel au rédacteur : vide sans contenus, borné sinon", () => {
  assertEquals(recentPassagesPrompt([]), "");
  const prompt = recentPassagesPrompt(Array.from({ length: 20 }, (_, i) => `Contenu ${i} ` + "x".repeat(380)));
  assertEquals(prompt.startsWith("DÉJÀ ÉCRIT RÉCEMMENT"), true);
  assertEquals(prompt.length < 2600, true);
});

function fakeClient(tables: Record<string, any>, calls: string[] = []) {
  return {
    from(name: string) {
      const q: any = {
        select: () => q, gte: () => q, order: () => q, limit: () => q,
        eq: (col: string, v: string) => { calls.push(`${name}.${col}=${v}`); return q; },
        is: (col: string) => { calls.push(`${name}.${col} is null`); return q; },
        then: (ok: any, ko: any) => Promise.resolve(tables[name]).then(ok, ko),
      };
      return q;
    },
  };
}

Deno.test("lecture : fusionne carrousels gardés et extraits, plus récent d'abord, sans doublon, par espace", async () => {
  const calls: string[] = [];
  const texts = await fetchRecentContentTexts("u1", "w1", 10, fakeClient({
    generated_carousels: { data: [{ created_at: "2026-10-02", hook_text: "Gardé", slides: [], caption: null }] },
    content_quality_events: { data: [
      { created_at: "2026-10-04", content_preview: { hook: "Récent", apercu_slides: [], caption: "" } },
      { created_at: "2026-10-01", content_preview: { hook: "Gardé", apercu_slides: [], caption: "" } },
    ] },
  }, calls));
  assertEquals(texts, ["Récent", "Gardé"]);
  assertEquals(calls, ["generated_carousels.workspace_id=w1", "content_quality_events.workspace_id=w1"]);
});

Deno.test("lecture : erreur ou table absente → [] (la génération ne dépend jamais de cette garde)", async () => {
  assertEquals(await fetchRecentContentTexts("u1", null, 10, fakeClient({
    generated_carousels: { error: { message: "boom" } },
    content_quality_events: { error: { message: "column content_preview does not exist" } },
  })), []);
  assertEquals(await fetchRecentContentTexts("u1", null, 10, { from() { throw new Error("réseau"); } }), []);
  assertEquals(await fetchRecentContentTexts("", null), []);
});
