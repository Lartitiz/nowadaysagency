/**
 * Garde « machine » — à lancer AVANT la visite guidée du matin.
 *
 * Pourquoi (11 → 14/10/2026) : trois matins de suite, la visite a tourné sur un Mac
 * sur batterie capot fermé (ou à 7 % de batterie). Le Mac s'endort malgré caffeinate,
 * les specs longues meurent en ERR_NETWORK_* → des dizaines de faux rouges, des
 * générations PAYÉES pour rien, et des données de test laissées en plan (posts
 * « QA drag » du 13/10) qui ont cassé la visite suivante.
 *
 * Lecture : macOS seulement (`pmset`, `ioreg`). Exit 0 toujours — c'est la routine
 * qui lit le VERDICT imprimé :
 *   VERDICT: OK         → visite complète.
 *   VERDICT: SANS_CREDIT → relancer la visite avec VISITE_SANS_CREDIT=1 (les specs
 *                          qui paient une génération sont écartées par
 *                          playwright.visite.config.ts) et le noter EN TÊTE du rapport.
 */
import { execSync } from "child_process";

// Sous ce niveau, sur batterie, un run de 8-15 min risque de finir en veille.
const SEUIL_BATTERIE = 20;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const batt = run("pmset -g batt");
const surBatterie = /Battery Power/.test(batt);
const niveau = Number(batt.match(/(\d+)%/)?.[1] ?? NaN);
const capotFerme = /"AppleClamshellState" = Yes/.test(run("ioreg -r -k AppleClamshellState"));

const raisons = [];
if (surBatterie && capotFerme) raisons.push("capot fermé sur batterie (le Mac s'endort malgré caffeinate)");
if (surBatterie && niveau < SEUIL_BATTERIE) raisons.push(`batterie à ${niveau} % (< ${SEUIL_BATTERIE} %)`);

const etat = batt
  ? `${surBatterie ? "sur batterie" : "sur secteur"}, ${Number.isNaN(niveau) ? "niveau inconnu" : `${niveau} %`}, capot ${capotFerme ? "fermé" : "ouvert"}`
  : "état inconnu (pmset indisponible)";

console.log(`🔋 Machine : ${etat}`);
if (raisons.length) {
  console.log(`VERDICT: SANS_CREDIT — ${raisons.join(" ; ")}`);
  console.log("→ lancer la visite avec VISITE_SANS_CREDIT=1 et le dire en tête du rapport.");
} else {
  console.log("VERDICT: OK");
}
