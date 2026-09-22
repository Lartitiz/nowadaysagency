import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { extractTextFromFile } from "@/lib/file-extractors";

// En Node, mammoth lit `buffer` ; dans le navigateur (champ "browser" de son
// package.json) il lit `arrayBuffer`. On traduit juste l'option : le parsing XML
// (xmldom + patch) reste le vrai.
vi.mock("mammoth", async (importOriginal) => {
  const real = await importOriginal<typeof import("mammoth")>();
  return {
    ...real,
    extractRawText: (opts: { arrayBuffer: ArrayBuffer }) =>
      real.extractRawText({ buffer: Buffer.from(opts.arrayBuffer) }),
  };
});

// Garde-fou de la chaîne mammoth → @xmldom/xmldom (override + patches/mammoth@1.12.1.patch).
// Si une montée de version de xmldom casse le patch, ces tests tombent au lieu
// de l'import .docx des utilisatrices.

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function documentXml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

async function makeDocx(docXml: string, name = "test.docx"): Promise<File> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", docXml);
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new File([buf], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("extractTextFromFile — .docx (mammoth + xmldom)", () => {
  it("extrait le texte des paragraphes, accents et entités compris", async () => {
    const file = await makeDocx(
      documentXml(
        `<w:p><w:r><w:t>Bonjour, je suis coach &amp; thérapeute.</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>Deuxième paragraphe</w:t></w:r></w:p>`,
      ),
    );
    const text = await extractTextFromFile(file);
    expect(text).toContain("Bonjour, je suis coach & thérapeute.");
    expect(text).toContain("Deuxième paragraphe");
    expect(text.indexOf("Bonjour")).toBeLessThan(text.indexOf("Deuxième"));
  });

  it("rejette un document.xml mal formé au lieu de renvoyer du vide", async () => {
    const file = await makeDocx(documentXml(`<w:p><w:r><w:t>pas fermé</w:r></w:p>`));
    await expect(extractTextFromFile(file)).rejects.toThrow(/tag mismatch/);
  });
});
