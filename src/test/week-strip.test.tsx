import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WeekStrip, { type WeekPost } from "@/components/dashboard/WeekStrip";
import { toLocalDateStr } from "@/lib/utils";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

function renderStrip(posts: WeekPost[], isLoading = false) {
  return render(
    <MemoryRouter>
      <WeekStrip posts={posts} isLoading={isLoading} />
    </MemoryRouter>,
  );
}

describe("WeekStrip", () => {
  it("affiche 7 cases jour, toutes libres sans contenu", () => {
    renderStrip([]);
    const cells = screen.getAllByRole("button", { name: /rien de prévu/i });
    expect(cells).toHaveLength(7);
    expect(screen.getByText(/rien de prévu pour l'instant/i)).toBeTruthy();
  });

  it("affiche réseau + format dans la case planifiée et le détail du prochain contenu", () => {
    const posts: WeekPost[] = [
      { date: daysFromNow(1), theme: "Anti-hustle culture", format: "Carrousel", canal: "instagram" },
    ];
    renderStrip(posts);
    // Case planifiée : libellé du format visible (desktop)
    expect(screen.getByText("carrousel")).toBeTruthy();
    // Ligne de détail : format + réseau + thème
    expect(screen.getByText(/carrousel Instagram — Anti-hustle culture/i)).toBeTruthy();
    // 6 cases restent libres
    expect(screen.getAllByRole("button", { name: /rien de prévu/i })).toHaveLength(6);
  });

  it("regroupe plusieurs contenus le même jour en « N contenus »", () => {
    const day = daysFromNow(2);
    const posts: WeekPost[] = [
      { date: day, theme: "A", format: "Story", canal: "instagram" },
      { date: day, theme: "B", format: "Post", canal: "linkedin" },
    ];
    renderStrip(posts);
    expect(screen.getByText("2 contenus")).toBeTruthy();
  });

  it("montre le prochain contenu même s'il tombe après les 7 jours affichés", () => {
    const posts: WeekPost[] = [
      { date: daysFromNow(11), theme: "3 erreurs fréquentes", format: "Post", canal: "instagram" },
    ];
    renderStrip(posts);
    // Aucune case remplie…
    expect(screen.getAllByRole("button", { name: /rien de prévu/i })).toHaveLength(7);
    // …mais la ligne de détail annonce bien le prochain contenu
    expect(screen.getByText(/post Instagram — 3 erreurs fréquentes/i)).toBeTruthy();
    expect(screen.getByText(/^Prochain —/)).toBeTruthy();
  });
});
