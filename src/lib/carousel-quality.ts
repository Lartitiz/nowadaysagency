export interface QualityIssue {
  slide: number;
  elementId: string;
  kind: "overflow" | "size" | "margin" | "contrast" | "manual" | "image";
  severity: "error" | "warning";
  message: string;
  fix?: Record<string, string>;
}
type RGB = [number, number, number];
function rgb(value: string): RGB | null {
  const parts = value.match(
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
  );
  if (!parts || (parts[4] !== undefined && Number(parts[4]) < 1)) return null;
  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}
// WCAG contrast formula; this is not a claim of full WCAG conformance.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
export function contrastRatio(a: RGB, b: RGB): number {
  const luminance = (c: RGB) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function inspectSlide(doc: Document, slide: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const view = doc.defaultView!;
  const photos = [
    ...doc.querySelectorAll<HTMLElement>(
      "img,[data-editor-photo],[data-pptx-photo]",
    ),
  ];
  for (const el of doc.querySelectorAll<HTMLElement>(
    "[data-editor-id][data-pptx-editable]",
  )) {
    if (
      !el.textContent?.trim() ||
      el.matches(
        "img,[data-editor-photo],[data-pptx-photo],[data-slide-page]",
      ) ||
      /^(page|page_number|slide_number|number)$/.test(
        el.dataset.pptxEditable || el.dataset.slideText || "",
      )
    )
      continue;
    const style = view.getComputedStyle(el),
      rect = el.getBoundingClientRect();
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0 ||
      !rect.width ||
      !rect.height
    )
      continue;
    const add = (
      kind: QualityIssue["kind"],
      message: string,
      severity: QualityIssue["severity"] = "warning",
      fix?: Record<string, string>,
    ) =>
      issues.push({
        slide,
        elementId: el.dataset.editorId!,
        kind,
        message,
        severity,
        fix,
      });
    const range = doc.createRange();
    range.selectNodeContents(el);
    const textRect = range.getBoundingClientRect();
    let clipped =
      rect.left < -2 ||
      rect.top < -2 ||
      rect.right > 1082 ||
      rect.bottom > 1352 ||
      textRect.left < -2 ||
      textRect.right > 1082 ||
      textRect.top < -2 ||
      textRect.bottom > 1352;
    for (
      let p: HTMLElement | null = el;
      p && p !== doc.body;
      p = p.parentElement
    ) {
      const s = view.getComputedStyle(p),
        r = p.getBoundingClientRect();
      if (
        /hidden|clip|scroll|auto/.test(s.overflowX) &&
        (textRect.left < r.left - 2 || textRect.right > r.right + 2)
      )
        clipped = true;
      if (
        /hidden|clip|scroll|auto/.test(s.overflowY) &&
        (textRect.top < r.top - 2 || textRect.bottom > r.bottom + 2)
      )
        clipped = true;
    }
    if (clipped)
      add(
        "overflow",
        "Texte coupé ou hors de la slide : ajuste sa position, sa largeur ou sa taille.",
        "error",
      );
    else if (
      Math.min(rect.left, rect.top, 1080 - rect.right, 1350 - rect.bottom) < 40
    )
      add("margin", "Texte proche du bord : laisse idéalement 40 px de marge.");
    const font = parseFloat(style.fontSize);
    if (font < 32)
      add(
        "size",
        "Texte petit sur mobile : essaie au moins 32 px dans cet éditeur.",
        "warning",
        { "font-size": "32px" },
      );
    let background: RGB | null = null;
    let uncertain = false;
    for (let p: HTMLElement | null = el; p; p = p.parentElement) {
      const s = view.getComputedStyle(p);
      if (
        s.backgroundImage !== "none" ||
        Number(s.opacity) < 1 ||
        s.filter !== "none" ||
        s.mixBlendMode !== "normal"
      ) {
        uncertain = true;
        break;
      }
      background = rgb(s.backgroundColor);
      if (background) break;
      if (
        s.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        s.backgroundColor !== "transparent"
      ) {
        uncertain = true;
        break;
      }
    }
    // A photo can be a sibling layer, not an ancestor. Do not guess its pixels.
    if (
      !rgb(style.backgroundColor) &&
      photos.some((photo) => {
        const r = photo.getBoundingClientRect();
        return (
          r.left < rect.right &&
          r.right > rect.left &&
          r.top < rect.bottom &&
          r.bottom > rect.top
        );
      })
    )
      uncertain = true;
    const foreground = rgb(style.color);
    if (uncertain || !foreground)
      add(
        "manual",
        "Contraste sur photo, transparence ou effet : vérifie visuellement la lisibilité.",
      );
    else {
      background ||= [255, 255, 255];
      // 1080 px artwork shown at 360 px on mobile; evaluate apparent text size.
      const threshold =
        font / 3 >= 24 || (font / 3 >= 18.67 && Number(style.fontWeight) >= 700)
          ? 3
          : 4.5;
      if (contrastRatio(foreground, background) < threshold) {
        const color =
          contrastRatio([0, 0, 0], background) >
          contrastRatio([255, 255, 255], background)
            ? "#000000"
            : "#ffffff";
        add(
          "contrast",
          "Contraste insuffisant sur fond uni : renforce la couleur du texte.",
          "warning",
          { color },
        );
      }
    }
  }
  return issues;
}

function bounded(
  promise: Promise<unknown>,
  signal: AbortSignal,
  ms = 12_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new DOMException("Annulé", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Le contrôle n’a pas pu charger tous les éléments. Vérifie ta connexion puis relance-le.",
          ),
        ),
      ms,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else promise.then(() => finish(), finish);
  });
}
export async function checkCarouselQuality(
  slides: { html: string }[],
  signal: AbortSignal,
): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  for (let i = 0; i < slides.length; i++) {
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    const frame = document.createElement("iframe");
    frame.title = `Contrôle qualité slide ${i + 1}`;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.style.cssText =
      "position:fixed;left:-12000px;top:0;width:1080px;height:1350px;border:0;pointer-events:none";
    try {
      const loaded = new Promise<void>((resolve) => {
        frame.onload = () => resolve();
      });
      frame.srcdoc = `<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}*{box-sizing:border-box}</style></head><body>${slides[i].html}</body></html>`;
      document.body.append(frame);
      await bounded(loaded, signal);
      const doc = frame.contentDocument!;
      await bounded(doc.fonts?.ready || Promise.resolve(), signal);
      issues.push(...inspectSlide(doc, i));
      const jobs = [
        ...doc.querySelectorAll<HTMLElement>(
          "img,[data-editor-photo],[data-pptx-photo]",
        ),
      ].map(async (el) => {
        let ok = true;
        if (el.tagName === "IMG")
          ok =
            (el as HTMLImageElement).complete &&
            (el as HTMLImageElement).naturalWidth > 0;
        else {
          const src = doc
            .defaultView!.getComputedStyle(el)
            .backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
          if (src) {
            const image = new Image();
            const loaded = new Promise<void>((resolve) => {
              image.onload = () => resolve();
              image.onerror = () => {
                ok = false;
                resolve();
              };
            });
            image.src = src;
            await bounded(loaded, signal);
          }
        }
        if (!ok)
          issues.push({
            slide: i,
            elementId: el.dataset.editorId || "",
            kind: "image",
            severity: "error",
            message:
              "Image impossible à charger : remplace-la ou vérifie sa disponibilité.",
          });
      });
      await Promise.all(jobs);
    } finally {
      frame.remove();
    }
  }
  return issues;
}
