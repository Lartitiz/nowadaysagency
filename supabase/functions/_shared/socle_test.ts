// Socle commun, étape 1 : les consignes des 7 règles ont été DÉPLACÉES dans
// socle.ts à texte égal. Ces tests verrouillent :
//   1. les textes eux-mêmes (empreinte SHA-256 prise AVANT le déplacement) ;
//   2. les anciens emplacements, qui réexportent exactement la même valeur ;
//   3. les interpolations (format-briefs.ts, carousel-visual/index.ts) ;
//   4. la forme des données d'adaptation (familles, formats, chemins, décisions).
// Les sorties complètes des constructeurs de prompts restent verrouillées par
// les snapshots existants (carousel-visual, creative-flow, carousel-editorial).
// Changer une consigne demande de mettre à jour son empreinte ici : la PR le montre.
//
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/socle_test.ts

import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as socle from "./socle.ts";
import {
  SOCLE_CHEMINS,
  SOCLE_DECISIONS,
  SOCLE_FAMILLES,
  SOCLE_FORMATS,
  SOCLE_RULE_IDS,
  SOCLE_RULES,
  numerotationListe,
  socleChemins,
  socleFamille,
  type SocleFormat,
} from "./socle.ts";
import { ANGLE_FAMILY_IDS } from "./angle-families.ts";
import * as livedCase from "./lived-case.ts";
import * as audienceAddress from "./audience-address.ts";
import * as carouselLength from "./carousel-length.ts";
import * as carouselCover from "./carousel-cover.ts";
import * as senseDesign from "./carousel-sense-design.ts";
import { captionBrief, linkedinBrief, newsletterBrief, photoCaptionBrief, pinterestBrief, reelBrief, storiesBrief } from "./format-briefs.ts";
import { buildCarouselWritingSystem, CAROUSEL_CONTINUITY, carouselContinuity } from "../carousel-ai/writing-contract.ts";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Empreintes prises sur origin/main (f2234d7b) AVANT le déplacement dans socle.ts. */
const FROZEN: Record<string, string> = {
  LIVED_CASE_FIRST: "bb61da20ef4e437fc367da98763601248764ca74f322a9683c40d529ba7adfd7",
  NEWS_FEELING_FIRST: "8f993be7ed971582d68c324586c2003e4cbc9e5f28363aa9cd1beea5a6a09bca",
  "audienceAddressRule(tu)": "1e455edbb8af8fa3962645c81697c776f87c907827cd9b6f62eaa464e731050a",
  "audienceAddressRule(vous)": "e40008f61d5fa6f67625514695ec922b115e886a9d0e07386c733ec6c65bd386",
  ONE_IDEA_RULE: "4d21394cc74aacced74db7c2762c9a1a1828c1aa6d6e3ac5a4556a3020abcaf4",
  COVER_WRITING: "62d69ab65b61817f44bbdac4b057f1c909d15296675c0eb657c224ad1855495d",
  TEXT_SENSE_RULES: "e527fc955637f7d9955356298cf47a52dd0862afbcbccd8ca4affae990ed9d11",
  // Règle 4 réécrite le 05/10/2026 (consigne positive commune, PR voix orale) :
  // avant, VOIX_ORALE_STORIES = 15fd7cd6…5c67, VOIX_ORALE_LEGENDE_PHOTO = 269e744f…ddd2.
  VOIX_ORALE: "b6540658834b0f58d7168d5a4de2f79ec7d7819344c2086f8e9d1eb2cd222876",
  VOIX_ORALE_LINKEDIN: "1e6a5fd9ef39e88736928aa2be25b1c93573f0fb778f517ea344bd1bacad279d",
  VOIX_ORALE_STORIES: "fb6f61ec2698eddb86725eb4c32432cf34a3f43f0860897699fe8a7e64792ade",
  VOIX_ORALE_LEGENDE_PHOTO: "b6540658834b0f58d7168d5a4de2f79ec7d7819344c2086f8e9d1eb2cd222876",
  LISIBLE_TAILLES_TITRES: "0f09b2bd9939575c37310935801517bc0decaae3d9d8c0ee134571f801637bcf",
  LISIBLE_TAILLE_CORPS: "855896ee84c93a51488b496199fee800bbdebfec855bd45c368db01518483034",
};

