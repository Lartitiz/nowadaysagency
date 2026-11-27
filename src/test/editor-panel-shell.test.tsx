// Le cadre du panneau de réglages est commun au carrousel et aux stories (27/11/2026) :
// src/components/creer/EditorPanelShell.tsx. Ce test bloque le retour d'un cadre écrit à la main.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Type } from "lucide-react";
import { panelBody, panelFrame, PanelSheetHeader, PanelTabButton } from "@/components/creer/EditorPanelShell";

afterEach(cleanup);
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("cadre commun du panneau de réglages", () => {
  it("un onglet : nom court affiché, nom complet lu, clic transmis", () => {
    const onClick = vi.fn();
    render(<div role="tablist"><PanelTabButton id="t-ia" controls="pane" selected label="Demander à l’IA" short="IA" icon={Type} onClick={onClick} /></div>);
    const tab = screen.getByRole("tab", { name: "Demander à l’IA" });
    expect(tab).toHaveTextContent("IA");
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveAttribute("aria-controls", "pane");
    fireEvent.click(tab);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("la ligne du volet dit ce qu'on règle et « Terminé » referme", () => {
    const onDone = vi.fn();
    render(<PanelSheetHeader onDone={onDone}>Story 2 : tes réglages s’appliquent en direct.</PanelSheetHeader>);
    expect(screen.getByText("Story 2 : tes réglages s’appliquent en direct.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminé" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("volet ouvert : le cadre prend la place sous l'aperçu et le contenu défile seul", () => {
    expect(panelFrame(false)).not.toContain("max-md:flex-1");
    expect(panelFrame(true)).toContain("max-md:flex-1");
    expect(panelBody(false)).not.toContain("overflow-y-auto");
    expect(panelBody(true)).toContain("max-md:overflow-y-auto");
  });

  it("les deux éditeurs passent par ce cadre, sans le réécrire", () => {
    for (const file of ["components/creer/CarouselEditorParts/EditorPanel.tsx", "components/stories/StoryEditorPanel.tsx"]) {
      const code = read(file);
      for (const piece of ["PanelTabButton", "PanelSheetHeader", "PANEL_TABLIST", "panelFrame(", "panelBody("]) expect(code, `${file} : ${piece}`).toContain(piece);
      expect(code, `${file} : onglet écrit à la main`).not.toMatch(/role="tab"\s/);
      expect(code, `${file} : « Terminé » écrit à la main`).not.toContain(">Terminé<");
      expect(code, `${file} : cadre écrit à la main`).not.toContain("md:grid-cols-[4.5rem_minmax(0,1fr)]");
    }
  });
});
