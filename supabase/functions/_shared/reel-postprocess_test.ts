import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  countReelSpokenWords,
  enforceReelNoFaceCam,
  enforceSelectedReelHook,
  rebuildReelLectureTest,
  recalibrateReelTimings,
  extractReelTexts,
  reinjectReelTexts,
  reelFaceCamViolations,
  reelTemplateLeaks,
  reelAuditableText,
} from "./reel-postprocess.ts";

function sampleReel() {
  return {
    format_type: "face_cam_confession",
    duree_cible: "50 sec",
    script: [
      {
        section: "hook",
        timing: "0-3 sec",
        format_visuel: "Face cam, regard caméra direct",
        texte_parle: "Mon premier devis faisait neuf pages entières.", // 7 mots
        texte_overlay: "9 PAGES. ZÉRO LECTURE.",
      },
      {
        section: "body",
        timing: "3-18 sec",
        format_visuel: "Face cam + plans de coupe",
        // 24 mots
        texte_parle:
          "J'étais tellement fière de tout détailler mais la cliente m'a répondu ok pour la formule du milieu alors qu'il n'y avait pas de formules.",
        texte_overlay: null,
      },
      {
        section: "cta",
        timing: "38-50 sec",
        format_visuel: "Retour face cam",
        texte_parle: "Aujourd'hui mes devis tiennent sur une page entière.", // 8 mots
        texte_overlay: "SAUVEGARDE",
      },
    ],
    sections: [] as any[],
    caption: { text: "Une caption complémentaire.", cta: "Dis-le moi en commentaire." },
    amplification_stories: [
      { text: "Nouveau Reel ! Le jour où mon devis a coulé", sticker_type: "sondage" },
      { text: "Et toi, il fait combien de pages ?", sticker_type: "question_ouverte" },
    ],
    plan_tournage: [
      { plan: "Toi face caméra à ton établi", type: "face_cam", sert_pour: "hook + cta" },
      { plan: "Gros plan sur tes mains", type: "b_roll", sert_pour: "body" },
    ],
  };
}

Deno.test("countReelSpokenWords compte le parlé, pas les overlays", () => {
  assertEquals(countReelSpokenWords(sampleReel()), 7 + 24 + 8);
});

Deno.test("recalibrateReelTimings : durée = mots / 2,5, cumul par section", () => {
  const reel = sampleReel();
  recalibrateReelTimings(reel);
  // 7 mots → 3 s ; 25 mots → 10 s ; 8 mots → 3 s. Total 16 s.
  assertEquals(reel.script[0].timing, "0-3 sec");
  assertEquals(reel.script[1].timing, "3-13 sec");
  assertEquals(reel.script[2].timing, "13-16 sec");
  assertEquals(reel.duree_cible, "16 sec");
  // Miroir sections = script (compat UI)
  assertEquals(reel.sections, reel.script);
});

Deno.test("recalibrateReelTimings : minimum 2 s par section", () => {
  const reel = { script: [{ section: "hook", texte_parle: "Stop." }] };
  recalibrateReelTimings(reel as any);
  assertEquals((reel as any).script[0].timing, "0-2 sec");
  assertEquals((reel as any).duree_cible, "2 sec");
});

Deno.test("extract + reinject : aller-retour fidèle, structure intacte", () => {
  const reel = sampleReel();
  const block = extractReelTexts(reel);
  assert(block.includes("[SECTION 1 - PARLE]"));
  assert(block.includes("[SECTION 3 - OVERLAY]\nSAUVEGARDE"));
  assert(block.includes("[CAPTION]"));
  assert(block.includes("[STORY 1]"));
  // Correction simulée : on remplace l'overlay gabarit et la story 1.
  const corrected = block
    .replace("[SECTION 3 - OVERLAY]\nSAUVEGARDE", "[SECTION 3 - OVERLAY]\nUNE PAGE. C'EST TOUT.")
    .replace(/\[STORY 1\]\n.*$/m, "[STORY 1]\nMon devis faisait 9 pages. Devine ce qu'elle a lu.");
  const out = reinjectReelTexts(reel, corrected);
  assertEquals(out.script[2].texte_overlay, "UNE PAGE. C'EST TOUT.");
  assertEquals(out.amplification_stories[0].text, "Mon devis faisait 9 pages. Devine ce qu'elle a lu.");
  // Champs non corrigés inchangés
  assertEquals(out.script[0].texte_parle, reel.script[0].texte_parle);
  assertEquals(out.caption.cta, reel.caption.cta);
  // L'original n'est pas muté
  assertEquals(reel.script[2].texte_overlay, "SAUVEGARDE");
});

Deno.test("reinjectReelTexts : bloc vide ou sans marqueurs = copie inchangée", () => {
  const reel = sampleReel();
  const out = reinjectReelTexts(reel, "Désolé, je ne peux pas corriger ce contenu.");
  assertEquals(out.script[0].texte_parle, reel.script[0].texte_parle);
  assertEquals(out.script[2].texte_overlay, "SAUVEGARDE");
});

