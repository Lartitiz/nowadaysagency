import { test, expect } from "@playwright/test";
import { detectClipped } from "./detect-clipped";

/**
 * Auto-test de la sonde « contenu coupé ».
 *
 * Une sonde ne vaut que si elle attrape le bug qu'elle prétend surveiller. On
 * FABRIQUE donc le bug du 01/08 — la case du calendrier plafonnée en CSS sous
 * la hauteur de son contenu — et on vérifie que le détecteur le voit. Puis on
 * vérifie l'inverse : les coupes VOLONTAIRES ne doivent jamais crier au loup,
 * sinon la sonde devient du bruit et personne ne la lit.
 */

async function poser(page: import("@playwright/test").Page, html: string) {
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
}

test("voit une case dont le contenu déborde sous un plafond CSS (le bug du calendrier)", async ({ page }) => {
  // Reproduction fidèle de la case réelle : padding 6px, ligne du numéro de jour,
  // 3 cartes de contenu, bouton « +N autres » — le tout plafonné à 150px.
  await poser(page, `
    <div id="case" style="width:200px;min-height:110px;max-height:150px;overflow:hidden;padding:6px;border:1px solid #ccc">
      <div style="height:18px">15</div>
      <div style="height:46px">Les 3 erreurs qui font que les solopreneurs…</div>
      <div style="height:46px">Les 3 erreurs qui font que les solopreneurs…</div>
      <div style="height:46px">Les 3 erreurs qui font que les solopreneurs…</div>
      <button style="height:18px">+6 autres</button>
    </div>
  `);
  const found = await page.evaluate(detectClipped);
  expect(found.length).toBeGreaterThan(0);
  expect(found[0].hiddenPx).toBeGreaterThan(16);
  expect(found[0].sample).toContain("Les 3 erreurs");
});

test("se tait quand la case grandit avec son contenu (l'état corrigé)", async ({ page }) => {
  await poser(page, `
    <div id="case" style="width:200px;min-height:110px;padding:6px;border:1px solid #ccc">
      <div style="height:18px">15</div>
      <div style="height:46px">Les 3 erreurs qui font que les solopreneurs…</div>
      <div style="height:46px">Les 3 erreurs qui font que les solopreneurs…</div>
      <div style="height:46px">Les 3 erreurs qui font que les solopreneurs…</div>
      <button style="height:18px">+6 autres</button>
    </div>
  `);
  expect(await page.evaluate(detectClipped)).toEqual([]);
});

test("ignore les coupes VOLONTAIRES (line-clamp, ellipsis, zone scrollable)", async ({ page }) => {
  await poser(page, `
    <div style="width:220px;height:60px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">
      Un texte volontairement tronqué à deux lignes, qui continue bien au-delà de ce que la boîte peut montrer, encore et encore.
    </div>
    <div style="width:220px;height:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      Un titre tronqué en points de suspension parce qu'il est trop long pour sa colonne.
    </div>
    <div style="width:220px;height:60px;overflow-y:auto">
      <div style="height:400px">Une zone qui DÉFILE : rien n'est perdu, on peut tout atteindre.</div>
    </div>
  `);
  expect(await page.evaluate(detectClipped)).toEqual([]);
});

test("ignore une coupe d'un ou deux pixels (arrondi de rendu, pas un bug)", async ({ page }) => {
  await poser(page, `
    <div style="width:200px;height:60px;overflow:hidden">
      <div style="height:68px">Un contenu qui dépasse de 8px à peine.</div>
    </div>
  `);
  expect(await page.evaluate(detectClipped)).toEqual([]);
});

test("ignore ce qui est masqué (display:none, opacity:0)", async ({ page }) => {
  await poser(page, `
    <div style="display:none;width:200px;height:60px;overflow:hidden"><div style="height:300px">caché</div></div>
    <div style="opacity:0;width:200px;height:60px;overflow:hidden"><div style="height:300px">transparent</div></div>
  `);
  expect(await page.evaluate(detectClipped)).toEqual([]);
});
