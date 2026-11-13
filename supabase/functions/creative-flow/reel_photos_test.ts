// Reel à partir de photos : un passage par photo, dans l'ordre (QA du 12/11/2026,
// choix de Laetitia du 13/11). Avec 3 photos, le script ne parlait que d'une
// seule : la rédaction ne recevait pas les photos.
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/reel_photos_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  REEL_MAX_SECONDS,
  buildHooksPrompt,
  reelHooksPhotosRule,
  reelPhotoPassagesBlock,
  reelPhotoUserContent,
  reelPhotosNotCovered,
  reelPhotosOf,
  reelPhotosSeenSource,
  reelSpokenWordCap,
  reelWordsPerPhoto,
} from "./formats/reel.ts";

const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

Deno.test("reel : seules les photos avec une image partent, 10 au plus, jamais en mode photo", () => {
  const photos = [{ base64: PHOTO }, { base64: "" }, {}, ...Array.from({ length: 12 }, () => ({ base64: PHOTO }))];
  assertEquals(reelPhotosOf({ photos }).length, 10);
  assertEquals(reelPhotosOf({ photos: [{ base64: PHOTO }], photo_mode: true }), []);
  assertEquals(reelPhotosOf({}), []);
});

Deno.test("reel : la consigne nomme le nombre de photos, l'ordre et la durée, sans rien de propre à un métier", () => {
  assertEquals(reelPhotoPassagesBlock(0), "");
  const block = reelPhotoPassagesBlock(3);
  assert(block.includes("3 photos"));
  assert(block.includes("dans l'ordre"));
  assert(block.includes(`${REEL_MAX_SECONDS} secondes`));
  assert(block.includes('"photo"'));
  assert(block.includes('"photos_vues"'));
  for (const metier of ["appartement", "pièce", "visite", "bien immobilier", "marchand"]) {
    assert(!block.toLowerCase().includes(metier), `mot de métier dans la consigne : ${metier}`);
  }
});

Deno.test("reel : plus de photos, des passages plus courts, toujours sous le plafond de mots", () => {
  for (const objective of [null, "visibilite"]) {
    const cap = reelSpokenWordCap(objective);
    let previous = Infinity;
    for (const n of [1, 3, 6, 10]) {
      const per = reelWordsPerPhoto(n, objective);
      assert(per <= previous);
      assert(per >= 6);
      assert(per * n <= cap || per === 6, `${n} photos × ${per} mots > ${cap}`);
      previous = per;
    }
  }
  // 10 photos : 8 sections ne suffisent plus, la limite suit le nombre de photos.
  assert(reelPhotoPassagesBlock(10).includes("jusqu'à 12"));
});

Deno.test("reel : chaque image est suivie de son numéro et de sa légende, la demande vient en dernier", () => {
  const content = reelPhotoUserContent([{ base64: PHOTO, context: "la façade" }, { base64: PHOTO }], "Rédige.");
  assertEquals(content.map((c) => c.type), ["image", "text", "image", "text", "text"]);
  assertEquals(content[1].text, `↑ Photo 1 sur 2 (ce qu'elle en dit : "la façade")`);
  assertEquals(content[3].text, "↑ Photo 2 sur 2");
  assertEquals(content[4].text, "Rédige.");
  assertEquals(content[0].source.media_type, "image/png");
});

Deno.test("reel : ce qui se voit sur les photos sert de source aux relectures", () => {
  assertEquals(reelPhotosSeenSource({}), "");
  assertEquals(reelPhotosSeenSource({ photos_vues: ["Une façade.", " ", "Une cuisine."] }), "CE QU'ON VOIT SUR SES PHOTOS (dans l'ordre) :\n1. Une façade.\n2. Une cuisine.");
});

Deno.test("reel : repère les photos qu'aucun passage ne montre", () => {
  const script = [{ photo: 1 }, { photo: 1 }, { photo: 3 }, { photo: null }];
  assertEquals(reelPhotosNotCovered({ script }, 3), [2]);
  assertEquals(reelPhotosNotCovered({ sections: [{ photo: 1 }, { photo: 2 }] }, 2), []);
});

Deno.test("reel : les accroches savent qu'il y a des photos et n'inventent rien d'invisible, sans rien de propre à un métier", () => {
  const base = { COMMON_PREFIX: "", excludeHooksRaw: [], context: "Mon atelier", objective: null };
  const without = buildHooksPrompt(base);
  assert(!without.systemPrompt.includes("SES PHOTOS"));
  assert(!without.userPrompt.includes("photo"));
  const withPhotos = buildHooksPrompt({ ...base, photoCount: 3 });
  assert(withPhotos.systemPrompt.includes("SES PHOTOS (3"));
  assert(withPhotos.userPrompt.includes("Mes 3 photos sont ci-dessus."));
  assert(buildHooksPrompt({ ...base, photoCount: 1 }).userPrompt.includes("Ma photo est ci-dessus."));
  const rule = reelHooksPhotosRule(3).toLowerCase();
  for (const metier of ["appartement", "pièce", "visite", "bien immobilier", "marchand", "mur"]) {
    assert(!rule.includes(metier), `mot de métier dans la consigne : ${metier}`);
  }
});
