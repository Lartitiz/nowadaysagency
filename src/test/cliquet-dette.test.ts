import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  comparer,
  compterAny,
  compterLignes,
  estExclu,
  formaterRapport,
  mesurer,
  nouvelleReference,
} from "../../scripts/cliquet-dette.mjs";

// Cliquet anti-dette (lot G1, 14/10/2026) : la taille des gros fichiers et
// leurs `any` sont gelés dans scripts/cliquet-dette.baseline.json ; la CI
// bloque toute hausse et tout nouveau fichier de plus de 800 lignes.

const ref = (fichiers: Record<string, { lignes: number; any: number }>) => ({ seuil: 800, fichiers });

describe("cliquet anti-dette : mesures", () => {
  it("compte les lignes comme wc -l", () => {
    expect(compterLignes("")).toBe(0);
    expect(compterLignes("a\nb\n")).toBe(2);
    expect(compterLignes("a\nb")).toBe(1);
  });

  it("compte `as any` et `: any`, pas `anything` ni `company`", () => {
    const code = [
      "const a = x as any;",
      "function f(b: any, c:any[]) {}",
      "const d: anything = 1;",
      "const company = 2; // as anyway",
    ].join("\n");
    expect(compterAny(code)).toBe(3);
  });

  it("exclut tests, snapshots et types Supabase générés", () => {
    expect(estExclu("src/test/foo.test.ts")).toBe(true);
    expect(estExclu("src/components/Foo.test.tsx")).toBe(true);
    expect(estExclu("supabase/functions/carousel-ai/index_test.ts")).toBe(true);
    expect(estExclu("supabase/functions/carousel-ai/__snapshots__/prompts_snapshot_test.ts.snap")).toBe(true);
    expect(estExclu("src/integrations/supabase/types.ts")).toBe(true);
    expect(estExclu("src/pages/CreerUnifie.tsx")).toBe(false);
    expect(estExclu("supabase/functions/_shared/redac-gate.ts")).toBe(false);
  });
});

describe("cliquet anti-dette : comparaison", () => {
  it("rien ne bouge : aucune erreur", () => {
    const r = comparer(ref({ "src/a.ts": { lignes: 900, any: 3 } }), { "src/a.ts": { lignes: 900, any: 3 } });
    expect(r).toEqual({ erreurs: [], baisses: [], disparus: [] });
    expect(formaterRapport(r)).toMatch(/^✅/);
  });

  it("un fichier de la référence qui grossit fait échouer, avec la commande à lancer", () => {
    const r = comparer(ref({ "src/a.ts": { lignes: 900, any: 3 } }), { "src/a.ts": { lignes: 901, any: 3 } });
    expect(r.erreurs).toEqual([{ type: "grossit", fichier: "src/a.ts", avant: 900, apres: 901 }]);
    const msg = formaterRapport(r);
    expect(msg).toContain("src/a.ts : 900 → 901 lignes (+1)");
    expect(msg).toContain("découper");
    expect(msg).toContain("node scripts/cliquet-dette.mjs --update --accepter-hausse");
  });

  it("un `any` de plus fait échouer, même si le fichier ne grossit pas", () => {
    const r = comparer(ref({ "src/a.ts": { lignes: 900, any: 3 } }), { "src/a.ts": { lignes: 890, any: 4 } });
    expect(r.erreurs).toEqual([{ type: "any", fichier: "src/a.ts", avant: 3, apres: 4 }]);
    expect(formaterRapport(r)).toContain("3 → 4 « any »");
  });

  it("un nouveau fichier de plus de 800 lignes fait échouer ; à 800 pile, non", () => {
    const r = comparer(ref({}), { "src/neuf.ts": { lignes: 801, any: 0 }, "src/pile.ts": { lignes: 800, any: 0 } });
    expect(r.erreurs).toEqual([{ type: "nouveau", fichier: "src/neuf.ts", apres: 801 }]);
    expect(formaterRapport(r)).toContain("nouveau fichier de 801 lignes");
  });

  it("un fichier qui maigrit ne fait pas échouer et propose --update", () => {
    const r = comparer(ref({ "src/a.ts": { lignes: 900, any: 3 } }), { "src/a.ts": { lignes: 850, any: 3 } });
    expect(r.erreurs).toEqual([]);
    expect(r.baisses).toHaveLength(1);
    const msg = formaterRapport(r);
    expect(msg).toContain("node scripts/cliquet-dette.mjs --update");
    expect(msg).not.toContain("--accepter-hausse");
  });

  it("un fichier supprimé n'est pas une erreur", () => {
    const r = comparer(ref({ "src/a.ts": { lignes: 900, any: 3 } }), {});
    expect(r.erreurs).toEqual([]);
    expect(r.disparus).toEqual(["src/a.ts"]);
  });
});

