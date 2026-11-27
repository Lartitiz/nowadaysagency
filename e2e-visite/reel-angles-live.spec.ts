/**
 * Reel — écran « Choisis ton angle d'attaque » (étape hook_selection).
 *
 * Angle mort du 03/08 : cet écran, glissé entre le brief et le résultat depuis le
 * lot 7, n'était couvert par AUCUNE sonde (carousel-photo / carousel-mix /
 * stories-visuelles s'arrêtent aux autres formats). Vécu en live : `creative-flow`
 * `step:"hooks"` répond 200 avec `hooks: []`, le front lève `Error("empty")`, et sur
 * un « 3 autres angles » raté il ne posait même pas de message — l'écran gardait ses
 * cartes, sans issue lisible, pendant plus de 15 minutes.
 *
 * Deux tests :
 *  1. « sans issue » — QUOTIDIEN, ZÉRO CRÉDIT (`hooks` et `questions` sont des steps
 *     gratuits, et la réponse vide est fabriquée côté navigateur). On PROVOQUE la
 *     charge vide, comme ecran-fige-sonde provoque le 500 : un écran de secours ne
 *     se voit jamais quand tout va bien.
 *  2. « parcours réel » — LUNDI ou FORCE_REEL_ANGLES=1, ~1-2 crédits : vrais angles,
 *     sélection, script généré.
 *
 * ⚠️ Signal « génération finie » d'un reel = les onglets du parcours (`role=tab` :
 * Script / Tournage / Montage / Légende). PAS `publish-or-schedule` : depuis la
 * PR #689 ce bouton n'existe qu'à la DERNIÈRE étape du parcours reel, on
 * l'attendrait jusqu'au timeout.
 */
import { test, expect, type Page } from "./test-propre";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/reel-angles");
fs.mkdirSync(SHOTS, { recursive: true });

// Le sujet qui a déclenché le bug en live (compte test Camille, 03/08).
const SUJET = "Pourquoi je refuse de brader mes savons alors qu'on me le demande tout le temps";

const CREATIVE_FLOW = "**/functions/v1/creative-flow";
const QUESTIONS_SEUIL_S = 15;

/** /creer → sujet → Instagram → Reel → questions passées → écran des angles. */
async function allerJusquAuxAngles(page: Page, reponse?: string): Promise<boolean> {
  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  const textarea = page.locator("#creation-idea").or(page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager|nouveauté|coulisses/i)).first();
  await expect(textarea).toBeVisible({ timeout: 15000 });
  await textarea.fill(SUJET);
  await page.getByRole("button", { name: /^(suivant|continuer)$/i }).first().click();

  await page.getByRole("button", { name: /instagram/i }).first().click();
  const reelCard = page.getByText("Reel", { exact: true }).first();
  await expect(reelCard).toBeVisible({ timeout: 15000 });
  await reelCard.click();

  // Le choix du format ne valide pas tout seul : « Suivant » ouvre le brief.
  const suivantFormat = page.getByRole("button", { name: /^Suivant$/i }).last();
  await expect(suivantFormat).toBeEnabled({ timeout: 15000 });
  const debutQuestions = Date.now();
  await suivantFormat.click();

  // Les questions (step gratuit) mettent ~10-20 s à arriver ; on les passe :
  // ce qu'on teste ici est l'écran d'APRÈS.
  const passer = page.getByRole("button", { name: /Passer les questions/i }).first();
  const genererDirect = page.getByRole("button", { name: /Générer directement/i }).first();
  await Promise.race([
    passer.waitFor({ state: "visible", timeout: 120_000 }),
    genererDirect.waitFor({ state: "visible", timeout: 120_000 }),
  ]);
  // ⏱️ Sonde du 27/11/2026 (Loom : 30 à 50 s d'attente). Normal : 3 à 7 s. Au-delà de
  // 15 s, un essai du serveur a été coupé et relancé : lire les lignes `questions_duree`
  // des journaux de creative-flow (contexte_ms = base lente, ia_ms = IA bloquée).
  const attenteS = (Date.now() - debutQuestions) / 1000;
  console.log(`⏱️ Questions du reel : ${attenteS <= QUESTIONS_SEUIL_S ? "✅" : "🟠"} affichées en ${attenteS.toFixed(1)} s (seuil ${QUESTIONS_SEUIL_S} s)`);
  // Lundi : on répond à la 1re question (sonde 🔢 des chiffres gardés), puis
  // « Générer avec mes précisions » (ou « Générer » s'il n'y a qu'une question).
  const champ = page.locator('textarea[id^="creation-question-"]').first();
  if (reponse && await champ.isVisible().catch(() => false)) {
    await champ.fill(reponse);
    const avecPrecisions = page.getByRole("button", { name: /Générer avec mes précisions/i }).first();
    if (await avecPrecisions.isVisible().catch(() => false)) await avecPrecisions.click();
    else await page.getByTestId("creer-questions-next").click();
    return true;
  }
  if (await passer.isVisible().catch(() => false)) await passer.click();
  else await genererDirect.click();
  return false;
}

