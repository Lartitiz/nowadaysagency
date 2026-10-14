import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CalendarPostPreview } from "@/components/calendar/CalendarPostPreview";
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/hooks/use-story-export", () => ({ useStoryExport: () => ({ hasFrames: false, frameCount: 0 }) }));
vi.mock("@/lib/export-logo", () => ({ getIncludeLogoPref: () => false, setIncludeLogoPref: vi.fn() }));
afterEach(cleanup);
// jsdom n'a pas ResizeObserver (utilisé par StoryFramePreview en mode fluid).
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
it.each(["post", "story_serie"])("shows a composed %s without a caption or a generation prompt", format => {
  render(<CalendarPostPreview photoComposition canal="instagram" format={format} caption="" theme="Alba" username="alba" displayName="Alba"
    mediaUrls={["https://example.test/alba.png"]} visualUrls={["https://example.test/alba.png"]}
    onNavigateToGenerator={vi.fn()} hasAngle={false} hasTheme />);
  expect(screen.getByAltText("Slide 1")).toHaveAttribute("src", "https://example.test/alba.png");
  expect(screen.getByRole("button", { name: "Télécharger le visuel" })).toBeVisible();
  expect(screen.queryByText(/Génère d'abord/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Régénère le carrousel/)).not.toBeInTheDocument();
});

it("renders the real story visuals for a story_serie instead of the generic 📱 placeholder", () => {
  // jsdom mesure 0 partout : on simule une largeur pour que l'aperçu fluide se monte.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 220, height: 391, top: 0, left: 0, right: 220, bottom: 391, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  render(<CalendarPostPreview canal="instagram" format="story_serie" caption="Ma légende" theme="Alba" username="alba" displayName="Alba"
    storiesData={[{ text: "Bienvenue dans ma séquence", visual: { gabarit: "fond_pills", background: "fond_couleur" } }]}
    onNavigateToGenerator={vi.fn()} hasAngle hasTheme />);
  expect(screen.getByTitle("Story 1")).toBeInTheDocument();
  expect(screen.queryByText("📱")).not.toBeInTheDocument();
});
