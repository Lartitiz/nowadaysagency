/**
 * Section « export PPTX » du bilan du lundi (Brique 3 qualité contenu).
 *
 * Ne génère RIEN : lit l'historique append-only `pptx-history.jsonl` alimenté par
 * les specs de génération à chaque export PPTX validé (1 ligne/export) — carrousel
 * TEXTE (`perf-carousel.spec.ts`), PHOTO (`carousel-photo-live.spec.ts`) et MIXTE
 * (`carousel-mix-live.spec.ts`). Résume les 7 derniers jours GLOBALEMENT puis PAR
 * FORMAT (texte/photo/mixte) : combien d'exports sains, quels défauts vus, plus
 * faible taux d'encre (fond trop vide / white-out), texte éditable. Le détail par
 * format est ce qui remonte les bugs « carré noir » / voile propres à photo/mixte.
 *
 * But : remonter dans le bilan hebdo la qualité du LIVRABLE PowerPoint téléchargeable
 * (demande de Laetitia 13/07) — le reste du contrôle qualité regarde le texte et le
 * rendu, celui-ci regarde le .pptx que la cliente récupère.
 *
 * Ne casse jamais le run (exit 0 partout). Fichier absent = « pas encore d'export
 * cette semaine » (la visite du matin ne l'a pas encore produit sur cette machine).
 */
import fs from "fs";
import os from "os";
import path from "path";

// Dossier STABLE hors worktree (même chemin que l'écriture dans perf-carousel.spec.ts) :
// la visite du matin tourne dans un worktree jetable, l'historique doit survivre.
const HISTORY_DIR = process.env.NOWADAYS_VISITE_DATA || path.join(os.homedir(), ".nowadays-visite");
const histPath = path.join(HISTORY_DIR, "pptx-history.jsonl");

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
  // Le carrousel PHOTO (brut) n'a légitimement AUCUN texte éditable (photos 1:1) :
  // on l'exclut du check « texte éditable », sinon il déclenche un faux ⚠️.
  const textRows = rows.filter((r) => r.format !== "carrousel_photo");
  const textRunsMin = textRows.length
    ? Math.min(...textRows.map((r) => (typeof r.textRuns === "number" ? r.textRuns : 0)))
    : 1;

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

  // ── Détail PAR FORMAT (texte / photo / mixte) : c'est ce qui rend visible une
  // régression export propre à photo/mixte (carré noir, voile) sans la noyer dans
  // le global. Un format ABSENT = sa spec n'a pas tourné cette semaine (heavy/lundi).
  const FORMS = [
    { key: "carrousel_texte_design", label: "texte" },
    { key: "carrousel_photo", label: "photo" },
    { key: "carrousel_mix", label: "mixte" },
  ];
  console.log("   par format (sains / total) :");
  for (const f of FORMS) {
    const fr = rows.filter((r) => r.format === f.key);
    if (!fr.length) { console.log(`      ${f.label.padEnd(6)} : — (aucun export cette semaine)`); continue; }
    const fSains = fr.filter((r) => r.ok).length;
    const fInks = fr.map((r) => r.mediaMinInk).filter((v) => typeof v === "number" && v >= 0);
    const fWorst = fInks.length ? Math.min(...fInks) : null;
    const fFlag = fSains < fr.length ? "  🔴" : "";
    const inkStr = fWorst != null ? `, encre mini ${(fWorst * 100).toFixed(2)} %` : "";
    console.log(`      ${f.label.padEnd(6)} : ${fSains}/${fr.length}${inkStr}${fFlag}`);
  }
  // Tout format présent dans l'historique mais hors de la liste connue (nouveau) :
  const known = new Set(FORMS.map((f) => f.key));
  const others = [...new Set(rows.map((r) => r.format).filter((k) => k && !known.has(k)))];
  for (const k of others) {
    const fr = rows.filter((r) => r.format === k);
    console.log(`      ${String(k).padEnd(6)} : ${fr.filter((r) => r.ok).length}/${fr.length}`);
  }

  // Défauts distincts vus dans la semaine (dédoublonnés), avec leur format.
  const problems = [...new Set(rows.flatMap((r) => (Array.isArray(r.problems) ? r.problems.map((p) => `[${r.format || "?"}] ${p}`) : [])))];
  if (problems.length) {
    console.log("   défauts vus cette semaine :");
    for (const p of problems.slice(0, 10)) console.log(`      🔴 ${p}`);
  }
  console.log("   👀 dernier fond extrait pour le regard : e2e-visite/shots/export-pptx-fond.png (photo : shots/carousel-photo/, mixte : shots/carousel-mix/)");
} catch (e) {
  console.log(`export PPTX : lecture impossible (${String(e.message).slice(0, 90)}) — section sautée.`);
}