Deno.test("reelFaceCamViolations détecte format_type, format_visuel et plan_tournage", () => {
  const v = reelFaceCamViolations(sampleReel());
  assert(v.some((x) => x.includes("format_type")));
  assert(v.some((x) => x.includes("section 1")));
  assert(v.some((x) => x.includes("plan_tournage 1")));
});

Deno.test("reelFaceCamViolations : script voix off conforme = vide", () => {
  const reel = {
    format_type: "voix_off_broll",
    script: [{ section: "hook", format_visuel: "Gros plan sur les mains au tour", texte_parle: "..." }],
    plan_tournage: [{ plan: "Mains qui façonnent une pièce", type: "b_roll" }],
  };
  assertEquals(reelFaceCamViolations(reel as any), []);
});

Deno.test("reelTemplateLeaks détecte SAUVEGARDE et Nouveau Reel", () => {
  const leaks = reelTemplateLeaks(sampleReel());
  assertEquals(leaks.length, 2);
  assert(leaks[0].includes("SAUVEGARDE"));
  assert(leaks[1].includes("Nouveau Reel"));
});

Deno.test("reelAuditableText inclut parlé, overlays, caption et stories", () => {
  const text = reelAuditableText(sampleReel());
  assert(text.includes("neuf pages"));
  assert(text.includes("ZÉRO LECTURE"));
  assert(text.includes("caption complémentaire"));
  assert(text.includes("Nouveau Reel"));
});

Deno.test("enforceReelNoFaceCam convertit structure + plans en voix off", () => {
  const reel = sampleReel();
  const touched = enforceReelNoFaceCam(reel);
  assertEquals(touched, true);
  assertEquals(reel.format_type, "voix_off_broll");
  assert(!/face.?cam/i.test(reel.script[0].format_visuel));
  assertEquals(reel.plan_tournage[0].type, "b_roll");
  // Le plan b_roll existant n'est pas touché
  assertEquals(reel.plan_tournage[1].plan, "Gros plan sur tes mains");
  // Après conversion, plus aucune violation
  assertEquals(reelFaceCamViolations(reel), []);
});

Deno.test("enforceReelNoFaceCam : script déjà voix off = false, rien ne bouge", () => {
  const reel = {
    format_type: "voix_off_broll",
    script: [{ section: "hook", format_visuel: "Mains au tour", texte_parle: "..." }],
    plan_tournage: [{ plan: "Mains qui façonnent", type: "b_roll" }],
  };
  assertEquals(enforceReelNoFaceCam(reel as any), false);
});

Deno.test("rebuildReelLectureTest : le monologue = concat des texte_parle finaux", () => {
  const reel = sampleReel() as any;
  reel.lecture_test = "ancien monologue périmé";
  reel.script[2].texte_parle = "Version corrigée de la chute.";
  rebuildReelLectureTest(reel);
  assert(reel.lecture_test.startsWith("Mon premier devis"));
  assert(reel.lecture_test.endsWith("Version corrigée de la chute."));
  assert(!reel.lecture_test.includes("périmé"));
});

Deno.test("enforceSelectedReelHook verrouille texte + overlay du hook choisi", () => {
  const reel = sampleReel() as any;
  const touched = enforceSelectedReelHook(reel, {
    text: "Mon premier savon, je l'ai jeté. Il était parfait.",
    text_overlay: "PARFAIT. DONC RATÉ.",
  });
  assertEquals(touched, true);
  assertEquals(reel.script[0].texte_parle, "Mon premier savon, je l'ai jeté. Il était parfait.");
  assertEquals(reel.script[0].texte_overlay, "PARFAIT. DONC RATÉ.");
  assertEquals(reel.sections, reel.script);
});

Deno.test("enforceSelectedReelHook : placeholder du fallback auto jamais verrouillé", () => {
  const reel = sampleReel() as any;
  const before = reel.script[0].texte_parle;
  assertEquals(enforceSelectedReelHook(reel, { text: "(génère un hook percutant de 5-12 mots)" }), false);
  assertEquals(enforceSelectedReelHook(reel, null), false);
  assertEquals(enforceSelectedReelHook(reel, undefined), false);
  assertEquals(reel.script[0].texte_parle, before);
});

Deno.test("enforceSelectedReelHook : hook déjà identique = false (idempotent)", () => {
  const reel = sampleReel() as any;
  enforceSelectedReelHook(reel, { text: "Nouveau hook choisi.", text_overlay: "OVERLAY CHOISI" });
  assertEquals(enforceSelectedReelHook(reel, { text: "Nouveau hook choisi.", text_overlay: "OVERLAY CHOISI" }), false);
});
