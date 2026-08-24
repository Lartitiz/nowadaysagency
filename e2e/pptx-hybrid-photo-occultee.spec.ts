/**
 * REPRO DÉTERMINISTE du défaut « photo occultée » sur carrousel MIXTE (24/08).
 *
 * Le défaut n'apparaît en visite guidée qu'une fois sur deux : il dépend du type
 * de slide que l'IA tire au sort (photo_full → sain, photo_integrated → cassé).
 * Ce test enlève le hasard : il monte à la main les gabarits `photo_integrated`
 * décrits par le prompt `carousel-visual` (top_photo, left_photo, card_photo) et
 * appelle le VRAI exporter hybride dans un vrai navigateur (Vite dev sert le
 * module source), puis relit le .pptx produit avec le même validateur que la
 * visite. Zéro crédit, zéro appel IA.
 *
 * À lancer (la CI n'exécute pas Playwright — elle s'arrête au tsc/vitest) :
 *   npx playwright test --config playwright.config.ts \
 *     e2e/pptx-hybrid-photo-occultee.spec.ts --project=chromium
 * Le .pptx produit reste dans test-results/pptx-encart.pptx : le vert de la spec
 * ne prouve rien à l'œil, c'est ce fichier qu'on ouvre pour REGARDER le rendu.
 *
 * La géométrie de décision, elle, est verrouillée en CI par
 * src/test/export-photo-backdrop.test.ts (les 5 gabarits) et le garde-fou de
 * l'export par src/test/pptx-validate.test.ts.
 *
 * Ce qui casse sans le correctif : dans ces gabarits, la photo est un ENCART
 * (elle ne recouvre pas entièrement son conteneur) → le fond opaque de la racine
 * reste peint dans le raster posé PAR-DESSUS la photo native → bloc charbon à
 * l'import Canva (même famille que le bug prod du 21/07).
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { validatePptx } from "../e2e-visite/pptx-validate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Gabarits `photo_integrated` du prompt carousel-visual, photo en ENCART. */
const SLIDES = [
  {
    // TÉMOIN photo_full : la photo recouvre toute la slide (cas déjà sain avant
    // le correctif — c'est le tirage qui faisait passer la visite un run sur deux).
    slide_number: 1,
    html: `<div style="width:1080px;height:1350px;background:#1A1815;position:relative">
      <div data-pptx-photo="1" style="position:absolute;inset:0;background-image:url(__PHOTO__);background-size:cover;background-position:center"></div>
      <div style="position:absolute;left:80px;bottom:240px;right:80px">
        <h2 data-pptx-editable="title" style="margin:0;font-family:Georgia,serif;font-size:64px;color:#FFFFFF">Cinq rituels doux</h2>
      </div>
    </div>`,
  },
  {
    // top_photo : photo 1080×740 en haut, texte en bas sur racine crème opaque.
    slide_number: 2,
    html: `<div style="width:1080px;height:1350px;background:#F6F4F0">
      <img data-pptx-photo="1" src="__PHOTO__" style="display:block;width:1080px;height:740px;object-fit:cover" />
      <div style="padding:80px">
        <h2 data-pptx-editable="title" style="margin:0;font-family:Georgia,serif;font-size:56px;color:#1A1815">Ralentir le matin</h2>
        <div style="width:80px;height:4px;background:#C96F4A;margin:24px 0"></div>
        <p data-pptx-editable="body" style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.5;color:#4A4642">Dix minutes sans écran avant d'ouvrir le téléphone, et la journée change de texture.</p>
      </div>
    </div>`,
  },
  {
    // card_photo : DEUX fonds opaques imbriqués (racine crème + carte blanche).
    slide_number: 3,
    html: `<div style="width:1080px;height:1350px;background:#F6F4F0;padding:80px">
      <div style="width:920px;height:1190px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08)">
        <img data-pptx-photo="1" src="__PHOTO__" style="display:block;width:920px;height:660px;object-fit:cover" />
        <div style="padding:48px">
          <h2 data-pptx-editable="title" style="margin:0;font-family:Georgia,serif;font-size:52px;color:#1A1815">Un geste à la fois</h2>
          <p data-pptx-editable="body" style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:28px;line-height:1.5;color:#4A4642">On ne tient pas une routine parce qu'elle est parfaite, mais parce qu'elle est petite.</p>
        </div>
      </div>
    </div>`,
  },
  {
    // left_photo : 2 colonnes, photo 432px à gauche, racine charbon opaque.
    slide_number: 4,
    html: `<div style="width:1080px;height:1350px;background:#1A1815;display:flex">
      <img data-pptx-photo="1" src="__PHOTO__" style="display:block;width:432px;height:1350px;object-fit:cover;flex-shrink:0" />
      <div style="width:4px;background:#C96F4A"></div>
      <div style="flex:1;padding:80px">
        <h2 data-pptx-editable="title" style="margin:0;font-family:Georgia,serif;font-size:52px;color:#F6F4F0">Deux colonnes</h2>
        <p data-pptx-editable="body" style="margin:24px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:28px;line-height:1.5;color:#D8D4CE">La photo tient la gauche, le texte respire à droite.</p>
      </div>
    </div>`,
  },
  {
    // banner_photo : bandeau 380px en haut — l'encart le plus fin.
    slide_number: 5,
    html: `<div style="width:1080px;height:1350px;background:#FFFFFF">
      <div data-pptx-photo="1" style="width:1080px;height:380px;background-image:url(__PHOTO__);background-size:cover;background-position:center"></div>
      <div style="padding:80px">
        <h2 data-pptx-editable="title" style="margin:0;font-family:Georgia,serif;font-size:60px;color:#1A1815">Un bandeau suffit</h2>
        <p data-pptx-editable="body" style="margin:24px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:28px;line-height:1.5;color:#4A4642">Même une photo de 380 px de haut doit rester visible sous le raster.</p>
      </div>
    </div>`,
  },
];


