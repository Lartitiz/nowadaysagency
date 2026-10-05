import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DownloadMenuItems } from "@/components/exports/DownloadMenuItems";

function renderMenu(props: Parameters<typeof DownloadMenuItems>[0]) {
  return render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Télécharger</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DownloadMenuItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("menu Télécharger : PDF document LinkedIn", () => {
  it("propose le PDF seulement quand l'export est fourni (carrousel LinkedIn)", () => {
    const { unmount } = renderMenu({ onPng: () => {}, count: 8 });
    expect(screen.queryByText("PDF : document LinkedIn")).toBeNull();
    unmount();
    const onPdf = vi.fn();
    renderMenu({ onPng: () => {}, onPdf, count: 8 });
    fireEvent.click(screen.getByText("PDF : document LinkedIn"));
    expect(onPdf).toHaveBeenCalledTimes(1);
  });
});
