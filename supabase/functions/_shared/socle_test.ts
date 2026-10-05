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

/**
 * Étape 7 du socle (05/10/2026) : consignes NOUVELLES des stories, reels et du
 * recyclage (une idée par unité, story 1 et couverture du reel, texte à l'écran).
 * Changer l'une d'elles demande de mettre à jour son empreinte ici.
 */
const FROZEN_STEP7: Record<string, string> = {
  UNE_IDEE_STORIES: "9a7b8cd034bb5294c169574c2a43f650c1af59a03a72ec6998aef33577b43639",
  STORIES_QUICK_RULE: "bdfe30f2598d21567bf485a3041cff263752aafeee316c73d3ad62232d940231",
  UNE_IDEE_REEL: "867e8fca7724b9d36abc1f72b67621a220399bd6581cd712b7f0b6f50ee2af4e",
  RECYCLAGE_CARROUSEL_LONGUEUR: "22ae5e81699523e65d24b7668624fa5cb4a069de242859f7769467427313cab6",
  RECYCLAGE_STORIES_LONGUEUR: "97cda22d003343a3a9f1ecfa1c01258751b40f170102c7e844c4d214642c9ae8",
  STORY1_ACCROCHE: "a50fc3f426953e5a9e265e9e186e99a922f879fab6f418d481ed817f874a0ca6",
  REEL_TEXTE_ECRAN: "59af4c0dce7b88ed78af96441b4a4568614594c55f39281412f3200c5b2b4576",
  REEL_COUVERTURE: "de240e0c01b706b30451ffc8467fb4a24a31328539d33ba2f206877313d9044c",
  "planAngleIndicatif(section)": "0e8fafcf977bbf5a0f53237e0d95706eb311f9907289853d65ebf903044f39c3",
};

Deno.test("étape 7 : empreintes des consignes stories, reels et recyclage", async () => {
  const current: Record<string, string> = {
    UNE_IDEE_STORIES: socle.UNE_IDEE_STORIES,
    STORIES_QUICK_RULE: socle.STORIES_QUICK_RULE,
    UNE_IDEE_REEL: socle.UNE_IDEE_REEL,
    RECYCLAGE_CARROUSEL_LONGUEUR: socle.RECYCLAGE_CARROUSEL_LONGUEUR,
    RECYCLAGE_STORIES_LONGUEUR: socle.RECYCLAGE_STORIES_LONGUEUR,
    STORY1_ACCROCHE: socle.STORY1_ACCROCHE,
    REEL_TEXTE_ECRAN: socle.REEL_TEXTE_ECRAN,
    REEL_COUVERTURE: socle.REEL_COUVERTURE,
    "planAngleIndicatif(section)": socle.planAngleIndicatif("section", "sections"),
  };
  for (const [name, text] of Object.entries(current)) assertEquals(await sha256(text), FROZEN_STEP7[name], `${name} a changé`);
  assertEquals(socle.REEL_OVERLAY_MIN_FONT_PX, 44);
  assertEquals([socle.STORIES_MAX, socle.STORIES_QUICK_MAX, socle.STORY_TEXT_MAX_CHARS], [10, 5, 350]);
  assertEquals(socle.REEL_SECTIONS, { min: 3, max: 8 });
  assertEquals([socle.RECYCLAGE_CARROUSEL_SLIDES, socle.RECYCLAGE_STORIES], [{ min: 5, max: 12 }, { min: 3, max: 10 }]);
});

Deno.test("étape 7 : stories branchées (une idée par story, 5 minutes, story 1 = accroche seule)", () => {
  for (const time_available of ["5min", "15min", undefined]) {
    for (const face_cam of ["oui", "non", undefined]) {
      const b = storiesBrief({ subject: "x", time_available, face_cam } as any);
      assert(b.includes(socle.UNE_IDEE_STORIES), "une idée par story absente");
      assert(b.includes(`17. ${socle.STORIES_QUICK_RULE}`), "garde-fou 5 minutes absent");
      assert(!b.includes('coupe "text" lui-même'), "consigne de coupe encore présente");
      assert(!b.includes("MAXIMUM 3 stories"), "plafond de 3 stories encore présent");
      assert(b.includes('"mot_cle"'), "mot clé de la story 1 absent du JSON");
      if (!(time_available === "5min" && face_cam === "oui")) assert(b.includes(socle.STORY1_ACCROCHE), `story 1 accroche absente (${time_available}, ${face_cam})`);
    }
  }
  // Liste annoncée avec un nombre : numérotation 1..N ; sinon rien.
  assert(storiesBrief({ subject: "5 erreurs de tarifs" } as any).includes(socle.numerotationConsigne(5, "stories")));
  assert(!storiesBrief({ subject: "mes tarifs" } as any).includes("LISTE ANNONCÉE"));
});

Deno.test("étape 7 : reel branché (une idée par plan, texte à l'écran = ses mots, couverture, plan indicatif, sans majuscules imposées)", () => {
  const b = reelBrief({ subject: "x", editorial_angle: "Mythe", content_structure: "1. Le mythe\n2. La vérité" });
  for (const part of [socle.UNE_IDEE_REEL, socle.REEL_TEXTE_ECRAN, socle.REEL_COUVERTURE, socle.planAngleIndicatif("section", "sections")]) {
    assert(b.includes(part), part.slice(0, 40));
  }
  for (const old of ["CONTREPOINT", "MAJUSCULES", "STRUCTURE À SUIVRE (obligatoire)", "DOIT correspondre aux étapes", "entre 3 et 6 sections"]) {
    assert(!b.includes(old), `reste : ${old}`);
  }
  assert(b.includes('"cover_mot_cle"'));
  // Visibilité : le reel reste court (le calibrage qui coupe reste).
  assert(reelBrief({ effectiveObjective: "visibilite", subject: "x" }).includes("DURÉE CIBLE : 15-25 secondes"));
  assert(reelBrief({ subject: "3 erreurs de devis" }).includes(socle.numerotationConsigne(3, "sections")));
  assert(!reelBrief({ subject: "mon devis" }).includes("LISTE ANNONCÉE"));
});

Deno.test("étape 7 : registre à jour (plus de « contredite » pour une idée par unité en stories, reels, recyclage)", () => {
  for (const fmt of ["reel", "stories", "recyclage"] as const) {
    assert(SOCLE_FORMATS[fmt].regles.une_idee_par_unite.etat !== "contredite", fmt);
    for (const c of socleChemins(fmt)) assert(c.regles.une_idee_par_unite !== "contredite", c.id);
  }
  assertEquals(SOCLE_FORMATS.stories.regles.couverture_accroche.etat, "oui");
  assertEquals(SOCLE_FORMATS.reel.regles.design_montre_lidee.etat, "oui");
  assertStrictEquals(SOCLE_RULES.une_idee_par_unite.consignes.stories, socle.UNE_IDEE_STORIES);
  assertStrictEquals(SOCLE_RULES.couverture_accroche.consignes.story_1, socle.STORY1_ACCROCHE);
  assertStrictEquals(SOCLE_RULES.design_montre_lidee.consignes.reel_texte_ecran, socle.REEL_TEXTE_ECRAN);
  assertEquals(socle.numerotationConsigne(null, "stories"), "");
});

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
