import { describe, it, expect } from "vitest";
import { autresBatteries, lireProcessus, verdictGarde, SEUIL_BASE_LENTE_MS } from "../../e2e-visite/garde-base";

// 27/11/2026 : deux batteries en direct en même temps ont saturé la base des
// clientes. Le garde-fou doit voir l'AUTRE batterie sans se voir lui-même.

const PS = `
  100     1 /bin/zsh -c npm run visite -- playwright test --config playwright.visite.config.ts
  101   100 npm exec playwright test --config playwright.visite.config.ts --reporter=list,json
  102   101 node /x/wt-a/node_modules/.bin/playwright test --config playwright.visite.config.ts --reporter=list,json
  103   102 /usr/local/bin/node /x/wt-a/node_modules/playwright/lib/common/process.js
  200     1 npm exec playwright test -c playwright.visite.config.ts e2e-visite/carousel-photo-fond-live.spec.ts
  201   200 node /x/wt-b/node_modules/.bin/playwright test -c playwright.visite.config.ts e2e-visite/carousel-photo-fond-live.spec.ts
  300     1 node /x/node_modules/.bin/playwright test
  301     1 node /x/node_modules/.bin/vitest run
`;

describe("garde-fou de lancement des tests en direct", () => {
  const processus = lireProcessus(PS);

  it("ne se compte pas lui-même, ni ses parents, ni ses enfants", () => {
    const seul = processus.filter((p) => p.pid < 200 || p.pid >= 300);
    expect(autresBatteries(seul, 102)).toEqual([]);
  });

  it("voit l'autre batterie en direct, pas les tests locaux", () => {
    expect(autresBatteries(processus, 102).map((p) => p.pid)).toEqual([200, 201]);
    expect(autresBatteries(processus, 201).map((p) => p.pid)).toEqual([101, 102]);
  });

  it("ne prend pas pour une batterie la boucle d'attente d'une autre session (27/11/2026)", () => {
    const attente = lireProcessus(`
  37056     1 /bin/zsh -c source /u/.claude/shell-snapshots/s.sh 2>/dev/null || true && eval 'cd ~/wt-x && for i in $(seq 1 60); do pgrep -f "playwright.visite.config" >/dev/null || break; sleep 20; done; npx playwright test --config playwright.visite.config.ts --project=setup'
  57234 37056 sleep 60
  43918     1 bash -c for i in 1 2 3; do npx playwright test --config playwright.visite.config.ts --project=setup && break; sleep 60; done
  500     1 node /x/wt-c/node_modules/@playwright/test/cli.js test -c playwright.visite.config.ts e2e-visite/a.spec.ts
`);
    // Les deux boucles d'attente ne comptent pas ; la batterie qui tourne vraiment
    // (lancée par cli.js, invisible avant), si.
    expect(autresBatteries(attente, 999).map((p) => p.pid)).toEqual([500]);
    expect(autresBatteries(lireProcessus(`
  600     1 node /x/node_modules/.bin/playwright test --config playwright.visite.config.ts
`), 999).map((p) => p.pid)).toEqual([600]);
  });

  it("refuse quand une autre batterie tourne", () => {
    const refus = verdictGarde({ autres: autresBatteries(processus, 102), tempsMs: null, force: false });
    expect(refus).toMatch(/une autre batterie/);
  });

  it("refuse quand la base est lente (médiane au-dessus du seuil)", () => {
    expect(verdictGarde({ autres: [], tempsMs: [9200, 2500, 6800], force: false })).toMatch(/répond lentement/);
  });

  it("laisse passer une base normale, même avec une lecture isolée lente", () => {
    expect(verdictGarde({ autres: [], tempsMs: [180, SEUIL_BASE_LENTE_MS + 4000, 240], force: false })).toBeNull();
  });

  it("VISITE_FORCE passe outre", () => {
    expect(verdictGarde({ autres: autresBatteries(processus, 102), tempsMs: [9000, 9000, 9000], force: true })).toBeNull();
  });
});
