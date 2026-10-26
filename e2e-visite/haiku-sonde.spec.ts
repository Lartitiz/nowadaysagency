/**
 * Sonde du TIER HAIKU (26/10/2026) : zéro crédit, chaque jour.
 *
 * Le tier Haiku (`HAIKU_MODEL`, Claude Haiku 5.5 depuis #1810) sert les sous-appels
 * des générations : plan et passe de correction des carrousels, description des
 * photos, questions d'approfondissement, interprète du Studio… Ces appels sont
 * FONDUS dans la ligne ai_usage du rédacteur et leurs erreurs sont souvent
 * avalées (une passe de correction qui échoue rend le texte tel quel) : un 400
 * de l'API (paramètre refusé après un changement de modèle, secret de retour
 * arrière mal écrit, modèle retiré) resterait invisible pendant des jours.
 * Ici : un appel réel `deepening_questions` (tier « questions » = Haiku, aucun
 * crédit débité, aucune écriture en base) avec le compte test.
 *
 * Rouge : statut ≠ 200, réponse illisible ou 0 question. Ligne 🟡 seulement
 * au-delà de 20 s (normal : 3-6 s).
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLOW_MS = 20_000;

function readEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

test("tier Haiku : questions d'approfondissement répondent (sans crédit)", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (un seul appel par visite)");
  test.setTimeout(120_000);
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
      const res = await fetch(`${url}/functions/v1/carousel-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "deepening_questions", carousel_type: "text", objective: "visibilité", photos: [],
          // Sujet collé à la marque du compte test (savonnière), stable d'un jour à l'autre.
          subject: "Pourquoi mes savons saponifiés à froid conviennent aux peaux sensibles",
        }),
      });
      return { status: res.status, ms: Math.round(performance.now() - t0), text: await res.text() };
    } catch (e) {
      return { status: 0, ms: Math.round(performance.now() - t0), text: String(e) };
    }
  }, { url, key });

  let questions: unknown[] = [];
  try {
    const parsed = JSON.parse(JSON.parse(r.text).content);
    questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  } catch { /* lu plus bas */ }
  console.log(`🧠 tier Haiku (questions d'approfondissement) : HTTP ${r.status} en ${(r.ms / 1000).toFixed(1)} s, ${questions.length} question(s)`);
  if (r.ms > SLOW_MS) console.log(`🟡 tier Haiku lent : ${(r.ms / 1000).toFixed(1)} s (normal 3-6 s)`);

  expect(r.status, `réponse du tier Haiku : ${r.text.slice(0, 300)}`).toBe(200);
  expect(questions.length, `aucune question lisible : ${r.text.slice(0, 300)}`).toBeGreaterThan(0);
});
