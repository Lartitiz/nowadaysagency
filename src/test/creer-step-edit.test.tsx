import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/textarea-with-voice", () => ({
  TextareaWithVoice: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

import CreerStepEdit from "@/components/creer/CreerStepEdit";

describe("CreerStepEdit — retouche avec contexte", () => {
  it("raccourcit le texte courant avec son sujet, sa source et le bon espace", async () => {
    invoke.mockResolvedValue({ data: { content: "Version raccourcie" }, error: null });
    render(<CreerStepEdit
      content="Brouillon initial"
      format="linkedin"
      subject="Les précommandes de la coopérative"
      newsContext="  Communiqué : réservation avant fabrication.  "
      workspaceId="espace-client"
      onSave={vi.fn()} onBack={vi.fn()} onCopy={vi.fn()}
    />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte retouché à la main" } });
    fireEvent.click(screen.getByRole("button", { name: /Plus court/ }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("Version raccourcie"));
    expect(invoke).toHaveBeenCalledWith("creative-flow", {
      body: {
        step: "adjust", contentType: "linkedin_post",
        content: "Texte retouché à la main", adjustment: "Plus court",
        context: "Les précommandes de la coopérative",
        news_context: "Communiqué : réservation avant fabrication.",
        workspace_id: "espace-client",
      },
    }, 90000);
  });
});
