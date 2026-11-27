import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMAT_SHEETS, type OuiNon } from "@/features/creer/format-sheets";
import { SUPPORTED_FORMATS, type SupportedFormat } from "@/lib/format-normalizer";
import { POST_CLOUD_FORMATS } from "@/hooks/use-post-cloud";

/* La fiche par format (src/features/creer/format-sheets.ts) DÉCRIT le code.
   Ce test relit le vrai code et échoue quand une case ne dit plus la vérité.
   S'il passe au rouge après ta modification : mets la fiche du format à jour
   dans la même PR (ou corrige le code si le changement n'était pas voulu). */

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const FORMATS = [...SUPPORTED_FORMATS] as SupportedFormat[];
const withValue = (pick: (f: SupportedFormat) => boolean) => FORMATS.filter(pick).sort();

const generator = read("src/hooks/use-content-generator.ts");
const doGenerate = read("src/hooks/use-do-generate.ts");
const formatNext = read("src/hooks/use-format-next.ts");
const pinterest = read("src/features/creer/pinterest-generation.ts");
const creativeFlow = read("supabase/functions/creative-flow/index.ts");
const socle = read("supabase/functions/_shared/socle.ts");

/** Corps d'un `case "<format>": { … }` du switch de generate(). */
function caseBlock(format: string): string {
  const start = generator.indexOf(`case "${format}": {`);
  if (start < 0) return "";
  const end = generator.indexOf("break;", start);
  return generator.slice(start, end);
}

