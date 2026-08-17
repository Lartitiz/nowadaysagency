/**
 * Newsletter réelle de bout en bout — chemin `runNewsletterTwoStep` de
 * creative-flow (extrait par la PR #777, re-branché SSE par la #811), jamais
 * revalidé en conditions réelles depuis le refactor (les specs live du 17/08
 * n'ont couvert que reel hooks→generate, T1a/T1b streamés et carrousel photo).
 *
 * Parcours : /creer → sujet → canal Newsletter (sélectionne le format direct)
 * → questions passées → génération streamée (SSE + heartbeat) → écran résultat.
 *
 * Vérifie ce que le two-step promet :
 *  - un OBJET d'email non vide (carte « Objet de l'email »),
 *  - un contenu substantiel (>200 mots visés par le brief),
 *  - AUCUN markdown résiduel (**gras**, ## titres) : `stripMarkdownFromNewsletter`
 *    tourne côté edge, le front ne fait que filet — si du markdown arrive ici,
 *    c'est l'edge qui a régressé (audit 09/07).
 *
 * Coût ~1 crédit → à la demande uniquement : FORCE_NEWSLETTER_LIVE=1.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots/newsletter-live");
fs.mkdirSync(SHOTS, { recursive: true });

const SUJET =
  "Pourquoi je fabrique mes savons à froid : ce que ça change pour ta peau et pour la planète";

test("newsletter réelle : sujet → génération streamée → objet + contenu sans markdown", async ({ page, viewport }) => {
  test.skip(!process.env.FORCE_NEWSLETTER_LIVE, "à la demande uniquement (coût ~1 crédit) : FORCE_NEWSLETTER_LIVE=1");
  test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement (coût réel)");
  test.setTimeout(600_000);

  page.on("response", (res) => {
    if (res.url().includes("/functions/v1/")) {
      console.log(`⏱️ ${res.url().split("/functions/v1/")[1].split("?")[0]} → ${res.status()}`);
    }
  });

  await page.goto("/creer?new=1", { waitUntil: "networkidle" });
  const closeBtn = page.locator('[data-testid="branding-banner-close"], button[aria-label*="ermer"]').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await closeBtn.click();

  // Étape 1 : sujet
  const textarea = page.getByPlaceholder(/raconte|idée|mot-clé|envie|partager/i).first();
  await expect(textarea).toBeVisible({ timeout: 15000 });
  await textarea.fill(SUJET);
  await page.getByRole("button", { name: /suivant/i }).first().click();

  // Étape 2 : canal Newsletter — le clic sélectionne AUSSI le format (un seul
  // format sur ce canal, cf. CreerStepFormat handleChannelSelect).
  await page.getByRole("button", { name: /newsletter/i }).first().click();

  // « Suivant » ouvre le brief/questions (même mécanique que le reel).
  const suivantFormat = page.getByRole("button", { name: /^Suivant$/i }).last();
  await expect(suivantFormat).toBeEnabled({ timeout: 15000 });
  await suivantFormat.click();

  // Questions (step gratuit) : on les passe, c'est la GÉNÉRATION qu'on teste.
  const passer = page.getByRole("button", { name: /Passer les questions/i }).first();
  const genererDirect = page.getByRole("button", { name: /Générer directement/i }).first();
  await Promise.race([
    passer.waitFor({ state: "visible", timeout: 120_000 }),
    genererDirect.waitFor({ state: "visible", timeout: 120_000 }),
  ]);
  if (await passer.isVisible().catch(() => false)) await passer.click();
  else await genererDirect.click();
  console.log("🚀 Génération newsletter lancée");

  // Fin = la carte « Objet de l'email » du NewsletterResult. On course l'erreur
  // inline du hook pour échouer vite et lisiblement plutôt qu'au timeout.
  const objetCard = page.getByText(/Objet de l'email/i).first();
  const erreur = page.getByText(/La génération a échoué|Erreur lors de la génération/i).first();
  await Promise.race([
    objetCard.waitFor({ state: "visible", timeout: 480_000 }),
    erreur.waitFor({ state: "visible", timeout: 480_000 }),
  ]);
  if (await erreur.isVisible().catch(() => false)) {
    await page.screenshot({ path: path.join(SHOTS, "newsletter-ECHEC.png"), fullPage: true });
    throw new Error(`La génération newsletter a échoué : ${(await erreur.textContent())?.slice(0, 200)}`);
  }
  await page.screenshot({ path: path.join(SHOTS, "newsletter-1-resultat.png"), fullPage: true });

  // 1) Objet non vide : le seul div qui a À LA FOIS le label et un p.font-bold
  //    en enfant direct est le CardContent de la carte objet.
  const subjectText =
    (await page
      .locator("div:has-text(\"Objet de l'email\") > p.font-bold")
      .first()
      .textContent()
      .catch(() => "")) ?? "";
  expect(subjectText.trim().length, "l'objet de l'email est vide").toBeGreaterThan(5);
  console.log(`✉️ Objet : ${subjectText.trim()}`);

  // 2) Preview text : facultatif dans le rendu — on LOGGE son absence (le brief
  //    le demande, le two-step le compte dans ses logs) sans faire rougir.
  const previewVisible = await page.getByText(/^Preview text$/i).isVisible().catch(() => false);
  if (!previewVisible) console.log("⚠️ preview_text absent du résultat (le brief le demande — à surveiller)");

  // 3) Contenu : substantiel et SANS markdown résiduel.
  const bodyText =
    (await page
      .locator('div:has-text("Contenu") > div.whitespace-pre-wrap')
      .first()
      .textContent()
      .catch(() => "")) ?? "";
  expect(bodyText.trim().length, "corps de newsletter anormalement court").toBeGreaterThan(500);
  const markdownResiduel = bodyText.match(/\*\*[^*]+\*\*|^#{1,3}\s|__[^_]+__/m);
  expect(
    markdownResiduel,
    `markdown résiduel dans la newsletter (stripMarkdownFromNewsletter a fui) : « ${markdownResiduel?.[0]} »`,
  ).toBeNull();

  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  console.log(`✅ Newsletter générée : objet ${subjectText.trim().length} car., corps ${wordCount} mots, preview ${previewVisible ? "présent" : "ABSENT"}`);
});