Deno.test("textes de consigne identiques à ceux d'avant le déplacement", async () => {
  const current: Record<string, string> = {
    LIVED_CASE_FIRST: socle.LIVED_CASE_FIRST,
    NEWS_FEELING_FIRST: socle.NEWS_FEELING_FIRST,
    "audienceAddressRule(tu)": socle.audienceAddressRule("tu"),
    "audienceAddressRule(vous)": socle.audienceAddressRule("vous"),
    ONE_IDEA_RULE: socle.ONE_IDEA_RULE,
    COVER_WRITING: socle.COVER_WRITING,
    TEXT_SENSE_RULES: socle.TEXT_SENSE_RULES,
    VOIX_ORALE: socle.VOIX_ORALE,
    VOIX_ORALE_LINKEDIN: socle.VOIX_ORALE_LINKEDIN,
    VOIX_ORALE_STORIES: socle.VOIX_ORALE_STORIES,
    VOIX_ORALE_LEGENDE_PHOTO: socle.VOIX_ORALE_LEGENDE_PHOTO,
    LISIBLE_TAILLES_TITRES: socle.LISIBLE_TAILLES_TITRES,
    LISIBLE_TAILLE_CORPS: socle.LISIBLE_TAILLE_CORPS,
  };
  for (const [name, text] of Object.entries(current)) assertEquals(await sha256(text), FROZEN[name], `${name} a changé`);
  assertEquals(socle.audienceAddressRule(null), "");
  assertEquals(socle.audienceAddressRule(undefined), "");
  assertEquals([socle.TEXT_SLIDE_TARGET_WORDS, socle.LONG_SLIDE_WORDS, socle.TEXT_AUTO_MAX_SLIDES], [{ min: 15, max: 35 }, 50, 20]);
  assertEquals([socle.COVER_HOOK_MAX_WORDS, socle.COVER_SUBTITLE_MAX_WORDS], [10, 12]);
});

Deno.test("les anciens emplacements réexportent exactement les mêmes valeurs", () => {
  assertStrictEquals(livedCase.LIVED_CASE_FIRST, socle.LIVED_CASE_FIRST);
  assertStrictEquals(livedCase.NEWS_FEELING_FIRST, socle.NEWS_FEELING_FIRST);
  assertStrictEquals(audienceAddress.audienceAddressRule, socle.audienceAddressRule);
  assertStrictEquals(carouselLength.ONE_IDEA_RULE, socle.ONE_IDEA_RULE);
  assertStrictEquals(carouselLength.TEXT_SLIDE_TARGET_WORDS, socle.TEXT_SLIDE_TARGET_WORDS);
  assertStrictEquals(carouselLength.LONG_SLIDE_WORDS, socle.LONG_SLIDE_WORDS);
  assertStrictEquals(carouselLength.TEXT_AUTO_MAX_SLIDES, socle.TEXT_AUTO_MAX_SLIDES);
  assertStrictEquals(carouselCover.COVER_WRITING, socle.COVER_WRITING);
  assertStrictEquals(carouselCover.COVER_HOOK_MAX_WORDS, socle.COVER_HOOK_MAX_WORDS);
  assertStrictEquals(carouselCover.COVER_SUBTITLE_MAX_WORDS, socle.COVER_SUBTITLE_MAX_WORDS);
  assertStrictEquals(senseDesign.TEXT_SENSE_RULES, socle.TEXT_SENSE_RULES);
});

Deno.test("interpolations : voix orale et lisibilité à leur place d'origine", () => {
  for (const addr of ["tu", "vous", null] as const) {
    assert(storiesBrief({ subject: "x", audienceAddress: addr } as any).includes(`8. ${socle.VOIX_ORALE_STORIES} `));
  }
  assert(photoCaptionBrief("une tasse").includes(`- ${socle.VOIX_ORALE_LEGENDE_PHOTO}\n`));
  const cv = Deno.readTextFileSync(new URL("../carousel-visual/index.ts", import.meta.url));
  assert(cv.includes("- ${LISIBLE_TAILLES_TITRES}\n") && cv.includes("- ${LISIBLE_TAILLE_CORPS}\n"));
});

