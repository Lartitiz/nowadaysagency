// Vidéo fabriquée gardée avec le contenu (27/11/2026). Vécu sur un compte réel : un reel
// rouvert depuis Mes idées dans un nouvel onglet n'affichait plus la vidéo faite la veille,
// retenue seulement par l'onglet. ReelResult l'écrit maintenant dans le reel (`montage_mp4`).
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
import ReelResult from "@/components/creer/formatRenderers/ReelResult";
import { reelSourceKey } from "@/lib/reel-publication";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), poll: vi.fn(), archive: vi.fn() }));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null, isLoading: false }) }));
vi.mock("@/lib/stock-videos", () => ({ suggestStockKeywords: vi.fn().mockResolvedValue({ keywords: [], primary: "" }), searchStockVideos: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/reel-user-videos", () => ({ listReelVideos: async () => [{ url: "https://clips.test/take.mp4", name: "Ma prise" }], loadVideoDuration: async () => 5, uploadReelVideo: vi.fn(), uploadReelStartPhoto: vi.fn() }));
vi.mock("@/lib/reel-render", async () => ({ ...await vi.importActual("@/lib/reel-plan"), submitReelRender: mocks.submit, pollReelRender: mocks.poll, archiveReelMp4: mocks.archive }));

const section = { section: "hook", timing: "0-3 sec", texte_parle: "Mon texte", texte_overlay: "Overlay" };
const reel = { format_type: "face_cam", sections: [section], script: [section], caption: { text: "Légende", cta: "" } };
const video = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/reels-montes/u1/reel.mp4`;

// Imite CreerUnifie : le reel remonte puis redescend en prop.
function Page({ onSaved }: { onSaved: (r: any) => void }) {
  const [result, setResult] = useState<any>(reel);
  return <ReelResult result={result} onResultChange={(r) => { setResult(r); onSaved(r); }} />;
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.submit.mockResolvedValue("project"); mocks.poll.mockResolvedValue("https://renderer.test/temp.mp4"); mocks.archive.mockResolvedValue(video);
});

it("la vidéo rangée est écrite dans le reel avec son script, sans perdre le montage ; un changement de clip la retire", async () => {
  let saved: any = reel;
  render(<Page onSaved={(r) => { saved = r; }} />);
  fireEvent.click(screen.getByRole("tab", { name: /Montage/ }));
  fireEvent.click(screen.getByRole("button", { name: /Je me filme/ }));
  await waitFor(() => expect(screen.getByLabelText("Reprendre une de mes vidéos")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Reprendre une de mes vidéos"), { target: { value: "https://clips.test/take.mp4" } });
  await waitFor(() => expect(screen.getByText(/Ma vidéo · Ma prise/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Assembler mon reel" }));
  await waitFor(() => expect(saved.montage_mp4).toEqual({ url: video, source: reelSourceKey(reel) }));
  // Le montage enregistré juste avant n'est pas écrasé par l'enregistrement de la vidéo.
  expect(saved.montage_project?.montageMode).toBe("filme");
  expect(saved.montage_project?.clips?.[0]?.url).toBe("https://clips.test/take.mp4");
});
