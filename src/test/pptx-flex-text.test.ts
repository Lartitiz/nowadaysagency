// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { extractAnnotatedBlocks } from "@/lib/pptx-font-mapping";

afterEach(() => { document.body.innerHTML = ""; });
function readBlock(style: string) {
  document.body.innerHTML = `<div data-pptx-editable="body" style="font-size:44px;${style}">1</div>`;
  const el = document.body.firstElementChild as HTMLElement;
  el.getBoundingClientRect = () => ({ x:80, y:800, left:80, top:800, right:200, bottom:920, width:120, height:120, toJSON:()=>({}) });
  return extractAnnotatedBlocks(document)[0];
}
describe("native PPTX alignment of a direct flex label", () => {
  it("keeps a number centered on both axes inside its square", () => {
    const block = readBlock("display:flex;align-items:center;justify-content:center");
    expect(block.style.textAlign).toBe("center");
    expect(block.style.verticalAlign).toBe("middle");
  });
  it("maps a column flex container using its corresponding axes", () => {
    const block = readBlock("display:flex;flex-direction:column;align-items:center;justify-content:center");
    expect(block.style.textAlign).toBe("center");
    expect(block.style.verticalAlign).toBe("middle");
  });
  it("keeps ordinary left-aligned text at the top", () => {
    const block = readBlock("text-align:left");
    expect(block.style.textAlign).toBe("left");
    expect(block.style.verticalAlign).toBeUndefined();
  });
});
