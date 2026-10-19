// « Refaire cette slide » : position du texte sur une photo tirée de la consigne de
// mise en page (essai réel du 19/10/2026, « mets le texte en bas » resté en haut).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-ai/slide-redo-position_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redoOverlayPosition } from "./layout.ts";
import { mergeIntoVisualSlide } from "./modes/slide-redo.ts";

Deno.test("position demandée : en bas, en haut, au centre, ou rien", () => {
  assertEquals(redoOverlayPosition("Texte en bas de la photo, plus court"), "bottom_left");
  assertEquals(redoOverlayPosition("Place le texte vers le haut"), "top_left");
  assertEquals(redoOverlayPosition("Texte au centre, plus aéré"), "center");
  assertEquals(redoOverlayPosition("Une autre disposition"), null);
  assertEquals(redoOverlayPosition(""), null);
});

Deno.test("slide photo : position fixée et verrouillée ; slide texte : rien", () => {
  const photo = { slide_number: 2, slide_type: "photo_full", photo_index: 2, overlay_text: "Court", overlay_position: "top_left" };
  assertEquals(mergeIntoVisualSlide({ ...photo }, photo, "texte en bas").overlay_position, "bottom_left");
  assertEquals(mergeIntoVisualSlide({ ...photo }, photo, "texte en bas").position_locked, true);
  assertEquals(mergeIntoVisualSlide({ ...photo }, photo, "une autre disposition").position_locked, undefined);
  const texte = { slide_number: 3, slide_type: "text_only", title: "T", body: "B" };
  assertEquals(mergeIntoVisualSlide({ ...texte }, texte, "texte en bas").position_locked, undefined);
});