// 🔢 Sonde du 27/11/2026 (#2193) : la relecture du reel effaçait les chiffres
// tirés des RÉPONSES de la personne (« bébé de 2 mois » disparu), parce qu'elle
// ne les comptait pas comme « à elle ». Réponse aux prix précis, puis on relit
// le script final : au moins un de ces prix doit y être.
const REPONSE_CHIFFREE =
  "Une cliente m'a demandé trois savons pour 10 € au lieu de 9 € pièce. J'ai refusé : " +
  "chaque savon me coûte déjà 4,20 € en matières, sans compter les six semaines de séchage.";
const CHIFFRES_REPONSE: Array<[string, RegExp]> = [
  ["4,20 €", /4[,.]20\s*(€|euros?)|quatre euros vingt/i],
  ["10 €", /\b10\s*(€|euros?)|dix euros/i],
  ["9 €", /\b9\s*(€|euros?)|neuf euros/i],
];
/** Ce que l'ancienne relecture faisait aux prix de sa réponse (essai de la sonde). */
const effacerPrix = (t: string) =>
  t.replace(/\b\d+(?:[,.]\d+)?\s*(?:€|euros?)|\b(?:quatre|dix|neuf) euros(?: vingt)?/gi, "quelques euros");

/** Le texte du script final, lu dans l'événement `done` du flux de `generate`. */
function texteDuScript(flux: string): string | null {
  let dernier: any = null;
  for (const bloc of flux.split("\n\n")) {
    const ligne = bloc.split("\n").find((l) => l.startsWith("data:"));
    if (!ligne) continue;
    try {
      const ev = JSON.parse(ligne.slice(5));
      if (ev?.type === "done") dernier = ev;
    } catch { /* morceau non JSON */ }
  }
  if (!dernier) return null;
  let r: any = dernier.full ?? dernier;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return r; } }
  const reel = r?.reel ?? r?.content ?? r?.result ?? r;
  const morceaux = [reel?.accroche, reel?.script, reel?.sections, reel?.lecture_test].filter((x) => x != null);
  return morceaux.length ? JSON.stringify(morceaux) : JSON.stringify(reel);
}

