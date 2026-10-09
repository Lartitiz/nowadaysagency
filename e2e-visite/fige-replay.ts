/**
 * Contenus figés (08/10/2026) — enregistrer une fois, rejouer chaque jour.
 *
 * Le but : surveiller NOTRE code (affichage des slides, design, export PowerPoint)
 * sur le site en ligne, chaque jour, sans payer de génération IA. On enregistre
 * UNE fois les réponses des fonctions serveur pendant un vrai parcours ; ensuite
 * le robot refait le même parcours et le navigateur reçoit ces réponses
 * enregistrées au lieu d'appeler l'IA. Tout le reste (le site, son code, le
 * rendu, l'export) tourne pour de vrai.
 *
 * Ce que ça NE surveille PAS : la qualité de l'écriture de l'IA (la réponse est
 * figée). Pour ça : la grille du bilan du lundi et le banc mensuel.
 *
 * Usage dans une spec :
 *   const fige = await installFigeReplay(page, "carrousel-texte");
 *   … parcours …
 *   await fige.save();   // n'écrit qu'en mode enregistrement
 * Mode : FIGE_RECORD=1 → enregistrement (coût réel, à faire rarement) ; sinon rejeu.
 */
import { expect, type Locator, type Page, type Route } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIGES_DIR = path.join(__dirname, "figes");

export interface FigeEntry {
  fn: string;
  method: string;
  status: number;
  contentType: string;
  body: string;
}

export interface FigeFile {
  name: string;
  recordedAt: string;
  entries: FigeEntry[];
}

/** Fonctions sans IA qui peuvent partir en vrai pendant un rejeu (lectures). */
export const LIVE_OK = new Set(["social-status", "check-subscription"]);

export const fnOf = (url: string) => url.split("/functions/v1/")[1]?.split("?")[0] ?? "";

/**
 * Rejoueur pur : pour chaque fonction, sert les réponses dans l'ordre où elles
 * ont été enregistrées ; au-delà, répète la dernière (un écran qui rappelle une
 * fonction une fois de plus ne casse pas le rejeu). null = fonction jamais vue.
 */
export function makeReplayer(entries: FigeEntry[]) {
  const byFn = new Map<string, FigeEntry[]>();
  for (const e of entries) byFn.set(`${e.method} ${e.fn}`, [...(byFn.get(`${e.method} ${e.fn}`) || []), e]);
  const served = new Map<string, number>();
  return (method: string, fn: string): FigeEntry | null => {
    const key = `${method} ${fn}`;
    const list = byFn.get(key);
    if (!list?.length) return null;
    const i = served.get(key) || 0;
    served.set(key, i + 1);
    return list[Math.min(i, list.length - 1)];
  };
}

export async function installFigeReplay(page: Page, name: string) {
  const file = path.join(FIGES_DIR, `${name}.json`);
  const recording = process.env.FIGE_RECORD === "1";
  const entries: FigeEntry[] = [];
  let replayed = 0;
  const missing = new Set<string>();

  if (!recording && !fs.existsSync(file)) {
    return { recording, available: false as const, file, save: async () => {}, stats: () => ({ replayed, missing: [] as string[] }) };
  }
  const replay = recording ? null : makeReplayer((JSON.parse(fs.readFileSync(file, "utf8")) as FigeFile).entries);

  await page.route("**/functions/v1/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.continue();
    const fn = fnOf(req.url());
    if (recording) {
      const resp = await route.fetch();
      const body = await resp.text();
      entries.push({ fn, method: req.method(), status: resp.status(), contentType: resp.headers()["content-type"] || "", body });
      return route.fulfill({ response: resp, body });
    }
    const hit = replay!(req.method(), fn);
    if (!hit) {
      missing.add(fn);
      // Lectures sans IA : elles peuvent partir en vrai. Tout le reste est BLOQUÉ :
      // un rejeu ne doit jamais payer une génération en douce. L'enregistrement est
      // alors incomplet → le test le signale (« non enregistrées »), ré-enregistrer.
      if (LIVE_OK.has(fn)) return route.continue();
      return route.fulfill({
        status: 503,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
        body: JSON.stringify({ error: `contenus figés : réponse « ${fn} » non enregistrée` }),
      });
    }
    replayed++;
    return route.fulfill({
      status: hit.status,
      headers: { "content-type": hit.contentType, "access-control-allow-origin": "*" },
      body: hit.body,
    });
  });

  return {
    recording,
    available: true as const,
    file,
    stats: () => ({ replayed, missing: [...missing] }),
    save: async () => {
      if (!recording) return;
      fs.mkdirSync(FIGES_DIR, { recursive: true });
      const out: FigeFile = { name, recordedAt: new Date().toISOString(), entries };
      fs.writeFileSync(file, JSON.stringify(out));
      console.log(`💾 ${entries.length} réponse(s) enregistrée(s) → ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1024).toFixed(0)} Ko)`);
    },
  };
}

/**
 * Capture d'une zone à taille FIXE (arrondie vers le bas) puis comparaison à la
 * référence. toHaveScreenshot refuse toute différence de taille, et un arrondi
 * de mise en page donne parfois 673 px au lieu de 674 pour la même slide
 * (vu sur le carrousel mixte le 09/10) : faux rouge sans aucun changement visible.
 */
export async function expectZoneMatches(page: Page, locator: Locator, name: string, message: string) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${message} (zone introuvable à l'écran)`);
  // Coordonnées de la PAGE (une zone peut dépasser la hauteur de l'écran).
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const clip = {
    x: Math.ceil(box.x + scroll.x), y: Math.ceil(box.y + scroll.y),
    width: Math.floor(box.width) - 1, height: Math.floor(box.height) - 1,
  };
  const shot = await page.screenshot({ clip, fullPage: true, animations: "disabled", mask: [page.locator("canvas")] });
  expect(shot, message).toMatchSnapshot(name, { maxDiffPixelRatio: 0.01 });
}
