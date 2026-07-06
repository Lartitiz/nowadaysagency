import { test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { ECRANS } from "./ecrans";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SONDE_DIR = path.join(__dirname, "sonde");

// SONDE = collecte pure de signaux pendant qu'on parcourt les écrans connectés.
// Elle NE JUGE PAS et NE FAIT JAMAIS ÉCHOUER le run : elle écrit un JSON par
// (écran, projet) dans e2e-visite/sonde/, que `aggregate.ts` (globalTeardown)
// synthétise en `sonde-report.json` trié en deux bacs (🔴 dur / 🟡 observation).
// Le VERDICT (vert/rouge) reste porté par les specs fonctionnelles + le cron.
//
// Deux profondeurs, pilotées par VISITE_AUDIT :
//   - absent        → sonde LÉGÈRE (console, réseau, débordement, perf) — quotidien
//   - "heavy"       → + audit a11y axe-core (serious/critical) — hebdo (lundi)
const HEAVY = process.env.VISITE_AUDIT === "heavy";

// On ne garde que le réseau vers l'app et ses edges Supabase : les 4xx/5xx de
// pixels analytics tiers ne sont pas nos bugs.
function isNotreReseau(url: string): boolean {
  return /nowadays-assistant\.fr|supabase\.co|\/functions\/v1\//.test(url);
}

type Sonde = {
  slug: string;
  url: string;
  projet: string;
  navError: string | null;
  gotoMs: number | null;
  perf: { domContentLoadedMs: number | null; loadMs: number | null } | null;
  overflowPx: number; // débordement horizontal (0 = ok)
  consoleErrors: Array<{ text: string; location: string }>;
  pageErrors: string[]; // exceptions JS non catchées
  network: Array<{ status: number; method: string; url: string }>; // 4xx/5xx de notre réseau
  requestFailed: Array<{ url: string; error: string }>;
  a11y: Array<{ id: string; impact: string; help: string; nodes: number; sample: string }> | null;
};

for (const e of ECRANS) {
  test(`sonde: ${e.slug}`, async ({ page }, info) => {
    const proj = info.project.name;
    const s: Sonde = {
      slug: e.slug,
      url: e.url,
      projet: proj,
      navError: null,
      gotoMs: null,
      perf: null,
      overflowPx: 0,
      consoleErrors: [],
      pageErrors: [],
      network: [],
      requestFailed: [],
      a11y: null,
    };

    // Écouteurs attachés AVANT le goto (sinon on rate les erreurs de chargement).
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const loc = msg.location();
      s.consoleErrors.push({
        text: msg.text().slice(0, 500),
        location: loc.url ? `${loc.url}:${loc.lineNumber}` : "",
      });
    });
    page.on("pageerror", (err) => {
      s.pageErrors.push((err.message || String(err)).slice(0, 500));
    });
    page.on("response", (res) => {
      const st = res.status();
      const u = res.url();
      if (st >= 400 && isNotreReseau(u)) {
        s.network.push({ status: st, method: res.request().method(), url: u.slice(0, 300) });
      }
    });
    page.on("requestfailed", (req) => {
      const u = req.url();
      if (!isNotreReseau(u)) return;
      const errText = req.failure()?.errorText || "";
      // net::ERR_ABORTED = annulation client (React Query démonte un composant,
      // la SPA re-render, la navigation coupe une requête en vol). Ce n'est PAS
      // un échec serveur → on l'ignore, sinon la sonde serait rouge chaque jour.
      if (/ERR_ABORTED/.test(errText)) return;
      s.requestFailed.push({ url: u.slice(0, 300), error: errText });
    });

    // Navigation mesurée. Un écran qui casse au chargement = navError (bac dur),
    // mais on écrit quand même le JSON pour ne pas perdre le signal.
    const t0 = Date.now();
    try {
      await page.goto(e.url, { waitUntil: "networkidle", timeout: 45_000 });
      s.gotoMs = Date.now() - t0;
      await page.waitForTimeout(1500); // laisse retomber les chargements async
    } catch (err) {
      s.navError = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }

    // Perf via Navigation Timing (gratuit, déjà mesuré par le navigateur).
    try {
      s.perf = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as
          | PerformanceNavigationTiming
          | undefined;
        if (!nav) return { domContentLoadedMs: null, loadMs: null };
        return {
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadMs: Math.round(nav.loadEventEnd),
        };
      });
    } catch {
      /* page cassée : perf non mesurable */
    }

    // Débordement horizontal (le piège 390px mobile) : scrollWidth > innerWidth.
    try {
      s.overflowPx = await page.evaluate(() => {
        const de = document.documentElement;
        const w = Math.max(de.scrollWidth, document.body?.scrollWidth || 0);
        return Math.max(0, w - window.innerWidth);
      });
    } catch {
      /* ignore */
    }

    // Audit a11y lourd — uniquement en mode heavy. On ne garde que serious/critical
    // pour ne pas noyer (axe remonte des dizaines de findings mineurs).
    if (HEAVY && !s.navError) {
      try {
        const results = await new AxeBuilder({ page })
          .options({ resultTypes: ["violations"] })
          .analyze();
        s.a11y = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => ({
            id: v.id,
            impact: v.impact || "",
            help: v.help,
            nodes: v.nodes.length,
            sample: v.nodes[0]?.target?.join(" ")?.slice(0, 160) || "",
          }));
      } catch (err) {
        s.a11y = [
          { id: "axe-error", impact: "n/a", help: String(err).slice(0, 200), nodes: 0, sample: "" },
        ];
      }
    }

    fs.mkdirSync(SONDE_DIR, { recursive: true });
    fs.writeFileSync(path.join(SONDE_DIR, `${e.slug}-${proj}.json`), JSON.stringify(s, null, 2));
  });
}
