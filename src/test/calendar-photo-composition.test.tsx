import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CalendarPostPreview } from "@/components/calendar/CalendarPostPreview";
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: null }) }));
vi.mock("@/hooks/use-open-in-canva", () => ({ useOpenInCanva: () => ({ openInCanva: vi.fn(), openingCanva: false }) }));
vi.mock("@/hooks/use-story-export", () => ({ useStoryExport: () => ({ hasFrames: false, frameCount: 0 }) }));
vi.mock("@/lib/export-logo", () => ({ getIncludeLogoPref: () => false, setIncludeLogoPref: vi.fn() }));
afterEach(cleanup);
it.each(["post", "story_serie"])("shows a composed %s without a caption or a generation prompt", format => {
  render(<CalendarPostPreview photoComposition canal="instagram" format={format} caption="" theme="Alba" username="alba" displayName="Alba"
    mediaUrls={["https://example.test/alba.png"]} visualUrls={["https://example.test/alba.png"]}
    onNavigateToGenerator={vi.fn()} hasAngle={false} hasTheme />);
  expect(screen.getByAltText("Slide 1")).toHaveAttribute("src", "https://example.test/alba.png");
  expect(screen.getByRole("button", { name: "Télécharger le visuel" })).toBeVisible();
  expect(screen.queryByText(/Génère d'abord/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Régénère le carrousel/)).not.toBeInTheDocument();
});
