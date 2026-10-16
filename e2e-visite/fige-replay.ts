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
/**
 * Attend que les polices des slides (iframes de la zone) soient chargées.
 * Les slides chargent leurs polices Google par <link>/@import avec display=swap :
 * tant que la police n'est pas arrivée, le texte s'affiche en police de secours
 * (Times). Vu le 15-16/10/2026 environ une fois sur trois sur la slide 1 du
 * carrousel texte → « aspect différent » à tort. document.fonts.ready seul ne
 * suffit pas : il est déjà résolu si la feuille de style Google n'est pas encore
 * arrivée (aucune police demandée). On attend donc : feuilles chargées, puis
 * chargement explicite de chaque police utilisée, puis fonts.ready.
 * Renvoie les polices encore absentes (vide = tout est prêt).
 */
export async function waitZoneFonts(locator: Locator, timeoutMs = 20_000): Promise<string[]> {
  return locator.evaluate(async (el, timeout) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const frames = [...(el instanceof HTMLIFrameElement ? [el] : []), ...el.querySelectorAll("iframe")] as HTMLIFrameElement[];
    const end = Date.now() + timeout;
    let missing: string[] = [];
    for (const f of frames) {
      for (;;) {
        const doc = f.contentDocument;
        if (doc && doc.readyState === "complete") {
          // Feuilles <link> pas encore arrivées : .sheet reste null.
          const pendingLinks = [...doc.querySelectorAll('link[rel="stylesheet"]')].filter((l) => !(l as HTMLLinkElement).sheet);
          // Polices Google demandées (<link> ou @import) mais pas encore déclarées :
          // la feuille de style Google n'est pas arrivée.
          const declaredNow = new Set([...doc.fonts].map((ff) => ff.family.replace(/^["']|["']$/g, "")));
          const google = [...doc.documentElement.innerHTML.matchAll(/fonts\.googleapis\.com\/css2?\?([^"')\s]+)/g)]
            .flatMap((m) => [...m[1].replace(/&amp;/g, "&").matchAll(/family=([^:&]+)/g)].map((f) => decodeURIComponent(f[1].replace(/\+/g, " "))));
          missing = google.filter((g) => !declaredNow.has(g));
          if (!pendingLinks.length && !missing.length) {
            const wanted = new Set<string>();
            for (const n of doc.body?.querySelectorAll("*") || []) {
              if (!(n as HTMLElement).innerText?.trim()) continue;
              const cs = doc.defaultView!.getComputedStyle(n);
              const fam = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
              if (fam) wanted.add(`${cs.fontStyle} ${cs.fontWeight} 32px "${fam}"`);
            }
            // Ne garde que les polices déclarées (@font-face) : les polices système n'ont rien à charger.
            const declared = new Set([...doc.fonts].map((ff) => ff.family.replace(/^["']|["']$/g, "")));
            const toLoad = [...wanted].filter((w) => declared.has(w.split('"')[1]));
            await Promise.all(toLoad.map((w) => doc.fonts.load(w).catch(() => [])));
            await doc.fonts.ready;
            missing = toLoad.filter((w) => !doc.fonts.check(w));
            if (!missing.length) break;
          }
        }
        if (Date.now() > end) break;
        await sleep(200);
      }
    }
    return missing;
  }, timeoutMs);
}

export async function expectZoneMatches(page: Page, locator: Locator, name: string, message: string) {
  await locator.scrollIntoViewIfNeeded();
  const missingFonts = await waitZoneFonts(locator);
  if (missingFonts.length) console.log(`⚠️ ${name} : police(s) pas chargée(s) avant la photo : ${missingFonts.join(" ; ")}`);
  // Le texte se remet en page avec la vraie police : une image pour finir.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${message} (zone introuvable à l'écran)`);
  // Coordonnées de la PAGE (une zone peut dépasser la hauteur de l'écran).
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const clip = {
    x: Math.ceil(box.x + scroll.x), y: Math.ceil(box.y + scroll.y),
    width: Math.floor(box.width) - 1, height: Math.floor(box.height) - 1,
  };
  // La barre d'actions du résultat est collée en bas de l'écran (chantier C,
  // 15/10/2026) : sans ça, elle recouvre le bas de la zone sur l'image.
  // Masquée le temps de la photo seulement (la suite de la spec s'en sert).
  const hide = await page.addStyleTag({ content: '[data-testid="result-actions"]{visibility:hidden !important}' });
  const shot = await page.screenshot({ clip, fullPage: true, animations: "disabled", mask: [page.locator("canvas")] });
  await hide.evaluate((el) => el.remove());
  expect(shot, message).toMatchSnapshot(name, { maxDiffPixelRatio: 0.01 });
}
