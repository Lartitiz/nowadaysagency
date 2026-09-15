import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportFileName } from "@/lib/export-file-name";

const longBrief = "QA R1 CARROUSEL C — Je prépare un contenu en trois étapes : noter une idée, relire à voix haute, choisir le format adapté. ".repeat(4);

describe("portable export filenames", () => {
  it.each(["zip", "png", "pptx"] as const)("can save a long accented brief as %s without losing its extension", extension => {
    const directory = mkdtempSync(join(tmpdir(), "export-name-"));
    try {
      const name = exportFileName(longBrief, extension);
      expect(Buffer.byteLength(name, "utf8")).toBeLessThanOrEqual(255);
      expect(name).toMatch(new RegExp(`\\.${extension}$`));
      writeFileSync(join(directory, name), "complete exported content");
      expect(readFileSync(join(directory, name), "utf8")).toBe("complete exported content");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the byte limit even when the entire title contains accented characters", () => {
    expect(Buffer.byteLength(exportFileName("é".repeat(500), "pptx"))).toBeLessThanOrEqual(255);
  });

  it("keeps short names readable and prevents paths and reserved basenames", () => {
    expect(exportFileName("Mes idées", "zip")).toBe("Mes-idées.zip");
    expect(exportFileName("a/b:c", "png")).toBe("a-b-c.png");
    expect(exportFileName("CON", "pptx")).toBe("export-CON.pptx");
    expect(exportFileName("...", "zip")).toBe("export.zip");
  });
});
