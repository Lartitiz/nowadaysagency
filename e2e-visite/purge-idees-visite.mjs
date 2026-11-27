/**
 * PURGE MANUELLE des brouillons d'idées laissés par la visite sur le compte de
 * référence (« Camille ») AVANT que les specs sachent ranger derrière elles
 * (test-propre.ts, 27/11/2026).
 *
 * Pourquoi elle existe : dès qu'un parcours passe par /creer, l'app range un
 * brouillon dans « Mes idées ». Pendant des mois la visite en a laissé à chaque
 * passage : plus de 1000 fiches le 27/11/2026, la lecture des idées coupée par
 * la base sur téléphone (500, code 57014) et la même fiche de test trois fois
 * dans le panneau du calendrier. Les specs nettoient maintenant leurs lignes ;
 * ce script sert UNIQUEMENT à solder l'arriéré.
 *
 * ⚠️ À LANCER À LA MAIN, JAMAIS depuis la routine, et `--apply` seulement avec
 * l'accord de Laetitia. Contrairement au ménage des specs (ids tracés pendant
 * le run), ce script filtre par TITRE. Pour ne rien emporter de vrai, il ne
 * retient qu'une fiche qui coche TOUT :
 *   - titre exactement égal à un sujet écrit en dur dans une spec de la visite ;
 *   - statut « to_explore » (jamais travaillée) ;
 *   - aucun contenu de calendrier rattaché (calendar_post_id vide) ;
 *   - brouillon rangé tout seul par l'écran de création (type draft, source creer).
 *
 * Usage :
 *   node e2e-visite/purge-idees-visite.mjs            → liste (aucune écriture)
 *   node e2e-visite/purge-idees-visite.mjs --apply    → supprime la liste affichée
 *
 * Identifiants : .env.visite.local (VISITE_EMAIL/VISITE_PASSWORD) + .env du
 * repo (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");

// Les sujets écrits en dur dans les specs de la visite (entre parenthèses : la
// spec). L'app coupe le titre d'un brouillon à 120 caractères : on fait pareil.
const SUJETS = [
  "Qui je suis : le visage derrière la marque, mon univers et ce que je veux transmettre", // contenus-figes-formats, carousel-photo-live, carousel-photo-fond-live
  "5 rituels slow pour ta com' : ma routine douce pour communiquer sans m'épuiser", // contenus-figes-formats, carousel-mix-live
  "Les coulisses de la fabrication de mon prochain savon", // contenus-figes-formats, stories-visuelles
  "Pourquoi je refuse de brader mes savons alors qu'on me le demande tout le temps", // contenus-figes-formats, reel-angles-live
  "Pourquoi je prends le temps de répondre à chaque message de cliente", // contenus-figes-formats
  "Pourquoi poster moins mais mieux change tout pour les solopreneurs", // contenus-figes, perf-carousel
  "3 idées reçues sur le savon artisanal (et pourquoi elles sont fausses)", // publish-gate-live, pinterest-visual-feedback
  "Pourquoi je montre les coulisses de mon atelier", // erreurs-credits-sonde, creer-429
  "3 erreurs que je vois souvent quand on parle de son activité", // format-defilement-sonde
  "Mes 5 slides déjà écrites sur la savonnerie", // mes-slides
  "Les coulisses de mon atelier : comment je prépare une nouvelle collection", // mes-photos-carrousel-sonde
  "Pourquoi je ne réponds plus aux DM le dimanche", // quota-etape4
  "Trois gestes simples pour faire durer un savon artisanal", // photos-fond-recharge-sonde
  "Pourquoi je fabrique mes savons à froid : ce que ça change pour la peau, le temps que ça demande et ce que j'ai dû apprendre", // carousel-images-proposees-live
  "Les 3 erreurs qui font que les solopreneurs vendent mal leurs offres", // fonctionnel-t1
];
const TITRES = [...new Set(SUJETS.map((s) => s.trim().slice(0, 120)))];

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
const EMAIL = process.env.VISITE_EMAIL || env.VISITE_EMAIL || "laetitiatest@nowadaysagency.com";
const PWD = process.env.VISITE_PASSWORD || env.VISITE_PASSWORD;

if (!URL_SB || !ANON || !PWD) {
  console.error("Config manquante : .env (VITE_SUPABASE_*) et .env.visite.local (VISITE_PASSWORD).");
  process.exit(1);
}

const tokRes = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PWD }),
});
if (!tokRes.ok) {
  console.error(`Login KO (HTTP ${tokRes.status}).`);
  process.exit(1);
}
const session = await tokRes.json();
const USER_ID = session.user.id;
const H = { apikey: ANON, Authorization: `Bearer ${session.access_token}`, "content-type": "application/json" };

// Colonnes légères seulement (jamais content_data : c'est lui qui fait couper
// la lecture par la base), une requête par titre, par pages de 500.
const CRITERES =
  `user_id=eq.${USER_ID}&status=eq.to_explore&calendar_post_id=is.null&type=eq.draft&source_module=eq.creer`;
async function lis(titre) {
  const lignes = [];
  for (let debut = 0; ; debut += 500) {
    const res = await fetch(
      `${URL_SB}/rest/v1/saved_ideas?select=id,created_at,format&${CRITERES}&titre=eq.${encodeURIComponent(titre)}&order=created_at.asc&offset=${debut}&limit=500`,
      { headers: H },
    );
    if (!res.ok) {
      console.error(`Lecture KO (HTTP ${res.status}) : ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const page = await res.json();
    lignes.push(...page);
    if (page.length < 500) return lignes;
  }
}

const aSupprimer = [];
const parJour = new Map();
console.log("Brouillons d'idées laissés par la visite sur le compte Camille\n");
console.log("  nombre  du → au                   titre");
for (const titre of TITRES) {
  const lignes = await lis(titre);
  if (!lignes.length) continue;
  aSupprimer.push(...lignes.map((l) => l.id));
  for (const l of lignes) {
    const jour = l.created_at.slice(0, 10);
    parJour.set(jour, (parJour.get(jour) || 0) + 1);
  }
  const formats = [...new Set(lignes.map((l) => l.format || "?"))].join(", ");
  console.log(
    `  ${String(lignes.length).padStart(6)}  ${lignes[0].created_at.slice(0, 10)} → ${lignes.at(-1).created_at.slice(0, 10)}   ${titre.slice(0, 80)} [${formats}]`,
  );
}

if (aSupprimer.length === 0) {
  console.log("\nRien à purger.");
  process.exit(0);
}

const jours = [...parJour].sort((a, b) => b[1] - a[1]);
console.log(`\nTotal : ${aSupprimer.length} fiche(s), créées sur ${jours.length} jour(s).`);
console.log(`Jours les plus chargés : ${jours.slice(0, 6).map(([j, n]) => `${j} (${n})`).join(" · ")}`);

// Pour situer : combien de fiches de Camille ne sont PAS concernées (elles restent).
// Compté page par page sur la seule colonne id : un comptage direct est coupé par la base.
let total = 0;
for (let debut = 0; ; debut += 1000) {
  const res = await fetch(`${URL_SB}/rest/v1/saved_ideas?select=id&user_id=eq.${USER_ID}&order=id.asc&offset=${debut}&limit=1000`, { headers: H });
  if (!res.ok) { total = NaN; break; }
  const n = (await res.json()).length;
  total += n;
  if (n < 1000) break;
}
if (Number.isFinite(total)) console.log(`Fiches de Camille au total : ${total} → il en resterait ${total - aSupprimer.length}.`);

if (!APPLY) {
  console.log(`\nAucune écriture. Après accord de Laetitia :`);
  console.log(`  node e2e-visite/purge-idees-visite.mjs --apply`);
  process.exit(0);
}

let ok = 0;
const echecs = [];
for (let i = 0; i < aSupprimer.length; i += 40) {
  const lot = aSupprimer.slice(i, i + 40);
  // Les critères sont répétés à la suppression : une fiche travaillée ou posée
  // au calendrier entre la liste et la suppression n'est pas emportée.
  const res = await fetch(`${URL_SB}/rest/v1/saved_ideas?id=in.(${lot.join(",")})&${CRITERES}`, {
    method: "DELETE",
    headers: { ...H, Prefer: "return=representation" },
  });
  if (res.ok) ok += (await res.json()).length;
  else echecs.push(`lot ${i / 40 + 1} → HTTP ${res.status}`);
}
console.log(`\n🧹 purge : ${ok}/${aSupprimer.length} supprimée(s)${echecs.length ? ` — échecs : ${echecs.join(", ")}` : ""}`);
