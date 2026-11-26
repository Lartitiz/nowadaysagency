import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captionFromToolOutput, cleanCaption, DescribeImageSchema, splitImage } from "./describe-image.ts";

Deno.test("describe_image : la légende est nettoyée, jamais une phrase d'assistant", () => {
  assertEquals(cleanCaption("« Cuisine ouverte avec îlot central. »"), "Cuisine ouverte avec îlot central");
  assertEquals(cleanCaption("Cette photo montre la façade côté rue"), "La façade côté rue");
  assertEquals(cleanCaption("On voit un séjour lumineux après travaux."), "Un séjour lumineux après travaux");
  assertEquals(cleanCaption("  salle   de bain \n carrelée "), "Salle de bain carrelée");
  // Pas une légende : champ vide plutôt qu'une ligne fausse.
  assertEquals(cleanCaption("Je ne peux pas décrire cette image"), "");
  assertEquals(cleanCaption("J'observe une cuisine"), "");
  assertEquals(cleanCaption(""), "");
  assertEquals(cleanCaption(null), "");
  // Trop longue : coupée sur un mot entier.
  const longue = cleanCaption("Grande pièce de vie " + "très lumineuse ".repeat(12));
  assertEquals(longue.length <= 120, true);
  assertEquals(/\s$/.test(longue), false);
  assertEquals(captionFromToolOutput(JSON.stringify({ caption: "La façade côté rue." })), "La façade côté rue");
  assertEquals(captionFromToolOutput("pas du json"), "");
});

Deno.test("describe_image : image en data URL ou brute, format illisible refusé", () => {
  assertEquals(splitImage({ base64: "data:image/png;base64,AAAA" }), { data: "AAAA", media_type: "image/png" });
  assertEquals(splitImage({ base64: "AAAA", mimeType: "image/jpg" }), { data: "AAAA", media_type: "image/jpeg" });
  assertEquals(splitImage({ base64: "AAAA" }), { data: "AAAA", media_type: "image/jpeg" });
  assertEquals(splitImage({ base64: "data:image/heic;base64,AAAA" }), null);
  assertEquals(DescribeImageSchema.safeParse({ mode: "describe_image", image: { base64: "x".repeat(200) } }).success, true);
  assertEquals(DescribeImageSchema.safeParse({ mode: "describe_image", image: { base64: "x".repeat(3_000_001) } }).success, false);
  assertEquals(DescribeImageSchema.safeParse({ mode: "describe_image", image: {} }).success, false);
});
