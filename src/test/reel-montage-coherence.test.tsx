vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";

vi.mock("@/lib/stock-videos", () => ({
  suggestStockKeywords: vi.fn().mockResolvedValue({ keywords: [], primary: "maison" }),
  searchStockVideos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/reel-user-videos", () => ({
  uploadReelVideo: vi.fn(), uploadReelStartPhoto: vi.fn().mockResolvedValue("https://stockage.test/depart.jpg"), loadVideoDuration: vi.fn().mockResolvedValue(null), listReelVideos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: vi.fn().mockReturnValue({ data: null }) }));

const section = { section: "hook", timing: "0-3 sec", texte_parle: "J'achète, je rénove, je revends.", texte_overlay: "Rénover" };
const reel = { format_type: "face_cam", script: [section], sections: [section], caption: { text: "Légende", cta: "" } };

// Imite CreerUnifie : le résultat corrigé remonte puis redescend en prop.
function Page({ initial, onSaved }: { initial: any; onSaved: (r: any) => void }) {
  const [result, setResult] = useState(initial);
  return <ReelResult result={result} onResultChange={(r) => { setResult(r); onSaved(r); }} />;
}
beforeEach(() => localStorage.clear());
const tab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));
const silentChosen = () => screen.getByText("Sans voix").closest("button")!.className.includes("border-primary");

describe("Montage du reel — choix « Sans voix » gardé", () => {
  it("survit à un aller-retour d'onglet puis à un rechargement", async () => {
    let saved: any = reel;
    const { unmount } = render(<Page initial={reel} onSaved={r => { saved = r; }} />);
    tab(/Montage/);
    fireEvent.click(screen.getByText("Je ne me montre pas"));
    fireEvent.click(await screen.findByText("Sans voix"));
    expect(silentChosen()).toBe(true);
    tab(/Légende/);
    tab(/Montage/);
    expect(silentChosen()).toBe(true);
    await waitFor(() => expect(saved.montage_project?.voiceMode).toBe("silent"));
    unmount();
    render(<Page initial={saved} onSaved={r => { saved = r; }} />);
    tab(/Montage/);
    expect(silentChosen()).toBe(true);
  });
});

describe("Montage du reel — photo de départ transmise par la page", () => {
  it("ReelResult passe la photo au montage, proposée sur le premier passage", async () => {
    render(<ReelResult result={reel} startPhoto="data:image/jpeg;base64,AAAA" />);
    tab(/Montage/);
    fireEvent.click(screen.getByText("Je ne me montre pas"));
    expect(await screen.findByText("Ta photo de départ")).toBeTruthy();
  });
});

describe("Montage du reel — le dernier choix de voix sert de départ au reel suivant", () => {
  it("« Sans voix » choisi sur un reel → le reel suivant s'ouvre sur « Sans voix », un montage enregistré garde le sien", async () => {
    localStorage.clear();
    const first = render(<ReelResult result={reel} />);
    tab(/Montage/);
    fireEvent.click(screen.getByText("Je ne me montre pas"));
    fireEvent.click(await screen.findByText("Sans voix"));
    first.unmount();

    const next = render(<ReelResult result={{ ...reel, sections: [{ ...section, texte_parle: "Autre reel." }], script: [{ ...section, texte_parle: "Autre reel." }] }} />);
    tab(/Montage/);
    fireEvent.click(screen.getByText("Je ne me montre pas"));
    expect(silentChosen()).toBe(true);
    next.unmount();

    const saved = { ...reel, montage_project: { version: 1, sectionTexts: [section.texte_parle], montageMode: "cache", voiceMode: "recorded", clips: [null], voiceClips: [null], cutaways: [null] } };
    render(<ReelResult result={saved} />);
    tab(/Montage/);
    expect(silentChosen()).toBe(false);
  });
});
