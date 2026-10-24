/**
 * Relecture de la fiche « Voici ce que j'ai compris de ton projet » (fin de
 * l'onboarding) : les 7 cartes s'ouvrent et une carte vide pose sa question
 * (24/10/2026, après #1789 / #1791 / #1793) : zéro crédit.
 *
 * Le 22/10, « On affine ensemble » sur « Ta proposition de valeur » faisait
 * planter tout l'écran, et une carte vide proposait « C'est bon » sur du vide :
 * aucune routine ne passait par cette relecture.
 *
 * La sonde simule une fiche « à relire » sur Camille (réponse réseau factice),
 * BLOQUE toute écriture en base et coupe tout appel à l'IA. Elle ouvre
 * « On affine ensemble » sur les 7 cartes sans rien lancer, puis vérifie qu'une
 * fiche vide (forme réelle de l'onboarding : confiance « medium » d'office)
 * pose sa question de rattrapage, sans « C'est bon ».
 *
 * Depuis le 24/10/2026, « On affine ensemble » s'appelle « Je corrige » et
 * « C'est bon » s'appelle « C'est juste » sur les cartes : la sonde cherche les deux.
 *
 * Au téléphone (375 × 812, ajouté le 24/10/2026 après #1797) : sur chacune des
 * 7 cartes, à l'arrivée et sans défiler, les 2 boutons de la carte sont au-dessus
 * de la barre du bas. Une carte trop longue les cachait (jusqu'à 2,5 écrans).
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const REMPLIE = {
  story: { confidence: "medium", full_story: "J'ai ouvert mon atelier de savons après dix ans dans un bureau." },
  persona: { confidence: "medium", description: "Des personnes à la peau sensible qui veulent des produits simples." },
  value_proposition: { confidence: "medium", key_phrase: "Des savons doux, faits main, pour les peaux sensibles." },
  tone_style: { confidence: "medium", voice_description: "Chaleureux et direct.", tone_keywords: ["chaleureux", "direct"] },
  content_strategy: { confidence: "medium", pillars: ["Coulisses de l'atelier", "Conseils peau sensible"] },
  offers: { confidence: "medium", offers: [{ name: "Savon doux" }] },
  charter: { confidence: "low", mood_keywords: ["naturel", "doux"] },
  sources_used: [], sources_failed: [], overall_confidence: "medium",
};
const VIDE = {
  story: { confidence: "medium", full_story: null }, persona: { confidence: "medium", description: null, goals: [] },
  value_proposition: { confidence: "medium", key_phrase: null }, tone_style: { confidence: "medium", voice_description: null },
  content_strategy: { confidence: "medium", pillars: [] }, offers: { confidence: "medium", offers: [] },
  charter: { confidence: "low", mood_keywords: [] }, sources_used: [], sources_failed: [], overall_confidence: "medium",
};
const CARTES = ["Ton histoire", "client·e idéal·e", "proposition de valeur", "Ton & style", "stratégie de contenu", "Tes offres", "charte graphique"];
const BOUTONS_CARTE = /C'est juste|C'est bon|Je corrige|On affine ensemble|Garder tel quel/;
const TABLES_MARQUE = ["storytelling", "persona", "brand_proposition", "brand_profile", "brand_strategy", "offers", "brand_charter"];

async function simuler(page: Page, analysis: Record<string, unknown>) {
  const ligne = { id: "00000000-0000-0000-0000-00000000c0de", analysis_result: analysis, website_url: null, instagram_handle: null, linkedin_url: null, autofill_status: "pending_review" };
  const vide = (route: Route, objet: boolean) => objet
    ? route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "0 rows" }) })
    : route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  await page.route("**/rest/v1/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const table = url.split("/rest/v1/")[1].split("?")[0];
    const objet = (req.headers()["accept"] || "").includes("object");
    if (req.method() === "GET" && table === "branding_autofill" && url.includes("pending_review")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(objet ? ligne : [ligne]) });
    }
    // Fiche vue comme celle d'une nouvelle cliente (rien d'écrit avant).
    if (req.method() === "GET" && (TABLES_MARQUE.includes(table) || table === "branding_coaching_sessions")) return vide(route, objet);
    if (req.method() === "GET" || req.method() === "HEAD") return route.continue();
    // Aucune écriture n'atteint la base.
    if (req.method() === "DELETE") return route.fulfill({ status: 204, body: "" });
    let corps: unknown[] = [];
    try { const b = req.postDataJSON(); corps = Array.isArray(b) ? b : [b]; } catch { /* rien */ }
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(objet ? { id: "00000000-0000-0000-0000-0000000000aa", ...(corps[0] as object) } : corps) });
  });
  // Zéro crédit : aucun appel à l'IA ne part.
  await page.route(/functions\/v1\/(branding-quick-refine|branding-coaching|charter-coaching)/, (route) => route.abort());
  await page.goto("/branding?from=onboarding&next=creer");
  await expect(page.getByText("Voici ce que j'ai compris de ton projet")).toBeVisible({ timeout: 60_000 });
}

