// « Je me filme » / « Je ne me montre pas » (27/11/2026) : deux pastilles sur
// l'écran des accroches du reel, retenues d'un reel à l'autre.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HookSelectionStep, { type ReelHook } from "@/components/creer/HookSelectionStep";
import { reelFaceCam, saveReelFaceCam, storedReelFaceCam } from "@/lib/reel-film-preference";

const HOOKS: ReelHook[] = [{ text: "300 savons fabriqués, 11 vendus.", type: "vecu_perso", type_label: "Vécu perso" }];
const noop = () => {};

beforeEach(() => localStorage.clear());

describe("choix retenu", () => {
  it("sans choix enregistré : face caméra, comme avant", () => {
    expect(storedReelFaceCam()).toBeNull();
    expect(reelFaceCam()).toBe("oui");
  });

  it("le choix est relu tel quel, une valeur inconnue est ignorée", () => {
    saveReelFaceCam("non");
    expect(storedReelFaceCam()).toBe("non");
    expect(reelFaceCam()).toBe("non");
    localStorage.setItem("reel_se_filme", "peut-etre");
    expect(storedReelFaceCam()).toBeNull();
    expect(reelFaceCam()).toBe("oui");
  });
});

describe("pastilles de l'écran des accroches", () => {
  it("absentes tant que le changement n'est pas branché", () => {
    render(<HookSelectionStep hooks={HOOKS} loading={false} onSelect={noop} onSkip={noop} onRefresh={noop} onBack={noop} />);
    expect(screen.queryByText("Je me filme")).toBeNull();
  });

  it("la pastille active est cochée ; toucher l'autre prévient la page, retoucher l'active ne fait rien", () => {
    const onFaceCamChange = vi.fn();
    render(<HookSelectionStep hooks={HOOKS} loading={false} onSelect={noop} onSkip={noop} onRefresh={noop} onBack={noop} faceCam="oui" onFaceCamChange={onFaceCamChange} />);
    expect(screen.getByTestId("reel-face-cam-oui")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("reel-face-cam-non")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("reel-face-cam-oui"));
    expect(onFaceCamChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("reel-face-cam-non"));
    expect(onFaceCamChange).toHaveBeenCalledWith("non");
  });
});
