import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alignFaceCamTakeDuration,
  applyReelElisions,
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


// ── alignFaceCamTakeDuration (re-tests 21/07 : script 84 s vs « 1 prise de 45-50 sec ») ──

Deno.test("alignFaceCamTakeDuration : la prise face cam unique couvre le monologue recompté", () => {
  const reel: any = {
    script: [
      { section: "hook", texte_parle: Array(25).fill("mot").join(" ") },   // 10 s
      { section: "body", texte_parle: Array(125).fill("mot").join(" ") },  // 50 s
    ],
    plan_tournage: [
      { plan: "Toi face caméra", type: "face_cam", duree: "1 prise de 45-50 sec (tout le texte en continu)" },
      { plan: "Gros plan budget", type: "insert", duree: "8-10 sec de rush" },
    ],
  };
  alignFaceCamTakeDuration(reel);
  assertEquals(reel.plan_tournage[0].duree, "1 prise de ~60 sec (tout le texte en continu)");
  assertEquals(reel.plan_tournage[1].duree, "8-10 sec de rush"); // les autres plans ne bougent pas
});

Deno.test("alignFaceCamTakeDuration : plusieurs prises face cam = découpage voulu, inchangé", () => {
  const reel: any = {
    script: [{ section: "hook", texte_parle: Array(100).fill("mot").join(" ") }],
    plan_tournage: [
      { plan: "Face cam 1", type: "face_cam", duree: "1 prise de 20 sec" },
      { plan: "Face cam 2", type: "face_cam", duree: "1 prise de 20 sec" },
    ],
  };
  alignFaceCamTakeDuration(reel);
  assertEquals(reel.plan_tournage[0].duree, "1 prise de 20 sec");
});

Deno.test("alignFaceCamTakeDuration : sans plan_tournage ou script vide, no-op", () => {
  alignFaceCamTakeDuration({});
  alignFaceCamTakeDuration({ plan_tournage: [{ type: "face_cam", duree: "x" }], script: [] });
});

// ── applyReelElisions ──

Deno.test("applyReelElisions : corrige sections, caption et cover", () => {
  const reel: any = {
    script: [
      { section: "hook", texte_parle: "On montre le avant/après qui brille.", texte_overlay: "LE AVANT/APRÈS" },
    ],
    caption: { text: "Les photos de avant.", cta: "Dis-moi que avant c'était mieux ?" },
    cover_text: "le avant/après",
  };
  applyReelElisions(reel);
  assertEquals(reel.script[0].texte_parle, "On montre l'avant/après qui brille.");
  assertEquals(reel.script[0].texte_overlay, "L'AVANT/APRÈS");
  assertEquals(reel.caption.text, "Les photos d'avant.");
  assertEquals(reel.caption.cta, "Dis-moi qu'avant c'était mieux ?");
  assertEquals(reel.cover_text, "l'avant/après");
  assertEquals(reel.sections, reel.script);
});

// ── Libellés de section écrits par l'IA : normalisés par le code ──

import {
  finalizeReelScript,
  mentionsFaceCam,
  normalizeReelSectionLabels,
  reelSectionRole,
} from "./reel-postprocess.ts";

Deno.test("reelSectionRole : casse, accents, synonymes", () => {
  for (const l of ["hook", "Hook", "HOOK", " hook ", "Accroche", "accroche (0-3 s)", "Intro", "introduction", "Ouverture", "hook_1"]) {
    assertEquals(reelSectionRole(l), "hook", l);
  }
  for (const l of ["body", "Body 2", "BODY_1", "Corps", "Développement", "developpement", "Contenu", "Milieu"]) {
    assertEquals(reelSectionRole(l), "body", l);
  }
  for (const l of ["cta", "CTA", "CTA final", "Call to action", "Appel à l'action", "Conclusion", "Chute"]) {
    assertEquals(reelSectionRole(l), "cta", l);
  }
  for (const l of ["", null, undefined, "scène 3", "xyz"]) assertEquals(reelSectionRole(l), null, String(l));
});

for (const label of ["Hook", "HOOK", "accroche", "Accroche", "intro", "Introduction", " hook "]) {
  Deno.test(`enforceSelectedReelHook : libellé « ${label} » → l'accroche choisie reste verrouillée`, () => {
    const reel = sampleReel() as any;
    reel.script[0].section = label;
    const touched = enforceSelectedReelHook(reel, { text: "Mon accroche à moi.", text_overlay: "MON CHOIX" });
    assertEquals(touched, true);
    assertEquals(reel.script[0].texte_parle, "Mon accroche à moi.");
    assertEquals(reel.script[0].texte_overlay, "MON CHOIX");
    assertEquals(reel.script[0].section, "hook");
  });
}

