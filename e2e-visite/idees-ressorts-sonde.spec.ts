/**
 * Sonde 💡 « Trouver une idée » (ajoutée le 14/11/2026, accord de Laetitia, après #1984) :
 * 1 crédit du compte test Camille, LUNDI seulement (liste SPECS_PAYANTES).
 *
 * Les 4 idées doivent venir de 4 ressorts différents (geste, clin d'œil, position…)
 * et porter chacune « Pourquoi on l'enverra ». Si le pipeline des idées perd les
 * ressorts (consigne réécrite, contrat changé, fonction redéployée d'une vieille
 * version), l'écran retombe sans bruit sur 4 « éclairages » : rien d'autre ne le voit.
 *
 * 🔴 = réponse en erreur ou pas 4 idées (test rouge) ; 🟠 = moins de 4 ressorts
 * différents ou une raison de partage manquante (ligne 🟠, test vert) ; ✅ sinon.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { verdictIdees } from "./idees-ressorts-verdict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function readEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

test("Trouver une idée : 4 ressorts différents et « Pourquoi on l'enverra » (1 crédit)", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (un seul appel par visite)");
  test.setTimeout(240_000);
  const repoEnv = readEnv(path.join(__dirname, "..", ".env"));
  const url = process.env.VITE_SUPABASE_URL || repoEnv.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || repoEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !key, "VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY introuvables.");

  await page.goto("/creer", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async ({ url, key }) => {
    const k = Object.keys(localStorage).find((x) => x.endsWith("-auth-token"));
    if (!k) return { status: 0, ms: 0, text: "pas de session" };
    const token = JSON.parse(localStorage.getItem(k)!).access_token;
    const t0 = performance.now();
    try {
      const res = await fetch(`${url}/functions/v1/content-coaching`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: { objectif: "auto", sujet: "", canal: "auto", format: "auto", activity: "", ton_envie: "auto", content_type: "auto" }, upcoming_marronniers: [], previous_ideas: [] }),
      });
      return { status: res.status, ms: Math.round(performance.now() - t0), text: await res.text() };
    } catch (e) {
      return { status: 0, ms: Math.round(performance.now() - t0), text: String(e) };
    }
  }, { url, key });

  let data: any = null;
  try { data = JSON.parse(r.text); } catch { /* lu plus bas */ }
  const v = verdictIdees(data?.ideas);
  console.log(`💡 Trouver une idée : ${v.niveau} HTTP ${r.status} en ${(r.ms / 1000).toFixed(0)} s · ressorts ${v.ressorts.join(", ") || "aucun"} · « Pourquoi on l'enverra » ${v.avecRaison}/4 · ${v.motif}`);
  expect(r.status, `réponse : ${r.text.slice(0, 300)}`).toBe(200);
  expect(v.niveau, v.motif).not.toBe("🔴");
});
