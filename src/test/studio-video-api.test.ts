import { expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
import { videoRequest } from "@/features/studio-video/api";
it("conserve la raison du refus serveur", async () => {
  invoke.mockResolvedValue({ data: { error: "Plafond vidéo atteint" }, error: { message: "Generic" } });
  await expect(videoRequest({action:"quote"})).rejects.toThrow("Plafond vidéo atteint");
});
it("conserve le job incertain même si le transport retourne une erreur", async () => {
  const data = { job: { id: "j", status: "submitting_uncertain" }, error: "Réponse incertaine" };
  invoke.mockResolvedValue({ data, error: { message: "Generic" } });
  await expect(videoRequest({ action: "submit" })).resolves.toEqual(data);
});
