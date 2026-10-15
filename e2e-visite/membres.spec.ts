import { test, expect } from "@playwright/test";
import { WORKSPACE_SHARING_ENABLED } from "../src/config/feature-flags";

// Mode Binôme coupé le 15/10/2026 (#1639) : la section Membres n'existe plus.
// La sonde vérifie alors qu'elle reste absente et qu'une invitation ne s'ouvre
// pas ; l'ancien parcours ne tourne que si l'interrupteur est rallumé.
test("mode Binôme masqué : pas de section Membres, invitations fermées", async ({ page }) => {
  test.skip(WORKSPACE_SHARING_ENABLED, "partage d'espace rallumé : voir le test suivant");
  await page.goto("/parametres", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: /mon espace/i })).toBeVisible({ timeout: 15_000 });
  // forceMount : les onglets inactifs sont dans la page, donc 0 = vraiment absente.
  await expect(page.getByRole("heading", { name: "Membres de l'espace" })).toHaveCount(0);
  await page.goto("/invite/sonde-jeton-inexistant");
  await expect(page.getByText("Invitation invalide")).toBeVisible({ timeout: 15_000 });
});

// Section « Membres de l'espace » (/parametres) : liste, invitation par lien,
// invitations en attente, révocation. Autonettoyant : l'invitation créée pour
// l'email jetable est révoquée en fin de test. Capture chaque état en PNG
// (relus pour juger le responsive — passe mobile 390px notamment).
// Email jetable distinct par projet : desktop et mobile tournent en parallèle
// sur le même workspace, un email partagé provoque un 409 « déjà en attente ».
test("membres : liste, invitation, lien, révocation", async ({ page }, testInfo) => {
  test.skip(!WORKSPACE_SHARING_ENABLED, "mode Binôme masqué depuis le 15/10/2026");
  const DUMMY_EMAIL = `laetitia+membres-${testInfo.project.name}@nowadaysagency.com`;
  const shot = (name: string) =>
    page.screenshot({
      path: `e2e-visite/results/membres/${testInfo.project.name}-${name}.png`,
      fullPage: false,
    });

  // navigator.clipboard.writeText échoue en headless sans permission explicite
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/parametres", { waitUntil: "networkidle" });

  // 🔑 18/09 (#1029) — /parametres est passé en onglets : « Membres de
  // l'espace » vit dans l'onglet « Mon espace », et les panneaux inactifs sont
  // en display:none (forceMount + data-[state=inactive]:hidden). Sans ce clic,
  // scrollIntoViewIfNeeded attend un élément jamais affiché (timeout 90 s).
  const ongletEspace = page.getByRole("tab", { name: /mon espace/i });
  await expect(ongletEspace).toBeVisible({ timeout: 15_000 });
  await ongletEspace.click();

  const section = page.locator("div.rounded-2xl", {
    has: page.getByRole("heading", { name: "Membres de l'espace" }),
  });
  await expect(section).toBeVisible({ timeout: 15_000 });
  await section.scrollIntoViewIfNeeded();

  // Liste des membres chargée (au moins la ligne « (toi) » avec badge de rôle)
  await expect(section.getByText("(toi)")).toBeVisible({ timeout: 20_000 });

  // Reliquats de runs précédents interrompus : on les révoque TOUS avant de recréer.
  // Il peut y en avoir plusieurs (un par run échoué avant la révocation finale) :
  // on compte au lieu de tester la visibilité, car `isVisible()` sur 2 boutons ou
  // plus lève une violation du mode strict — jadis avalée par un catch, ce qui
  // désactivait le nettoyage précisément quand il devenait nécessaire.
  const revokeLeftovers = section.getByRole("button", {
    name: `Révoquer l'invitation de ${DUMMY_EMAIL}`,
  });
  for (let restants = await revokeLeftovers.count(); restants > 0; restants--) {
    await revokeLeftovers.first().click();
    await expect(revokeLeftovers).toHaveCount(restants - 1, { timeout: 20_000 });
  }
  await expect(section.getByText(DUMMY_EMAIL)).toHaveCount(0);
  await shot("1-liste");

  // Créer une invitation pour l'email jetable
  await section.getByPlaceholder("prenom@exemple.fr").fill(DUMMY_EMAIL);
  await section.getByRole("button", { name: "Créer l'invitation" }).click();

  // Le lien apparaît + la ligne « en attente »
  await expect(section.getByText("Lien d'invitation prêt")).toBeVisible({ timeout: 20_000 });
  // Exactement une ligne : on partait d'une ardoise propre, donc un doublon ici
  // serait une vraie duplication côté app, pas un reliquat de test.
  await expect(section.getByText(DUMMY_EMAIL)).toHaveCount(1);
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
