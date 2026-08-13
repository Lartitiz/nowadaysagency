import { test, expect } from "@playwright/test";

/**
 * Régression « ça a sauté, revenu au début » (13/08, 1er contenu post-onboarding).
 *
 * Cause : les paramètres ?sujet/?format/?auto=1 restaient collés à l'URL de
 * /creer ; tout remontage de la page (reload, onglet recyclé) REJOUAIT l'init
 * — questions régénérées, résultat effacé, retour au récap. Le correctif :
 * les paramètres sont consommés puis retirés de l'URL, et la reprise passe
 * par la persistance du flux (use-flow-persistence + flag autoFlow).
 *
 * Ce test FABRIQUE le scénario : arrivée sur le récap auto=1, puis reload.
 * Il vérifie (1) que l'URL est nettoyée après l'init, (2) que le récap
 * « Ton premier contenu » survit au reload SANS les paramètres d'URL.
 * Aucune génération n'est lancée : zéro crédit consommé.
 */

const SUJET = "Sujet de test reprise premier contenu";

test("le récap du 1er contenu survit au reload sans rejouer l'init d'URL", async ({ page }) => {
  // Isole le test de l'état onboarding du compte : on ne teste ICI que /creer.
  // (Le cache est celui que ProtectedRoute pose après une vérification "done".)
  await page.addInitScript(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.*-auth-token$/.test(k)) {
        try {
          const uid = JSON.parse(localStorage.getItem(k) || "{}")?.user?.id;
          if (uid) sessionStorage.setItem(`onboarding_checked:${uid}`, "done");
        } catch { /* token illisible — le test échouera plus loin */ }
      }
    }
  });
  // Départ propre : ?new=1 purge tout brouillon persisté du compte de test.
  await page.goto("/creer?new=1");
  await expect(page).not.toHaveURL(/new=1/);

  await page.goto(`/creer?sujet=${encodeURIComponent(SUJET)}&format=post&auto=1`);

  // Le récap auto=1 s'affiche avec l'idée préparée.
  await expect(page.getByText("Ton premier contenu est prêt à écrire")).toBeVisible();
  await expect(page.getByText(SUJET)).toBeVisible();

  // Les paramètres « à usage unique » ont été consommés puis retirés :
  // c'est eux qui rejouaient l'init destructrice à chaque remontage.
  await expect(page).not.toHaveURL(/auto=1/);
  await expect(page).not.toHaveURL(/sujet=/);
  await expect(page).not.toHaveURL(/format=/);

  // Reload en plein parcours (le geste qui « faisait sauter » le flux) :
  // la reprise vient de la persistance, plus des paramètres d'URL.
  await page.reload();
  await expect(page.getByText("Ton premier contenu est prêt à écrire")).toBeVisible();
  await expect(page.getByText(SUJET)).toBeVisible();
  await expect(page.getByRole("button", { name: /Générer mon premier contenu/ })).toBeVisible();

  // Nettoyage : on rend le brouillon inoffensif pour les autres specs.
  await page.goto("/creer?new=1");
});
