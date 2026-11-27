import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudioImageWaiting, elapsedSince, formatElapsed, waitingMessage } from "@/features/visual-studio/StudioImageWaiting";

describe("attente d'une image du Studio", () => {
  it("compte le temps depuis la création de l'image, même après un rechargement", () => {
    const created = "2026-11-27T10:00:00.000Z";
    expect(elapsedSince(created, Date.parse("2026-11-27T10:00:18.400Z"))).toBe(18);
    expect(elapsedSince(created, Date.parse("2026-11-27T09:59:58Z"))).toBe(0);
    expect(elapsedSince("pas une date", Date.now())).toBe(0);
    expect(formatElapsed(18)).toBe("0:18");
    expect(formatElapsed(75)).toBe("1:15");
  });

  it("annonce une minute, puis dit que c'est plus long sans parler d'échec", () => {
    expect(waitingMessage(10)).toContain("compte environ 1 minute");
    expect(waitingMessage(130)).toContain("plus long que d’habitude");
  });

  it("montre la photo de départ floue pendant la création", () => {
    const { container } = render(<StudioImageWaiting createdAt={new Date().toISOString()} startPhoto="https://x.test/piece.jpg" />);
    const img = container.querySelector("img.studio-image-waiting-photo") as HTMLImageElement;
    expect(img.src).toBe("https://x.test/piece.jpg");
    expect(img.style.filter).toContain("blur(16px)");
    expect(screen.getByRole("status")).toHaveTextContent("Ta nouvelle image se prépare");
  });

  it("sans photo de départ : cadre et reflet seuls", () => {
    const { container } = render(<StudioImageWaiting createdAt={new Date().toISOString()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".studio-image-waiting-sweep")).not.toBeNull();
  });
});
