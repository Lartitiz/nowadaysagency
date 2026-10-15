/**
 * Référence avant/après pour le découpage de l'export hybride (fiche 15 de
 * docs/robustesse/gros-fichiers.md, test 5). Le XML des slides
 * (`ppt/slides/slide*.xml`, sans le contenu des images) d'un export doit rester
 * IDENTIQUE quand on déplace du code à l'identique.
 *
 * La position des textes dépend des polices de la machine : la référence est
 * donc LOCALE (rangée dans test-results/, jamais commitée). Mode d'emploi :
 *   1. avant un lot : PPTX_REF=save  npx playwright test e2e/pptx-mixed-text.spec.ts e2e/pptx-hybrid-photo-occultee.spec.ts --project=chromium
 *   2. après le lot : PPTX_REF=check npx playwright test … (même commande)
 * Sans PPTX_REF, rien n'est comparé : les specs gardent leur comportement.
 */
import { expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.join(__dirname, "..", "test-results", "pptx-reference");

/** XML des slides, dans l'ordre, sans les attributs qui varient d'un export à l'autre. */
export async function slidesXml(pptx: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(pptx);
  const noms = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const parties: string[] = [];
  for (const n of noms) parties.push(`<!-- ${n} -->\n${await zip.file(n)!.async("string")}`);
  // pptxgenjs numérote ses objets avec un compteur de module : neutre pour le rendu.
  return parties.join("\n").replace(/ id="\d+"/g, ' id="#"');
}

/** Enregistre ou compare la référence selon PPTX_REF (voir l'en-tête). */
export async function compareToReference(nom: string, pptx: Buffer): Promise<void> {
  const mode = process.env.PPTX_REF;
  if (mode !== "save" && mode !== "check") return;
  const fichier = path.join(DOSSIER, `${nom}.xml`);
  const xml = await slidesXml(pptx);
  if (mode === "save") {
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(fichier, xml);
    console.log(`📌 référence PPTX enregistrée : ${fichier}`);
    return;
  }
  expect(fs.existsSync(fichier), `référence absente : lancer d'abord avec PPTX_REF=save (${fichier})`).toBe(true);
  expect(xml, `XML des slides différent de la référence ${fichier}`).toBe(fs.readFileSync(fichier, "utf8"));
}
