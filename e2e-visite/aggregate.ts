import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SONDE_DIR = path.join(__dirname, "sonde");

// Seuils de tri. Volontairement indulgents : la sonde ne doit remonter que
// des signaux, pas du bruit. Le cron affine avec le registre « déjà connu ».
// On mesure sur gotoMs (temps jusqu'au networkidle = page réellement prête,
// data comprise) et NON sur perf.loadMs (loadEventEnd ~400-680ms ne capte que
// le shell de la SPA — inutile). Plancher absolu + régression vs baseline.
const PERF_GOTO_MS = 8000; // au-delà = 🟡 lenteur (plancher absolu, sans baseline)
const OVERFLOW_TOL = 3; // px de tolérance avant de crier au débordement

// Baseline perf COMMITÉE (perf-baseline.json à côté d'aggregate) : budget load-ms
// par `${slug}-${projet}`. Le cron tourne en worktree frais chaque jour (sonde/
// gitignoré) → seul un fichier commité persiste pour comparer d'un jour à l'autre.
// Regénérer si la perf change légitimement (cf. commentaire du fichier).
const BASELINE_FILE = path.join(__dirname, "perf-baseline.json");
let PERF_BASELINE: Record<string, number> = {};
try {
  PERF_BASELINE = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
} catch {
  /* pas de baseline commitée → pas de détection de régression, juste le plancher absolu */
}

type Sonde = {
  slug: string;
  url: string;
  projet: string;
  navError: string | null;
  gotoMs: number | null;
  perf: { domContentLoadedMs: number | null; loadMs: number | null } | null;
  overflowPx: number;
  consoleErrors: Array<{ text: string; location: string }>;
  pageErrors: string[];
  network: Array<{ status: number; method: string; url: string }>;
  requestFailed: Array<{ url: string; error: string }>;
  brokenImages: string[];
  a11y: Array<{ id: string; impact: string; help: string; nodes: number; sample: string }> | null;
};

type Finding = { bac: "dur" | "observation"; type: string; ecran: string; detail: string };

// globalTeardown : lit tous les JSON de sonde/ et les trie en deux bacs.
// 🔴 dur = casse le vert (JS non catché, 5xx, requête essentielle échouée, page non chargée).
// 🟡 observation = n'invalide PAS le vert (4xx d'API, console.error, débordement, lenteur, a11y).
export default function () {
  if (!fs.existsSync(SONDE_DIR)) return; // aucune sonde lancée (ex : run de specs fonctionnelles seules)

  const files = fs.readdirSync(SONDE_DIR).filter((f) => f.endsWith(".json"));
  if (!files.length) return;

  const dur: Finding[] = [];
  const obs: Finding[] = [];
  let heavy = false;

  for (const f of files) {
    if (f === "_landing.json") continue; // traité à part (forme différente)
    let s: Sonde;
    try {
      s = JSON.parse(fs.readFileSync(path.join(SONDE_DIR, f), "utf8"));
    } catch {
      continue;
    }
    const ecran = `${s.slug} [${s.projet}]`;
    if (s.a11y !== null) heavy = true;

    // --- 🔴 dur ---
    if (s.navError) dur.push({ bac: "dur", type: "page-non-chargée", ecran, detail: s.navError });
    for (const pe of s.pageErrors)
      dur.push({ bac: "dur", type: "erreur-js", ecran, detail: pe });
    for (const n of s.network)
      if (n.status >= 500)
        dur.push({ bac: "dur", type: "réseau-5xx", ecran, detail: `${n.status} ${n.method} ${n.url}` });
    for (const img of s.brokenImages || [])
      dur.push({ bac: "dur", type: "image-cassée", ecran, detail: img });

    // --- 🟡 observation ---
    // Échec réseau (hors annulations, déjà filtrées côté sonde) : souvent une
    // coupure transitoire → observation, le cron re-run avant de conclure.
    for (const rf of s.requestFailed)
      obs.push({ bac: "observation", type: "requête-échouée", ecran, detail: `${rf.error} ${rf.url}` });
    for (const n of s.network)
      if (n.status >= 400 && n.status < 500)
        obs.push({ bac: "observation", type: "réseau-4xx", ecran, detail: `${n.status} ${n.method} ${n.url}` });
    for (const ce of s.consoleErrors)
      obs.push({ bac: "observation", type: "console-error", ecran, detail: `${ce.text} (${ce.location})` });
    if (s.overflowPx > OVERFLOW_TOL)
      obs.push({ bac: "observation", type: "débordement-h", ecran, detail: `${s.overflowPx}px hors viewport` });
    const goto = s.gotoMs ?? null;
    if (goto && goto > PERF_GOTO_MS)
      obs.push({ bac: "observation", type: "lenteur", ecran, detail: `chargement ${goto}ms (> ${PERF_GOTO_MS}ms)` });
    // Régression perf vs baseline commitée (le budget inclut déjà une marge ×1.7).
    const budget = PERF_BASELINE[`${s.slug}-${s.projet}`];
    if (goto && budget && goto > budget)
      obs.push({ bac: "observation", type: "perf-régression", ecran, detail: `chargement ${goto}ms > budget ${budget}ms` });
    for (const a of s.a11y || [])
      obs.push({ bac: "observation", type: `a11y-${a.impact}`, ecran, detail: `${a.id} — ${a.help} (${a.nodes} él., ex: ${a.sample})` });
  }

  // --- Landing publique (meta/SEO) ---
  try {
    const l = JSON.parse(fs.readFileSync(path.join(SONDE_DIR, "_landing.json"), "utf8")) as {
      missing: string[];
      navError: string | null;
    };
    if (l.navError)
      dur.push({ bac: "dur", type: "landing-KO", ecran: "landing /", detail: l.navError });
    for (const m of l.missing || [])
      obs.push({ bac: "observation", type: "landing-seo", ecran: "landing /", detail: m });
  } catch {
    /* pas de sonde landing dans ce run */
  }

  const nEcrans = files.filter((f) => f !== "_landing.json").length;
  const report = {
    mode: heavy ? "heavy" : "light",
    ecransSondes: nEcrans,
    dur,
    observations: obs,
    verdictSonde: dur.length === 0 ? "vert" : "rouge",
  };
  fs.writeFileSync(path.join(__dirname, "sonde-report.json"), JSON.stringify(report, null, 2));

  // Résumé lisible (le cron lit surtout le JSON, mais ceci aide au coup d'œil).
  const lignes: string[] = [];
  lignes.push(`# Sonde — ${report.mode === "heavy" ? "audit lourd (a11y)" : "sonde légère"}`);
  lignes.push(`${nEcrans} écrans sondés · 🔴 ${dur.length} dur · 🟡 ${obs.length} observation\n`);
  if (dur.length) {
    lignes.push("## 🔴 Dur (casse le vert)");
    for (const d of dur) lignes.push(`- **${d.type}** — ${d.ecran} — ${d.detail}`);
    lignes.push("");
  }
  if (obs.length) {
    lignes.push("## 🟡 Observations (n'invalide pas le vert)");
    for (const o of obs) lignes.push(`- **${o.type}** — ${o.ecran} — ${o.detail}`);
  }
  if (!dur.length && !obs.length) lignes.push("✅ Aucun signal — RAS côté sonde.");
  fs.writeFileSync(path.join(__dirname, "sonde-report.md"), lignes.join("\n"));

  // Trace console pour le run interactif.
  console.log(
    `\n[sonde] ${nEcrans} écrans · 🔴 ${dur.length} dur · 🟡 ${obs.length} obs · mode ${report.mode} → e2e-visite/sonde-report.md`,
  );
}
