import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreerStepFormat from "@/components/creer/CreerStepFormat";
import { RECAP_PREFIX } from "../../supabase/functions/_shared/multi-subject";

const m = vi.hoisted(() => ({ inserts: [] as any[], error: null as any }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => ({ column: "user_id", value: "u1" }), useWorkspaceId: () => "u1" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const q: any = { select: () => q, eq: () => q, order: () => q, insert: (rows: any) => { m.inserts.push({ table, rows }); return Promise.resolve({ error: m.error }); } };
  return q;
} } }));

const para = (s: string) => `${s} `.repeat(12);
const VEILLE = `1. Les Reels longs pourraient toucher des non-abonnées\n\n${para("Un test rapporté par une experte.")}\n\n2. Ne pas juger un post à 48 h\n\n${para("La relation se construit sur des mois.")}\n\n3. Raconter la fabrication\n\n${para("Les gens et le savoir-faire avant l'objet.")}`;

function Harness({ initial }: { initial: string }) {
  const [idea, setIdea] = useState(initial);
  return <>
    <pre data-testid="idea">{idea}</pre>
    <CreerStepFormat idea={idea} initialFormat="story" onNext={() => {}} onBack={() => {}} onIdeaChange={setIdea} />
  </>;
}

beforeEach(() => { m.inserts = []; m.error = null; });

describe("stories sur un brief à plusieurs sujets", () => {
  it("demande quoi faire et bloque Suivant tant que rien n'est choisi", () => {
    render(<Harness initial={VEILLE} />);
    expect(screen.getByText("Ton texte contient 3 sujets")).toBeInTheDocument();
    expect(screen.getByTestId("creer-format-next")).toBeDisabled();
  });

  it("séquence récap : le brief est préfixé, Suivant se débloque, on peut revenir au choix", () => {
    render(<Harness initial={VEILLE} />);
    fireEvent.click(screen.getByRole("button", { name: "Une séquence récap des 3 sujets" }));
    expect(screen.getByTestId("idea").textContent?.startsWith(RECAP_PREFIX)).toBe(true);
    expect(screen.getByTestId("creer-format-next")).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Changer" }));
    expect(screen.getByTestId("idea").textContent).toBe(VEILLE.trim());
  });

  it("un seul sujet : le brief garde ce sujet, les autres sont rangés en briefs complets", async () => {
    render(<Harness initial={VEILLE} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "2. Ne pas juger un post à 48 h" })); });
    await waitFor(() => expect(screen.getByTestId("idea").textContent?.startsWith("2. Ne pas juger")).toBe(true));
    expect(screen.getByTestId("idea").textContent).not.toContain("Reels longs");
    expect(m.inserts).toHaveLength(1);
    expect(m.inserts[0].table).toBe("content_briefs");
    expect(m.inserts[0].rows.map((r: any) => r.subject.split("\n")[0])).toEqual(["1. Les Reels longs pourraient toucher des non-abonnées", "3. Raconter la fabrication"]);
    expect(m.inserts[0].rows[0]).toMatchObject({ user_id: "u1", workspace_id: null, format: "story", questions: [], answers: {} });
    expect(screen.queryByText("Ton texte contient 3 sujets")).not.toBeInTheDocument();
  });

  it("rangement en échec : rien ne change", async () => {
    m.error = { message: "offline" };
    render(<Harness initial={VEILLE} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "3. Raconter la fabrication" })); });
    expect(screen.getByTestId("idea").textContent).toBe(VEILLE);
  });

  it("un brief ordinaire ne montre rien", () => {
    render(<Harness initial="Pourquoi publier tous les jours ne sert à rien" />);
    expect(screen.queryByTestId("multi-subject-choice")).not.toBeInTheDocument();
  });
});