test.describe("Relecture de la fiche : 7 cartes et carte vide", () => {
  test("les 7 cartes s'ouvrent, une carte vide pose sa question", async ({ page }, info) => {
    test.setTimeout(120_000);
    const taille = info.project.name;
    const oups = page.getByText("Oups, quelque chose a coincé");

    if (taille === "mobile") await page.setViewportSize({ width: 375, height: 812 });
    await simuler(page, REMPLIE);

    // Téléphone : les 2 boutons de chaque carte visibles à l'arrivée, sans défiler.
    const cachees: string[] = [];
    if (taille === "mobile") {
      for (const nom of CARTES) {
        await page.getByRole("button", { name: new RegExp(`Aller à « .*${nom.replace(/[·&]/g, ".")}`) }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        const m = await page.evaluate((motif) => {
          const re = new RegExp(motif);
          const carte = [...document.querySelectorAll("h2")].map((h) => h.closest("div.border")).find(Boolean);
          const barre = [...document.querySelectorAll("div.fixed")].find((d) => d.textContent?.includes("validées"));
          const limite = barre ? barre.getBoundingClientRect().top : innerHeight;
          const boutons = carte ? [...carte.querySelectorAll("button")].filter((b) => re.test(b.textContent || "")) : [];
          return { n: boutons.length, visibles: boutons.filter((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= limite; }).length };
        }, BOUTONS_CARTE.source);
        if (m.n < 2 || m.visibles < 2) cachees.push(`${nom} (boutons visibles : ${m.visibles}/${Math.max(m.n, 2)})`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole("button", { name: /Aller à « Ton histoire »/ }).click();
    }
    const ouvertes: string[] = [];
    const ko: string[] = [];
    for (const nom of CARTES) {
      await page.getByRole("button", { name: new RegExp(`Aller à « .*${nom.replace(/[·&]/g, ".")}`) }).click();
      await page.waitForTimeout(300);
      // « Je corrige » depuis le 24/10/2026 (chantier 4) ; l'ancien nom reste
      // reconnu tant que la version en ligne n'est pas republiée.
      await page.getByRole("button", { name: /Je corrige|On affine ensemble/ }).first().click();
      await page.waitForTimeout(800);
      if (await oups.isVisible().catch(() => false)) { ko.push(`${nom} : plantage`); break; }
      // Onboarding : la passe unique s'ouvre (questions), on revient sans rien lancer.
      const retour = page.getByRole("button", { name: /Revenir à mes cartes|Revenir à la vue d'ensemble/ }).first();
      if (!(await retour.isVisible().catch(() => false))) { ko.push(`${nom} : rien ne s'ouvre`); continue; }
      ouvertes.push(nom);
      await retour.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `e2e-visite/results/relecture-fiche-${taille}.png` });

    await simuler(page, VIDE);
    const question = await page.getByLabel("En deux phrases, comment ton activité a commencé ?").isVisible().catch(() => false);
    const cestBon = await page.getByRole("button", { name: /C'est juste|C'est bon/ }).isVisible().catch(() => false);
    const videOk = question && !cestBon && !(await oups.isVisible().catch(() => false));
    await page.screenshot({ path: `e2e-visite/results/relecture-fiche-vide-${taille}.png` });

    console.log(`🪪 Relecture fiche (${taille}) : ${ouvertes.length}/7 cartes s'ouvrent · carte vide ${videOk ? "pose sa question ✅" : `❌ (${!question ? "pas de question" : cestBon ? "« C'est bon » sur du vide" : "plantage"})`}`);
    for (const k of ko) console.log(`   - ❌ ${k}`);
    if (taille === "mobile") {
      console.log(`📱 Boutons au téléphone (375 × 812) : ${cachees.length === 0 ? "7/7 cartes ✅" : `🔴 ${7 - cachees.length}/7, cachés sur : ${cachees.join(", ")}`}`);
    }
    expect(ko, "« On affine ensemble » ne s'ouvre pas sur toutes les cartes").toEqual([]);
    expect(videOk, "la carte vide ne pose pas sa question").toBe(true);
    expect(cachees, "boutons de carte cachés au téléphone à l'arrivée").toEqual([]);
  });
});
