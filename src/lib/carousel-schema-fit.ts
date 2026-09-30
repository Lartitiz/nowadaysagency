import { hasClippedElement } from "./carousel-quality";

/** Only newly generated schema slides enter here. Saved/locked slides and photos
 * retain their original HTML. Compact whitespace before touching type sizes;
 * never remove copy, flatten relationships or scale the whole canvas. */
export function fitSchemaDocument(doc: Document): boolean {
  if (!hasClippedElement(doc)) return false;
  const view = doc.defaultView!;
  const root = [...doc.body.children].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 1078 && r.height >= 1348 && el.tagName !== "STYLE";
  }) as HTMLElement | undefined;
  if (!root) return false;
  const rootStyle = view.getComputedStyle(root);
  // Arbitrary absolute layouts need a separate composition, not blind movement.
  if (rootStyle.display !== "flex" || rootStyle.flexDirection !== "column") return false;
  const elements = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const original = elements.map(el => ({ el, css: el.getAttribute("style"),
    computed: Object.fromEntries(["font-size", "line-height", "margin-top", "margin-bottom", "padding-top", "padding-bottom", "row-gap"].map(k => [k, view.getComputedStyle(el).getPropertyValue(k)])) }));
  if (elements.some(el => el !== root && /absolute|fixed/.test(view.getComputedStyle(el).position) && el.matches("[data-pptx-editable],[data-slide-text]"))) return false;
  for (const ratio of [.75, .5, .3]) {
    for (const { el, computed: c } of original) {
      for (const key of ["margin-top", "margin-bottom", "padding-top", "padding-bottom", "row-gap"]) {
        const value = parseFloat(c[key]);
        if (value > 0) el.style.setProperty(key, `${Math.max(el === root ? 48 : 4, value * ratio)}px`);
      }
      const size = parseFloat(c["font-size"]), line = parseFloat(c["line-height"]);
      if (line > size * 1.35) el.style.lineHeight = "1.35";
    }
    // Avoid flex shrinking text boxes while their contents keep their full height.
    for (const child of root.children) (child as HTMLElement).style.flexShrink = "0";
    if (!hasClippedElement(doc)) { root.dataset.schemaFit = "spacing-v1"; return true; }
  }
  // Never commit an unverified partial adjustment. The ordinary QA keeps warning.
  for (const { el, css } of original) {
    if (css === null) el.removeAttribute("style"); else el.setAttribute("style", css);
  }
  return false;
}

export async function fitGeneratedSchemaSlides<T extends { html: string }>(slides: T[], source: any[]): Promise<T[]> {
  return Promise.all(slides.map(async (slide, i) => {
    if (!source[i]?.visual_schema || source[i]?.editor_locked || source[i]?.no_overlay || /^photo/.test(source[i]?.slide_type || "")) return slide;
    const frame = document.createElement("iframe");
    frame.title = "Ajustement du schéma";
    frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.style.cssText = "position:fixed;left:-12000px;top:0;width:1080px;height:1350px;border:0;pointer-events:none";
    let timer: ReturnType<typeof setTimeout>;
    let expired = false;
    // Copy back styles only to the original markup: browser extensions or other
    // late iframe nodes must never enter the saved carousel.
    const original = new DOMParser().parseFromString(slide.html, "text/html");
    const nodes = [...original.querySelectorAll<HTMLElement>("body *,head link,head style")];
    nodes.forEach((el, index) => el.setAttribute("data-schema-fit-key", String(index)));
    try {
      const work = async () => {
        const loaded = new Promise<void>(resolve => { frame.onload = () => resolve(); });
        frame.srcdoc = `<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px}*{box-sizing:border-box}</style></head><body>${original.head.innerHTML}${original.body.innerHTML}</body></html>`;
        document.body.append(frame); await loaded;
        const doc = frame.contentDocument!; await doc.fonts.ready;
        if (expired) return slide;
        // Images are excluded; wait for real fonts before measuring line wrapping.
        if (doc.querySelector("img,[data-pptx-photo],[data-editor-photo]")) return slide;
        const text = doc.body.textContent;
        const changed = fitSchemaDocument(doc);
        if (!changed || doc.body.textContent !== text || expired) return slide;
        nodes.forEach((el, index) => {
          const fitted = doc.querySelector<HTMLElement>(`[data-schema-fit-key="${index}"]`);
          if (fitted?.hasAttribute("style")) el.setAttribute("style", fitted.getAttribute("style")!);
          if (fitted?.dataset.schemaFit) el.dataset.schemaFit = fitted.dataset.schemaFit;
          el.removeAttribute("data-schema-fit-key");
        });
        return { ...slide, html: original.head.innerHTML + original.body.innerHTML };
      };
      return await Promise.race([work(), new Promise<T>(resolve => { timer = setTimeout(() => { expired = true; resolve(slide); }, 8000); })]);
    } catch { return slide; }
    finally { clearTimeout(timer!); frame.remove(); }
  }));
}