Deno.test("enforceSelectedReelHook : aucune section étiquetée hook → la 1re section (position) est verrouillée", () => {
  for (const label of [undefined, "", "scène 1", "partie 1"]) {
    const reel = sampleReel() as any;
    reel.script[0].section = label;
    assertEquals(enforceSelectedReelHook(reel, { text: "Mon accroche à moi." }), true, String(label));
    assertEquals(reel.script[0].texte_parle, "Mon accroche à moi.");
  }
});

Deno.test("enforceSelectedReelHook : un hook étiqueté plus loin n'est pas écrasé par position", () => {
  const reel = sampleReel() as any;
  reel.script[0].section = "body";
  reel.script[1].section = "Hook";
  const before = reel.script[0].texte_parle;
  // Le verrou ne vise que la 1re section ; ici elle est explicitement un body.
  assertEquals(enforceSelectedReelHook(reel, { text: "Mon accroche à moi." }), false);
  assertEquals(reel.script[0].texte_parle, before);
  assertEquals(reel.script[1].section, "hook");
});

Deno.test("normalizeReelSectionLabels : libellés canoniques, textes intacts, miroir sections", () => {
  const reel = sampleReel() as any;
  reel.script[0].section = "Accroche";
  reel.script[1].section = "Body 1";
  reel.script[2].section = "CTA final";
  const textsBefore = reel.script.map((s: any) => [s.texte_parle, s.texte_overlay]);
  assertEquals(normalizeReelSectionLabels(reel), true);
  assertEquals(reel.script.map((s: any) => s.section), ["hook", "body", "cta"]);
  assertEquals(reel.script.map((s: any) => [s.texte_parle, s.texte_overlay]), textsBefore);
  assertEquals(reel.sections, reel.script);
  assertEquals(normalizeReelSectionLabels(reel), false); // idempotent
});

// ── face cam : toutes les écritures ──

Deno.test("mentionsFaceCam : toutes les écritures de face cam", () => {
  for (const v of [
    "face_cam", "face_cam_confession", "facecam", "FaceCam", "face-cam", "Face Cam", "FACE CAM", "face  cam",
    "face.cam", "face caméra", "Face caméra", "face camera", "caméra face", "Caméra de face", "face à la caméra",
    "en face de la caméra", "regarde la caméra", "Regard caméra direct", "regardes la caméra", "talking head", "talking-head",
  ]) {
    assert(mentionsFaceCam(v), v);
  }
});

Deno.test("mentionsFaceCam : pas de faux positif", () => {
  for (const v of [
    "voix_off_broll", "hook_loop", "b_roll", "insert", "Gros plan sur tes mains", "surface camouflée",
    "interface caméra du téléphone", "Plan sur ton activité (mains, gestes, matière)", "", null, undefined,
  ]) {
    assert(!mentionsFaceCam(v), String(v));
  }
});

for (const ft of ["facecam", "face-cam", "Face Cam", "FACE_CAM_CONFESSION", "caméra face", "face caméra"]) {
  Deno.test(`enforceReelNoFaceCam : format_type « ${ft} » converti en voix off`, () => {
    const reel = sampleReel() as any;
    reel.format_type = ft;
    reel.script[0].format_visuel = ft;
    reel.plan_tournage[0].type = ft;
    reel.plan_tournage[0].plan = "Toi, assise à ton poste";
    assertEquals(enforceReelNoFaceCam(reel), true);
    assertEquals(reel.format_type, "voix_off_broll");
    assert(!mentionsFaceCam(reel.script[0].format_visuel));
    assertEquals(reel.plan_tournage[0].type, "b_roll");
    assertEquals(reelFaceCamViolations(reel), []);
  });
}

Deno.test("reelFaceCamViolations : plan_tournage au type mal écrit détecté", () => {
  const reel = sampleReel() as any;
  reel.format_type = "voix_off_broll";
  reel.script.forEach((s: any) => (s.format_visuel = "B-roll"));
  reel.plan_tournage = [{ plan: "Toi assise", type: "Face-Cam" }];
  assertEquals(reelFaceCamViolations(reel).length, 1);
});

Deno.test("finalizeReelScript : verrou du hook puis élisions, lecture_test et timings recomptés", () => {
  const reel = sampleReel() as any;
  reel.script[0].section = "Accroche";
  finalizeReelScript(reel, { text: "Mon accroche à moi.", text_overlay: "MON CHOIX" });
  assertEquals(reel.script[0].texte_parle, "Mon accroche à moi.");
  assert(reel.lecture_test.startsWith("Mon accroche à moi."));
  assertEquals(reel.script[0].timing, "0-2 sec");
  assertEquals(reel.sections, reel.script);
});
