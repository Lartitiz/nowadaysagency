import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { prepareLinkedInText, copyTextForChannel } from "@/lib/linkedin-copy";
import { prepareLinkedInText as edgePrepareLinkedInText } from "../../supabase/functions/_shared/linkedin-graph";

vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: vi.fn() }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ activeWorkspace: null, workspaces: [] }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" }, session: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/textarea-with-voice", () => ({
  TextareaWithVoice: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

import CreerStepEdit from "@/components/creer/CreerStepEdit";

// Un post LinkedIn copié puis collé dans LinkedIn : le markdown n'y est pas
// interprété, un **gras** resterait en astérisques bruts. La publication
// directe nettoie déjà (PR #1302, linkedin-graph) ; la copie doit faire pareil.
const RAW = [
  "**J'ai arrêté les remises.** Voici *pourquoi*.",
  "",
  "1. Le prix dit la valeur",
  "2. La remise dit le doute",
  "- une puce",
  "• une autre puce",
  "* puce étoile",
  "",
  "Plus de détails sur [mon site](https://exemple.fr/mon_atelier_*bis*) ou https://exemple.fr/a_b_c",
  "",
  "#céramique #fait_main #prix",
].join("\n");

const CLEAN = [
  "J'ai arrêté les remises. Voici pourquoi.",
  "",
  "1. Le prix dit la valeur",
  "2. La remise dit le doute",
  "- une puce",
  "• une autre puce",
  "* puce étoile",
  "",
  "Plus de détails sur mon site (https://exemple.fr/mon_atelier_*bis*) ou https://exemple.fr/a_b_c",
  "",
  "#céramique #fait_main #prix",
].join("\n");

describe("prepareLinkedInText (copie LinkedIn)", () => {
  it("retire gras/italique/liens markdown, garde numérotation, puces, sauts de ligne, hashtags et URL", () => {
    expect(prepareLinkedInText(RAW)).toBe(CLEAN);
  });

  it("donne exactement le même texte que la publication directe (edge linkedin-graph)", () => {
    expect(prepareLinkedInText(RAW)).toBe(edgePrepareLinkedInText(RAW));
  });

  it("ne raccourcit pas un texte sans markdown", () => {
    const plain = "Une ligne.\n\nUne autre ligne, 2 * 3 = 6.\n#tag";
    expect(prepareLinkedInText(plain)).toBe(plain);
  });

  it("ne nettoie que pour LinkedIn (les autres canaux gardent le texte tel quel)", () => {
    for (const ch of ["linkedin", "post_linkedin", "linkedin_post", "LinkedIn"]) {
      expect(copyTextForChannel(RAW, ch)).toBe(CLEAN);
    }
    for (const ch of ["instagram", "post", "newsletter", "pinterest", null, undefined]) {
      expect(copyTextForChannel(RAW, ch)).toBe(RAW);
    }
  });
});

describe("/creer — bouton Copier de l'édition", () => {
  it("LinkedIn : copie le texte sans markdown", () => {
    const onCopy = vi.fn();
    render(<CreerStepEdit content={RAW} format="linkedin" onSave={vi.fn()} onBack={vi.fn()} onCopy={onCopy} />);
    fireEvent.click(screen.getByRole("button", { name: "Copier" }));
    expect(onCopy).toHaveBeenLastCalledWith(CLEAN);
  });

  it("Instagram : texte copié inchangé", () => {
    const onCopy = vi.fn();
    render(<CreerStepEdit content={RAW} format="post" onSave={vi.fn()} onBack={vi.fn()} onCopy={onCopy} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Copier" }).at(-1)!);
    expect(onCopy).toHaveBeenLastCalledWith(RAW);
  });
});

import CreerStepResult from "@/components/creer/CreerStepResult";
import { MemoryRouter } from "react-router-dom";

describe("/creer — « Copier le texte » du résultat", () => {
  const renderResult = (format: string, result: any) => {
    const onCopy = vi.fn();
    render(<MemoryRouter><CreerStepResult result={result} format={format} generating={false}
      onEdit={vi.fn()} onReset={vi.fn()} onRegenerate={vi.fn()} onCopy={onCopy} /></MemoryRouter>);
    const trigger = screen.getAllByRole("button", { name: /Autres actions/ }).at(-1)!;
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Copier le texte/ }));
    return onCopy;
  };

  it("LinkedIn (contenu IA) : copie sans markdown", () => {
    expect(renderResult("linkedin", { content: RAW })).toHaveBeenLastCalledWith(CLEAN);
  });

  it("LinkedIn (texte retouché) : copie sans markdown", () => {
    expect(renderResult("linkedin", { content: "x", edited_text: RAW })).toHaveBeenLastCalledWith(CLEAN);
  });
});
