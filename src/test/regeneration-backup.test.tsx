import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

// Lot 6 « robustesse création de contenu » (14/10/2026) : « Régénérer » et
// « Changer d'angle » ne doivent plus jamais effacer la version retouchée.
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { regenerationOutcome, useRegenerationBackup } from "@/hooks/use-regeneration-backup";

const ancienne = { type: "post", raw: { content: "Version IA", edited_text: "Ma version retouchée" } };
const snapshot = { result: ancienne, visualSlides: [{ slide_number: 1, html: "<div>1</div>" }], editContent: "Ma version retouchée" };

describe("décision après une régénération", () => {
  const base = { started: true, busy: false, previousResult: ancienne, step: "result" };
  it("attend tant que l'IA travaille ou que rien n'a démarré", () => {
    expect(regenerationOutcome({ ...base, busy: true, result: null })).toBe("waiting");
    expect(regenerationOutcome({ ...base, started: false, result: ancienne })).toBe("waiting");
  });
  it("échec : étape résultat vide, ou renvoi à l'étape format", () => {
    expect(regenerationOutcome({ ...base, result: null })).toBe("failed");
    expect(regenerationOutcome({ ...base, result: null, step: "format" })).toBe("failed");
  });
  it("succès : un nouveau résultat", () => {
    expect(regenerationOutcome({ ...base, result: { raw: { content: "Nouvelle" } } })).toBe("succeeded");
  });
  it("étape intermédiaire (structure, hook) : on attend", () => {
    expect(regenerationOutcome({ ...base, result: null, step: "structure_review" })).toBe("waiting");
    expect(regenerationOutcome({ ...base, result: null, step: "hook_selection" })).toBe("waiting");
  });
  it("repartie de zéro : la sauvegarde est abandonnée", () => {
    expect(regenerationOutcome({ ...base, result: null, step: "idea" })).toBe("abandoned");
  });
});

describe("useRegenerationBackup", () => {
  beforeEach(() => { toast.mockClear(); toast.success.mockClear(); });

  const setup = () => {
    const restore = vi.fn();
    const hook = renderHook((p: { result: any; step: string; busy: boolean }) => useRegenerationBackup({ ...p, restore }), {
      initialProps: { result: ancienne, step: "result", busy: false },
    });
    return { restore, ...hook };
  };

  it("échec de la nouvelle génération : la version retouchée revient toute seule", () => {
    const { restore, result, rerender } = setup();
    act(() => result.current.begin(snapshot));
    rerender({ result: null, step: "result", busy: true });
    rerender({ result: null, step: "result", busy: false });
    expect(restore).toHaveBeenCalledWith(snapshot);
    expect(result.current.pending).toBeNull();
  });

  it("succès : la version d'avant reste à un clic", () => {
    const { restore, result, rerender } = setup();
    act(() => result.current.begin(snapshot));
    rerender({ result: null, step: "result", busy: true });
    rerender({ result: { raw: { content: "Nouvelle" } }, step: "result", busy: false });
    expect(restore).not.toHaveBeenCalled();
    const [, opts] = toast.success.mock.calls[0];
    expect(opts.action.label).toBe("Revenir à ma version précédente");
    opts.action.onClick();
    expect(restore).toHaveBeenCalledWith(snapshot);
  });

  it("pendant la régénération, la sauvegarde reste disponible pour la copie de secours", () => {
    const { result, rerender } = setup();
    act(() => result.current.begin(snapshot));
    rerender({ result: null, step: "result", busy: true });
    expect(result.current.pending).toBe(snapshot);
  });

  it("rien n'a démarré (double-clic bloqué) : la sauvegarde est oubliée", () => {
    const { restore, result } = setup();
    act(() => result.current.begin(snapshot));
    act(() => result.current.settleIfNotStarted());
    expect(result.current.pending).toBeNull();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe("branchement dans /creer", () => {
  const creer = fs.readFileSync(path.resolve(__dirname, "../pages/CreerUnifie.tsx"), "utf8");
  it("Régénérer et Changer d'angle gardent la version d'avant", () => {
    const regen = creer.slice(creer.indexOf("const handleRegenerate = "), creer.indexOf("const handleChangeAngle = "));
    expect(regen.indexOf("regenerationBackup.begin(")).toBeGreaterThan(-1);
    expect(regen.indexOf("regenerationBackup.begin(")).toBeLessThan(regen.indexOf("await doGenerate("));
    const angle = creer.slice(creer.indexOf("const handleChangeAngle = "), creer.indexOf("setPendingAngleRegen(true)"));
    expect(angle).toContain("regenerationBackup.begin(");
  });
  it("la copie de secours ne remplace pas la version d'avant par du vide", () => {
    expect(creer).toMatch(/result: result \|\| regenerationBackup\.pending\?\.result \|\| undefined/);
  });
  it("la frappe de l'étape Modifier part dans la copie de secours", () => {
    expect(creer).toMatch(/onDraftChange=\{setEditContent\}/);
    expect(creer).toMatch(/editBaseline,/);
  });
});