test("export hybride : une photo en ENCART n'est jamais occultée par le raster", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (export PPTX)");
  test.setTimeout(180_000);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const b64 = await page.evaluate(async (slides) => {
    // Photo de test : deux bandes très saturées → un raster opaque posé dessus
    // se voit aussi à l'œil sur la capture extraite.
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#E23D2E";
    ctx.fillRect(0, 0, 1200, 600);
    ctx.fillStyle = "#2E7DE2";
    ctx.fillRect(0, 600, 1200, 600);
    const photo = c.toDataURL("image/jpeg", 0.9);

    const mod = await import("/src/lib/export-carousel-hybrid-pptx.ts");
    const blob = (await mod.exportCarouselHybridPptx(
      slides.map((s) => ({ slide_number: s.slide_number, html: s.html.replaceAll("__PHOTO__", photo) })),
      null,
      { color_background: "#F6F4F0", color_text: "#1A1815", font_title: "Georgia", font_body: "Helvetica" },
      "repro-encart",
      [{ base64: photo }],
      null,
      { returnBlob: true },
    )) as Blob;

    const u8 = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
    return btoa(s);
  }, SLIDES);

  expect(errors, `erreurs JS pendant l'export : ${errors.join(" | ")}`).toEqual([]);

  // Gardé sur disque (test-results/ est gitignoré) : le vert de la spec ne prouve
  // rien à l'œil — c'est ce fichier qu'on ouvre pour REGARDER le rendu.
  const out = path.join(__dirname, "..", "test-results", "pptx-encart.pptx");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(b64, "base64"));
  console.log(`📦 PPTX écrit : ${out}`);
  const report = await validatePptx(out, { minSlides: 5, expectEditableText: true, backgroundIsDecorative: true });
  console.log(
    `📦 ${report.slideCount} slides, ${report.mediaCount} images, ${report.problems.length} défaut(s)` +
      (report.problems.length ? ` :\n   - ${report.problems.join("\n   - ")}` : ""),
  );

  // Chaque slide porte sa photo NATIVE en plus de son fond rasterisé.
  expect(report.slideCount).toBe(SLIDES.length);
  expect(report.mediaCount).toBeGreaterThanOrEqual(SLIDES.length + 1);
  expect(report.problems, `Défauts PPTX : ${report.problems.join(" | ")}`).toEqual([]);
});
