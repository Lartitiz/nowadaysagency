import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/* Passe du 16/10 : une idée du diagnostic reprise telle quelle doit transmettre
   sa fiche, sinon le contenu crée une seconde fiche et l'idée reste « à placer ».
   Et l'écran Format rappelle le sujet avec un lien pour le changer. */

const filters = vi.hoisted(() => [] as string[]);
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: (c: string, v: string) => { filters.push(`eq:${c}=${v}`); return chain; },
    is: (c: string) => { filters.push(`is:${c}`); return chain; },
    order: () => chain,
    limit: () => Promise.resolve({ data: [{ id: "idee-1", titre: "Mes bijoux en petites séries" }], error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "user_id", value: "u1" }) }));
vi.mock("@/components/ui/textarea-with-voice", () => ({
  TextareaWithVoice: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
vi.mock("@/components/dashboard/ContentCoachingDialog", () => ({ default: () => null }));
vi.mock("@/components/creer/CreerTransformTab", () => ({ default: () => null }));

import CreerStepIdea from "@/components/creer/CreerStepIdea";
import CreerSubjectLine from "@/components/creer/CreerSubjectLine";

describe("Idée du diagnostic reliée au contenu", () => {
  it("transmet la fiche quand l'idée est reprise telle quelle, pas quand elle est réécrite", async () => {
    const onNext = vi.fn();
    render(<MemoryRouter><CreerStepIdea onNext={onNext} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Mes bijoux en petites séries" }));
    fireEvent.click(screen.getByTestId("creer-idea-next"));
    expect(onNext).toHaveBeenLastCalledWith("Mes bijoux en petites séries", "idee-1");
    // Seules les idées encore intactes sont proposées.
    expect(filters).toEqual(expect.arrayContaining(["eq:status=to_explore", "is:calendar_post_id", "is:content_data"]));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Un tout autre sujet" } });
    fireEvent.click(screen.getByTestId("creer-idea-next"));
    expect(onNext).toHaveBeenLastCalledWith("Un tout autre sujet", undefined);
  });

  it("l'écran Format montre le sujet et ramène à l'idée pour le changer", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CreerSubjectLine idea="  Mes bijoux en petites séries " onChange={onChange} />);
    expect(screen.getByTestId("creer-format-subject")).toHaveTextContent("Sujet : Mes bijoux en petites sériesChanger le sujet");
    fireEvent.click(screen.getByRole("button", { name: "Changer le sujet" }));
    expect(onChange).toHaveBeenCalledOnce();
    rerender(<CreerSubjectLine idea="  " onChange={onChange} />);
    expect(screen.queryByTestId("creer-format-subject")).toBeNull();
  });
});
