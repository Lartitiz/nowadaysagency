/**
 * Porte du paiement : le bouton « Passer à Premium → » de /abonnement ouvre
 * bien la page de paiement Stripe (checkout.stripe.com).
 *
 * Jusqu'ici seule la santé du webhook Stripe était surveillée : si l'edge
 * create-checkout tombait (clé Stripe, prix retiré, garde de conflit trop
 * zélée…), plus personne ne pouvait payer sans qu'aucune sonde ne le voie.
 *
 * On S'ARRÊTE sur la page Stripe : rien n'est rempli, rien n'est payé.
 * Effets de bord d'un passage (vérifiés dans create-checkout/subscription-checkout.ts
 * et la migration 20260911120000_launch_checkout_guard.sql) :
 * - une session Stripe « open » qui expire seule au bout de 2 h ; les passages
 *   suivants dans ce délai RÉUTILISENT la même session (pas d'accumulation) ;
 * - une seule ligne checkout_attempts pour Camille (clé = user_id, réécrite) ;
 * - un client Stripe pour Camille, créé une fois (clé d'idempotence) ;
 * - AUCUNE ligne subscriptions : elle n'est écrite que par le webhook
 *   checkout.session.completed, donc jamais sans paiement.
 * Consentement analytics forcé à « refused » : pas d'évènement
 * upgrade_checkout_opened envoyé à PostHog/Meta par la visite.
 *
 * Si Camille devient payante, la carte Premium affiche « Plan actuel ✓ » :
 * on vérifie alors la porte voisine, « Gérer mon abonnement » → portail Stripe.
 *
 * Zéro crédit IA. Desktop seulement (même parcours en mobile).
 */

import { test, expect } from "@playwright/test";

test.describe("porte du paiement", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop uniquement");

  test("Passer à Premium ouvre la page de paiement Stripe", async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      try { localStorage.setItem("cookie_consent", "refused"); } catch { /* sans stockage */ }
    });

    await page.goto("/abonnement", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Changer de plan" })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: info.outputPath("1-abonnement.png"), fullPage: true });

    const upgrade = page.getByRole("button", { name: /^Passer à Premium/ });
    const isFree = await upgrade.isVisible();

    if (!isFree) {
      // Camille déjà Premium : la porte utile devient le portail client Stripe.
      const portal = page.getByRole("button", { name: "Gérer mon abonnement" });
      await expect(portal, "Ni « Passer à Premium » ni « Gérer mon abonnement » : plus aucune porte vers Stripe").toBeVisible();
      const popupP = page.waitForEvent("popup", { timeout: 20_000 });
      await portal.click();
      const popup = await popupP;
      await popup.waitForURL(/billing\.stripe\.com/, { timeout: 20_000 });
      await popup.screenshot({ path: info.outputPath("2-portail-stripe.png") });
      await popup.close();
      return;
    }

    await expect(upgrade).toBeEnabled({ timeout: 15_000 });
    // La page part vers Stripe aussitôt la réponse reçue : le corps est lu au
    // passage (route.fetch) avant d'être rendu tel quel à la page.
    let checkout: { status: number; body: string } | null = null;
    await page.route("**/functions/v1/create-checkout", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const res = await route.fetch();
      checkout = { status: res.status(), body: await res.text() };
      await route.fulfill({ response: res, body: checkout.body });
    });
    await upgrade.click();
    await expect.poll(() => checkout, { timeout: 25_000, message: "create-checkout jamais appelé" }).not.toBeNull();
    const { status, body } = checkout!;
    expect(status, `create-checkout a répondu ${status} : ${body.slice(0, 200)}`).toBe(200);
    const url = (() => { try { return String(JSON.parse(body).url || ""); } catch { return ""; } })();
    expect(url, `create-checkout n'a pas renvoyé d'URL Stripe : ${body.slice(0, 200)}`).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // Arrivée sur Stripe, puis ARRÊT : on ne touche à aucun champ.
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });
    await expect(page.getByText(/39[,.]00/).first(), "La page Stripe ne montre pas le prix 39,00").toBeVisible({ timeout: 30_000 });
    // Session réutilisée d'un passage à l'autre pendant 2 h (pas d'accumulation).
    info.annotations.push({ type: "checkout", description: url.match(/cs_(live|test)_[A-Za-z0-9]{8}/)?.[0] ?? "?" });
    await page.waitForTimeout(1500); // fondu d'entrée de la page Stripe
    await page.screenshot({ path: info.outputPath("2-checkout-stripe.png") });
  });
});
