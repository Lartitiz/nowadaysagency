/**
 * NON-RÉGRESSION reel — un script de référence passe par TOUTES les gardes de
 * production, dans l'ordre réel, puis par le contrat d'entrée du rendu et la
 * recette JSON2Video :
 *   creative-flow (applyReelQualityPass) : enforceReelNoFaceCam → verrou du
 *   hook choisi → [passe de correction IA, hors test] → finalizeReelScript ;
 *   front (ReelMontage → reel-plan) : buildRenderPlan, mode silencieux ;
 *   réseau : JSON → SubmitSchema (zod retire toute clé inconnue) ;
 *   rendu : buildReelRecipe.
 * Attendu : l'accroche choisie est verrouillée, chaque scène porte SON texte à
 * l'écran (uniquement ses mots : un texte inventé est retiré au profit du texte
 * parlé), et chaque mot de ce texte est rendu, dans sa casse, dans la boîte, au
 * plancher lisible (découpé en écrans si besoin).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enforceReelNoFaceCam,
  enforceSelectedReelHook,
  finalizeReelScript,
  reelFaceCamViolations,
} from "../_shared/reel-postprocess.ts";
import { buildRenderPlan } from "../../../src/lib/reel-plan.ts";
import { SubmitSchema } from "./schema.ts";
import { buildReelRecipe, estimateOverlayLines, overlayTextHeight } from "./recipe.ts";

const CHOSEN_HOOK = {
  text: "Mon premier savon, je l'ai jeté. Il était parfait.",
  text_overlay: "PARFAIT. DONC RATÉ.",
};

const BODY_2_SPOKEN =
  "Parce qu'un savon parfait ne raconte rien : pas de main, pas d'histoire, juste un objet de plus sur une étagère " +
  "déjà pleine. Ce que tes clientes achètent, c'est la trace du geste, la petite irrégularité qui dit qu'une " +
  "personne l'a fait, ici, pour elles.";

/** Script tel que le modèle peut le rendre : libellés et structure « face cam » mal écrits. */
function referenceReel() {
  return {
    format_type: "Face-Cam confession",
    format_label: "Face cam",
    duree_cible: "45 sec",
    script: [
      {
        section: "Accroche", // libellé non canonique : le verrou doit tenir quand même
        timing: "0-3 sec",
        format_visuel: "Facecam, regard caméra",
        texte_parle: "Mon premier savon je l'ai jeté parce qu'il était trop parfait.", // paraphrase du modèle
        texte_overlay: "parfait donc raté", // paraphrase, en minuscules
      },
      {
        section: "Body",
        timing: "3-15 sec",
        format_visuel: "Plans de coupe sur les mains",
        texte_parle: "Je l'avais moulé, démoulé, poncé jusqu'à ce qu'il n'ait plus aucun défaut.",
        texte_overlay: "plus aucun défaut", // extrait de ses mots, en minuscules : gardé tel quel
      },
      {
        section: "body",
        timing: "15-35 sec",
        format_visuel: "Gros plan matière",
        texte_parle: BODY_2_SPOKEN,
        texte_overlay: null, // absent : repli sur TOUT le texte parlé, qui doit tenir
      },
      {
        section: "CTA",
        timing: "35-45 sec",
        format_visuel: "caméra face, sourire",
        texte_parle: "Montre-moi ton dernier raté en commentaire.",
        texte_overlay: "TON RATÉ VAUT DE L'OR", // des mots qu'elle ne dit pas : retiré, son texte parlé passe à l'écran
      },
    ],
    sections: "DUPLIQUE ICI le contenu du tableau script" as unknown,
    caption: { text: "Une légende.", cta: "Et toi ?" },
    plan_tournage: [
      { plan: "Toi face caméra à l'atelier", type: "Face Cam", sert_pour: "hook + cta", duree: "1 prise de 60 sec" },
      { plan: "Gros plan sur tes mains qui poncent", type: "b_roll", sert_pour: "body", duree: "10 sec" },
    ],
  };
}

const words = (t: string) => t.split(/\s+/).filter(Boolean);

function runProductionChain() {
  const parsed = referenceReel() as any;
  // creative-flow, applyReelQualityPass, face_cam = "non"
  enforceReelNoFaceCam(parsed);
  enforceSelectedReelHook(parsed, CHOSEN_HOOK);
  // (passe de correction IA : hors test — les filets ci-dessous s'appliquent même si elle échoue)
  finalizeReelScript(parsed, CHOSEN_HOOK);

  // Front : écran de montage, mode « sans voix » (texte à l'écran).
  const sections = parsed.sections as any[];
  const plan = buildRenderPlan(sections, sections.map((_, i) => `https://cdn.test/clip-${i}.mp4`), {
    voice_mode: "silent",
  });
  // Réseau puis contrat d'entrée de l'edge function.
  const body = SubmitSchema.parse(JSON.parse(JSON.stringify({ action: "submit", ...plan })));
  const recipe = buildReelRecipe(body) as any;
  return { parsed, recipe };
}

