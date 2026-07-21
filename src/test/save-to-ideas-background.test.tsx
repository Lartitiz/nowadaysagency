import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

// Garde-fou UX : sauvegarder une idée ferme la fenêtre dès que l'idée est en
// base — l'attache des visuels (rasterisation + upload, plusieurs secondes par
// slide) se fait en arrière-plan avec un toast de progression, et ne doit
// JAMAIS re-bloquer la fenêtre (régression du 21/07 : 30 s de « Sauvegarde... »).

const mocks = vi.hoisted(() => {
  const updatePayloads: any[] = [];
  const insertSingle = vi.fn(async () => ({ data: { id: "idea-1" }, error: null }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({
    insert: vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) })),
    update: vi.fn((payload: any) => {
      updatePayloads.push(payload);
      return { eq: updateEq };
    }),
  }));
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "toast-visuels"),
  };
  return { insertSingle, updateEq, from, updatePayloads, toast };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "u1" }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/ui/textarea-with-voice", () => ({
  TextareaWithVoice: (props: any) => <textarea {...props} />,
}));

import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";

const slides = [
  { slide_number: 1, html: "<div>1</div>" },
  { slide_number: 2, html: "<div>2</div>" },
];

const baseProps = {
  open: true,
  contentType: "post_instagram" as const,
  subject: "Mon sujet",
  contentData: { hook: "abc" },
  sourceModule: "creer",
  format: "carousel",
  visualSlides: slides,
};

describe("SaveToIdeasDialog — attache des visuels en arrière-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePayloads.length = 0;
  });

  it("ferme la fenêtre et confirme la sauvegarde AVANT la fin de l'upload des visuels", async () => {
    let resolveUpload!: (urls: string[]) => void;
    let progressCb: ((d: number, t: number) => void) | undefined;
    const onUploadVisuals = vi.fn((_id: string, onProgress?: (d: number, t: number) => void) => {
      progressCb = onProgress;
      return new Promise<string[]>((res) => {
        resolveUpload = res;
      });
    });
    const onOpenChange = vi.fn();

    const { getByText } = render(
      <SaveToIdeasDialog {...baseProps} onOpenChange={onOpenChange} onUploadVisuals={onUploadVisuals} />
    );
    fireEvent.click(getByText("💾 Sauvegarder"));

    // La fenêtre se ferme et le succès s'affiche alors que l'upload est encore en cours
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining("Idée sauvegardée"));
    expect(onUploadVisuals).toHaveBeenCalledWith("idea-1", expect.any(Function));
    expect(mocks.toast.loading).toHaveBeenCalledWith(expect.stringContaining("0/2"));

    // La progression met à jour le même toast
    progressCb?.(1, 2);
    expect(mocks.toast.loading).toHaveBeenCalledWith(
      expect.stringContaining("1/2"),
      expect.objectContaining({ id: "toast-visuels" })
    );

    // Fin d'upload : l'idée est mise à jour avec les URLs et le toast passe au vert
    resolveUpload(["https://x/slide-1.png", "https://x/slide-2.png"]);
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Visuels attachés à ton idée ✓",
        expect.objectContaining({ id: "toast-visuels" })
      )
    );
    const withVisuals = mocks.updatePayloads.find((p) => p.content_data?.visual_urls);
    expect(withVisuals.content_data.visual_urls).toHaveLength(2);
    expect(withVisuals.content_data.hook).toBe("abc");
  });

  it("prévient (sans bloquer) si l'upload des visuels échoue", async () => {
    const onUploadVisuals = vi.fn(() => Promise.reject(new Error("boom")));
    const onOpenChange = vi.fn();

    const { getByText } = render(
      <SaveToIdeasDialog {...baseProps} onOpenChange={onOpenChange} onUploadVisuals={onUploadVisuals} />
    );
    fireEvent.click(getByText("💾 Sauvegarder"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        expect.stringContaining("n'ont pas pu y être attachés"),
        expect.objectContaining({ id: "toast-visuels" })
      )
    );
    // L'idée elle-même est bien sauvegardée malgré l'échec des visuels
    expect(mocks.insertSingle).toHaveBeenCalled();
  });

  it("aucun toast de progression pour un contenu sans visuels", async () => {
    const onOpenChange = vi.fn();
    const { getByText } = render(
      <SaveToIdeasDialog
        {...baseProps}
        visualSlides={undefined}
        onOpenChange={onOpenChange}
        onUploadVisuals={undefined}
      />
    );
    fireEvent.click(getByText("💾 Sauvegarder"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.loading).not.toHaveBeenCalled();
  });
});
