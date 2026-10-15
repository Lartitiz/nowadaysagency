/**
 * SMOKE À FROID — le filet « inconnu·e du jour du lancement ».
 *
 * La visite tourne sur Camille (compte MÛR). Le lancement amène des INCONNU·ES
 * à FROID : inscription → dashboard nouveau·lle → entrée dans le diagnostic.
 * C'est LA PORTE D'ENTRÉE, que Camille n'exerce jamais, et où se cachent les
 * régressions qui tuent l'activation (~51 % ne génèrent jamais) — notamment la
 * classe « écran blanc d'onboarding » déjà survenue (#261/#267).
 *
 * Périmètre VOLONTAIREMENT resserré pour tourner chaque jour sans flaky :
 *   1. inscription d'un compte JETABLE daté sur la landing (auto-confirm ON →
 *      session directe, aucun e-mail de confirmation) ;
 *   2. atterrissage sur un dashboard « nouveau·lle » sain : prénom + guidage
 *      (diagnostic à reprendre / premier contenu / premiers pas) — CAPTURE ;
 *   3. entrée dans le diagnostic : la landing d'onboarding se charge puis avance
 *      de 2-3 écrans SANS écran blanc / crash — CAPTURES ;
 *   4. NETTOIE le compte jetable (edge delete-account) en afterAll, même en
 *      cas d'échec → zéro accumulation.
 *
 * Hors périmètre EXPRÈS (car soit fragile en quotidien, soit déjà couvert) :
 *   - dérouler les 12 étapes du diagnostic + IA + 1re génération branding :
 *     reste au harnais qa-neuf périodique (forcé 11-12/07) ;
 *   - /creer est GATÉ pour un compte à froid (redirige vers le diagnostic tant
 *     qu'il n'est pas fini) — le pipeline de génération est déjà testé chaque
 *     jour par fonctionnel-t1 sur Camille.
 */
import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/cold");
fs.mkdirSync(SHOTS, { recursive: true });

// Compte jetable unique par run. `+cs` = identifiable, exclu des stats (#332),
// purgeable en masse si un nettoyage rate.
const STAMP = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const EMAIL = `laetitia+cs${STAMP}@nowadaysagency.com`;
const PWD = `ColdSmoke!${STAMP}`;
const PRENOM = "Coldy";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

// Signaux (comme la sonde) : console.error + 4xx/5xx edges/rest, hors bénins connus.
const KNOWN_BENIGN = /ERR_ABORTED|instagram\/bio|\/parametres/i;

