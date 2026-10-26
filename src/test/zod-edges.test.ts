import { describe, it, expect } from "vitest";
// Sonde lancée chaque lundi par e2e-visite/code-health.mjs (ajoutée le 26/10/2026).
import { analyser, comparer, extraireVersions, lireDepot, rapport } from "../../e2e-visite/zod-edges.mjs";

describe("sonde zod des edge functions", () => {
  it("lit les 4 formes d'import et les versions non épinglées", () => {
    expect(extraireVersions('import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";')).toEqual(["3.22.4"]);
    expect(extraireVersions('import { z } from "npm:zod@^4.6.7";')).toEqual(["4.6.7"]);
    expect(extraireVersions('import { z } from "https://esm.sh/zod@3.23.8?target=deno";')).toEqual(["3.23.8"]);
    expect(extraireVersions('import { z } from "jsr:@zod/zod@4.6.6";')).toEqual(["4.6.6"]);
    expect(extraireVersions('{ "imports": { "zod": "npm:zod" } }')).toEqual(["non épinglée"]);
    expect(extraireVersions('import { zodResolver } from "x"; // zod')).toEqual([]);
  });

  it("compare les versions au seuil 4.6.6", () => {
    expect(comparer("3.22.4", "4.6.6")).toBe(-1);
    expect(comparer("4.6.5", "4.6.6")).toBe(-1);
    expect(comparer("4.6.6", "4.6.6")).toBe(0);
    expect(comparer("4.10.0", "4.6.6")).toBe(1);
  });

  it("le dépôt du 26/10/2026 : 49 edges en 3.22.4, 1re mesure = ⚠️ sans WARN", () => {
    const res = analyser(lireDepot());
    // Tant que la migration des edges n'est pas faite ; à ajuster le jour où elles passent en v4.
    expect(res.fichiersVulnerables).toBeGreaterThan(0);
    const r = rapport(res, undefined);
    expect(r.lignes[1]).toMatch(/⚠️ \d+ fichier\(s\) sur zod < 4\.6\.6/);
    expect(r.verdict).toBe("OK");
  });

  it("stable = rappel sans WARN ; empire = WARN ; tout ≥ 4.6.6 = ✅", () => {
    const vieux = analyser([
      { fichier: "a/index.ts", contenu: '"https://deno.land/x/zod@v3.22.4/mod.ts"' },
      { fichier: "b/index.ts", contenu: '"https://deno.land/x/zod@v3.22.4/mod.ts"' },
    ]);
    const ref = { fichiersVulnerables: 2, versionsVulnerables: ["3.22.4"] };
    expect(rapport(vieux, ref).verdict).toBe("OK");
    expect(rapport(vieux, ref).lignes.join("\n")).toMatch(/connu et accepté/);

    const plus = analyser([...[0, 1, 2].map((i) => ({ fichier: `${i}.ts`, contenu: '"https://deno.land/x/zod@v3.22.4/mod.ts"' }))]);
    expect(rapport(plus, ref).verdict).toBe("WARN");

    const autreVersion = analyser([{ fichier: "c.ts", contenu: '"npm:zod@3.25.76"' }]);
    expect(rapport(autreVersion, ref).verdict).toBe("WARN");

    const neuf = analyser([{ fichier: "a.ts", contenu: '"npm:zod@4.6.7"' }]);
    const r = rapport(neuf, ref);
    expect(r.verdict).toBe("OK");
    expect(r.lignes[1]).toMatch(/✅ 4\.6\.7 \(1 fichier\) — toutes ≥ 4\.6\.6/);
    expect(r.mesure).toEqual({ fichiersVulnerables: 0, versionsVulnerables: [] });
  });
});
