import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeImpact, diffSnapshots, FORMAT_BRIEF_FILES, formatReport, FUNCTION_LABELS, parseSnapshots, zoneOf } from "../../scripts/impact-creation.mjs";

// Rapport d'impact « création de contenu » (lot 4, 13/10/2026) : la CI dit
// quels formats une modification peut toucher et quels prompts figés changent.

const usage = new Map<string, Set<string>>([
  ["redac-gate", new Set(["creative-flow", "linkedin-ai", "pinterest-ai", "ai-text-action", "engagement-insight", "cron-health"])],
  ["anthropic", new Set(["creative-flow", "carousel-ai", "generate-content", "admin-users"])],
  ["story-formatting", new Set(["creative-flow"])],
]);

const snap = (entries: Record<string, string>) =>
  "export const snapshot = {};\n\n" +
  Object.entries(entries).map(([k, v]) => `snapshot[\`${k} 1\`] = \`\n${v}\n\`;\n`).join("\n");

describe("rapport d'impact création de contenu", () => {
  it("un fichier de format ne touche que ce format", () => {
    const { formats, shared } = analyzeImpact(["supabase/functions/creative-flow/formats/linkedin.ts"], usage);
    expect([...formats.keys()]).toEqual(["Post LinkedIn"]);
    expect(shared).toEqual([]);
  });

  it("index.ts ou shared.ts de creative-flow touche tous ses formats", () => {
    const { formats } = analyzeImpact(["supabase/functions/creative-flow/shared.ts"], usage);
    expect([...formats.keys()][0]).toMatch(/^Tous les formats de creative-flow/);
  });

  it("un module partagé de la chaîne de relecture remonte chaque générateur touché, pas les autres fonctions", () => {
    const { formats, shared } = analyzeImpact(["supabase/functions/_shared/redac-gate.ts"], usage);
    expect(shared[0]).toMatchObject({ module: "redac-gate", zone: "orange" });
    expect(shared[0].functions).toContain("cron-health");
    expect(shared[0].content).not.toContain("cron-health");
    const labels = [...formats.keys()];
    expect(labels).toContain("LinkedIn : profil, crosspost, légende de carrousel");
    expect(labels).toContain("Menu IA sur sélection de texte");
    expect(labels.some((l) => l.startsWith("Tous les formats de creative-flow"))).toBe(true);
  });

  it("un module de la zone rouge tient en une ligne", () => {
    const { formats } = analyzeImpact(["supabase/functions/_shared/anthropic.ts"], usage);
    expect([...formats.keys()]).toEqual(["Tous les générateurs de contenu"]);
    expect(zoneOf("anthropic")).toBe("rouge");
    expect(zoneOf("story-formatting")).toBe("verte");
  });

  it("un sous-module de _shared garde la zone de son module d'origine", () => {
    expect(zoneOf("redac-gate/numbers")).toBe("orange");
    expect(zoneOf("socle/regles")).toBe("rouge");
    expect(zoneOf("format-briefs/reel")).toBe("verte");
    // Préfixe commun mais module différent : pas de confusion.
    expect(zoneOf("audience-address-pass")).toBe("orange");
    const { shared } = analyzeImpact(["supabase/functions/_shared/redac-gate/numbers.ts"],
      new Map([["redac-gate/numbers", new Set(["creative-flow", "linkedin-ai"])]]));
    expect(shared[0]).toMatchObject({ module: "redac-gate/numbers", zone: "orange" });
  });

  it("ignore les tests et les fichiers sans rapport avec la création de contenu", () => {
    const { formats, shared } = analyzeImpact([
      "supabase/functions/creative-flow/index_test.ts",
      "supabase/functions/creative-flow/__snapshots__/prompts_snapshot_test.ts.snap",
      "supabase/functions/stripe-webhook/index.ts",
      "src/pages/Abonnement.tsx",
    ], usage);
    expect(formats.size).toBe(0);
    expect(shared).toEqual([]);
  });

  it("reconnaît les écrans du parcours /creer", () => {
    const { formats } = analyzeImpact(["src/components/creer/formatRenderers/StoryResult.tsx", "src/pages/CreerUnifie.tsx"], usage);
    expect([...formats.keys()].sort()).toEqual(["Parcours /creer (tous formats)", "Écran de résultat : Story"]);
  });

  it("nomme les fonctions de design et de vidéo (lot 9)", () => {
    const { formats } = analyzeImpact([
      "supabase/functions/visual-studio/index.ts",
      "supabase/functions/visual-direction-suggest/index.ts",
      "supabase/functions/studio-video/higgsfield.ts",
    ], usage);
    expect([...formats.keys()].sort()).toEqual([
      "Charte : direction photo et vidéo suggérée",
      "Studio vidéo",
      "Studio visuel : images et retouches photo",
    ]);
  });

  it("chaque fonction de création de contenu a une étiquette lisible", () => {
    for (const fn of ["visual-studio", "visual-direction-suggest", "studio-video", "carousel-visual", "carousel-slide-image", "pinterest-visual"]) {
      expect(FUNCTION_LABELS[fn], fn).toMatch(/\S/);
    }
  });

  it("reconnaît les fichiers front du carrousel, du reel et de l'étape « Modifier » (lot 9)", () => {
    const cases: [string, string][] = [
      ["src/hooks/use-generate-visuals.ts", "Carrousels : lancement de la mise en forme visuelle"],
      ["src/lib/carousel-editor.ts", "Carrousels : éditeur visuel"],
      ["src/components/creer/CarouselEditor.tsx", "Carrousels : éditeur visuel"],
      ["src/components/creer/ReelMontage.tsx", "Reel : écran de montage"],
      ["src/features/reel-montage/types.ts", "Reel : écran de montage"],
      ["src/hooks/use-user-slides-generate.ts", "Carrousels : slides écrites par l'utilisatrice"],
      ["src/features/creer/edited-text.ts", "Parcours /creer : étape « Modifier » (tous formats)"],
      ["src/components/creer/CreerStepEdit.tsx", "Parcours /creer : étape « Modifier » (tous formats)"],
      ["src/hooks/use-regeneration-backup.ts", "Parcours /creer : filet « Régénérer » / « Changer d'angle » (tous formats)"],
    ];
    for (const [file, label] of cases) {
      const { formats } = analyzeImpact([file], usage);
      expect([...formats.keys()], file).toEqual([label]);
      expect([...formats.get(label)!][0]).toBe(`\`${file}\` modifié`);
    }
  });

  it("reconnaît les morceaux sortis de CreerUnifie (lot B)", () => {
    for (const file of [
      "src/components/creer/LowCreditsBanner.tsx",
      "src/components/creer/PhotoMissingDialog.tsx",
      "src/components/creer/ConfirmResetDialog.tsx",
    ]) {
      const { formats } = analyzeImpact([file], usage);
      expect([...formats.keys()], file).toEqual(["Parcours /creer (tous formats)"]);
    }
  });

  it("reconnaît les fonctions sorties de CreerUnifie (lot C)", () => {
    for (const file of [
      "src/features/creer/creer-step.ts",
      "src/features/creer/draft-conflict.ts",
      "src/features/creer/pending-stream.ts",
      "src/features/creer/edit-text-from-result.ts",
      "src/features/creer/content-brief.ts",
    ]) {
      const { formats } = analyzeImpact([file], usage);
      expect([...formats.keys()], file).toEqual(["Parcours /creer (tous formats)"]);
    }
  });

  it("reconnaît les fonctions sorties de CalendarPostDialog (fiche 13)", () => {
    for (const file of ["src/features/calendar/post-dialog-helpers.ts", "src/hooks/use-calendar-post-navigation.ts"]) {
      const { formats } = analyzeImpact([file], usage);
      expect([...formats.keys()], file).toEqual(["Lien calendrier → générateur"]);
    }
  });

  it("reconnaît les morceaux sortis de use-content-generator (fiche 17)", () => {
    for (const file of [
      "src/features/creer/generator/types.ts",
      "src/features/creer/generator/tolerant-json.ts",
      "src/features/creer/generator/error-messages.ts",
    ]) {
      const { formats } = analyzeImpact([file], usage);
      expect([...formats.keys()], file).toEqual(["Parcours /creer : lancement des générations (tous formats)"]);
    }
  });

  it("reconnaît les exports sortis de CreerUnifie (lot D)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-creer-exports.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("reconnaît la séquence de lancement sortie de CreerUnifie (lot E)", () => {
    for (const file of ["src/hooks/use-launch-sequence.ts", "src/components/creer/LaunchSequenceResults.tsx"]) {
      const { formats } = analyzeImpact([file], usage);
      expect([...formats.keys()], file).toEqual(["Parcours /creer (tous formats)"]);
    }
  });

  it("reconnaît les angles du reel sortis de CreerUnifie (lot F)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-reel-hooks.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("reconnaît la vidéo du reel sortie de CreerUnifie (lot G1)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-reel-artifact.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("reconnaît la publication sortie de CreerUnifie (lot G2)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-creer-publish.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("reconnaît les photos sorties de CreerUnifie (lot H)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-creer-photos.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("reconnaît la sauvegarde locale sortie de CreerUnifie (lot I)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-creer-flow-persistence.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("reconnaît l'arrivée sur /creer sortie de CreerUnifie (lot J)", () => {
    const { formats } = analyzeImpact(["src/hooks/use-creer-entry-init.ts"], usage);
    expect([...formats.keys()]).toEqual(["Parcours /creer (tous formats)"]);
  });

  it("les tests de ces fichiers front ne déclenchent rien", () => {
    const { formats } = analyzeImpact(["src/test/use-generate-visuals.test.ts", "src/components/creer/CarouselEditor.test.tsx"], usage);
    expect(formats.size).toBe(0);
  });

  it("lit les entrées d'un .snap et repère celles qui changent", () => {
    const before = snap({ "generate — post Instagram": "consigne A", "generate — stories": "consigne S", "ancien": "x" });
    const after = snap({ "generate — post Instagram": "consigne A modifiée", "generate — stories": "consigne S", "nouveau": "y" });
    expect([...parseSnapshots(before).keys()]).toEqual(["generate — post Instagram", "generate — stories", "ancien"]);
    expect(diffSnapshots(before, after)).toEqual({ added: ["nouveau"], removed: ["ancien"], changed: ["generate — post Instagram"] });
  });

  it("le rapport nomme le prompt modifié et rappelle la règle", () => {
    const impact = analyzeImpact(["supabase/functions/_shared/story-formatting.ts"], usage);
    const report = formatReport(impact, [{ file: "creative-flow/__snapshots__/x.snap", added: [], removed: [], changed: ["generate — stories"] }]);
    expect(report).toContain("🟢 `_shared/story-formatting.ts` (zone verte)");
    expect(report).toContain("modifié : `creative-flow/__snapshots__/x.snap` › generate — stories");
    expect(report).toContain("corrige le code, pas le snapshot");
  });

  it("dit clairement quand rien n'est touché", () => {
    expect(formatReport(analyzeImpact(["README.md"], usage), [])).toContain("Aucun générateur de contenu touché.");
  });

  it("un brief de _shared/format-briefs/ ne remonte que son format", () => {
    const briefUsage = new Map<string, Set<string>>([
      ["format-briefs", new Set(["creative-flow"])],
      ["format-briefs/reel", new Set(["creative-flow"])],
      ["format-briefs/common", new Set(["creative-flow"])],
    ]);
    const reel = analyzeImpact(["supabase/functions/_shared/format-briefs/reel.ts"], briefUsage);
    expect([...reel.formats.keys()]).toEqual(["Reel"]);
    expect(reel.shared[0]).toMatchObject({ module: "format-briefs/reel", zone: "verte" });
    const common = analyzeImpact(["supabase/functions/_shared/format-briefs/common.ts"], briefUsage);
    expect([...common.formats.keys()].sort()).toEqual(["Reel", "Stories"]);
    // Le sommaire (réexports) garde la règle générale : tous les formats de creative-flow.
    const sommaire = analyzeImpact(["supabase/functions/_shared/format-briefs.ts"], briefUsage);
    expect([...sommaire.formats.keys()][0]).toMatch(/^Tous les formats de creative-flow/);
  });

  it("chaque fichier de _shared/format-briefs/ a son libellé dans FORMAT_BRIEF_FILES", () => {
    const modules = fs.readdirSync("supabase/functions/_shared/format-briefs")
      .filter((f) => f.endsWith(".ts") && !f.endsWith("_test.ts"))
      .map((f) => `format-briefs/${f.slice(0, -3)}`);
    expect(modules.length).toBeGreaterThan(0);
    for (const mod of modules) expect(FORMAT_BRIEF_FILES[mod], mod).toBeDefined();
  });
});
