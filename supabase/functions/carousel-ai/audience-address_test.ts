import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceCarouselAudienceAddress } from "./index.ts";
import { buildCarouselWritingSystem } from "./writing-contract.ts";
import { COVER_WRITING, coverRewritePrompt } from "../_shared/carousel-cover.ts";
import { formatContextForAI } from "../_shared/user-context.ts";
import { audienceAddressRule } from "../_shared/audience-address.ts";

// Tu ou vous (décision de Laetitia, 04/10/2026) : le réglage de la fiche de
// marque est une règle ferme en tête de la rédaction du carrousel, de la
// réécriture de couverture et du contexte de marque partagé, puis il est
// contrôlé par le code sur le carrousel final.

const DOC = {
  slides: [
    { slide_number: 1, title: "Oui, j'utilise l'IA générative.", body: "" },
    { slide_number: 2, title: "Je préfère que tu l'apprennes de moi", body: "Tu as le droit de savoir comment je travaille." },
    { slide_number: 3, title: "Le prix", body: "Stratégie, site et e-mails pour 2 100 € TTC." },
  ],
  caption: { hook: "On en parle ?", body: "Je vous dis tout.", cta: "", hashtags: ["#ia"] },
};

Deno.test("carrousel : règle ferme en tête du prompt de rédaction, rien sans réglage", () => {
  const rule = audienceAddressRule("vous");
  const withRule = buildCarouselWritingSystem("CONTEXTE", false, "IDENTITÉ", "CLARTÉ", false, rule);
  assert(withRule.startsWith(rule));
  const without = buildCarouselWritingSystem("CONTEXTE", false, "IDENTITÉ", "CLARTÉ");
  assertEquals(withRule.slice(rule.length + 2), without);
});

Deno.test("couverture : exemples d'accroche neutres, réécriture tenue au réglage", () => {
  for (const tutoie of ["ta page de vente", "ta bio", "Personne ne te dit", "Arrête de publier", "ta com"]) {
    assert(!COVER_WRITING.includes(tutoie), tutoie);
  }
  const input = { hook: "Un titre beaucoup trop long pour une couverture de carrousel vraiment", subtitle: "", slide2: "" };
  assert(coverRewritePrompt(input, "vous").includes("VOUVOIE le public"));
  assert(coverRewritePrompt(input, "tu").includes("TUTOIE le public"));
  assert(coverRewritePrompt(input).includes("le tutoiement ou vouvoiement"));
});

Deno.test("contexte de marque partagé : règle en tête quand la fiche dit vouvoiement, inchangé sinon", () => {
  const ctx = (tone_register: string) => ({ tone: { voice_description: "Chaleureuse et directe", tone_register } });
  const vous = formatContextForAI(ctx("vouvoiement"));
  assert(vous.indexOf("ADRESSE AU PUBLIC : VOUVOIEMENT") < vous.indexOf("TON & STYLE"));
  assert(vous.includes("sauf l'ADRESSE AU PUBLIC"));
  const none = formatContextForAI(ctx("familier"));
  assert(!none.includes("ADRESSE AU PUBLIC"));
});

Deno.test("contrôle final : le tutoiement d'une marque qui vouvoie est corrigé, la légende comprise", async () => {
  let items: string[] = [];
  const out = await enforceCarouselAudienceAddress(structuredClone(DOC), "vous", 10_000, async (block, _addr, list) => {
    items = list;
    return block
      .replace("Je préfère que tu l'apprennes de moi", "Je préfère que vous l'appreniez de moi")
      .replace("Tu as le droit", "Vous avez le droit");
  });
  assertEquals(items, ["Je préfère que tu l'apprennes de moi", "Tu as le droit de savoir comment je travaille."]);
  assertEquals(out.slides[1].title, "Je préfère que vous l'appreniez de moi");
  assertEquals(out.slides[1].body, "Vous avez le droit de savoir comment je travaille.");
  assertEquals(out.slides[2].body, DOC.slides[2].body);
  assertEquals(out.caption.body, "Je vous dis tout.");
});

Deno.test("contrôle final : correction refusée si elle perd un chiffre ; sans budget, mesure seule", async () => {
  const lossy = await enforceCarouselAudienceAddress(structuredClone(DOC), "vous", 10_000, async (block) =>
    block.replace("Tu as le droit", "Vous avez le droit").replace("2 100 € TTC", "un prix doux"));
  assertEquals(lossy, DOC);
  let called = false;
  const measured = await enforceCarouselAudienceAddress(structuredClone(DOC), "vous", 0, async (b) => { called = true; return b; });
  assertEquals(called, false);
  assertEquals(measured, DOC);
});

Deno.test("contrôle final, marque qui tutoie : passe sans effet = carrousel intact", async () => {
  let called = false;
  const out = await enforceCarouselAudienceAddress(structuredClone(DOC), "tu", 10_000, async (b) => { called = true; return b; });
  // « Je vous dis tout. » dans la légende contredit le tutoiement : seule cette phrase est listée.
  assertEquals(called, true);
  assertEquals(out, DOC);
});
