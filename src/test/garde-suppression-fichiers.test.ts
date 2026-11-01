import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { comparer, compter, inventaire } from "../../scripts/garde-suppression-fichiers.mjs";
import liste from "../../scripts/garde-suppression-fichiers.json";

const lancerSur = (fichier: string, contenu: string) => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "garde-"));
  fs.mkdirSync(path.dirname(path.join(racine, fichier)), { recursive: true });
  fs.writeFileSync(path.join(racine, fichier), contenu);
  const r = spawnSync("node", ["scripts/garde-suppression-fichiers.mjs", "--racine", racine], { encoding: "utf8" });
  fs.rmSync(racine, { recursive: true });
  return r;
};

describe("garde suppression de fichiers", () => {
  it("compte les effacements du storage, pas ceux des commentaires ni du DOM", () => {
    const code = `
      // supabase.storage.from("x").remove([p])  ← commentaire, ignoré
      await supabase.storage.from("photos").remove([a]);
      await supabase.storage
        .from(bucket)
        .remove(paths);
      el.remove();
    `;
    const motifs = [/storage\s*\.\s*from\([^)]*\)\s*\.\s*remove\s*\(/g];
    expect(compter(code, motifs)).toBe(2);
  });

  it("signale un fichier non validé et une hausse d'occurrences", () => {
    const valide = { "a.ts": { occurrences: 1, raison: "x" } };
    expect(comparer({ "a.ts": 1 }, valide)).toEqual([]);
    expect(comparer({ "a.ts": 2 }, valide)).toHaveLength(1);
    expect(comparer({ "b.ts": 1 }, valide)).toHaveLength(1);
  });

  it("le dépôt tel qu'il est passe : chaque effacement est validé, avec sa raison", () => {
    expect(comparer(inventaire(), liste.valides)).toEqual([]);
    for (const [fichier, v] of Object.entries(liste.valides)) expect(v.raison.length, fichier).toBeGreaterThan(20);
  });

  it("un nouvel effacement non déclaré fait échouer le script lancé par la CI", () => {
    const r = lancerSur("src/nouveau.ts", 'await supabase.storage.from("user-photos").remove([p]);\n');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("src/nouveau.ts");
  });

  it("voit aussi les migrations de Lovable et un bucket gardé dans une variable", () => {
    expect(lancerSur("drizzle/migrations/0099_x.sql", "DELETE FROM storage.objects WHERE true;\n").status).toBe(1);
    expect(lancerSur("src/alias.ts", 'const photosBucket = supabase.storage.from("x");\nawait photosBucket.remove([p]);\n').status).toBe(1);
  });

  it("laisse passer un dossier sans effacement, et i-- ne cache pas la ligne", () => {
    expect(lancerSur("src/sain.ts", "el.remove();\n").status).toBe(0);
    expect(lancerSur("src/piege.ts", 'i--; await supabase.storage.from("x").remove([p]);\n').status).toBe(1);
  });
});
