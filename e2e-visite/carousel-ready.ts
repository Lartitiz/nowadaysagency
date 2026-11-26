/**
 * Fin de création d'un carrousel (26/11/2026) : l'éditeur ne s'ouvre plus tout
 * seul. Les slides écrites restent à l'écran pendant la mise en page
 * (`carousel-ready-gate`), puis « Ton carrousel est prêt » et le bouton
 * « Ouvrir mon carrousel » (`carousel-ready-open`). Tant qu'on n'a pas cliqué,
 * ni l'éditeur ni « Publier ou programmer » ne sont à l'écran.
 *
 * `autoOpenReadyCarousel` clique ce bouton dès qu'il apparaît, comme le ferait
 * la personne. À appeler juste après avoir lancé la création, une fois par
 * création. Sans lui, un parcours qui attend l'éditeur attend pour rien.
 */
import type { Locator, Page } from "@playwright/test";

export function autoOpenReadyCarousel(page: Page, timeout = 900_000): void {
  const open = page.getByTestId("carousel-ready-open");
  void open.waitFor({ state: "visible", timeout })
    .then(() => open.click())
    .then(() => console.log("🎬 « Ton carrousel est prêt » : « Ouvrir mon carrousel » cliqué"))
    .catch(() => {});
}

/** Le texte est écrit : l'annonce de fin (création en direct) ou les actions du résultat (carrousel rouvert). */
export function carouselTextReady(page: Page): Locator {
  return page.getByTestId("carousel-ready-gate").or(page.getByTestId("publish-or-schedule")).first();
}