/** Les cartes d'angles, ou l'écran de repli quand il n'y en a aucune. */
function angles(page: Page) {
  return {
    cartes: page.getByRole("radiogroup", { name: "Angles d'attaque proposés" }).getByRole("radio"),
    titre: page.getByText(/Choisis ton angle d'attaque/i).first(),
    repli: page.getByRole("button", { name: /Continuer sans choisir/i }).first(),
    secours: page.getByRole("button", { name: /Laisser l'IA choisir/i }).first(),
    retour: page.getByRole("button", { name: /Revenir aux questions/i }).first(),
    autres: page.getByRole("button", { name: /3 autres angles/i }).first(),
    ecrire: page.getByRole("button", { name: /Écrire le script complet/i }).first(),
    // testid et pas `role=alert` seul : les toasts Sonner partagent ce rôle.
    alerte: page.getByTestId("hooks-error").first(),
  };
}

test("angles du reel : une charge vide ne laisse JAMAIS l'écran sans issue", async ({ page }) => {
  test.setTimeout(300_000);

  // Lecture SEULE de la réponse réelle (pas de `route.fetch`) : c'est la seule
  // façon de distinguer « l'edge a rendu 0 angle » de « le front a mal lu ».
  //
  // ⚠️ Le listener voit AUSSI les réponses que ce test fabrique lui-même au
  // `route.fulfill` ci-dessous. Sans discrimination, `charge200Vide` serait vrai
  // à TOUS les runs (on y lirait notre propre `{ hooks: [] }`) et le signal de
  // fin crierait au loup tous les jours — vécu le 06/08, où il a fait croire à
  // tort que `creative-flow` n'était pas redéployée. Le drapeau ne regarde donc
  // QUE la requête réellement partie au serveur, identifiée par son objet
  // `Request` mémorisé au moment du `continue()`.
  let requeteReelle: import("@playwright/test").Request | null = null;
  let charge200Vide = false;
  page.on("response", async (res) => {
    if (!res.url().includes("/functions/v1/creative-flow")) return;
    let step = "?";
    try {
      step = (JSON.parse(res.request().postData() || "{}") as { step?: string }).step ?? "?";
    } catch {
      /* corps non JSON */
    }
    if (step !== "hooks") return;
    let corps = "";
    try {
      corps = (await res.text()).slice(0, 200);
    } catch {
      /* corps déjà consommé */
    }
    const fabriquee = res.request() !== requeteReelle;
    console.log(
      `⏱️ creative-flow step=hooks → ${res.status()}${fabriquee ? " (charge FABRIQUÉE par le test)" : ""} | ${corps}`,
    );
    if (fabriquee) return;
    if (res.status() === 200 && /"hooks"\s*:\s*\[\s*\]/.test(corps)) charge200Vide = true;
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("fetchReelHooks")) console.log(`🔴 ${msg.text()}`);
  });

  // Le 1er appel `hooks` part pour de vrai (gratuit) ; les suivants — donc le
  // « 3 autres angles » — reçoivent le 200 menteur observé en live.
  let appelsHooks = 0;
  await page.route(CREATIVE_FLOW, async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    let body: any = {};
    try {
      body = req.postDataJSON() ?? {};
    } catch {
      /* corps non JSON : rien à filtrer */
    }
    if (body.step !== "hooks") return route.continue();
    appelsHooks += 1;
    // ⚠️ Le 1er appel passe par `continue()` et JAMAIS par `fetch()` + `fulfill()` :
    // ce détour renvoie les en-têtes d'origine (`content-encoding: gzip`) avec un
    // corps déjà décodé, et le SDK Supabase lit alors une charge vide — on
    // fabriquerait le bug qu'on prétend observer.
    if (appelsHooks === 1) {
      requeteReelle = req;
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      body: JSON.stringify({ hooks: [] }),
    });
  });

  await allerJusquAuxAngles(page);
  const a = angles(page);

  // Deux entrées possibles : des angles (cas nominal) ou déjà l'écran de repli
  // si le 1er appel réel a échoué. Les deux doivent rester praticables.
  await Promise.race([
    a.cartes.first().waitFor({ state: "visible", timeout: 180_000 }),
    a.repli.waitFor({ state: "visible", timeout: 180_000 }),
  ]);

  if (await a.cartes.first().isVisible().catch(() => false)) {
    await expect(a.titre).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "angles-1-cartes.png"), fullPage: true });

    // ── Le vrai scénario du 03/08 : « 3 autres angles » qui revient vide ──
    await a.autres.click();

    // 1) L'échec est DIT. C'est ce qui manquait : le catch ignorait les refresh.
    await expect(a.alerte).toBeVisible({ timeout: 90_000 });
    const message = (await a.alerte.textContent())?.trim() ?? "";
    expect(message.length, "un message vide vaut pas de message").toBeGreaterThan(10);
    expect(message, "jamais de message technique brut à l'écran").not.toMatch(/^empty$|Error:|undefined/);

    // 2) Les angles précédents restent là ET utilisables.
    expect(await a.cartes.count()).toBeGreaterThan(0);
    await a.cartes.first().click();
    await expect(a.ecrire).toBeEnabled();

    await page.screenshot({ path: path.join(SHOTS, "angles-2-refresh-rate.png"), fullPage: true });
  } else {
    // Repli : aucune carte. L'écran doit porter toutes ses sorties.
    await expect(a.alerte).toBeVisible();
    await expect(a.repli).toBeEnabled();
    await page.screenshot({ path: path.join(SHOTS, "angles-2-repli.png"), fullPage: true });
  }

  // 3) Les sorties de secours ne se verrouillent jamais — c'est LA garantie
  // qui manquait (« Laisser l'IA choisir » était désactivé pendant un refresh,
  // et l'écran de repli n'avait aucun retour arrière).
  const sortie = (await a.secours.isVisible().catch(() => false)) ? a.secours : a.repli;
  await expect(sortie, "aucune sortie active : l'écran est un cul-de-sac").toBeEnabled();
  await expect(a.retour, "pas de retour arrière : l'écran enferme").toBeEnabled();
  // On ne CLIQUE pas la sortie : elle lance une génération facturée.

  // Ce test garde le FRONT (l'écran s'en sort). Le « 200 menteur » de l'edge est
  // un second défaut, qu'on refuse de masquer : il ressort en clair, sans faire
  // rougir le run — c'est le test du lundi qui le sanctionne pour de bon.
  if (charge200Vide) {
    console.log(
      "⚠️ SIGNAL EDGE : creative-flow step=hooks a répondu 200 avec `hooks: []` sur un " +
        "sujet valide. Le front s'en sort (c'est ce qu'on teste ici), mais l'edge ment " +
        "sur son succès — vérifier qu'il est bien redéployé (il doit répondre 502).",
    );
  }
});

