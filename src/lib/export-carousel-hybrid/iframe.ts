import { type HybridCharter, SLIDE_W_PX, SLIDE_H_PX } from "./types";
import { charterFontUrl } from "../pptx-mixed-text";
import { waitForExportImages } from "../export-image-readiness";
import { bakeGlassBlur } from "../export-glass-blur";
import { bakePhotoFilters } from "../export-photo-filters";

// ---------------------------------------------------------------------------
// iframe mounting + readiness
// ---------------------------------------------------------------------------

export async function mountIframe(html: string, charter?: HybridCharter | null): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${SLIDE_W_PX}px;height:${SLIDE_H_PX}px;border:0;z-index:-1;pointer-events:none;`;
  iframe.setAttribute("aria-hidden", "true");

  const fontLinks = Array.from(document.head.querySelectorAll("link"))
    .filter((l) => /fonts\.(googleapis|gstatic|bunny)/i.test(l.getAttribute("href") || ""))
    .map((l) => l.outerHTML)
    .join("\n");

  const charterFonts = charterFontUrl([charter?.font_title, charter?.font_body]);
  const charterLink = charterFonts ? `<link rel="stylesheet" href="${charterFonts.replace(/&/g, "&amp;")}">` : "";

  // NB: tous les descendants d'un bloc annoté sont masqués pour éviter le double-rendu
  // dans la rasterisation html2canvas (sinon les spans avec couleur explicite restent visibles
  // sous le bloc éditable PPTX rajouté par-dessus).
  // Si un descendant doit rester visible (badge, sticker, illustration), ne pas annoter le
  // parent en data-pptx-editable — annoter chaque sous-bloc texte individuellement.
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8" />${fontLinks}${charterLink}
<style>
  html, body { margin:0; padding:0; width:${SLIDE_W_PX}px; height:${SLIDE_H_PX}px; overflow:hidden; background:transparent; }
  *, *::before, *::after { box-sizing: border-box; }
  [data-pptx-hide="true"],
  [data-pptx-hide="true"] * {
    color: transparent !important;
    text-shadow: none !important;
    -webkit-text-fill-color: transparent !important;
    background-clip: text !important;
    -webkit-background-clip: text !important;
    background-image: none !important;
  }
  [data-pptx-hide="true"]::before,
  [data-pptx-hide="true"]::after,
  [data-pptx-hide="true"] *::before,
  [data-pptx-hide="true"] *::after {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    text-shadow: none !important;
  }
  /* Masquage des zones photo : visibility (pas display) pour préserver le layout
     et garder getBoundingClientRect valide. Le background-image est traité
     en JS pour conserver les gradients overlay (cf. extractPhotoZones). */
  [data-pptx-photo-hide="true"] img,
  [data-pptx-photo-hide="true"] picture,
  [data-pptx-photo-hide="true"] svg image {
    visibility: hidden !important;
  }
  /* Masquage des shapes structurels rendus en pptxgenjs natif :
     on retire UNIQUEMENT le fond/ombre du shape lui-même, JAMAIS celui des descendants
     (le texte enfant doit rester visible dans le PNG si non annoté éditable).
     PAS de sélecteur descendant ici, contrairement à data-pptx-hide. */
  [data-pptx-shape-hide="true"] {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
    border-color: transparent !important;
  }
</style></head><body>${html}</body></html>`;

  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("iframe load timeout")), 8000);
    iframe.addEventListener(
      "load",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

  return iframe;
}

export async function waitReady(iframe: HTMLIFrameElement): Promise<void> {
  const doc = iframe.contentDocument;
  if (!doc) return;
  try {
    if ((doc as any).fonts?.ready) {
      await Promise.race([(doc as any).fonts.ready, new Promise((r) => setTimeout(r, 5000))]);
    }
  } catch {
    /* noop */
  }
  await waitForExportImages(doc.body);
  // Verre dépoli : html2canvas ignore filter:blur, on pose une photo déjà floutée.
  await bakeGlassBlur(doc.body);
  await bakePhotoFilters(doc.body);
  // 2 frames pour laisser le layout se stabiliser. ⚠️ requestAnimationFrame est
  // MIS EN PAUSE par le navigateur quand l'onglet est en arrière-plan (ce qui
  // arrive dès qu'on ouvre l'onglet Canva). Sans garde-fou, cette attente ne se
  // résout JAMAIS → l'export (et donc « Ouvrir dans Canva ») se fige à l'infini.
  // On la course contre un setTimeout qui, lui, se déclenche même en arrière-plan.
  await Promise.race([
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    new Promise<void>((r) => setTimeout(r, 300)),
  ]);
  await new Promise((r) => setTimeout(r, 200));
}
