/**
 * Sonde « icône à l'export » (18/10/2026, accord de Laetitia, après #1772, chantier AB).
 *
 * Appelée à la fin du carrousel texte figé (contenus-figes.spec.ts), déjà rejoué chaque
 * matin sans crédit. Elle n'échoue jamais : elle écrit une ligne lue par la visite du matin :
 *   🔣 Icône à l'export ✅ (PNG 6,2 % · PowerPoint 5,9 % de la couleur de l'icône)
 *
 * Pourquoi : « Ajouter une icône » pose un dessin SVG sur la slide. Un <svg> posé lui-même
 * en position absolue n'est PAS dessiné par html2canvas dans l'iframe d'export : l'icône
 * se voyait dans l'éditeur et manquait dans le PNG et le PowerPoint, sans aucune erreur
 * (vu le 18/10/2026 pendant le chantier). Les tests CI tournent sans vrai rendu : seul un
 * export dans un vrai navigateur le voit.
 *
 * Parcours : slide 1, « Ajouter une icône » › « Idée », téléchargement « Images PNG (ZIP) »
 * et « PowerPoint : éditable », puis lecture des pixels du carré de l'icône (centre de la
 * slide) dans slide-1.png et dans l'image de fond de la slide 1 du PowerPoint. Seuil : au
 * moins 1,5 % du carré à la couleur de l'icône dans chacun (mesuré 5 à 15 % le 18/10).
 * L'icône est retirée à la fin par « Annuler » (les sondes suivantes voient le carrousel
 * d'origine).
 */
import type { Page } from "@playwright/test";
import * as fs from "fs";
import JSZip from "jszip";

const court = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 90);
const SEUIL = 0.015;

/** Part du carré de l'icône (440,575 → 640,775 en pixels de slide) proche de `couleur`. */
async function partCouleur(page: Page, png: Buffer, couleur: string): Promise<number> {
  return page.evaluate(async ({ b64, hex }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const img = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const s = img.width / 1080;
    const d = x.getImageData(Math.round(440 * s), Math.round(575 * s), Math.round(200 * s), Math.round(200 * s)).data;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) < 60) n++;
    return n / (d.length / 4);
  }, { b64: png.toString("base64"), hex: couleur });
}

async function telecharge(page: Page, item: RegExp): Promise<Buffer> {
  await page.getByRole("button", { name: /Télécharger/ }).first().click();
  const entree = page.getByRole("menuitem").filter({ hasText: item }).first();
  await entree.waitFor({ state: "visible", timeout: 8000 });
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 180_000 }), entree.click()]);
  const chemin = await d.path();
  if (!chemin) throw new Error(`téléchargement « ${item.source} » vide`);
  return fs.readFileSync(chemin);
}

export async function sondeIconeExport(page: Page) {
  let posee = false;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "Sélectionner la slide 1", exact: true }).click();
    await page.waitForTimeout(800);
    const panneau = page.getByLabel("Réglages simples");
    const bouton = panneau.getByRole("button", { name: /Ajouter une icône/ });
    if (!(await bouton.isVisible().catch(() => false))) throw new Error("« Ajouter une icône » absent du mode simple");
    await bouton.click();
    await page.getByLabel("Chercher une icône").fill("idée");
    await page.getByRole("button", { name: "Icône Idée" }).click();
    const icone = page.frameLocator('iframe[title^="Éditeur de la slide"]').locator('[data-editor-icon="Idée"] svg').first();
    await icone.waitFor({ timeout: 10_000 });
    posee = true;
    const couleur = (await icone.getAttribute("stroke")) || "";
    if (!/^#[0-9a-f]{6}$/i.test(couleur)) throw new Error(`couleur de l'icône illisible (« ${couleur} »)`);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(2500); // la sauvegarde continue part avant l'export

    const zip = await JSZip.loadAsync(await telecharge(page, /Images PNG/));
    const slide1 = Object.keys(zip.files).find((f) => /(^|\/)slide-1\.png$/.test(f));
    if (!slide1) throw new Error("slide-1.png absente du ZIP");
    const partPng = await partCouleur(page, await zip.file(slide1)!.async("nodebuffer"), couleur);

    const pptx = await JSZip.loadAsync(await telecharge(page, /PowerPoint/));
    const rels = (await pptx.file("ppt/slides/_rels/slide1.xml.rels")?.async("string")) || "";
    const fond = rels.match(/Target="\.\.\/media\/([^"]+\.png)"/)?.[1];
    if (!fond) throw new Error("pas d'image de fond sur la slide 1 du PowerPoint");
    const partPptx = await partCouleur(page, await pptx.file(`ppt/media/${fond}`)!.async("nodebuffer"), couleur);

    const pc = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
    const ok = partPng >= SEUIL && partPptx >= SEUIL;
    const manque = [partPng < SEUIL ? "absente du PNG" : "", partPptx < SEUIL ? "absente du PowerPoint" : ""].filter(Boolean).join(", ");
    console.log(`🔣 Icône à l'export ${ok ? "✅" : "❌"} (PNG ${pc(partPng)} · PowerPoint ${pc(partPptx)} de la couleur de l'icône${ok ? "" : ` : ${manque}`})${ok ? "" : " 🟠"}`);
  } catch (e) {
    console.log(`🔣 Icône à l'export ❌ (${court(e)}) 🟠`);
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
    if (posee) await page.getByLabel("Annuler la modification").click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}
