/**
 * Garde « API Stripe périmée » — scan DÉTERMINISTE des edge functions.
 *
 * Pourquoi cette garde existe (incident 24-31/07/2026) : le webhook Stripe a renvoyé
 * des HTTP 500 en boucle pendant 8 jours, jusqu'à la menace de coupure de l'endpoint
 * par Stripe. Cause : la version d'API **Basil (2025-03-31)** a DÉPLACÉ des champs,
 * et le code lisait toujours les anciens :
 *   1. `subscription.current_period_start/end` → parti sur `subscription.items.data[0]`.
 *      Lu à l'ancien endroit il vaut `undefined` → `new Date(undefined * 1000)` →
 *      `.toISOString()` lève une RangeError → 500 → Stripe rejoue en boucle.
 *   2. `invoice.subscription` → parti sur `invoice.parent.subscription_details.subscription`.
 *      Celui-là ne plante PAS : `subId` vaut `undefined`, le handler `break`, le webhook
 *      répond 200. Bug SILENCIEUX : `studio_months_paid` jamais incrémenté, statut jamais
 *      passé en `past_due`, aucune notif ni e-mail quand une carte est refusée.
 *
 * 🔑 La leçon : un champ qui disparaît d'une API ne se voit ni au type-check (l'objet
 * Stripe est typé `any` au bout de deux `as`), ni à l'exécution (undefined se propage).
 * Seul un scan déterministe du code attrape la classe entière — avant le déploiement.
 *
 * Deux consommateurs, une seule source :
 *   - `src/test/stripe-api-guard.test.ts` (CI BLOQUANTE — empêche la régression d'entrer)
 *   - la visite guidée quotidienne, étape 7ter (`node e2e-visite/stripe-api-guard.mjs`)
 *
 * Zéro faux positif par construction : on ne juge QUE les identifiants prouvés issus de
 * Stripe (affectés depuis `stripe.*`, depuis `event.data.object as Stripe.X`, ou typés
 * `: Stripe.X`) — jamais une ligne de la table `subscriptions`, qui porte les mêmes noms
 * de colonnes (`check-subscription` lit légitimement `sub?.current_period_end` sur une
 * ligne BDD).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Fenêtre de contexte (en caractères, source normalisée sans commentaires) dans laquelle
// on cherche la preuve que la lecture est protégée. Assez large pour couvrir un helper
// de 3 lignes, assez courte pour ne pas absoudre une lecture nue plus loin dans le fichier.
const WINDOW = 160;

const STRIPE_TYPES = "(?:Subscription|Invoice|Checkout\\.Session|Event|Customer|Price|Product)";

/** Retire commentaires (// et  /* *\/) sans casser les chaînes ni les URLs `https://`. */
export function stripComments(src) {
  let out = "";
  let mode = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i++; continue; }
      if (c === "/" && d === "*") { mode = "block"; i++; continue; }
      if (c === "'" || c === '"' || c === "`") mode = c;
      out += c;
      continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += "\n"; } continue; }
    if (mode === "block") { if (c === "*" && d === "/") { mode = "code"; i++; out += " "; } continue; }
    // dans une chaîne : on recopie, en sautant les échappements
    if (c === "\\") { out += c + (d ?? ""); i++; continue; }
    if (c === mode) mode = "code";
    out += c;
  }
  return out;
}

/** Source normalisée : sans commentaires, espaces collapsés (les fenêtres restent lisibles). */
export function normalize(src) {
  return stripComments(src).replace(/\s+/g, " ");
}

function aliasesOf(code, set) {
  // `const s = sub as unknown as AnyRec;` / `const x = invoice;` → x hérite de l'origine.
  for (let pass = 0; pass < 3; pass++) {
    for (const m of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(\w+)(?:\s+as\s+[^;=]+?)?\s*;/g)) {
      if (set.has(m[2])) set.add(m[1]);
    }
  }
  return set;
}

