import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceStoriesPhotoFirst } from "./story-photo-gate.ts";

function sampleSequence() {
  return {
    stories: [
      {
        number: 1,
        format: "texte_fond",
        format_label: "📝 Texte sur fond coloré",
        face_cam: false,
        visual: {
          gabarit: "interaction",
          background: "fond_couleur",
          photo_directive: null,
          photo_query_en: null,
        },
      },
      {
        number: 2,
        format: "photo",
        face_cam: false,
        visual: {
          gabarit: "photo_pills",
          background: "photo",
          photo_directive: "ton bureau le matin",
          photo_query_en: "desk morning light",
        },
      },
      {
        number: 3,
        format: "texte_fond",
        face_cam: false,
        visual: { gabarit: "fond_pills", background: "fond_couleur" },
      },
      {
        number: 4,
        format: "face_cam",
        face_cam: true,
        visual: null,
      },
      {
        number: 5,
        format: "texte_fond",
        face_cam: false,
        visual: { gabarit: "citation", background: "fond_couleur", quote: "Un vrai retour client." },
      },
      {
        number: 6,
        format: "texte_fond",
        face_cam: false,
        visual: { gabarit: "liste", background: "fond_couleur", list_pills: ["a", "b"] },
      },
    ],
  };
}

Deno.test("toutes les stories éligibles passent en fond photo", () => {
  const parsed = sampleSequence();
  enforceStoriesPhotoFirst(parsed);
  const backgrounds = parsed.stories.map((s) => s.visual?.background ?? null);
  assertEquals(backgrounds, ["photo", "photo", "photo", null, "fond_couleur", "photo"]);
});

Deno.test("fond_pills devient photo_pills, les autres gabarits sont conservés", () => {
  const parsed = sampleSequence();
  enforceStoriesPhotoFirst(parsed);
  assertEquals(parsed.stories[0].visual!.gabarit, "interaction");
  assertEquals(parsed.stories[2].visual!.gabarit, "photo_pills");
  assertEquals(parsed.stories[5].visual!.gabarit, "liste");
});

Deno.test("le badge format suit le fond : texte_fond basculé devient photo", () => {
  const parsed = sampleSequence();
  enforceStoriesPhotoFirst(parsed);
  assertEquals(parsed.stories[0].format, "photo");
  assertEquals(parsed.stories[0].format_label, "📸 Photo avec texte");
  // face cam et citation ne bougent pas
  assertEquals(parsed.stories[3].format, "face_cam");
  assertEquals(parsed.stories[4].format, "texte_fond");
});

// Régression du 18/08/2026 : la séquence est sortie en format "texte" (et non
// "texte_fond"). Le fond photo était bien posé — c'est le BADGE qui mentait,
// 4 stories à fond photo s'affichant « texte ». La garde doit normaliser tout
// nom de format texte-ish, pas la seule chaîne exacte.
Deno.test("le badge suit le fond quelle que soit la variante du nom de format", () => {
  for (const variante of ["texte", "TEXTE", " texte_fond ", "texte sur fond coloré", "text_background"]) {
    const parsed = {
      stories: [{
        number: 1,
        format: variante,
        format_label: "📝 Texte sur fond coloré",
        face_cam: false,
        visual: { gabarit: "fond_pills", background: "fond_couleur" },
      }],
    };
    enforceStoriesPhotoFirst(parsed);
    assertEquals(parsed.stories[0].format, "photo", `variante « ${variante} »`);
    assertEquals(parsed.stories[0].format_label, "📸 Photo avec texte");
  }
});

Deno.test("un format non texte-sur-fond garde son badge, même passé en fond photo", () => {
  // Filet : ni "face_cam" (story mal étiquetée, face_cam booléen absent) ni un
  // format déjà photo/vidéo ne doivent être réécrits en « photo » par erreur.
  for (const format of ["face_cam", "face cam", "video", "reel", "photo"]) {
    const parsed = {
      stories: [{ number: 1, format, visual: { gabarit: "fond_pills", background: "fond_couleur" } }],
    };
    enforceStoriesPhotoFirst(parsed);
    assertEquals(parsed.stories[0].format, format, `format « ${format} »`);
  }
});

Deno.test("story déjà photo et gabarit sans visual : intouchés", () => {
  const parsed = sampleSequence();
  const before = JSON.stringify(parsed.stories[1]);
  enforceStoriesPhotoFirst(parsed);
  assertEquals(JSON.stringify(parsed.stories[1]), before);
  assertEquals(parsed.stories[3].visual, null);
});

Deno.test("entrées dégénérées : ne jette pas", () => {
  enforceStoriesPhotoFirst(null);
  enforceStoriesPhotoFirst({});
  enforceStoriesPhotoFirst({ stories: [{}, { visual: "oops" as unknown as null }] });
});
