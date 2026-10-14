import { describe, expect, it } from "vitest";
import { comparer, compter } from "../../scripts/garde-suppression-fichiers.mjs";

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
});
