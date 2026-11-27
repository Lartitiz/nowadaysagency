import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TextareaWithVoice } from "@/components/ui/textarea-with-voice";
import { InputWithVoice } from "@/components/ui/input-with-voice";

vi.mock("@/hooks/use-speech-recognition", () => ({
  useSpeechRecognition: () => ({ isListening: false, isSupported: true, toggle: () => {}, error: null }),
}));

// Le micro est posé par-dessus le coin droit du champ : le champ doit toujours lui
// garder sa place, même quand l'écran qui l'utilise règle ses propres marges
// (écran Créer : `px-1` annulait la marge, le texte passait sous le micro, 27/11/2026).
describe("champ avec micro : la place du micro est toujours gardée", () => {
  it("zone de texte : la marge de droite résiste aux marges de l'appelant", () => {
    render(<TooltipProvider><TextareaWithVoice data-testid="t" className="px-1 sm:px-6" value="" onChange={() => {}} /></TooltipProvider>);
    expect(screen.getByLabelText("Dicter")).toBeTruthy();
    expect(screen.getByTestId("t").className.split(/\s+/)).toContain("!pr-12");
  });
  it("champ d'une ligne : idem", () => {
    render(<TooltipProvider><InputWithVoice data-testid="i" className="px-1" value="" onChange={() => {}} /></TooltipProvider>);
    expect(screen.getByTestId("i").className.split(/\s+/)).toContain("!pr-12");
  });
});
