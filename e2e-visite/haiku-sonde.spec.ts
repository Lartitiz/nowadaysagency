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
 *
 * Ligne ❓ (15/11/2026, #1980/#1985/#1990) : qualité des questions du carrousel ET
 * d'un post (creative-flow step « questions », gratuit). 🟠 si une question
 * dépasse 32 mots ou se répond par oui/non (« Tu as… ? », « Y a-t-il… ? »).
 * 25/11/2026 : 🟠 aussi si une phrase finie par « ? » n'interroge pas, ou si une
 * question vouvoie (lectures de questions-qualite.ts).
 * Jamais rouge : c'est une lecture, pas une panne.
 */
import { test, expect } from "./test-propre";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { lireQualite } from "./questions-qualite";

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

  // ❓ Qualité : carrousel (déjà appelé) + questions d'un post (creative-flow, gratuit).
  const post = await page.evaluate(async ({ url, key }) => {
    const k = Object.keys(localStorage).find((x) => x.endsWith("-auth-token"));
    if (!k) return { status: 0, text: "pas de session" };
    const token = JSON.parse(localStorage.getItem(k)!).access_token;
    try {
      const res = await fetch(`${url}/functions/v1/creative-flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "questions", contentType: "post", context: "Pourquoi je refuse de mettre du parfum de synthèse dans mes savons" }),
      });
      return { status: res.status, text: await res.text() };
    } catch (e) {
      return { status: 0, text: String(e) };
    }
  }, { url, key });
  let questionsPost: unknown[] = [];
  try {
    const p = JSON.parse(post.text);
    questionsPost = Array.isArray(p?.questions) ? p.questions : [];
  } catch { /* signalé ci-dessous */ }
  const qc = lireQualite(questions);
  const qp = lireQualite(questionsPost);
  const orange = qc.orange || qp.orange || questions.length === 0 || questionsPost.length === 0;
  console.log(
    `${orange ? "🟠" : "✅"} ❓ qualité des questions : carrousel ${qc.n} (max ${qc.maxMots} mots, ${qc.fermees.length} oui/non)` +
    ` · post ${post.status === 200 ? `${qp.n} (max ${qp.maxMots} mots, ${qp.fermees.length} oui/non)` : `HTTP ${post.status}`}` +
    ` · ${qc.sansQuestion.length + qp.sansQuestion.length} qui n'interroge pas, ${qc.vouvoient.length + qp.vouvoient.length} qui vouvoie` +
    ` — seuils : > 32 mots, ≥ 1 oui/non, ≥ 1 « ? » sans question ou ≥ 1 « vous »`,
  );
  for (const f of [...qc.fermees, ...qp.fermees]) console.log(`   oui/non : « ${f} »`);
  for (const f of [...qc.sansQuestion, ...qp.sansQuestion]) console.log(`   n'interroge pas : « ${f} »`);
  for (const f of [...qc.vouvoient, ...qp.vouvoient]) console.log(`   vouvoie : « ${f} »`);
  for (const q of [qc, qp]) if (q.maxMots > 32) console.log(`   trop longue (${q.maxMots} mots) : « ${q.plusLongue} »`);

  expect(r.status, `réponse du tier Haiku : ${r.text.slice(0, 300)}`).toBe(200);
  expect(questions.length, `aucune question lisible : ${r.text.slice(0, 300)}`).toBeGreaterThan(0);
});
