/**
 * Sonde anti-écran-figé — la classe de bug « le chargement tourne sans fin »
 *
 * POURQUOI cette sonde existe (bug vécu le 23/07/2026)
 * ────────────────────────────────────────────────────
 * L'analyse de marque (/branding) restait bloquée sur son écran de chargement,
 * sans jamais afficher ni résultat ni erreur : l'edge `analyze-brand` renvoyait
 * un 404 en ~400 ms (fonction non déployée), mais un `setTimeout` non annulé
 * ré-écrasait l'état « error » par « analyzing » → spinner infini qui MASQUAIT
 * l'erreur (corrigé #631). Puis #637 a durci 2 `fetch` bruts sans minuteur.
 *
 * 🔑 LE POINT CLÉ : un chargement bloqué ne se voit JAMAIS quand tout va bien —
 * en conditions normales le serveur répond et le spinner s'arrête. Pour le
 * débusquer il faut PROVOQUER la panne (interception réseau), puis vérifier que
 * l'écran S'EN SORT. C'est la même méthode que `creer-429.spec.ts` (qui force un
 * 429 sur /creer), généralisée à tout le périmètre.
 *
 * Zéro crédit : les appels sont interceptés côté navigateur et n'atteignent
 * jamais le serveur — aucune génération IA n'est consommée.
 *
 * DEUX MODES, deux bugs différents
 * ────────────────────────────────
 * 1. QUOTIDIEN — « le serveur répond NON tout de suite » (500 immédiat).
 *    Attrape la famille #631 : l'erreur revient mais l'écran reste en chargement.
 *    Règle testée : un écran dont le serveur tombe doit finir par montrer
 *    quelque chose (erreur/vide/contenu) — jamais tourner dans le vide.
 *
 * 2. LUNDI — « le serveur ne répond JAMAIS » (requête suspendue).
 *    Attrape la famille #637 : `fetch` brut sans AbortController → attente
 *    infinie. Réservé aux flux qu'on a explicitement équipés d'un minuteur de
 *    sécurité, dont c'est le test de non-régression. NB : on ne l'applique PAS
 *    aux écrans react-query (pas de timeout global côté client — l'exiger
 *    partout produirait des rouges non actionnables).
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";
import { ECRANS } from "./ecrans";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots");

// Appels de DONNÉES uniquement. On ne touche JAMAIS /auth/ : casser
// l'authentification ferait sortir de session et produirait un faux rouge.
const DATA_CALLS = /\/rest\/v1\/|\/functions\/v1\//;

// Indicateurs de chargement RÉELLEMENT utilisés dans l'app (inventaire 23/07) :
//  - `animate-bounce-dot` : LE loader plein écran (3 points) de `SuspenseFallback`
//    (App.tsx) et `ProtectedRoute` — c'est celui qu'on voit sur une page bloquée.
//  - `animate-spin` : les <Loader2/> (139 fichiers), boutons et panneaux.
//  - `animate-pulse` : les squelettes (42 fichiers).
// `aria-busy` n'est utilisé nulle part → inutile de le cibler.
// EXCLUS volontairement (faux positifs vérifiés le 23/07) :
//  - `[role=progressbar]` : c'est le composant <Progress> shadcn, utilisé pour des
//    progressions de CONTENU (« Tes premiers pas 0/6 » sur le dashboard), pas
//    pour un chargement → il faisait rougir un dashboard pourtant parfaitement
//    géré (bandeau « Impossible de charger… » + Réessayer).
//  - `pulse-subtle` : animation décorative.
// `:visible` = on ignore ce qui est monté mais caché.
// ⚠️ Ne PAS retirer `animate-bounce-dot` : sans lui la sonde est un vert menteur
// (vérifié le 23/07 — un dashboard totalement figé passait au vert).
const EN_CHARGEMENT =
  ".animate-bounce-dot:visible, .animate-spin:visible, .animate-pulse:visible";

// react-query est configuré en `retry: 1` (src/App.tsx) → l'échec est établi
// vite (1 seule nouvelle tentative, pas de long backoff).
// 30 s = marge volontairement large contre l'intermittence : le sondage s'arrête
// DÈS que le chargement disparaît, donc un délai long ne coûte rien sur les
// écrans sains (~2 s chacun) — il ne pèse que sur un vrai blocage. Calibré le
// 23/07 après un faux rouge sur `dashboard-complet` (lent seulement quand les
// tests s'enchaînent ; vert en 3,5 s lancé seul).
const DELAI_SORTIE_MS = 30_000;

// ─────────────────────────────────────────────────────────────────────────────
// MODE 1 — QUOTIDIEN : le serveur répond « non » immédiatement
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Sonde anti-écran-figé — serveur en erreur", () => {
  for (const ecran of ECRANS) {
    test(`${ecran.slug} : erreur serveur = l'écran s'en sort, pas de chargement sans fin`, async ({
      page,
      viewport,
    }) => {
      test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement");

      await page.route(DATA_CALLS, (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "panne simulée (sonde écran figé)" }),
        }),
      );

      await page.goto(ecran.url, { waitUntil: "domcontentloaded" });

      // L'écran a le droit d'afficher un chargement au début : on ne juge que
      // sa CAPACITÉ À EN SORTIR dans un délai borné.
      try {
        await expect
          .poll(() => page.locator(EN_CHARGEMENT).count(), { timeout: DELAI_SORTIE_MS })
          .toBe(0);
      } catch {
        // Rouge actionnable : on dit CE QUI reste en chargement, avec une capture.
        const details = await page
          .locator(EN_CHARGEMENT)
          .evaluateAll((els) =>
            els.slice(0, 5).map((el) => {
              const cls = typeof el.className === "string" ? el.className : "";
              return `<${el.tagName.toLowerCase()} class="${cls.slice(0, 70)}"> ${(el.textContent || "").trim().slice(0, 50)}`;
            }),
          );
        await page.screenshot({
          path: path.join(SHOTS, `ecran-fige-${ecran.slug}.png`),
          fullPage: true,
        });
        throw new Error(
          `ÉCRAN FIGÉ — ${ecran.slug} (${ecran.url}) : le serveur a répondu 500 mais un chargement tourne encore après ${DELAI_SORTIE_MS / 1000}s.\n` +
            `L'utilisatrice voit un spinner sans fin au lieu d'un message d'erreur.\n` +
            `Éléments encore en chargement :\n  - ${details.join("\n  - ")}`,
        );
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MODE 2 — LUNDI : le serveur ne répond JAMAIS (non-régression des minuteurs)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Sonde anti-écran-figé — serveur muet (minuteurs de sécurité)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("mini-diagnostic landing : serveur muet → résultat de secours grâce au minuteur 30 s", async ({
    page,
    viewport,
  }) => {
    const isMonday = new Date().getDay() === 1;
    test.skip(
      !isMonday && !process.env.FORCE_ECRAN_FIGE_MUET,
      "lundi uniquement (il faut attendre le minuteur ~30 s)",
    );
    test.skip((viewport?.width ?? 0) < 1024, "desktop uniquement");
    test.setTimeout(120_000);

    // Serveur muet : on n'appelle NI fulfill NI continue → la requête reste
    // suspendue, exactement comme un réseau qui « pend ». Sans le garde-fou
    // AbortController de #637, la phase resterait "loading" indéfiniment.
    await page.route("**/functions/v1/mini-audit-instagram", () => {
      /* jamais de réponse : c'est le but */
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const champ = page.getByPlaceholder("ton_compte_instagram");
    await expect(champ).toBeVisible({ timeout: 20_000 });
    await champ.fill("nowadaysagency");
    await champ.press("Enter");

    // Le minuteur (30 s) doit abandonner l'appel → le catch affiche le
    // résultat de secours. Sans lui : spinner infini sur la landing publique.
    await expect(page.getByText(/Ton profil mérite un vrai diagnostic/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  // 🕳️ À étendre : `SharedCalendarPage` a aussi un minuteur (20 s, #637) mais son
  // test demande un token de partage valide — à ajouter quand une fixture de
  // partage existera dans le harnais.
});
