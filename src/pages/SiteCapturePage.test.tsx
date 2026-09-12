import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ workspace: "A", ready: true, user: "user-test", invoke: vi.fn(), error: vi.fn(), fixes: [] as Array<(text: string) => void> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user ? { id: m.user } : null }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => m.workspace, useWorkspaceReady: () => m.ready }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.invoke }));
vi.mock("sonner", () => ({ toast: { error: m.error, success: vi.fn() } }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));
vi.mock("@/components/SubPageHeader", () => ({ default: () => null }));
vi.mock("@/components/content/BrandingStatusBanner", () => ({ default: () => null }));
vi.mock("@/components/RedFlagsChecker", () => ({ default: ({ onFix }: { onFix: (text: string) => void }) => {
  m.fixes.push(onFix); return <button onClick={() => onFix("Titre corrigé")}>Corriger</button>;
} }));
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} /> }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} /> }));
import SiteCapturePage from "./SiteCapturePage";

const draft = (space: string) => ({ leadName: `Offre ${space}`, leadDesc: `Description ${space}`, result: { title: `Titre ${space}`, bullets: [space], cta_text: `Découvrir ${space}` } });
const save = (space: string) => localStorage.setItem(`capture-page:${space}`, JSON.stringify(draft(space)));
const cached = (space: string) => JSON.parse(localStorage.getItem(`capture-page:${space}`) || "null");
const name = () => screen.getAllByRole("textbox")[0];
const desc = () => screen.getAllByRole("textbox")[1];
const generate = () => fireEvent.click(screen.getByRole("button", { name: "Générer ma page de capture" }));
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const response = (title: string) => ({ data: { content: JSON.stringify({ title }) }, error: null });
beforeEach(() => { localStorage.clear(); m.workspace = "A"; m.ready = true; m.user = "user-test"; m.invoke.mockReset(); m.error.mockReset(); m.fixes = []; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Page de capture : isolation des espaces", () => {
  it("A vers B vide : aucun résultat A affiché ou écrit dans B, retour A intact", () => {
    save("A"); const a = localStorage.getItem("capture-page:A");
    const { rerender } = render(<SiteCapturePage />);
    expect(screen.getByText("Titre A")).toBeInTheDocument();
    m.workspace = "B"; rerender(<SiteCapturePage />);
    expect(screen.queryByText("Titre A")).not.toBeInTheDocument();
    expect(name()).toHaveValue(""); expect(desc()).toHaveValue("");
    expect(cached("B")).toBeNull();
    expect(localStorage.getItem("capture-page:A")).toBe(a);
    m.workspace = "A"; rerender(<SiteCapturePage />);
    expect(screen.getByText("Titre A")).toBeInTheDocument(); expect(name()).toHaveValue("Offre A");
  });

  it("réhydrate B déjà rempli avant toute écriture, même en StrictMode", () => {
    save("A"); save("B");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { rerender } = render(<StrictMode><SiteCapturePage /></StrictMode>);
    m.workspace = "B"; rerender(<StrictMode><SiteCapturePage /></StrictMode>);
    expect(screen.getByText("Titre B")).toBeInTheDocument();
    expect(name()).toHaveValue("Offre B"); expect(desc()).toHaveValue("Description B");
    expect(write).not.toHaveBeenCalled(); expect(cached("A")).toEqual(draft("A")); expect(cached("B")).toEqual(draft("B"));
  });

  it("conserve les brouillons sans résultat et les champs vidés dans chaque espace", () => {
    const { rerender } = render(<SiteCapturePage />);
    fireEvent.change(name(), { target: { value: "Brouillon A" } });
    fireEvent.change(desc(), { target: { value: "Texte A" } });
    m.workspace = "B"; rerender(<SiteCapturePage />);
    fireEvent.change(name(), { target: { value: "Brouillon B" } });
    m.workspace = "A"; rerender(<SiteCapturePage />);
    expect(name()).toHaveValue("Brouillon A"); expect(desc()).toHaveValue("Texte A");
    fireEvent.change(desc(), { target: { value: "" } });
    m.workspace = "B"; rerender(<SiteCapturePage />); expect(name()).toHaveValue("Brouillon B");
    m.workspace = "A"; rerender(<SiteCapturePage />); expect(desc()).toHaveValue("");
    expect(cached("A").result).toBeNull();
  });

  it("sauvegarde les corrections et les modifications du formulaire après génération", () => {
    save("A"); render(<SiteCapturePage />);
    fireEvent.click(screen.getByText("Corriger"));
    fireEvent.change(name(), { target: { value: "Nouveau nom" } });
    expect(cached("A").result.title).toBe("Titre corrigé");
    expect(cached("A").leadName).toBe("Nouveau nom");
  });

  it("ignore les réponses A tardives pendant une génération B et après retour A", async () => {
    save("A"); save("B"); const a = deferred(); const b = deferred();
    m.invoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { rerender } = render(<SiteCapturePage />); generate();
    expect(m.invoke.mock.calls[0][1].body.workspace_id).toBe("A");
    m.workspace = "B"; rerender(<SiteCapturePage />); generate();
    await act(async () => a.resolve(response("Ancienne génération A")));
    expect(screen.getByRole("button", { name: "Génération..." })).toBeDisabled();
    expect(cached("A")).toEqual(draft("A")); expect(cached("B")).toEqual(draft("B"));
    await act(async () => b.resolve(response("Nouvelle génération B")));
    expect(screen.getByText("Nouvelle génération B")).toBeInTheDocument();
    expect(cached("B").result.title).toBe("Nouvelle génération B");
    m.workspace = "A"; rerender(<SiteCapturePage />); expect(screen.getByText("Titre A")).toBeInTheDocument();
  });

  it("A → B → A : ancienne génération et ancienne correction n'écrasent pas la nouvelle visite", async () => {
    save("A"); const old = deferred(); const current = deferred();
    m.invoke.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { rerender } = render(<SiteCapturePage />); const oldFix = m.fixes[0]; generate();
    m.workspace = "B"; rerender(<SiteCapturePage />);
    m.workspace = "A"; rerender(<SiteCapturePage />); generate();
    await act(async () => current.resolve(response("Résultat actuel A")));
    await act(async () => { old.resolve(response("Résultat périmé A")); oldFix("Correction périmée A"); });
    expect(screen.getByText("Résultat actuel A")).toBeInTheDocument();
    expect(cached("A").result.title).toBe("Résultat actuel A"); expect(cached("B")).toBeNull();
  });

  it("erreur de génération : résultat précédent conservé et nouvelle tentative possible", async () => {
    save("A"); vi.spyOn(console, "error").mockImplementation(() => {});
    m.invoke.mockResolvedValueOnce({ data: null, error: { message: "network" } }).mockResolvedValueOnce(response("Réussi"));
    render(<SiteCapturePage />); await act(async () => generate());
    expect(m.error).toHaveBeenCalledTimes(1); expect(cached("A")).toEqual(draft("A"));
    await act(async () => generate()); expect(screen.getByText("Réussi")).toBeInTheDocument();
  });

  it("erreur tardive après changement d'espace : aucun toast ni écriture", async () => {
    save("A"); const pending = deferred(); m.invoke.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<SiteCapturePage />); generate();
    m.workspace = "B"; rerender(<SiteCapturePage />);
    await act(async () => pending.reject(new Error("network")));
    expect(m.error).not.toHaveBeenCalled(); expect(cached("B")).toBeNull();
  });

  it("cache corrompu et erreur de lecture : aucune réécriture automatique", () => {
    localStorage.setItem("capture-page:A", "ancien cache illisible");
    const { rerender } = render(<SiteCapturePage />);
    expect(name()).toHaveValue(""); expect(localStorage.getItem("capture-page:A")).toBe("ancien cache illisible");
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage"); });
    const write = vi.spyOn(Storage.prototype, "setItem");
    m.workspace = "B"; rerender(<SiteCapturePage />); expect(write).not.toHaveBeenCalled(); read.mockRestore();
  });

  it("quota plein : génération utilisable sans contaminer un autre espace", async () => {
    save("A"); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    m.invoke.mockResolvedValueOnce(response("Résultat visible")); render(<SiteCapturePage />);
    await act(async () => generate()); expect(screen.getByText("Résultat visible")).toBeInTheDocument();
    expect(cached("A")).toEqual(draft("A")); expect(cached("B")).toBeNull();
  });

  it("attend la résolution de l'espace et bloque la génération après déconnexion", () => {
    save("A"); m.ready = false; const { rerender } = render(<SiteCapturePage />);
    expect(screen.queryByText("Titre A")).not.toBeInTheDocument();
    fireEvent.change(name(), { target: { value: "En attente" } });
    expect(screen.getByRole("button", { name: "Générer ma page de capture" })).toBeDisabled();
    expect(cached("A")).toEqual(draft("A"));
    m.ready = true; rerender(<SiteCapturePage />); expect(name()).toHaveValue("Offre A");
    m.user = ""; rerender(<SiteCapturePage />); expect(name()).toHaveValue("");
    expect(screen.queryByText("Titre A")).not.toBeInTheDocument(); expect(m.invoke).not.toHaveBeenCalled();
  });
});
