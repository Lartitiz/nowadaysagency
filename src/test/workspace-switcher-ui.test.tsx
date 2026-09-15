import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "@/components/AppHeader";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const navigate = vi.fn();

beforeEach(() => {
  navigate.mockClear();
});

it("does not navigate when role verification fails", async () => {
  const switchWorkspace = vi.fn().mockResolvedValue(false);
  render(
    <WorkspaceSwitcher
      activeWorkspace={{ id: "A", name: "Alpha" }}
      workspaces={[
        { id: "A", name: "Alpha" },
        { id: "B", name: "Beta" },
      ]}
      switchWorkspace={switchWorkspace}
      switchingWorkspaceId={null}
      navigate={navigate}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Beta/ }));

  await waitFor(() => expect(switchWorkspace).toHaveBeenCalledWith("B"));
  expect(navigate).not.toHaveBeenCalled();
});

it("navigates only after the workspace and role switch succeeds", async () => {
  const switchWorkspace = vi.fn().mockResolvedValue(true);
  render(
    <WorkspaceSwitcher
      activeWorkspace={{ id: "A", name: "Alpha" }}
      workspaces={[
        { id: "A", name: "Alpha" },
        { id: "B", name: "Beta" },
      ]}
      switchWorkspace={switchWorkspace}
      switchingWorkspaceId={null}
      navigate={navigate}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /Beta/ }));

  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
  expect(switchWorkspace).toHaveBeenCalledWith("B");
});

it("disables the real header selector while a role is being verified", () => {
  render(
    <WorkspaceSwitcher
      activeWorkspace={{ id: "A", name: "Alpha" }}
      workspaces={[
        { id: "A", name: "Alpha" },
        { id: "B", name: "Beta" },
      ]}
      switchWorkspace={vi.fn()}
      switchingWorkspaceId="B"
      navigate={navigate}
    />,
  );

  expect(screen.getAllByRole("button", { name: /Alpha/ })).toHaveLength(2);
  for (const button of screen.getAllByRole("button", { name: /Alpha/ })) {
    expect(button).toBeDisabled();
  }
  expect(screen.getByRole("button", { name: /Beta/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Beta/ })).toHaveAttribute("aria-busy", "true");
});
