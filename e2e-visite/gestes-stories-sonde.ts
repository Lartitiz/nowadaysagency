/**
 * Sonde des gestes des stories (chantier 4, PR #1865, 12/11/2026, accord de Laetitia).
 *
 * Appelée à la fin des contenus figés « story » (rejoués chaque matin sans crédit).
 * Elle ne clique sur aucun geste (rien n'est modifié) et n'échoue jamais. Sur téléphone
 * (#1884), Avant / Après / Dupliquer / Ajouter / Refaire sont dans le menu « … »
 * (« Actions sur la story 1 ») : la sonde l'ouvre, lit ses entrées, le referme. Elle écrit
 * une ligne lue par la visite du matin (consigne 7duodecies) :
 *   🎬 Gestes des stories (1440 px) : 6/6 ✅
 *
 * Pourquoi : les tests CI (`story-result-sequence-gestures`) vérifient le code, mais
 * rien ne regardait si ces boutons sont bien affichés EN LIGNE (une retouche Lovable
 * de StoryResult.tsx peut les faire disparaître sans casser la CI).
 */
import type { Page } from "@playwright/test";

// menu : libellé de l'entrée du menu « … » sur téléphone (absent = jamais dans le menu).
const GESTES: { nom: string; role: "button" | "group"; name: string; menu?: string }[] = [
  { nom: "Dupliquer", role: "button", name: "Dupliquer la story 1", menu: "Dupliquer" },
  { nom: "Après", role: "button", name: "Placer la story 1 après la story 2", menu: "Placer après" },
  { nom: "Ajouter", role: "button", name: "Ajouter une story après la story 1", menu: "Ajouter une story après" },
  { nom: "Taille", role: "group", name: "Taille du texte" },
  { nom: "Grand", role: "button", name: "Grand" },
  { nom: "Refaire", role: "button", name: "Refaire cette story (story 1)", menu: "Refaire cette story" },
];

export async function sondeGestesStories(page: Page) {
  const largeur = page.viewportSize()?.width ?? "?";
  try {
    const tab = page.getByRole("button", { name: "Voir la story 1" });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await page.waitForTimeout(500);
    const visibles = new Set<string>();
    for (const g of GESTES) {
      if (await page.getByRole(g.role, { name: g.name, exact: true }).first().isVisible().catch(() => false)) visibles.add(g.nom);
    }
    let dansLeMenu = 0;
    const menu = page.getByRole("button", { name: "Actions sur la story 1", exact: true });
    if (GESTES.some((g) => g.menu && !visibles.has(g.nom)) && (await menu.isVisible().catch(() => false))) {
      await menu.click();
      await page.getByRole("menu").first().waitFor({ timeout: 5000 }).catch(() => {});
      for (const g of GESTES) {
        if (!g.menu || visibles.has(g.nom)) continue;
        if (await page.getByRole("menuitem", { name: g.menu, exact: true }).first().isVisible().catch(() => false)) {
          visibles.add(g.nom);
          dansLeMenu++;
        }
      }
      await page.keyboard.press("Escape");
    }
    const manquants = GESTES.filter((g) => !visibles.has(g.nom)).map((g) => g.nom);
    const ok = GESTES.length - manquants.length;
    console.log(
      `🎬 Gestes des stories (${largeur} px) : ${ok}/${GESTES.length}${dansLeMenu ? ` (dont ${dansLeMenu} dans le menu « … »)` : ""} ${manquants.length ? `🟠 manquants : ${manquants.join(", ")}` : "✅"}`,
    );
  } catch (e) {
    console.log(`🎬 Gestes des stories (${largeur} px) : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  }
}
