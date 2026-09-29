import { expect, it } from "vitest";
import { photoDisplayLabel } from "@/lib/photo-label";

it("shows the description for opaque import names seen in the Studio library", () => {
  for (const name of [
    "33ed85a7fddce0c50394ca35fbe3c6a9",
    "33ed85a7-fddc-e0c5-0394-ca35fbe3c6a9",
    "img_5174.jpg",
    "Capture d’écran 2026-09-29 à 12.59.18",
  ]) {
    expect(photoDisplayLabel(name, "Maison en pierre et lavande")).toBe("Maison en pierre et lavande");
  }
  expect(photoDisplayLabel("Bol en céramique", "Description secondaire")).toBe("Bol en céramique");
});
