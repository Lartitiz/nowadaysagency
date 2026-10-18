import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PublishOrScheduleDialog from "@/components/creer/PublishOrScheduleDialog";
import { instagramTooManyImagesReason } from "@/features/creer/publish-guards";

// Chantier Y (18/10/2026) : l'avertissement qui bloque la publication auto est
// écrit UNE fois (avant : sous « Maintenant » ET sous « Programmer ») ; quand
// publier est impossible, « Garder au calendrier » passe en premier.
vi.mock("@/components/calendar/AlreadyPlannedNotice", () => ({ default: () => null }));

const props = {
  open: true, onOpenChange: vi.fn(), channel: "instagram" as const, channelConnected: true,
  onPublishNow: vi.fn(), onSchedule: vi.fn(), onDraft: vi.fn(), onPublishedByHand: vi.fn(), onConnectChannel: vi.fn(),
};
const order = () => ["publish-draft-option", "publish-now-option"].map((id) => screen.getByTestId(id))
  .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  .map((el) => el.getAttribute("data-testid"));

describe("fenêtre « Publier ou garder au calendrier »", () => {
  it("14 slides : l'avertissement est écrit une seule fois, au-dessus des deux choix", () => {
    const reason = instagramTooManyImagesReason(14)!;
    render(<PublishOrScheduleDialog {...props} disabledReason={reason} />);
    expect(screen.getAllByText(reason)).toHaveLength(1);
    const warning = screen.getByTestId("publish-blocked-reason");
    expect(warning.compareDocumentPosition(screen.getByTestId("publish-now-option")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order()).toEqual(["publish-draft-option", "publish-now-option"]);
  });

  it("Instagram non connecté : écrit une fois, et « Garder au calendrier » en premier", () => {
    render(<PublishOrScheduleDialog {...props} channelConnected={false} />);
    expect(screen.getAllByText("Compte Instagram non connecté.")).toHaveLength(1);
    expect(order()).toEqual(["publish-draft-option", "publish-now-option"]);
    expect(screen.getByTestId("publish-connect-action")).toBeEnabled();
  });

  it("Instagram connecté et publiable : la publication auto reste en premier, sans avertissement", () => {
    render(<PublishOrScheduleDialog {...props} />);
    expect(screen.queryByTestId("publish-blocked-reason")).not.toBeInTheDocument();
    expect(order()).toEqual(["publish-now-option", "publish-draft-option"]);
  });
});
