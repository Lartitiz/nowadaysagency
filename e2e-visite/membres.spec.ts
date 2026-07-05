import { test, expect } from "@playwright/test";

// Section « Membres de l'espace » (/parametres) : liste, invitation par lien,
// invitations en attente, révocation. Autonettoyant : l'invitation créée pour
// l'email jetable est révoquée en fin de test. Capture chaque état en PNG
// (relus pour juger le responsive — passe mobile 390px notamment).
// Email jetable distinct par projet : desktop et mobile tournent en parallèle
// sur le même workspace, un email partagé provoque un 409 « déjà en attente ».
test("membres : liste, invitation, lien, révocation", async ({ page }, testInfo) => {
  const DUMMY_EMAIL = `laetitia+membres-${testInfo.project.name}@nowadaysagency.com`;
  const shot = (name: string) =>
    page.screenshot({
      path: `e2e-visite/results/membres/${testInfo.project.name}-${name}.png`,
      fullPage: false,
    });

  // navigator.clipboard.writeText échoue en headless sans permission explicite
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/parametres", { waitUntil: "networkidle" });

  const section = page.locator("div.rounded-2xl", {
    has: page.getByRole("heading", { name: "Membres de l'espace" }),
  });
  await section.scrollIntoViewIfNeeded();

  // Liste des membres chargée (au moins la ligne « (toi) » avec badge de rôle)
  await expect(section.getByText("(toi)")).toBeVisible({ timeout: 20_000 });

  // Reliquat d'un run précédent interrompu : on révoque avant de recréer
  const revokeLeftover = section.getByRole("button", {
    name: `Révoquer l'invitation de ${DUMMY_EMAIL}`,
  });
  if (await revokeLeftover.isVisible().catch(() => false)) {
    await revokeLeftover.click();
    await expect(section.getByText(DUMMY_EMAIL)).toBeHidden({ timeout: 20_000 });
  }
  await shot("1-liste");

  // Créer une invitation pour l'email jetable
  await section.getByPlaceholder("prenom@exemple.fr").fill(DUMMY_EMAIL);
  await section.getByRole("button", { name: "Créer l'invitation" }).click();

  // Le lien apparaît + la ligne « en attente »
  await expect(section.getByText("Lien d'invitation prêt")).toBeVisible({ timeout: 20_000 });
  await expect(section.getByText(DUMMY_EMAIL)).toBeVisible();
  await shot("2-invitation-creee");

  // Copie du lien (bouton du bloc « lien prêt »)
  await section.getByRole("button", { name: "Copier le lien", exact: true }).click();
  await expect(section.getByText("Copié")).toBeVisible();

  // Révocation (nettoyage) : la croix de la ligne en attente
  await section.getByRole("button", { name: `Révoquer l'invitation de ${DUMMY_EMAIL}` }).click();
  await expect(section.getByText(DUMMY_EMAIL)).toBeHidden({ timeout: 20_000 });
  await shot("3-apres-revocation");

  // Pas de débordement horizontal (règle des passes mobile)
  const overflow = await page.evaluate(
    () => document.scrollingElement!.scrollWidth - window.innerWidth,
  );
  expect(overflow, "débordement horizontal en px").toBeLessThanOrEqual(0);
});
