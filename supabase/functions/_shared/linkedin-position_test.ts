// Posts LinkedIn « lisses » : le 24/09 (7cbffb9d) la consigne PRENDS POSITION
// avait disparu du brief LinkedIn. On vérifie qu'elle est revenue sans rouvrir
// la porte aux faits, chiffres ou vécus inventés.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { linkedinBrief } from "./format-briefs.ts";
import { LINKEDIN_PRINCIPLES_COMPACT } from "./copywriting-prompts.ts";
import { CORRECTION_PROMPTS } from "./correction-pass.ts";

Deno.test("brief LinkedIn : prise de position assumée en première personne", () => {
  const brief = linkedinBrief(null);
  assertEquals(brief.includes("PROFONDEUR ET PRISE DE POSITION"), true);
  assertEquals(brief.includes("assume-la en première personne"), true);
  assertEquals(brief.includes("« nous » collectif"), true);
});

Deno.test("brief LinkedIn : émotions courantes nommables, sans diagnostiquer ni prêter un vécu", () => {
  const brief = linkedinBrief(null);
  assertEquals(brief.includes("Nomme les émotions concrètes que ce sujet soulève couramment"), true);
  assertEquals(brief.includes("jamais comme le diagnostic de la personne qui lit"), true);
  assertEquals(brief.includes("Aucun chiffre, lieu, dialogue, sentiment ou résultat inventé"), false);
  assertEquals(brief.includes("Aucun chiffre, lieu, dialogue, résultat ou ressenti de l'autrice inventé"), true);
});

Deno.test("brief LinkedIn : pas de précaution sans objet, fin sur position ou question simple, pas de devoir", () => {
  const brief = linkedinBrief(null);
  assertEquals(brief.includes("ni « sans garantie »"), true);
  assertEquals(brief.includes("question simple et précise à laquelle on peut répondre en commentaire"), true);
  assertEquals(brief.includes("Jamais un devoir adressé au lecteur"), true);
  assertEquals(brief.includes("N'ajoute une question que si"), false);
});

Deno.test("brief LinkedIn : le gabarit « prise de position » garde ses étapes de raisonnement", () => {
  const brief = linkedinBrief("prise_de_position");
  assertEquals(brief.includes("TEMPLATE PRISE DE POSITION"), true);
  assertEquals(brief.includes("Garde ses étapes de raisonnement et de position"), true);
  assertEquals(brief.includes("Garde uniquement les étapes attestées"), false);
});

Deno.test("principes LinkedIn (linkedin-ai et creative-flow) : PRENDS POSITION, opinion sans source mais faits sourcés", () => {
  assertEquals(LINKEDIN_PRINCIPLES_COMPACT.includes("PRENDS POSITION"), true);
  assertEquals(LINKEDIN_PRINCIPLES_COMPACT.includes("Une opinion n'a pas besoin de source ; un fait, un chiffre ou un vécu, si."), true);
  assertEquals(LINKEDIN_PRINCIPLES_COMPACT.includes("Jamais un devoir adressé au lecteur"), true);
});

Deno.test("correction LinkedIn : garde la position, n'invente toujours rien", () => {
  const p = CORRECTION_PROMPTS.linkedin;
  assertEquals(p.includes("Garde la prise de position assumée"), true);
  assertEquals(p.includes("N'invente aucun fait, chiffre, citation, pensée, émotion ou vécu"), true);
});

Deno.test("relecture fidèle aux sources (posts avec brief) : garde opinion et émotion partagée, sans précaution ajoutée", async () => {
  const { sourceFirstCorrectionPrompt } = await import("./correction-pass.ts");
  const p = sourceFirstCorrectionPrompt({ sourceContext: "brief" }, "");
  assertEquals(p.includes("une opinion n'a pas besoin de source"), true);
  assertEquals(p.includes("les émotions courantes nommées comme une expérience partagée"), true);
  assertEquals(p.includes("Supprime en revanche une précaution"), true);
  assertEquals(p.includes("anecdotes vécues, témoignages, résultats"), true);
});

Deno.test("brief LinkedIn : le « je » de position est une opinion, pas un souvenir inventé (gabarits compris)", () => {
  const brief = linkedinBrief("prise_de_position");
  assertEquals(brief.includes("Ce « je » exprime une opinion au présent"), true);
  assertEquals(brief.includes("ne servent que si les réponses fournissent ce vécu"), true);
  assertEquals(brief.includes("« Pendant longtemps j'ai cru X / J'ai vu Y arriver trop souvent"), false);
  assertEquals(brief.includes("sans souvenir inventé"), true);
});

// Veille LinkedIn du 27/11/2026 (115 posts, 7 profils) : la coupure tombe vers
// 130 caractères, les meilleurs posts ouvrent sur un vécu des sources et
// finissent sur une phrase nette plutôt que sur une question par habitude.
Deno.test("brief LinkedIn : ouverture avant la coupure, fin nette, annonce lisible", () => {
  const brief = linkedinBrief(null);
  assertEquals(brief.includes("à peu près 130 caractères"), true);
  assertEquals(brief.includes("ouvre dessus plutôt que de le garder pour le milieu du post"), true);
  assertEquals(brief.includes("jamais sur une phrase ou une scène inventée"), true);
  assertEquals(brief.includes("La question n'est pas obligatoire"), true);
  assertEquals(brief.includes("informations pratiques fournies (date, lieu, places, prix) groupées"), true);
  assertEquals(brief.includes("l'enjeu se comprend sans connaître le métier"), true);
  assertEquals(brief.includes("Élargis l'enjeu, pas la morale"), true);
  assertEquals(brief.includes("Un enjeu partagé ne s'invente pas en souvenir"), true);
});
