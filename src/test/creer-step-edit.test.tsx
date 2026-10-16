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


it("copie la saisie courante même avant Sauver, y compris une saisie vidée", () => {
  const onCopy = vi.fn();
  render(<CreerStepEdit content="Ancien texte" format="post" onSave={vi.fn()} onBack={vi.fn()} onCopy={onCopy} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Retouche non sauvegardée" } });
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  expect(onCopy).toHaveBeenLastCalledWith("Retouche non sauvegardée");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Copier" }));
  expect(onCopy).toHaveBeenLastCalledWith("");
});

// Lot 6 « robustesse création de contenu » (14/10/2026) : ne plus perdre la frappe.
describe("CreerStepEdit — la frappe n'est jamais perdue", () => {
  it("transmet le texte en cours pour la copie de secours, sans attendre Sauver", async () => {
    const onDraftChange = vi.fn();
    render(<CreerStepEdit content="Texte de départ" format="post" onDraftChange={onDraftChange} onSave={vi.fn()} onBack={vi.fn()} onCopy={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte retouché" } });
    await waitFor(() => expect(onDraftChange).toHaveBeenLastCalledWith("Texte retouché"));
  });

  it("Retour sans modification revient directement", () => {
    const onBack = vi.fn();
    render(<CreerStepEdit content="Texte" savedContent="Texte" format="post" onSave={vi.fn()} onBack={onBack} onCopy={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("Retour avec des modifications non appliquées demande d'abord, et peut les appliquer", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    render(<CreerStepEdit content="Texte" savedContent="Texte" format="post" onSave={onSave} onBack={onBack} onCopy={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte retouché" } });
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }));
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer et revenir" }));
    expect(onSave).toHaveBeenCalledWith("Texte retouché");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("« Continuer à modifier » garde l'écran et le texte", async () => {
    const onBack = vi.fn();
    render(<CreerStepEdit content="Texte" savedContent="Texte" format="post" onSave={vi.fn()} onBack={onBack} onCopy={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte retouché" } });
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Continuer à modifier" }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Texte retouché");
  });

  it("« Revenir sans les appliquer » revient sans sauver", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    render(<CreerStepEdit content="Texte" savedContent="Texte" format="post" onSave={onSave} onBack={onBack} onCopy={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte retouché" } });
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Revenir sans les appliquer" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("un texte rechargé depuis la copie de secours compte comme non appliqué", async () => {
    const onBack = vi.fn();
    render(<CreerStepEdit content="Brouillon restauré" savedContent="Version appliquée" format="post" onSave={vi.fn()} onBack={onBack} onCopy={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }));
    expect(await screen.findByText("Tu as des modifications non appliquées")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});

// Lot 7 (14/10/2026) : le bon type de contenu pour l'ajustement, pas de faux succès.
describe("CreerStepEdit — ajustement par format", () => {
  it.each([
    ["reel", "reel"], ["story", "stories"], ["carousel", "carousel"],
    ["pinterest_visual", "post_pinterest"], ["post", "instagram_post"], ["newsletter", "newsletter"],
  ])("format %s → contentType %s", async (format, contentType) => {
    invoke.mockClear();
    invoke.mockResolvedValue({ data: { content: "Ajusté" }, error: null });
    render(<CreerStepEdit content="Texte" format={format} onSave={vi.fn()} onBack={vi.fn()} onCopy={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Plus percutant/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body.contentType).toBe(contentType);
  });

  it("une réponse sans texte n'affiche pas « Contenu ajusté ! » et garde le texte", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    invoke.mockResolvedValue({ data: {}, error: null });
    render(<CreerStepEdit content="Mon texte" format="post" onSave={vi.fn()} onBack={vi.fn()} onCopy={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Plus court/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalledWith("Contenu ajusté !");
    expect(screen.getByRole("textbox")).toHaveValue("Mon texte");
  });

  it("« Appliquer et revenir » reste sur l'écran si le texte n'a pas pu être appliqué", async () => {
    const onBack = vi.fn();
    render(<CreerStepEdit content="Texte" savedContent="Texte" format="carousel" onSave={() => false} onBack={onBack} onCopy={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Texte sans repères" } });
    fireEvent.click(screen.getByRole("button", { name: /Retour/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer et revenir" }));
    expect(onBack).not.toHaveBeenCalled();
  });
});