describe("La fiche par format dit la vérité sur le code", () => {
  it("une fiche pour chaque format de /creer, et aucune en trop", () => {
    expect(Object.keys(FORMAT_SHEETS).sort()).toEqual([...FORMATS].sort());
  });

  it("un « non » ou un « en partie » a toujours sa raison écrite", () => {
    for (const f of FORMATS) {
      const s = FORMAT_SHEETS[f];
      const cases: [string, OuiNon][] = [["filDeLeau", s.filDeLeau], ["enregistreSeul", s.enregistreSeul]];
      for (const [nom, c] of cases) {
        const texte = "detail" in c ? c.detail : c.raison;
        expect(texte.trim().length, `${f}.${nom}`).toBeGreaterThan(15);
      }
      if ("raison" in s.questions) expect(s.questions.raison.trim().length, `${f}.questions`).toBeGreaterThan(15);
      else expect(s.questions.fonction, `${f}.questions`).toBeTruthy();
      if (s.socle.formats.length === 0) expect((s.socle.raison || "").trim().length, `${f}.socle`).toBeGreaterThan(15);
    }
  });

  it("questions : le carrousel passe par carousel-ai, les autres par creative-flow", () => {
    expect(generator).toMatch(/if \(format === "carousel"\) \{[\s\S]{0,200}invokeWithTimeout\("carousel-ai"/);
    expect(generator).toMatch(/buildQuestionsRequest\(params, requestCtx\);\s*const res = await invokeWithTimeout\("creative-flow"/);
    expect(withValue((f) => FORMAT_SHEETS[f].questions.fonction === "carousel-ai")).toEqual(["carousel"]);
    // Seul format sans étape questions : l'inspiration Pinterest (analyse de l'épingle à la place).
    expect(formatNext).toMatch(/format === "pinterest_inspiration"[\s\S]{0,900}setStep\("inspiration_proposals"\)/);
    expect(withValue((f) => FORMAT_SHEETS[f].questions.fonction === null)).toEqual(["pinterest_inspiration"]);
  });

  it("écriture en flux de texte : exactement les formats de `textFormats` (use-do-generate)", () => {
    const m = doGenerate.match(/const textFormats = \[([^\]]+)\]/);
    expect(m, "liste textFormats introuvable dans use-do-generate.ts").toBeTruthy();
    const textFormats = [...m![1].matchAll(/"([\w-]+)"/g)].map((x) => x[1]).sort();
    expect(withValue((f) => FORMAT_SHEETS[f].ecriture.appel === "texte")).toEqual(textFormats);
    for (const f of textFormats) expect(FORMAT_SHEETS[f as SupportedFormat].ecriture.fonction).toBe("creative-flow");
  });

  it("écriture avec signaux de vie : les formats dont generate() appelle invokeWithHeartbeat", () => {
    const signaux = withValue((f) => FORMAT_SHEETS[f].ecriture.appel === "signaux");
    expect(signaux).toEqual(["carousel", "reel", "story"]);
    for (const f of signaux) {
      const block = caseBlock(f);
      expect(block, `case "${f}" de generate()`).toContain(`invokeWithHeartbeat("${FORMAT_SHEETS[f].ecriture.fonction}"`);
    }
  });

  it("écriture d'un bloc : les trois épingles Pinterest à part, chacune sur sa fonction", () => {
    expect(withValue((f) => FORMAT_SHEETS[f].ecriture.appel === "bloc")).toEqual(["pinterest_inspiration", "pinterest_photo", "pinterest_visual"]);
    expect(pinterest).toContain("invokeWithTimeout(edgeName");
    expect(pinterest).toContain('edgeName: "pinterest-visual"');
    expect(pinterest).toContain('edgeName: "pinterest-photo-brief"');
    expect(formatNext).toContain('invokeWithTimeout("pinterest-inspiration"');
    expect(FORMAT_SHEETS.pinterest_visual.ecriture.fonction).toBe("pinterest-visual");
    expect(FORMAT_SHEETS.pinterest_photo.ecriture.fonction).toBe("pinterest-photo-brief");
    expect(FORMAT_SHEETS.pinterest_inspiration.ecriture.fonction).toBe("pinterest-inspiration");
  });

  it("au fil de l'eau : brouillon reçu pour carrousel, reel, stories ; texte pour post et Pinterest ; deux passes sinon", () => {
    const brouillon: Record<string, string> = { carousel: "setDraftSlides(", reel: "setReelDraft(", story: "setStoryDraft(" };
    for (const [f, setter] of Object.entries(brouillon)) {
      const block = caseBlock(f);
      // Le brouillon est bien lu dans l'évènement `draft` envoyé par le serveur.
      expect(block.slice(block.indexOf('stage === "draft"')), `brouillon du format ${f}`).toContain(setter);
      expect(block, `évènement draft du format ${f}`).toContain('stage === "draft"');
      expect(FORMAT_SHEETS[f as SupportedFormat].filDeLeau.etat).toBe("oui");
    }
    // Côté serveur, LinkedIn et newsletter partent en deux passes (étapes seulement) ;
    // le reste des formats texte s'écrit mot à mot (streamDefaultPostSSE).
    expect(creativeFlow).toMatch(/if \(isLinkedIn\) \{\s*return runWithHeartbeatSSE\([^\n]*runLinkedInTwoStep/);
    expect(creativeFlow).toMatch(/if \(isNewsletter\) \{\s*return runWithHeartbeatSSE\([^\n]*runNewsletterTwoStep/);
    expect(creativeFlow).toContain("return streamDefaultPostSSE(");
    expect(withValue((f) => FORMAT_SHEETS[f].ecriture.appel === "texte" && FORMAT_SHEETS[f].filDeLeau.etat === "non")).toEqual(["linkedin", "newsletter"]);
    // Les épingles d'un bloc n'ont rien à montrer avant la fin.
    for (const f of withValue((x) => FORMAT_SHEETS[x].ecriture.appel === "bloc")) expect(FORMAT_SHEETS[f].filDeLeau.etat).toBe("non");
  });

  it("enregistré tout seul : carrousel, stories, reel, et les posts de POST_CLOUD_FORMATS", () => {
    expect(read("src/hooks/use-stories-cloud.ts")).toContain('selectedFormat === "story"');
    expect(read("src/hooks/use-reel-cloud.ts")).toContain('selectedFormat === "reel"');
    const attendu = ["carousel", "story", "reel", ...POST_CLOUD_FORMATS].sort();
    expect(withValue((f) => FORMAT_SHEETS[f].enregistreSeul.etat === "oui")).toEqual(attendu);
  });

  it("règles d'écriture : chaque format cité existe dans le registre du socle", () => {
    const connus = new Set([...socle.matchAll(/\bformat: "([\w]+)"/g)].map((m) => m[1]));
    expect(connus.size).toBeGreaterThan(8);
    for (const f of FORMATS) for (const s of FORMAT_SHEETS[f].socle.formats) expect(connus.has(s), `${f} → ${s}`).toBe(true);
    // Un format écrit par creative-flow ou carousel-ai est toujours couvert par le socle.
    for (const f of FORMATS) {
      const fn = FORMAT_SHEETS[f].ecriture.fonction;
      if (fn === "creative-flow" || fn === "carousel-ai") expect(FORMAT_SHEETS[f].socle.formats.length, f).toBeGreaterThan(0);
    }
  });
});
