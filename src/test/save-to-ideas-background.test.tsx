import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

// The dialog closes after the text is saved, but complete success waits for all visuals.

const mocks = vi.hoisted(() => {
  const updatePayloads: any[] = [];
  const insertSingle = vi.fn(async () => ({ data: { id: "idea-1" }, error: null }));
  const updateEq = vi.fn(async () => ({ data: { id: "idea-1" }, error: null }));
  const from = vi.fn(() => ({
    insert: vi.fn(() => ({ select: vi.fn(() => ({ single: insertSingle })) })),
    update: vi.fn((payload: any) => {
      updatePayloads.push(payload);
      return { eq: () => ({ select: () => ({ single: updateEq }) }) };
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

  it("ferme la fenêtre sans annoncer un succès complet avant la fin des visuels", async () => {
    let resolveUpload!: (urls: string[]) => void;
    let progressCb: ((d: number, t: number) => void) | undefined;
    const onUploadVisuals = vi.fn((_id: string, onProgress?: (d: number, t: number) => void) => {
      progressCb = onProgress;
      return new Promise<string[]>((res) => {
        resolveUpload = res;
      });
    });
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const onSavingChange = vi.fn();

    const { getByText } = render(
      <SaveToIdeasDialog {...baseProps} onOpenChange={onOpenChange} onUploadVisuals={onUploadVisuals} onSaved={onSaved} onSavingChange={onSavingChange} />
    );
    fireEvent.click(getByText("Enregistrer dans Mes idées"));

    // La fenêtre se ferme et le succès s'affiche alors que l'upload est encore en cours
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onSavingChange).toHaveBeenLastCalledWith(true);
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
        "Texte et visuels enregistrés ✓",
        expect.objectContaining({ id: "toast-visuels" })
      )
    );
    expect(onSaved).toHaveBeenCalledWith("idea-1", true);
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
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
    fireEvent.click(getByText("Enregistrer dans Mes idées"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        expect.stringContaining("visuels incomplets"),
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
    fireEvent.click(getByText("Enregistrer dans Mes idées"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast.loading).not.toHaveBeenCalled();
  });
  it("keeps the dialog open and never confirms after a server failure", async () => {
    mocks.insertSingle.mockResolvedValueOnce({ data: null, error: { message: "network" } } as any);
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const onSavingChange = vi.fn();
    const { getByText } = render(<SaveToIdeasDialog {...baseProps} visualSlides={undefined} onSaved={onSaved} onOpenChange={onOpenChange} onSavingChange={onSavingChange} />);
    fireEvent.click(getByText("Enregistrer dans Mes idées"));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it("reports a partial save when not all requested visuals are attached", async () => {
    const onSaved = vi.fn();
    const { getByText } = render(<SaveToIdeasDialog {...baseProps} onOpenChange={vi.fn()} onSaved={onSaved} onUploadVisuals={async () => ["one.png"]} />);
    fireEvent.click(getByText("Enregistrer dans Mes idées"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("idea-1", false));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

});
