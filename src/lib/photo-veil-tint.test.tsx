// Voile de marque (02/10/2026) : déplacer le texte garde la teinte du voile.
import { expect, it } from "vitest";
import { positionPhotoText } from "./carousel-editor";

it("keeps the brand tint of the veil when the text is moved", () => {
  const source = `<div style="width:1080px;height:1350px;position:relative"><div data-injected-scrim="1" style="position:absolute;left:0;bottom:0;width:1080px;height:54%;background:linear-gradient(0deg,rgba(145,1,75,0.85) 0%,rgba(145,1,75,0) 100%);"></div><div data-photo-text-layout="bottom_left" style="display:flex"><p data-slide-text="overlay">Texte</p></div></div>`;
  for (const position of ["top_left", "center"] as const) {
    const moved = positionPhotoText({ id: "1", html: source, data: {} } as any, position);
    const style = new DOMParser().parseFromString(moved.html, "text/html").querySelector<HTMLElement>("[data-injected-scrim]")!.getAttribute("style") || "";
    expect(style.replace(/\s/g, "")).toContain("rgba(145,1,75,0.85)");
    expect(style.replace(/\s/g, "")).not.toContain("rgba(0,0,0,0.85)");
  }
});
