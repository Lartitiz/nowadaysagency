// NON-RÉGRESSION export PPTX éditable Pinterest : quand pin_data arrive avec
// une STRUCTURE incomplète (avant/après sans `side`, schéma sans élément
// `number === 0`, badge vide), le code déduit la structure au lieu de perdre
// des textes ou de laisser une zone vide. Chaque élément attendu et chaque mot
// doivent figurer dans la slide ; quand les champs sont bons, rien ne change.
import { beforeEach, describe, expect, it, vi } from "vitest";

type TextCall = { text: string; size: number | undefined; opts: Record<string, unknown> };
const calls: { texts: TextCall[] } = { texts: [] };

vi.mock("pptxgenjs", () => {
  class FakePptx {
    layout = "";
    author = "";
    defineLayout() {}
    addSlide() {
      return {
        addShape() {},
        addNotes() {},
        addText(parts: unknown, opts: Record<string, unknown>) {
          const arr = Array.isArray(parts) ? (parts as Array<{ text?: string; options?: { fontSize?: number } }>) : null;
          const text = arr ? arr.map((p) => p.text || "").join("") : String(parts);
          const size = arr ? arr[0]?.options?.fontSize : (opts.fontSize as number | undefined);
          calls.texts.push({ text, size, opts });
        },
      };
    }
    async writeFile() {}
  }
  return { default: FakePptx };
});

import {
  exportPinterestEditablePptx,
  splitBeforeAfter,
  splitSchemaCenter,
} from "@/lib/export-pinterest-editable-pptx";

const allText = () => calls.texts.map((t) => t.text).join("\n");

function expectEveryWord(...texts: string[]) {
  const all = allText();
  for (const t of texts) for (const w of t.split(/\s+/)) expect(all).toContain(w);
}

beforeEach(() => {
  calls.texts = [];
});

describe("export PPTX éditable Pinterest — structure déduite par le code", () => {
  it("avant/après SANS side : moitié avant, moitié après, aucun texte perdu", async () => {
    const elements = [
      { label: "Poster au hasard" },
      { label: "Aucun tableau défini" },
      { label: "Un calendrier éditorial" },
      { label: "Des tableaux par thème" },
    ];
    await exportPinterestEditablePptx(
      { pin_type: "avant_apres", main_title: "Ma stratégie Pinterest", elements },
      "t", "d",
    );
    expectEveryWord("Ma stratégie Pinterest", ...elements.map((e) => e.label));
    // Ordre conservé et icônes de section : 2 « avant » (❌) puis 2 « après » (✅).
    const items = calls.texts.filter((t) => /^(❌|✅) /.test(t.text)).map((t) => t.text);
    expect(items).toEqual([
      "❌ Poster au hasard",
      "❌ Aucun tableau défini",
      "✅ Un calendrier éditorial",
      "✅ Des tableaux par thème",
    ]);
  });

  it("avant/après avec side partiel : side respecté, emoji ❌/✅ utilisé, le reste réparti", () => {
    const { before, after } = splitBeforeAfter([
      { label: "a", side: "after" },
      { label: "b", emoji: "❌" },
      { label: "c" },
      { label: "d", emoji: "✅" },
    ]);
    expect(before.map((e) => e.label)).toEqual(["b"]);
    expect(after.map((e) => e.label)).toEqual(["a", "c", "d"]);
  });

  it("avant/après avec side complet : répartition de l'IA inchangée", () => {
    const els = [
      { label: "x", side: "after" as const },
      { label: "y", side: "before" as const },
      { label: "z", side: "after" as const },
    ];
    const { before, after } = splitBeforeAfter(els);
    expect(before).toEqual([els[1]]);
    expect(after).toEqual([els[0], els[2]]);
  });

  it("schéma SANS number===0 : le 1er élément devient la carte centrale, les autres en périphérie", async () => {
    const elements = [
      { number: 1, label: "Ma marque", description: "Le cœur du projet" },
      { number: 2, label: "Mes valeurs" },
      { number: 3, label: "Ma cible" },
    ];
    await exportPinterestEditablePptx(
      { pin_type: "schema_visuel", main_title: "Construire sa marque", elements },
      "t", "d",
    );
    expectEveryWord("Construire sa marque", "Le cœur du projet", ...elements.map((e) => e.label));
    // Carte centrale = libellé en 16pt ; périphériques en 11pt.
    expect(calls.texts.find((t) => t.text === "Ma marque")?.size).toBe(16);
    expect(calls.texts.find((t) => t.text === "Mes valeurs")?.size).toBe(11);
    expect(calls.texts.filter((t) => t.text === "Ma marque")).toHaveLength(1);
  });

  it("schéma avec number===0 : centre de l'IA respecté (même s'il n'est pas 1er)", () => {
    const els = [{ number: 1, label: "a" }, { number: 0, label: "centre" }, { number: 2, label: "b" }];
    const { center, peripherals } = splitSchemaCenter(els);
    expect(center?.label).toBe("centre");
    expect(peripherals.map((e) => e.label)).toEqual(["a", "b"]);
  });

  it("badge vide ou manquant : libellé du type ; badge de l'IA gardé sinon", async () => {
    await exportPinterestEditablePptx(
      { pin_type: "checklist", main_title: "Avant de publier", badge_label: "   ", elements: [{ label: "Relire le titre" }] },
      "t", "d",
    );
    expect(allText()).toContain("CHECKLIST");
    expectEveryWord("Avant de publier", "Relire le titre");

    calls.texts = [];
    await exportPinterestEditablePptx(
      { pin_type: "mini_tuto", main_title: "Mon tuto", elements: [{ label: "Étape une" }] },
      "t", "d",
    );
    expect(allText()).toContain("TUTO");

    calls.texts = [];
    await exportPinterestEditablePptx(
      { pin_type: "mini_tuto", main_title: "Mon tuto", badge_label: "Méthode", elements: [{ label: "Étape une" }] },
      "t", "d",
    );
    expect(allText()).toContain("MÉTHODE");
    expect(allText()).not.toContain("TUTO");
  });
});