/** Identifiants dont on est SÛR qu'ils portent un objet renvoyé par l'API Stripe. */
export function stripeBoundIdents(code) {
  const set = new Set();
  for (const m of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?stripe\w*\s*\./g)) set.add(m[1]);
  for (const m of code.matchAll(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*event\\.data\\.object\\s+as\\s+Stripe\\.${STRIPE_TYPES}`, "g"))) set.add(m[1]);
  for (const m of code.matchAll(new RegExp(`(\\w+)\\s*:\\s*Stripe\\.${STRIPE_TYPES}`, "g"))) set.add(m[1]);
  return aliasesOf(code, set);
}

/** Sous-ensemble : les objets Invoice (seuls concernés par la disparition de `invoice.subscription`). */
export function invoiceIdents(code, bound) {
  const set = new Set([...bound].filter((id) => /invoice/i.test(id) || id === "inv"));
  for (const m of code.matchAll(/(\w+)\s*:\s*Stripe\.Invoice\b/g)) set.add(m[1]);
  return aliasesOf(code, set);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Scanne UNE source. Renvoie la liste des lectures d'API périmées.
 * @param {string} file  chemin affiché dans le rapport
 * @param {string} src   contenu brut du fichier
 */
export function scanSource(file, src) {
  const code = normalize(src);
  const bound = stripeBoundIdents(code);
  const invoices = invoiceIdents(code, bound);
  const found = [];
  const before = (i) => code.slice(Math.max(0, i - WINDOW), i);
  const extrait = (i) => code.slice(Math.max(0, i - 60), i + 70).trim();

  // R1 — période de facturation lue sur l'objet Subscription (partie sur les items en Basil).
  for (const m of code.matchAll(/(\w+)\s*\??\.\s*(current_period_(?:start|end))\b/g)) {
    const [, obj] = m;
    if (/item/i.test(obj)) continue;            // lecture au BON endroit
    if (!bound.has(obj)) continue;              // ligne BDD, pas un objet Stripe
    const ctx = before(m.index);
    // Repli légitime : `item.current_period_x ?? sub.current_period_x`
    if (/\bitems?\b/.test(ctx) && /current_period_/.test(ctx)) continue;
    found.push({
      file,
      regle: "periode-subscription",
      quoi: `${obj}.${m[2]}`,
      pourquoi: "supprimé de l'objet Subscription en Basil (2025-03-31) → undefined → RangeError → 500 en boucle",
      corriger: "lire `sub.items.data[0].current_period_*` avec repli `?? sub.current_period_*`",
      extrait: extrait(m.index),
    });
  }

  // R2 — `invoice.subscription` (parti sous `invoice.parent.subscription_details`).
  for (const m of code.matchAll(/(\w+)\s*\??\.\s*subscription\b/g)) {
    const [, obj] = m;
    if (!invoices.has(obj)) continue;
    if (/subscription_details/.test(before(m.index))) continue;
    found.push({
      file,
      regle: "invoice-subscription",
      quoi: `${obj}.subscription`,
      pourquoi: "supprimé des objets de facturation en Basil → undefined SANS erreur → handler muet (bug silencieux)",
      corriger: "lire `invoice.parent.subscription_details.subscription` avec repli `?? invoice.subscription`",
      extrait: extrait(m.index),
    });
  }

  // R3 — conversion de timestamp non gardée : le détonateur du 500.
  for (const m of code.matchAll(/new\s+Date\s*\(\s*([A-Za-z_$][\w$?.[\]]*)\s*\*\s*1000\s*\)/g)) {
    const expr = m[1];
    const ctx = before(m.index);
    const racine = escapeRe(expr.replace(/\?/g, ""));
    if (new RegExp(`${racine}\\s*\\??\\.?\\s*(\\?|&&)`).test(ctx)) continue;      // ternaire / court-circuit
    if (/typeof\s+\w+\s*[!=]==?\s*"number"/.test(ctx)) continue;                   // helper typé (toIso)
    if (/Number\.isFinite|isNaN\s*\(/.test(ctx)) continue;
    found.push({
      file,
      regle: "date-non-gardee",
      quoi: `new Date(${expr} * 1000)`,
      pourquoi: "si le champ Stripe a disparu, `undefined * 1000` = NaN → .toISOString() lève une RangeError → 500",
      corriger: "passer par un helper qui renvoie null quand la valeur n'est pas un nombre fini",
      extrait: extrait(m.index),
    });
  }

  return found;
}

/** Fichiers d'edge functions qui touchent à Stripe (les seuls concernés). */
export function stripeSourceFiles(root) {
  const dir = path.join(root, "supabase", "functions");
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith("_test.ts")) {
        const src = fs.readFileSync(p, "utf8");
        if (/stripe/i.test(src)) out.push({ file: path.relative(root, p), src });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Scan complet du dépôt. */
export function scanRepo(root) {
  return stripeSourceFiles(root).flatMap(({ file, src }) => scanSource(file, src));
}

// ── CLI (étape de la visite guidée) ───────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const fichiers = stripeSourceFiles(root);
  const findings = fichiers.flatMap(({ file, src }) => scanSource(file, src));

  if (findings.length === 0) {
    console.log("VERDICT: OK");
    console.log(`💳 API Stripe : ${fichiers.length} fichier(s) scanné(s), aucune lecture de champ supprimé ✅`);
  } else {
    console.log("VERDICT: PANNE");
    console.log(`🔴 API STRIPE PÉRIMÉE : ${findings.length} lecture(s) de champ supprimé par Stripe Basil.`);
    for (const f of findings) {
      console.log(`   🔴 ${f.file} — ${f.quoi}  [${f.regle}]`);
      console.log(`      pourquoi : ${f.pourquoi}`);
      console.log(`      corriger : ${f.corriger}`);
      console.log(`      extrait  : …${f.extrait}…`);
    }
    console.log("   ⇒ ACTION : corriger le code (PR), puis redéployer l'edge via Lovable.");
    console.log("   (rappel incident 24/07 : Stripe désactive un endpoint qui renvoie 500 pendant ~9 jours)");
  }
  process.exit(0); // c'est la routine qui juge le VERDICT imprimé
}
