/**
 * Sonde du PLAN des carrousels photo (12/10/2026) : zéro crédit, chaque jour.
 *
 * Le plan (`carousel-ai` type `structure_proposal`, une lecture des photos par
 * Sonnet) est gratuit et n'écrit rien en base : ses durées ne vivaient que dans
 * les journaux de l'edge, effacés en quelques heures. Le 10/10 un appel a pris
 * 164 s alors que l'écran attendait 150 s (toast « Erreur lors de la proposition
 * de structure » et carrousel sans plan) ; aucune routine ne l'aurait vu.
 * Ici : un appel réel avec le compte test, 3 photos, 10 slides demandées.
 *
 * Rouge : réponse en erreur, plan vide ou longueur ≠ 10. Ligne 🟡 seulement au-delà
 * de 120 s (normal : 50-65 s ; l'écran attend 170 s depuis #1438).
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLOW_MS = 120_000;

function readEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const photo = (file: string, context: string) => ({
  base64: "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, file)).toString("base64"),
  mimeType: "image/jpeg",
  context,
});

test("plan du carrousel photo : réponse, longueur et durée (sans crédit)", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (un seul appel par visite)");
  test.setTimeout(300_000);
  const repoEnv = readEnv(path.join(__dirname, "..", ".env"));
  const url = process.env.VITE_SUPABASE_URL || repoEnv.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || repoEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  test.skip(!url || !key, "VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY introuvables.");

  // Sujet collé à ce que montrent les fixtures (sinon refus photo_mismatch légitime).
  const photos = [
    photo("fixtures-portrait-test.jpg", "moi, portrait de face"),
    photo("fixtures-cover-test.jpg", "visuel d'ambiance de ma marque"),
    photo("fixtures-portrait-test.jpg", "moi encore"),
  ];
  await page.goto("/creer", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async ({ url, key, photos }) => {
    const k = Object.keys(localStorage).find((x) => x.endsWith("-auth-token"));
    if (!k) return { status: 0, ms: 0, text: "pas de session" };
    const token = JSON.parse(localStorage.getItem(k)!).access_token;
    const t0 = performance.now();
    try {
      const res = await fetch(`${url}/functions/v1/carousel-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "structure_proposal", carousel_type: "photo", slide_count: 10,
          subject: "Qui je suis : le visage derrière la marque, mon univers et ce que je veux transmettre",
          photo_description: "Photo 1 : moi, portrait de face. Photo 2 : un visuel d'ambiance de ma marque. Photo 3 : moi encore.",
          photos,
        }),
      });
      return { status: res.status, ms: Math.round(performance.now() - t0), text: await res.text() };
    } catch (e) {
      return { status: 0, ms: Math.round(performance.now() - t0), text: String(e) };
    }
  }, { url, key, photos });

  let data: any = null;
  try { data = JSON.parse(r.text); } catch { /* lu plus bas */ }
  const slides = Array.isArray(data?.result?.slides) ? data.result.slides : [];
  const withPhoto = slides.filter((s: any) => Number.isInteger(s?.photo_index)).length;
  console.log(`🗂️ plan carrousel photo : HTTP ${r.status} en ${(r.ms / 1000).toFixed(1)} s, ${slides.length} slides, ${withPhoto} avec photo${data?.error ? `, erreur ${data.error}` : ""}`);
  if (r.ms > SLOW_MS) console.log(`🟡 plan lent : ${(r.ms / 1000).toFixed(1)} s (normal 50-65 s, écran 170 s)`);

  expect(r.status, `réponse du plan : ${r.text.slice(0, 300)}`).toBe(200);
  expect(data?.error, `plan refusé : ${data?.message || data?.error}`).toBeFalsy();
  expect(slides.length, "le plan n'a pas les 10 slides demandées").toBe(10);
});
