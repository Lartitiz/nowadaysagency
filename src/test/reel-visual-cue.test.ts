import { describe, expect, it } from "vitest";
import { readableReelFormat, readableVisualCue } from "@/lib/reel-shot-purpose";

describe("reel : libellés sans anglicisme pour les anciens reels (12/11/2026)", () => {
  it("traduit l'indication de plan d'un passage", () => {
    expect(readableVisualCue("Face cam, regard caméra, ton posé mais direct")).toBe("Face caméra, regard caméra, ton posé mais direct");
    expect(readableVisualCue("Retour face cam")).toBe("Retour face caméra");
    expect(readableVisualCue("Face caméra + plans de coupe")).toBe("Face caméra + images d'illustration");
    expect(readableVisualCue("B-roll sur l'atelier")).toBe("images d'illustration sur l'atelier");
    expect(readableVisualCue(undefined)).toBe("");
  });
  it("traduit le nom de la structure", () => {
    expect(readableReelFormat("face_cam_confession")).toBe("Face caméra");
    expect(readableReelFormat("Voix off + B-roll")).toBe("Voix off sur images");
    expect(readableReelFormat("Hook loop")).toBe("Boucle courte");
    expect(readableReelFormat("Tutoriel")).toBe("Tutoriel");
  });
});