describe("cliquet anti-dette : mise à jour de la référence", () => {
  const avant = ref({
    "src/maigrit.ts": { lignes: 1000, any: 5 },
    "src/grossit.ts": { lignes: 900, any: 2 },
    "src/sous-le-seuil.ts": { lignes: 850, any: 0 },
    "src/supprime.ts": { lignes: 900, any: 0 },
  });
  const mesures = {
    "src/maigrit.ts": { lignes: 950, any: 4 },
    "src/grossit.ts": { lignes: 950, any: 3 },
    "src/sous-le-seuil.ts": { lignes: 700, any: 0 },
    "src/nouveau.ts": { lignes: 1200, any: 1 },
  };

  it("--update fait seulement baisser : une hausse reste bloquée", () => {
    const apres = nouvelleReference(avant, mesures);
    expect(apres).toEqual(
      ref({
        "src/grossit.ts": { lignes: 900, any: 2 },
        "src/maigrit.ts": { lignes: 950, any: 4 },
      }),
    );
    expect(comparer(apres, mesures).erreurs.map((e) => e.fichier)).toEqual([
      "src/grossit.ts",
      "src/grossit.ts",
      "src/nouveau.ts",
    ]);
  });

  it("--update --accepter-hausse reprend l'état actuel des fichiers de plus de 800 lignes", () => {
    const apres = nouvelleReference(avant, mesures, { accepterHausse: true });
    expect(apres).toEqual(
      ref({
        "src/grossit.ts": { lignes: 950, any: 3 },
        "src/maigrit.ts": { lignes: 950, any: 4 },
        "src/nouveau.ts": { lignes: 1200, any: 1 },
      }),
    );
    expect(comparer(apres, mesures).erreurs).toEqual([]);
  });
});

describe("cliquet anti-dette : sur le disque", () => {
  let dossier: string;
  afterEach(() => dossier && fs.rmSync(dossier, { recursive: true, force: true }));

  it("mesure src/ et supabase/functions/ sans les tests ni node_modules", () => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), "cliquet-"));
    const ecrire = (f: string, texte: string) => {
      fs.mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
      fs.writeFileSync(path.join(dossier, f), texte);
    };
    ecrire("src/pages/Page.tsx", "const a = 1 as any;\n");
    ecrire("src/pages/Page.test.tsx", "x\n");
    ecrire("supabase/functions/f/index.ts", "a\nb\n");
    ecrire("supabase/functions/f/index_test.ts", "x\n");
    ecrire("supabase/functions/node_modules/dep/index.ts", "x\n");
    ecrire("src/styles.css", "x\n");
    expect(mesurer(dossier)).toEqual({
      "src/pages/Page.tsx": { lignes: 1, any: 1 },
      "supabase/functions/f/index.ts": { lignes: 2, any: 0 },
    });
  });

  it("la référence du dépôt est bien formée (la vérification elle-même est l'étape CI)", () => {
    dossier = "";
    const racine = path.resolve(__dirname, "../..");
    const reference = JSON.parse(fs.readFileSync(path.join(racine, "scripts/cliquet-dette.baseline.json"), "utf8"));
    expect(reference.seuil).toBe(800);
    const entrees = Object.entries(reference.fichiers) as [string, { lignes: number; any: number }][];
    expect(entrees.length).toBeGreaterThan(0);
    for (const [f, v] of entrees) {
      expect(estExclu(f)).toBe(false);
      expect(v.lignes).toBeGreaterThan(800);
      expect(Number.isInteger(v.any)).toBe(true);
    }
  });
});

describe("classement des gros fichiers (scripts/gros-fichiers.mjs)", () => {
  it("compte commits et corrections par fichier, Lovable « Changes » compris dans les commits", async () => {
    const { compterCommits, score } = await import("../../scripts/gros-fichiers.mjs");
    const log = [
      "@@fix(creer): bouton figé\n\nsrc/a.ts\nsrc/b.ts\n",
      "@@Changes\n\nsrc/a.ts\n",
      "@@Corrigé l'export\n\nsrc/a.ts\n",
      "@@feat: prefix des titres\n\nsrc/b.ts\n",
    ].join("");
    expect(compterCommits(log)).toEqual({
      commits: { "src/a.ts": 3, "src/b.ts": 2 },
      corrections: { "src/a.ts": 2, "src/b.ts": 1 },
    });
    expect(score({ lignes: 1000, commits: 10, corrections: 0 })).toBe(20);
    expect(score({ lignes: 1000, commits: 0, corrections: 0 })).toBe(10);
  });
});