Deno.test("voix orale : consigne positive branchée partout sauf Pinterest", () => {
  const v = socle.VOIX_ORALE;
  // L'interdit des tics plaqués reste, la voix orale est demandée à partir de SES textes.
  assert(/écris comme elle parle/.test(v) && /SES textes/.test(v) && /SES réponses/.test(v));
  assert(/n'ajoute aucun tic/.test(v) && /aucun vécu ni témoignage/.test(v));
  assert(socle.VOIX_ORALE_LINKEDIN.startsWith(v) && /plus posé/.test(socle.VOIX_ORALE_LINKEDIN));
  // Carrousels (texte, photo et mixte sur plan validé, LinkedIn) : fil commun.
  assert(CAROUSEL_CONTINUITY.includes(v) && !CAROUSEL_CONTINUITY.includes("Ne plaque ni oralité"));
  assertStrictEquals(carouselContinuity(false), CAROUSEL_CONTINUITY);
  assert(carouselContinuity(true).includes(socle.VOIX_ORALE_LINKEDIN));
  assert(buildCarouselWritingSystem("", false, "", "").includes(v));
  assert(buildCarouselWritingSystem("", true, "", "").includes(socle.VOIX_ORALE_LINKEDIN));
  // Posts, légendes, newsletter, reels, LinkedIn, stories.
  for (const [nom, brief] of [["caption", captionBrief(null)], ["legende", photoCaptionBrief("une tasse")], ["newsletter", newsletterBrief()], ["reel", reelBrief(null)]] as const) {
    assert(brief.includes(v), `${nom} sans VOIX_ORALE`);
  }
  assert(linkedinBrief(null).includes(socle.VOIX_ORALE_LINKEDIN));
  assert(storiesBrief({ subject: "x" } as any).includes(socle.VOIX_ORALE_STORIES));
  // Pinterest : décision du 05/10/2026, ton clair et référencé.
  const pin = pinterestBrief(null, null);
  assert(!pin.includes(v) && !pin.includes("SA VOIX ORALE") && pin.includes("Moins de personnalité"));
});

Deno.test("les 7 règles nommées, dans l'ordre, avec leurs consignes", () => {
  assertEquals(SOCLE_RULE_IDS, ["cas_dabord", "adresse_tu_vous", "une_idee_par_unite", "voix_orale", "design_montre_lidee", "lisible_dabord", "couverture_accroche"]);
  SOCLE_RULE_IDS.forEach((id, i) => {
    const rule = SOCLE_RULES[id];
    assertEquals(rule.numero, i + 1);
    assert(rule.titre && rule.principe, id);
    assert(Object.values(rule.consignes).length > 0 && Object.values(rule.consignes).every((t) => t.length > 20), id);
    assert(rule.origines.length > 0, id);
  });
  assertStrictEquals(SOCLE_RULES.cas_dabord.consignes.own_case, socle.LIVED_CASE_FIRST);
  assertStrictEquals(SOCLE_RULES.couverture_accroche.consignes.carrousel, socle.COVER_WRITING);
});

Deno.test("adaptation par famille : 11 familles × 7 règles, texte pour chaque A et N", () => {
  for (const fam of ANGLE_FAMILY_IDS) {
    for (const rule of SOCLE_RULE_IDS) {
      const a = SOCLE_FAMILLES[fam][rule];
      assert(a, `${fam}.${rule} manquant`);
      if (a.application !== "S") assert(a.texte && a.texte.length > 10, `${fam}.${rule} : texte attendu`);
    }
  }
  // Tableau 2b : tu/vous et lisibilité s'appliquent telles quelles partout.
  for (const fam of ANGLE_FAMILY_IDS) {
    assertEquals(SOCLE_FAMILLES[fam].adresse_tu_vous.application, "S");
    assertEquals(SOCLE_FAMILLES[fam].lisible_dabord.application, "S");
  }
  assertEquals(SOCLE_FAMILLES.J.design_montre_lidee.application, "N");
  assertEquals(Object.values(SOCLE_FAMILLES.A).every((a) => a.application === "S"), true);
  assertEquals(socleFamille(null, "cas_dabord"), { application: "S" });
  assertEquals(socleFamille("B", "cas_dabord").application, "A");
});

Deno.test("adaptation par format et registre des chemins complets", () => {
  const formats = Object.keys(SOCLE_FORMATS) as SocleFormat[];
  assertEquals(formats.length, 13);
  for (const fmt of formats) {
    for (const rule of SOCLE_RULE_IDS) assert(SOCLE_FORMATS[fmt].regles[rule], `${fmt}.${rule}`);
    assert(socleChemins(fmt).length > 0, `aucun chemin pour ${fmt}`);
  }
  const ids = SOCLE_CHEMINS.map((c) => c.id);
  assertEquals(new Set(ids).size, ids.length, "identifiants de chemins en double");
  for (const c of SOCLE_CHEMINS) {
    assertEquals(Object.keys(c.regles).sort(), [...SOCLE_RULE_IDS].sort(), c.id);
    for (const file of c.fichiers) {
      const stat = Deno.statSync(new URL(`../${file}`, import.meta.url));
      assert(stat.isFile, `${c.id} : ${file} introuvable`);
    }
  }
});

Deno.test("décisions de Laetitia inscrites dans les données (non branchées)", () => {
  assert(/numérotés de 1 à N/.test(SOCLE_DECISIONS.numerotation_listes.texte));
  assert(/numérotés de 1 à N/.test(SOCLE_FAMILLES.E.une_idee_par_unite.texte || ""));
  assertEquals(SOCLE_FORMATS.reel.regles.une_idee_par_unite.cible, "A");
  assertEquals(SOCLE_FORMATS.reel.regles.une_idee_par_unite.texte, SOCLE_DECISIONS.reels_courts.texte);
  assertEquals(SOCLE_FORMATS.pinterest.regles.voix_orale.cible, "N");
  assertEquals(SOCLE_FORMATS.pinterest.regles.voix_orale.texte, SOCLE_DECISIONS.pinterest_hors_voix_orale.texte);
  assertEquals(numerotationListe(5), { numeroter: true, de: 1, a: 5 });
  assertEquals(numerotationListe(undefined), { numeroter: false });
  assertEquals(numerotationListe(0), { numeroter: false });
  assertEquals(numerotationListe(2.5), { numeroter: false });
});

Deno.test("socle.ts reste pur (seul import : le type des familles)", () => {
  const src = Deno.readTextFileSync(new URL("./socle.ts", import.meta.url));
  const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
  assertEquals(imports, ['import type { AngleFamily } from "./angle-families.ts";']);
});
