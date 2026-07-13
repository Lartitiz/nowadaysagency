/**
 * Section « export PPTX » du bilan du lundi (Brique 3 qualité contenu).
 *
 * Ne génère RIEN : lit l'historique append-only `results/pptx-history.jsonl` que
 * `perf-carousel.spec.ts` écrit à chaque export PPTX validé (1 ligne/jour, run de
 * la visite du matin). Résume les 7 derniers jours : combien d'exports sains, quels
 * défauts vus, plus faible taux d'encre (fond trop vide / white-out), texte éditable.
 *
 * But : remonter dans le bilan hebdo la qualité du LIVRABLE PowerPoint téléchargeable
 * (demande de Laetitia 13/07) — le reste du contrôle qualité regarde le texte et le
 * rendu, celui-ci regarde le .pptx que la cliente récupère.
 *
 * Ne casse jamais le run (exit 0 partout). Fichier absent = « pas encore d'export
 * cette semaine » (la visite du matin ne l'a pas encore produit sur cette machine).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const histPath = path.join(__dirname, "results", "pptx-history.jsonl");

function readHistory() {
  if (!fs.existsSync(histPath)) return [];
  const out = [];
  for (const line of fs.readFileSync(histPath, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* ligne corrompue ignorée */ }
  }
  return out;
}

try {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;
  const rows = readHistory().filter((r) => {
    const t = Date.parse(r?.date || "");
    return Number.isFinite(t) && t >= weekAgo;
  });

  console.log("   ── export PPTX (PowerPoint téléchargeable) — 7 derniers jours ──");
  if (!rows.length) {
    console.log("   aucun export PPTX enregistré cette semaine (visite du matin pas encore passée sur cette machine, ou perf-carousel non exécuté).");
    process.exit(0);
  }

  const sains = rows.filter((r) => r.ok).length;
  const inks = rows.map((r) => r.mediaMinInk).filter((v) => typeof v === "number" && v >= 0);
  const worstInk = inks.length ? Math.min(...inks) : null;
  const slideCounts = rows.map((r) => r.slideCount).filter((v) => typeof v === "number");
  const textRunsMin = Math.min(...rows.map((r) => (typeof r.textRuns === "number" ? r.textRuns : 0)));

  const alerte = sains < rows.length ? "  🔴 des exports défaillants cette semaine" : "";
  console.log(`   exports validés sains : ${sains}/${rows.length}${alerte}`);
  if (slideCounts.length) {
    const uniq = [...new Set(slideCounts)].sort((a, b) => a - b).join(", ");
    console.log(`   slides par export : ${uniq}`);
  }
  console.log(`   texte éditable : ${textRunsMin > 0 ? "oui sur tous les exports" : "⚠️ un export sans texte éditable (rendu image ?)"}`);
  if (worstInk != null) {
    const flag = worstInk < 0.02 ? "  🔴 fond quasi vide / white-out possible" : "";
    console.log(`   taux d'encre le plus faible : ${(worstInk * 100).toFixed(2)} %${flag}`);
  }

  // Défauts distincts vus dans la semaine (dédoublonnés).
  const problems = [...new Set(rows.flatMap((r) => (Array.isArray(r.problems) ? r.problems : [])))];
  if (problems.length) {
    console.log("   défauts vus cette semaine :");
    for (const p of problems.slice(0, 8)) console.log(`      🔴 ${p}`);
  }
  console.log("   👀 dernier fond extrait pour le regard : e2e-visite/shots/export-pptx-fond.png");
} catch (e) {
  console.log(`export PPTX : lecture impossible (${String(e.message).slice(0, 90)}) — section sautée.`);
}
