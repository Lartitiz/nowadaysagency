import { describe, expect, it } from "vitest";
import { findOverwrites, formatReport, isReviewedMerge, meaningful, parseUnifiedDiff, prNumberOf, severityOf } from "../../scripts/garde-ecrasement.mjs";

// Garde anti-écrasement (08/10/2026) : cas réel du 06/08 sur nowadays-siteweb,
// une fusion Lovable partie d'avant la PR #39 avait effacé ses corrections.
const diff = [
  "diff --git a/src/routes/cooperative-asso.tsx b/src/routes/cooperative-asso.tsx",
  "--- a/src/routes/cooperative-asso.tsx",
  "+++ b/src/routes/cooperative-asso.tsx",
  "@@ -10,3 +10,1 @@",
  '-  const prix = "45 € par mois";',
  '-  const terme = "accompagnement complet";',
  "-  }",
  '+  const prix = "60 € par mois";',
  "@@ -40 +38,0 @@",
  '-  <p>Une ligne déplacée plus bas</p>',
  "diff --git a/src/routes/autre.tsx b/src/routes/autre.tsx",
  "--- a/src/routes/autre.tsx",
  "+++ b/src/routes/autre.tsx",
  "@@ -5,0 +5,1 @@",
  "+  <p>Une ligne déplacée plus bas</p>",
  "diff --git a/bun.lock b/bun.lock",
  "--- a/bun.lock",
  "+++ b/bun.lock",
  "@@ -1 +1 @@",
  '-    "react": "18.2.0", // ancienne version',
  '+    "react": "18.3.0",',
  "diff --git a/src/nouveau.ts b/src/nouveau.ts",
  "--- /dev/null",
  "+++ b/src/nouveau.ts",
  "@@ -0,0 +1 @@",
  "+export const x = 1;",
].join("\n");

describe("garde anti-écrasement", () => {
  it("reconnaît les PR et les fusions relues", () => {
    expect(prNumberOf("fix : corrige les prix (#39)")).toBe(39);
    expect(prNumberOf("Changes")).toBeNull();
    expect(isReviewedMerge("Merge pull request #1214 from Lartitiz/feat/x")).toBe(true);
    expect(isReviewedMerge("Merge remote-tracking branch 'origin/main' into feat/x")).toBe(true);
    expect(isReviewedMerge("Publié article prospection éthique")).toBe(false);
  });

  it("lit les lignes supprimées avec leur numéro d'avant, ignore les fichiers créés", () => {
    const files = parseUnifiedDiff(diff);
    expect(files.map((f: any) => f.file)).toEqual(["src/routes/cooperative-asso.tsx", "src/routes/autre.tsx", "bun.lock"]);
    expect(files[0].removed.map((r: any) => r.line)).toEqual([10, 11, 12, 40]);
  });

  it("compte les lignes d'une PR récente supprimées, hors déplacements, accolades et fichiers d'outils", () => {
    const files = parseUnifiedDiff(diff);
    const findings = findOverwrites(files, {
      blameOf: (_file: string, lines: number[]) => lines.map(() => "sha-pr-39"),
      prOf: (sha: string) => (sha === "sha-pr-39" ? { number: 39, sha, title: "corrige les prix" } : null),
      minLines: 2,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].number).toBe(39);
    // prix + terme ; l'accolade, la ligne déplacée et bun.lock ne comptent pas
    expect(findings[0].lines).toBe(2);
    expect(findings[0].files[0].samples).toEqual(['const prix = "45 € par mois";', 'const terme = "accompagnement complet";']);
  });

  it("sous le seuil, ou ligne écrite hors PR récente : rien", () => {
    const files = parseUnifiedDiff(diff);
    expect(findOverwrites(files, { blameOf: (_f: string, l: number[]) => l.map(() => "x"), prOf: () => null })).toEqual([]);
    expect(findOverwrites(files, {
      blameOf: (_f: string, l: number[]) => l.map(() => "s"), prOf: () => ({ number: 1, sha: "s", title: "t" }), minLines: 3,
    })).toEqual([]);
  });

  it("gravité : écrasement si Lovable n'avait pas la PR, modification sinon ; rapport lisible", () => {
    expect(severityOf(false)).toBe("overwrite");
    expect(severityOf(true)).toBe("edit");
    expect(meaningful("  }")).toBe(false);
    expect(meaningful("const a = 1;")).toBe(true);
    const report = formatReport({ sha: "15327728abcdef", subject: "Publié article", author: "gpt-engineer-app[bot]" },
      [{ number: 39, title: "corrige les prix", lines: 2, files: [{ file: "a.tsx", samples: ["const `x` = 1"] }] }]);
    expect(report).toContain("#39");
    expect(report).toContain("15327728");
    expect(report).toContain("const 'x' = 1");
  });
});
