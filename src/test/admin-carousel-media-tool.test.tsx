import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import AdminCarouselMediaTool from "@/components/admin/AdminCarouselMediaTool";
afterEach(() => { cleanup(); invoke.mockReset(); });

const report = (over: Record<string, unknown> = {}) => ({ processed: 5, converted: 0, unchanged: 0, conflicts: 0, images: 0, bytesBefore: 0, bytesAfter: 0, failed: [], next: null, done: true, ...over });

it("simulates first (nothing modified), page by page, then allows the real conversion", async () => {
  invoke.mockImplementation(async (_name: string, { body }: any) => {
    if (body.table === "saved_ideas" && !body.after) return { data: report({ converted: 5, images: 12, bytesBefore: 40_000_000, next: "id-5", done: false }), error: null };
    if (body.table === "saved_ideas") return { data: report({ converted: 2, images: 3, bytesBefore: 5_000_000, next: "id-7" }), error: null };
    return { data: report({ converted: 1, images: 1, bytesBefore: 1_000_000, next: "c-1" }), error: null };
  });
  render(<AdminCarouselMediaTool />);
  expect(screen.getByRole("button", { name: /Lancer la conversion/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Simuler/ }));
  expect(await screen.findByText("Terminé.")).toBeVisible();
  expect(invoke.mock.calls.every(([, { body }]) => body.dryRun === true)).toBe(true);
  expect(invoke.mock.calls.map(([, { body }]) => [body.table, body.after])).toEqual([["saved_ideas", null], ["saved_ideas", "id-5"], ["calendar_posts", null]]);
  expect(screen.getByText(/7 contenu\(s\) à convertir, 15 photo\(s\), 45 Mo/)).toBeVisible();
  expect(screen.getByRole("button", { name: /Lancer la conversion/ })).toBeEnabled();
});

it("reports conversions, conflicts and untouched failures; a server error stops with a message", async () => {
  invoke.mockResolvedValueOnce({ data: report({ converted: 1 }), error: null }).mockResolvedValueOnce({ data: report(), error: null });
  render(<AdminCarouselMediaTool />);
  fireEvent.click(screen.getByRole("button", { name: /Simuler/ }));
  await screen.findByText("Terminé.");
  invoke.mockResolvedValueOnce({ data: report({ converted: 3, images: 4, bytesBefore: 9_000_000, bytesAfter: 30_000, conflicts: 1, failed: [{ id: "abcdef123456", reasons: ["content_data : taille différente"] }] }), error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("Forbidden") });
  fireEvent.click(screen.getByRole("button", { name: /Lancer la conversion/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Forbidden");
  expect(invoke.mock.calls.slice(2).every(([, { body }]) => body.dryRun === false)).toBe(true);
  expect(screen.getByText(/3 contenu\(s\) convertis, 4 photo\(s\) rangées : 9 Mo → 30 Ko/)).toBeVisible();
  expect(screen.getByText(/1 contenu\(s\) modifié\(s\) pendant la conversion/)).toBeVisible();
  expect(screen.getByText(/1 contenu\(s\) non convertis/)).toBeVisible();
});