function attachSignals(page: Page, sink: string[]) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!KNOWN_BENIGN.test(t)) sink.push(`console.error: ${t.slice(0, 140)}`);
    }
  });
  page.on("response", (r) => {
    const s = r.status();
    const u = r.url();
    if (s >= 400 && /\/functions\/v1\/|\/rest\/v1\//.test(u) && !KNOWN_BENIGN.test(u)) {
      sink.push(`${s} ${r.request().method()} ${u.slice(0, 80)}`);
    }
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
}

/**
 * Attend la fin des fondus (framer-motion part d'opacity 0) : l'opacité EFFECTIVE
 * de l'élément = produit des opacités de ses ancêtres. Sans ça, la capture tombe
 * au milieu du fondu et un écran à moitié transparent ressemble à un écran blanc.
 * Best-effort : ne fait pas échouer le smoke (la visibilité est déjà prouvée).
 */
async function waitFullyOpaque(loc: ReturnType<Page["locator"]>) {
  await expect
    .poll(
      () =>
        loc
          .evaluate((el) => {
            let o = 1;
            for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
            return o;
          })
          .catch(() => 0),
      { timeout: 5000 },
    )
    .toBeGreaterThan(0.99)
    .catch(() => console.log("ℹ️  fondu pas terminé à la capture (best-effort)"));
}

/** Nettoyage indépendant du navigateur : login API → token → edge delete-account. */
async function deleteThrowawayAccount(): Promise<string> {
  if (!SUPABASE_URL || !ANON) return "skip (config Supabase absente)";
  try {
    const tokRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    if (!tokRes.ok) return `login KO (${tokRes.status}) — compte peut-être jamais créé`;
    const token = (await tokRes.json())?.access_token;
    if (!token) return "pas de token";
    const del = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await del.json().catch(() => ({}));
    return del.ok && body?.success ? `OK (${body.tables_cleaned} tables)` : `KO ${del.status} ${JSON.stringify(body).slice(0, 80)}`;
  } catch (e: any) {
    return `exception: ${String(e?.message || e).slice(0, 80)}`;
  }
}

test.afterAll(async () => {
  const res = await deleteThrowawayAccount();
  console.log(`🧹 nettoyage compte jetable (${EMAIL}) : ${res}`);
});

test("Smoke à froid — inscription → dashboard nouveau·lle → entrée diagnostic", async ({ page }) => {
  const signals: string[] = [];
  attachSignals(page, signals);
  console.log(`compte jetable : ${EMAIL}`);

  // 1) INSCRIPTION sur la landing (auto-confirm ON → session directe).
  // domcontentloaded (pas networkidle) : la SPA/landing sonde en continu →
  // networkidle n'arrive jamais et mange tout le budget. On attend les éléments.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Cibler le formulaire d'inscription par son nom : depuis la nouvelle page
  // d'accueil (#1163), un mini-formulaire Instagram le précède dans la page.
  const form = page.getByRole("form", { name: "Formulaire d'inscription" });
  await form.getByPlaceholder("Ton prénom").fill(PRENOM);
  await form.getByPlaceholder("Ton email").fill(EMAIL);
  await form.getByPlaceholder(/photographe, coach/i).fill("savonnière artisanale");
  await form.getByPlaceholder(/Mot de passe/i).fill(PWD);
  await form.locator('input[type="checkbox"]').first().check();
  await form.getByRole("button", { name: /Commencer gratuitement/i }).click();

  // 2) ATTERRISSAGE nouveau·lle — sain et GUIDÉ. Depuis la refonte activation,
  //    l'inscription route DIRECTEMENT vers le diagnostic (/onboarding) au lieu
  //    de passer par le dashboard ; on accepte les deux. L'essentiel du smoke =
  //    la porte d'entrée n'est PAS un écran blanc (classe #261/#267).
  await page.waitForURL((u) => u.pathname === "/onboarding" || u.pathname === "/dashboard", {
    timeout: 30000,
  });
  // 🔑 12/10 — l'ancienne vérif `getByText(/Bienvenue|…/).isVisible({timeout})`
  // passait sur un écran VIDE : (1) le toast sonner « Compte créé ! 🎉 /
  // Bienvenue ! On prépare ton espace… » satisfaisait la regex ; (2) isVisible()
  // n'attend pas (son timeout est ignoré). On attend donc un VRAI élément de
  // la page — jamais un texte libre que le toast pourrait fournir — puis la
  // fin du fondu framer-motion avant la capture.
  // Bouton de l'accueil du diagnostic OU titre dans <main> du dashboard (le
  // Toaster sonner est monté hors de <main> ; le squelette de chargement n'a
  // aucun titre). `.or()` plutôt qu'un test d'URL : une redirection tardive
  // /dashboard → /onboarding ne fausse pas le choix.
  const landing = page
    .getByRole("button", { name: /C'est parti/i })
    .or(page.locator("main").getByRole("heading"))
    .first();
  await expect(landing, "Atterrissage nouveau·lle SANS guidage ni contenu (écran blanc ?)").toBeVisible({ timeout: 15000 });
  await waitFullyOpaque(landing);
  await shot(page, "01-dashboard-nouveau");

  // 3) ENTRÉE dans le diagnostic — se charge et avance de quelques écrans SANS
  //    écran blanc (classe de bug historique #261/#267). On ne déroule PAS les
  //    12 étapes (fragile en quotidien → qa-neuf périodique).
  // 🔑 12/10 — PAS de rechargement quand on y est déjà : le SIGNED_IN route vers
  // /onboarding AVANT la fin de l'insert `profiles` de SignupForm (et du
  // chargement des espaces). Un `page.goto` à ce moment ANNULE ces requêtes
  // (net::ERR_ABORTED) → faux signaux « Signup profile insert failed / Failed
  // to load workspaces: Failed to fetch ». Prouvé par `requestfailed` : ni base
  // froide ni bug de l'app (ligne profiles + espace bien créés côté serveur).
  if (new URL(page.url()).pathname !== "/onboarding") {
    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  }
  // Écran d'accueil du diagnostic : « Hey 👋 Bienvenue » + « C'est parti ».
  const welcomeCta = page.getByRole("button", { name: /C'est parti|Commencer/i }).first();
  await expect(welcomeCta, "L'accueil du diagnostic ne se charge pas (écran blanc ?)").toBeVisible({ timeout: 15000 });
  await waitFullyOpaque(welcomeCta);
  await shot(page, "02-diagnostic-accueil");
  await welcomeCta.click();

  // Étape 1 « Dis-moi qui tu es » (prénom + activité sur un écran, pré-remplis à l'inscription)
  // — preuve que l'onboarding démarre sans crasher après l'accueil.
  const etape1 = page.getByText(/Dis-moi qui tu es/i).first();
  await expect(etape1, "Le diagnostic ne démarre pas après « C'est parti » (écran blanc ?)").toBeVisible({ timeout: 12000 });
  await shot(page, "03-diagnostic-etape1");

  // Un pas de plus — BEST-EFFORT (informationnel, ne fait PAS échouer le smoke) :
  // Suivant → écran « Tu proposes plutôt quoi ? ». On capture ce qui s'affiche
  // pour le regard du cron ; l'assertion dure est déjà passée à l'étape 1 (pas
  // d'écran blanc). Dérouler tout le diagnostic reste au harnais qa-neuf.
  // 🔑 15/10 — prénom et « tu fais quoi, en deux mots ? » sont désormais sur
  // le MÊME écran (chantier A, démarrage raccourci) : le pas suivant est donc
  // l'écran produits/services.
  const suivant = page.locator("button:visible", { hasText: /suivant/i }).first();
  await suivant.click({ timeout: 5000 }).catch(() => {});
  // toBeVisible (qui ATTEND) et non isVisible({ timeout }) dont le délai est ignoré.
  const step2 = await expect(page.getByText(/Tu proposes plutôt quoi/i).first())
    .toBeVisible({ timeout: 8000 })
    .then(() => true, () => false);
  await shot(page, "04-diagnostic-etape2");
  if (!step2) console.log("ℹ️  étape 2 non atteinte au clic Suivant (best-effort) — l'entrée diagnostic reste OK");

  // Bilan signaux (n'échoue pas le test : reporté pour le regard du cron).
  if (signals.length) {
    console.log(`🟡 ${signals.length} signaux à froid :`);
    for (const s of signals.slice(0, 12)) console.log("   -", s);
  } else {
    console.log("✅ 0 signal console/réseau à froid");
  }
});