test("angles du reel : parcours réel jusqu'au script (lundi, ~1-2 crédits)", async ({ page, viewport }) => {
  const isMonday = new Date().getDay() === 1;
  test.skip(!isMonday && !process.env.FORCE_REEL_ANGLES, "lundi uniquement (coût ~1-2 crédits/semaine)");
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût réel)");
  test.setTimeout(900_000);

  page.on("response", (res) => {
    if (res.url().includes("/functions/v1/")) {
      console.log(`⏱️ ${res.url().split("/functions/v1/")[1].split("?")[0]} → ${res.status()}`);
    }
  });

  // Essai de la ligne ✍️ contre l'écran d'avant #2144 : `SONDE_SANS_FLUX=1`
  // retient tout le flux de l'écriture jusqu'à la fin (le brouillon arrive
  // alors d'un bloc, comme avant). La ligne doit passer au 🟠.
  if (process.env.SONDE_SANS_FLUX) {
    await page.route(CREATIVE_FLOW, async (route) => {
      const req = route.request();
      let step = "";
      try { step = (req.postDataJSON() ?? {}).step ?? ""; } catch { /* corps non JSON */ }
      if (req.method() !== "POST" || step !== "generate") return route.continue();
      const res = await route.fetch({ timeout: 300_000 });
      const headers = { ...res.headers() };
      delete headers["content-encoding"];
      delete headers["content-length"];
      return route.fulfill({ status: res.status(), headers, body: await res.body() });
    });
  }

  // Essai de la ligne 🔢 contre la relecture d'avant #2193 : `SONDE_SANS_CHIFFRES=1`
  // efface les prix du script rendu, comme le faisait l'ancienne relecture.
  // La ligne doit passer au 🟠.
  if (process.env.SONDE_SANS_CHIFFRES) {
    await page.route(CREATIVE_FLOW, async (route) => {
      const req = route.request();
      let step = "";
      try { step = (req.postDataJSON() ?? {}).step ?? ""; } catch { /* corps non JSON */ }
      if (req.method() !== "POST" || step !== "generate") return route.continue();
      const res = await route.fetch({ timeout: 300_000 });
      const headers = { ...res.headers() };
      delete headers["content-encoding"];
      delete headers["content-length"];
      return route.fulfill({ status: res.status(), headers, body: effacerPrix(await res.text()) });
    });
  }

  // Le flux de `generate`, lu à la fin (sonde 🔢).
  let fluxGenerate: Promise<string> | null = null;
  let reponseEnvoyee = false;
  page.on("response", (res) => {
    if (!res.url().includes("/functions/v1/creative-flow")) return;
    let body: any = {};
    try { body = res.request().postDataJSON() ?? {}; } catch { /* corps non JSON */ }
    if (body.step !== "generate") return;
    reponseEnvoyee = JSON.stringify(body).includes("4,20");
    fluxGenerate = res.text().catch(() => "");
  });

  const arepondu = await allerJusquAuxAngles(page, REPONSE_CHIFFREE);
  const a = angles(page);

  await Promise.race([
    a.cartes.first().waitFor({ state: "visible", timeout: 180_000 }),
    a.repli.waitFor({ state: "visible", timeout: 180_000 }),
  ]);
  if (await a.repli.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "reel-ECHEC-angles.png"), fullPage: true });
    const raison = (await a.alerte.textContent().catch(() => "")) ?? "";
    throw new Error(`step "hooks" n'a rendu aucun angle sur un sujet valide : ${raison.slice(0, 220)}`);
  }

  const nb = await a.cartes.count();
  expect(nb, "l'écran promet trois façons d'ouvrir le reel").toBe(3);
  await page.screenshot({ path: path.join(SHOTS, "reel-1-angles.png"), fullPage: true });

  await a.cartes.first().click();
  await expect(a.ecrire).toBeEnabled();
  await a.ecrire.click();
  console.log("🚀 Angle choisi, script lancé");
  const depart = Date.now();

  // Fin de génération = les onglets du parcours reel. « Script » et « Légende »
  // sont les deux seuls toujours présents (Tournage/Montage dépendent du script).
  // ✍️ Premier mot du script (27/11/2026, #2144) : le texte parlé puis les
  // scènes s'affichent PENDANT l'écriture. Avant, rien pendant ~38 s (le
  // brouillon ne partait qu'à la fin de l'écriture). L'accroche choisie, posée
  // d'office dans le téléphone, ne compte pas : seul le texte du script compte.
  // Seuil : 20 s (en ligne le 27/11 : 12 s ; ancienne version : 38 s).
  const premierMot = page.locator('[data-testid="reel-draft-monologue"], [data-testid="reel-draft-scenes"] li').first();
  const vuA = await premierMot.waitFor({ state: "visible", timeout: 120_000 })
    .then(() => (Date.now() - depart) / 1000).catch(() => null);
  console.log(vuA === null
    ? "✍️ Reel, premier mot du script : 🟠 jamais vu pendant l'écriture (le script n'apparaît qu'à la fin)"
    : `✍️ Reel, premier mot du script : ${vuA <= 20 ? "✅" : "🟠"} à ${vuA.toFixed(1)} s (seuil 20 s)`);
  await expect(page.getByRole("tab", { name: /^Script$/ })).toBeVisible({ timeout: 780_000 });
  await expect(page.getByRole("tab", { name: /^Légende$/ })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "reel-2-script.png"), fullPage: true });

  // 🔢 Les prix de sa réponse sont-ils encore dans le script final ?
  // Le flux SSE n'a pas de corps lisible côté Playwright quand il arrive au fil de
  // l'eau : on lit le script affiché (onglet Script), sinon le flux (essai simulé).
  const affiche = await page.getByRole("tabpanel").first().innerText().catch(() => "");
  const script = affiche.trim().length > 80 ? affiche : fluxGenerate ? texteDuScript(await fluxGenerate) : null;
  if (!arepondu || !reponseEnvoyee) {
    console.log(`🔢 Reel, chiffres de sa réponse : 🟠 pas vérifié (${!arepondu ? "aucune question où répondre" : "la réponse n'est pas partie avec la demande"})`);
  } else if (script === null) {
    console.log("🔢 Reel, chiffres de sa réponse : 🟠 pas vérifié (script final introuvable dans la réponse du serveur)");
  } else {
    const gardes = CHIFFRES_REPONSE.filter(([, re]) => re.test(script)).map(([nom]) => nom);
    console.log(gardes.length
      ? `🔢 Reel, chiffres de sa réponse : ✅ ${gardes.length}/${CHIFFRES_REPONSE.length} gardés (${gardes.join(", ")})`
      : `🔢 Reel, chiffres de sa réponse : 🟠 aucun des ${CHIFFRES_REPONSE.length} prix de sa réponse dans le script (la relecture les a-t-elle effacés ? voir reelNumberSources, #2193)`);
  }
  console.log(`✅ Reel généré depuis un angle choisi (${nb} angles proposés)`);
});
