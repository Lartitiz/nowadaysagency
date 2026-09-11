import { afterEach, describe, expect, it, vi } from "vitest";
import { materializeStoryPillsForCapture } from "@/lib/export-carousel-png";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

describe("fidélité des pastilles dans l'export story", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("remplace le rectangle multiligne par une pastille distincte pour chaque ligne", () => {
    document.body.innerHTML = `
      <div id="parent" style="position:static;width:auto;height:auto;text-align:center">
        <span
          id="pill"
          data-story-pptx="body"
          data-story-mode="wh"
          style="display:inline;font-family:Inter,sans-serif;font-size:52px;font-weight:700;line-height:64px;letter-spacing:.01em;background:#fff;color:#111;padding:4px 8px;border-radius:8px"
        >Alpha beta</span>
      </div>`;

    const parent = document.querySelector<HTMLElement>("#parent")!;
    const pill = document.querySelector<HTMLElement>("#pill")!;
    const fragments = [rect(120, 96, 180, 72), rect(140, 160, 140, 72)];
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue(rect(100, 100, 300, 128));
    vi.spyOn(pill, "getClientRects").mockReturnValue(fragments as unknown as DOMRectList);

    let startOffset = 0;
    vi.spyOn(document, "createRange").mockImplementation(
      () =>
        ({
          setStart: (_node: Node, offset: number) => {
            startOffset = offset;
          },
          setEnd: vi.fn(),
          getBoundingClientRect: () => rect(0, startOffset < 6 ? 100 : 164, 10, 52),
          detach: vi.fn(),
        }) as unknown as Range,
    );

    materializeStoryPillsForCapture(document);

    expect(document.querySelector("#pill")).toBeNull();
    const stack = document.querySelector<HTMLElement>("[data-story-rasterized-pill='body']")!;
    const lines = Array.from(stack.children) as HTMLElement[];
    expect(lines.map((line) => line.textContent)).toEqual(["Alpha", "beta"]);
    expect(lines.every((line) => line.style.background === "rgb(255, 255, 255)")).toBe(true);
    expect(lines.every((line) => line.style.borderRadius === "8px")).toBe(true);
    expect(lines[1].style.marginTop).toBe("-8px");
    expect(parent.style.position).toBe("relative");
    expect(parent.style.width).toBe("300px");
    expect(parent.style.height).toBe("128px");
    expect(stack.style.left).toBe("20px");
    expect(stack.style.top).toBe("-4px");
  });

  it("laisse une pastille sur une seule ligne inchangée", () => {
    document.body.innerHTML = `
      <div><span id="pill" data-story-pptx="title" data-story-mode="col">Une ligne ?</span></div>`;
    const pill = document.querySelector<HTMLElement>("#pill")!;
    vi.spyOn(pill, "getClientRects").mockReturnValue(
      [rect(0, 0, 120, 50)] as unknown as DOMRectList,
    );

    materializeStoryPillsForCapture(document);

    expect(document.querySelector("#pill")).toBe(pill);
    expect(document.querySelector("[data-story-rasterized-pill]")).toBeNull();
  });
});
