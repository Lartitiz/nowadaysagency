import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { measureAppHeaderHeight, useAppHeaderHeightVar } from "@/lib/app-header-height";

function fakeHeader(height: number, position = "sticky", display = "block") {
  const el = document.createElement("header");
  el.style.position = position;
  el.style.top = "0px";
  el.style.display = display;
  el.getBoundingClientRect = () => ({ top: 0, bottom: height, height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function Probe() {
  useAppHeaderHeightVar();
  return null;
}

describe("hauteur du menu de l'app (--app-header-h)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--app-header-h");
  });

  it("mesure l'en-tête collé visible, ignore les en-têtes non collés ou cachés", () => {
    fakeHeader(30, "static");
    fakeHeader(200, "sticky", "none");
    fakeHeader(81);
    expect(measureAppHeaderHeight()).toBe(81);
  });

  it("aucun en-tête collé : 0 (les classes gardent leur repli)", () => {
    fakeHeader(40, "static");
    expect(measureAppHeaderHeight()).toBe(0);
  });

  it("écrit la variable sur <html> tant que l'éditeur est là, la retire ensuite", () => {
    fakeHeader(57);
    const { unmount } = render(<Probe />);
    expect(document.documentElement.style.getPropertyValue("--app-header-h")).toBe("57px");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--app-header-h")).toBe("");
  });
});
