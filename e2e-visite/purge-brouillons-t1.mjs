/**
 * PURGE MANUELLE des brouillons laissés par la visite T1 sur le compte de
 * référence (« Camille ») AVANT que fonctionnel-t1.spec.ts sache nettoyer
 * derrière lui.
 *
 * Pourquoi elle existe : jusqu'au 22/08/2026, T1a posait chaque jour un post
 * calendrier au titre et à la date écrits en dur dans le spec, et personne ne
 * les enlevait. Le dashboard de Camille affichait « 25 contenus prêts, jamais
 * publiés », dont 5 lignes strictement identiques — l'alerte était devenue du
 * bruit. Le spec nettoie maintenant ses propres lignes ; ce script sert
 * UNIQUEMENT à solder l'arriéré.
 *
 * ⚠️ À LANCER À LA MAIN, JAMAIS depuis la routine. Contrairement au teardown du
 * spec (qui ne supprime que des ids tracés pendant le run), ce script filtre
 * par TITRE : il ne peut pas distinguer un vrai contenu de Laetitia qui
 * porterait exactement le même nom. D'où le fonctionnement en deux temps —
 * il LISTE d'abord, il ne supprime que sur `--apply`, après relecture humaine.
 *
 * Usage :
 *   node e2e-visite/purge-brouillons-t1.mjs            → liste (aucune écriture)
 *   node e2e-visite/purge-brouillons-t1.mjs --apply    → supprime la liste affichée
 *
 * Identifiants : .env.visite.local (VISITE_EMAIL/VISITE_PASSWORD) + .env du
 * repo (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");

// Le titre écrit en dur dans fonctionnel-t1.spec.ts (const IDEA). Si le spec
// change d'idée, mettre les DEUX titres ici le temps de solder l'arriéré.
const TITRES = ["Les 3 erreurs qui font que les solopreneurs vendent mal leurs offres"];

const APPLY = process.argv.includes("--apply");

function readEnvFile(file) {
  const vars = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...readEnvFile(path.join(REPO, ".env")), ...readEnvFile(path.join(REPO, ".env.visite.local")) };
const URL_SB = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.VISITE_EMAIL || env.VISITE_EMAIL;
const PWD = process.env.VISITE_PASSWORD || env.VISITE_PASSWORD;

if (!URL_SB || !ANON || !EMAIL || !PWD) {
  console.error("Config manquante : .env (VITE_SUPABASE_*) et .env.visite.local (VISITE_EMAIL/PASSWORD).");
  process.exit(1);
}

const tokRes = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PWD }),
});
if (!tokRes.ok) {
  console.error(`Login KO (HTTP ${tokRes.status}) pour ${EMAIL}.`);
  process.exit(1);
}
const TOKEN = (await tokRes.json()).access_token;
const H = { apikey: ANON, Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

// `in.("titre")` : PostgREST veut les valeurs entre guillemets doubles échappés.
const filtre = `theme=in.(${TITRES.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")})`;
const listRes = await fetch(
  `${URL_SB}/rest/v1/calendar_posts?select=id,date,canal,theme,status,created_at&${filtre}&order=created_at.asc`,
  { headers: H },
);
if (!listRes.ok) {
  console.error(`Lecture KO (HTTP ${listRes.status}) : ${(await listRes.text()).slice(0, 200)}`);
  process.exit(1);
}
const posts = await listRes.json();

if (posts.length === 0) {
  console.log("Rien à purger : aucun post calendrier ne porte le titre de la visite T1.");
  process.exit(0);
}

console.log(`${posts.length} post(s) calendrier au titre de la visite T1 :\n`);
for (const p of posts) {
  console.log(`  ${p.created_at?.slice(0, 16).replace("T", " ")}  date=${p.date}  ${p.canal || "?"}/${p.status || "?"}  ${p.id}`);
}

if (!APPLY) {
  console.log(`\nRelis la liste. Si tout vient bien de la routine :`);
  console.log(`  node e2e-visite/purge-brouillons-t1.mjs --apply`);
  process.exit(0);
}

let ok = 0;
const echecs = [];
for (const p of posts) {
  const res = await fetch(`${URL_SB}/rest/v1/calendar_posts?id=eq.${p.id}`, { method: "DELETE", headers: H });
  if (res.ok) ok++;
  else echecs.push(`${p.id} → HTTP ${res.status}`);
}
console.log(`\n🧹 purge : ${ok}/${posts.length} supprimé(s)${echecs.length ? ` — échecs : ${echecs.join(", ")}` : ""}`);
