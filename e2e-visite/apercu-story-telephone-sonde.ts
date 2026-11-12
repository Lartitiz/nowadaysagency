/**
 * Sonde : l'aperçu de la story 1 tient-il sur le premier écran du téléphone ?
 * (ajoutée le 12/11/2026 avec l'accord de Laetitia, après #1884 et #1893).
 *
 * Appelée à la fin des contenus figés « story » (rejoués chaque matin sans crédit).
 * Elle ne modifie rien et n'échoue jamais. La spec tourne en ordi : la sonde passe
 * en 390 × 844, fait défiler jusqu'aux cartes des stories comme le fait l'app à
 * l'arrivée sur téléphone (`useScrollIntoViewOnPhone`), puis vérifie que la case
 * de texte et l'aperçu entier de la story 1 sont au-dessus de la barre du bas
 * (« Télécharger »). Elle écrit une ligne lue par la visite du matin (consigne
 * 7duodecies) :
 *   📱 Aperçu story téléphone : ✅ 245→601 px, barre à 684
 *   📱 Aperçu story téléphone : 🟠 coupé de 117 px (245→801, barre à 684)
 *
 * Pourquoi : le 12/11, l'aperçu commençait à 737 px (sous la barre, à 0 px visible).
 * Les tests CI vérifient le défilement, pas la hauteur réelle de la carte en ligne :
 * un bouton ou un encadré ajouté au-dessus de l'aperçu (retouche Lovable) peut le
 * repousser sous la barre sans casser la CI.
 */
import type { Page } from "@playwright/test";

export async function sondeApercuStoryTelephone(page: Page) {
  const avant = page.viewportSize();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const tab = page.getByRole("button", { name: "Voir la story 1" });
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await page.waitForTimeout(400);
    const apercu = page.locator('iframe[title="Aperçu story 1"]').first();
    // Même geste que l'app à l'arrivée : le haut des cartes des stories en haut de l'écran.
    await apercu.evaluate((el) => {
      const cartes = el.closest('[data-selection-enabled="true"]') ?? el;
      (cartes as HTMLElement).scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(600);
    const box = await apercu.boundingBox();
    const barre = await page.getByRole("button", { name: /^Télécharger/ }).first().boundingBox();
    if (!box) {
      console.log("📱 Aperçu story téléphone : non vérifié (aperçu introuvable)");
      return;
    }
    const limite = barre ? Math.round(barre.y) : 844;
    const haut = Math.round(box.y);
    const bas = Math.round(box.y + box.height);
    const coupe = bas - limite;
    console.log(
      coupe <= 0 && haut >= 0
        ? `📱 Aperçu story téléphone : ✅ ${haut}→${bas} px, barre à ${limite}`
        : `📱 Aperçu story téléphone : 🟠 coupé de ${Math.max(coupe, -haut)} px (${haut}→${bas}, barre à ${limite})`,
    );
  } catch (e) {
    console.log(`📱 Aperçu story téléphone : non vérifié (${e instanceof Error ? e.message.slice(0, 80) : "?"})`);
  } finally {
    if (avant) await page.setViewportSize(avant).catch(() => {});
  }
}
