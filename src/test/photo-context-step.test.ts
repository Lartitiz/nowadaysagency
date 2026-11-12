import { describe, it, expect } from "vitest";
import {
  readableFileName, suggestPhotoContext, splitPairMark, withPairMark, initialRows, setPairRole,
  applyContextRows, needsContextStep, PHOTO_CONTEXT_MAX,
} from "@/features/creer/photo-context-step";

// Étape « Que montre chaque photo ? » (QA du 12/11/2026) : suggestions
// gratuites et marqueur de la paire avant / après, lu par carousel-ai
// (supabase/functions/carousel-ai/photo-pair.ts : même marqueur).
describe("suggestions gratuites", () => {
  it("garde un nom de fichier lisible, jamais un nom d'appareil photo", () => {
    expect(readableFileName("facade-rue-des-lilas.jpg")).toBe("facade rue des lilas");
    expect(readableFileName("IMG_2041.HEIC")).toBe("");
    expect(readableFileName("PXL_20261112_101010.jpg")).toBe("");
    expect(readableFileName("WhatsApp Image 2026-11-12 at 10.10.10.jpeg")).toBe("");
    expect(readableFileName("3f2a9c0d-1b2e-4c5d-8e9f-0a1b2c3d4e5f.png")).toBe("");
    expect(readableFileName("20261112_101010.jpg")).toBe("");
  });
  it("devine l'avant / après dans le nom et le retire du texte", () => {
    expect(suggestPhotoContext({ name: "cuisine-avant.jpg" })).toEqual({ text: "Cuisine", role: "before" });
    expect(suggestPhotoContext({ name: "salle_de_bain_apres.jpg" })).toEqual({ text: "Salle de bain", role: "after" });
    expect(suggestPhotoContext({ name: "after kitchen.png" })).toEqual({ text: "Kitchen", role: "after" });
  });
  it("préfère la description de la photothèque au nom", () => {
    const libraryContext = "Nom : photo 12\nDescription : Séjour lumineux après rénovation\nClassement : lieu";
    expect(suggestPhotoContext({ name: "x.jpg", libraryContext })).toEqual({ text: "Séjour lumineux après rénovation", role: "after" });
  });
  it("ne propose rien plutôt qu'une supposition", () => {
    expect(suggestPhotoContext({ name: "IMG_1.jpg" })).toEqual({ text: "", role: null });
  });
});

describe("marqueur de paire", () => {
  it("aller-retour, dans la limite du serveur", () => {
    expect(withPairMark("before", "cuisine")).toBe("AVANT — cuisine");
    expect(withPairMark("after", "")).toBe("APRÈS");
    expect(splitPairMark("APRÈS — cuisine")).toEqual({ role: "after", text: "cuisine" });
    expect(splitPairMark("APRÈS")).toEqual({ role: "after", text: "" });
    expect(splitPairMark("Avant de commencer")).toEqual({ role: null, text: "Avant de commencer" });
    expect(withPairMark("before", "x".repeat(400)).length).toBeLessThanOrEqual(PHOTO_CONTEXT_MAX);
  });
  it("une seule paire : cocher un 2e « avant » déplace la marque, re-cliquer l'enlève", () => {
    let rows = initialRows([{ id: "a" }, { id: "b" }, { id: "c" }]);
    rows = setPairRole(rows, 0, "before");
    rows = setPairRole(rows, 1, "before");
    expect(rows.map(r => r.role)).toEqual([null, "before", null]);
    rows = setPairRole(rows, 1, "before");
    expect(rows.map(r => r.role)).toEqual([null, null, null]);
  });
  it("une paire incomplète n'est pas écrite ; les photos d'ambiance ne bougent pas", () => {
    const photos = [{ id: "a" }, { id: "s", stockAmbient: true, context: "ambiance" }, { id: "b" }];
    let rows = initialRows(photos);
    expect(rows).toHaveLength(2);
    rows = setPairRole(rows.map((r, i) => ({ ...r, text: i ? "après" : "avant" })), 0, "before");
    expect(applyContextRows(photos, rows).map(p => p.context)).toEqual(["avant", "ambiance", "après"]);
    rows = setPairRole(rows, 1, "after");
    expect(applyContextRows(photos, rows).map(p => p.context)).toEqual(["AVANT — avant", "ambiance", "APRÈS — après"]);
  });
  it("un marqueur seul ne compte pas comme une ligne de contexte", () => {
    expect(needsContextStep([{ context: "AVANT" }, { context: "APRÈS — cuisine" }])).toBe(true);
    expect(needsContextStep([{ context: "façade" }, { stockAmbient: true }])).toBe(false);
  });
});
