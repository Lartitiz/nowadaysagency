/**
 * Sonde des gestes des stories (chantier 4, PR #1865, 12/11/2026, accord de Laetitia).
 *
 * Appelée à la fin des contenus figés « story » (rejoués chaque matin sans crédit).
 * Elle ne clique sur aucun geste (rien n'est modifié) et n'échoue jamais : elle écrit
 * une ligne lue par la visite du matin (consigne 7duodecies) :
 *   🎬 Gestes des stories (1440 px) : 6/6 ✅
 *
 * Pourquoi : les tests CI (`story-result-sequence-gestures`) vérifient le code, mais
 * rien ne regardait si ces boutons sont bien affichés EN LIGNE (une retouche Lovable
 * de StoryResult.tsx peut les faire disparaître sans casser la CI).
 */
import type { Page } from "@playwright/test";

const GESTES: { nom: string; role: "button" | "group"; name: string }[] = [
  { nom: "Dupliquer", role: "button", name: "Dupliquer la story 1" },
  { nom: "Après", role: "button", name: "Placer la story 1 après la story 2" },
  { nom: "Ajouter", role: "button", name: "Ajouter une story après la story 1" },
  { nom: "Taille", role: "group", name: "Taille du texte" },
  { nom: "Grand", role: "button", name: "Grand" },
  { nom: "Refaire", role: "button", name: "Refaire cette story (story 1)" },
];

export async function sondeGestesStories(page: Page) {
  const largeur = page.viewportSize()?.width ?? "?";
  try {
    const tab = page.getByRole("button", { name: "Voir la story 1" });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await page.waitForTimeout(500);
    const manquants: string[] = [];
    for (const g of GESTES) {
      const visible = await page.getByRole(g.role, { name: g.name, exact: true }).first().isVisible().catch(() => false);
      if (!visible) manquants.push(g.nom);
    }
    const ok = GESTES.length - manquants.length;
    console.log(
      `🎬 Gestes des stories (${largeur} px) : ${ok}/${GESTES.length} ${manquants.length ? `🟠 manquants : ${manquants.join(", ")}` : "✅"}`,
    );
  } catch (e) {
    console.log(`🎬 Gestes des stories (${largeur} px) : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  }
}