Deno.test("NON-RÉGRESSION reel : l'accroche choisie est verrouillée malgré un libellé « Accroche »", () => {
  const { parsed } = runProductionChain();
  assertEquals(parsed.script[0].section, "hook");
  assertEquals(parsed.script[0].texte_parle, CHOSEN_HOOK.text);
  assertEquals(parsed.script[0].texte_overlay, CHOSEN_HOOK.text_overlay);
  assert(parsed.lecture_test.startsWith(CHOSEN_HOOK.text));
  assertEquals(parsed.script.map((s: any) => s.section), ["hook", "body", "body", "cta"]);
});

Deno.test("NON-RÉGRESSION reel : face_cam=non → plus aucune trace de face cam, quelle que soit l'écriture", () => {
  const { parsed } = runProductionChain();
  assertEquals(parsed.format_type, "voix_off_broll");
  assertEquals(reelFaceCamViolations(parsed), []);
  assertEquals(parsed.plan_tournage[0].type, "b_roll");
});

Deno.test("NON-RÉGRESSION reel : chaque scène porte son texte à l'écran, chaque mot est rendu dans la boîte", () => {
  const { parsed, recipe } = runProductionChain();
  const expectedOnScreen = [
    CHOSEN_HOOK.text_overlay, // hook choisi : son choix prime
    "plus aucun défaut",
    BODY_2_SPOKEN, // repli : texte parlé ENTIER, jamais raccourci
    "Montre-moi ton dernier raté en commentaire.", // overlay inventé retiré → ses mots
  ];
  assertEquals(parsed.script[3].texte_overlay, null);
  assertEquals(recipe.scenes.length, parsed.script.length);
  recipe.scenes.forEach((scene: any, i: number) => {
    const texts = scene.elements.filter((e: any) => e.type === "text");
    assert(texts.length >= 1, `scène ${i + 1} : un texte à l'écran`);
    // Chaque mot, dans l'ordre, dans la casse écrite (plus de majuscules forcées).
    assertEquals(words(texts.map((e: any) => e.text).join(" ")), words(expectedOnScreen[i]), `scène ${i + 1}`);
    for (const el of texts) {
      // Il tient dans la boîte, et la boîte dans l'image (hors bandeaux Instagram).
      const size = parseInt(el.settings["font-size"], 10);
      assert(size >= 44, `scène ${i + 1} : police sous le plancher`);
      assert(overlayTextHeight(estimateOverlayLines(el.text, size, el.width), size) <= el.height, `scène ${i + 1} déborde`);
      assert(el.x >= 0 && el.x + el.width <= recipe.width);
      assert(el.y >= Math.round(recipe.height * 0.12) && el.y + el.height <= Math.round(recipe.height * 0.86));
    }
  });
  // Textes courts : rendu validé inchangé (58 px, boîte d'origine).
  for (const i of [0, 1, 3]) {
    const el = recipe.scenes[i].elements.find((e: any) => e.type === "text");
    assertEquals([el.settings["font-size"], el.y, el.height], ["58px", 1229, 422]);
  }
  // Mode silencieux : ni voix, ni sous-titres audio.
  assertEquals(recipe.elements, undefined);
  for (const scene of recipe.scenes) {
    assert(!scene.elements.some((e: any) => e.type === "audio" || e.type === "voice"));
  }
});

Deno.test("Contrat d'entrée du rendu : overlay_text n'est plus retiré en silence", () => {
  const body = SubmitSchema.parse({
    action: "submit",
    voice_mode: "silent",
    sections: [{ clip_url: "https://cdn.test/a.mp4", duration: 4, overlay_text: "LE GESTE COMPTE" }],
  });
  assertEquals(body.sections[0].overlay_text, "LE GESTE COMPTE");
  // Un texte parlé long (repli) passe aussi, sans être coupé.
  const long = BODY_2_SPOKEN.repeat(4);
  const b2 = SubmitSchema.parse({
    action: "submit",
    voice_mode: "silent",
    sections: [{ clip_url: "https://cdn.test/a.mp4", duration: 4, overlay_text: long }],
  });
  assertEquals(b2.sections[0].overlay_text, long);
});
