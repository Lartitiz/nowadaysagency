import { beforeEach, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: invoke }));
import {
  studioRequest,
  StudioRequestError,
} from "@/features/visual-studio/api";
beforeEach(() => invoke.mockReset());
it("preserves a definite server retry code and explanation from normalized transport data", async () => {
  invoke.mockResolvedValue({
    data: { error: "Renvoie ta demande.", code: "refresh_request" },
    error: { code: "SERVER_ERROR", message: "Service indisponible" },
  });
  await expect(studioRequest({ action: "message" })).rejects.toMatchObject({
    message: "Renvoie ta demande.",
    code: "refresh_request",
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("does not invent a safe retry for an ambiguous transport failure", async () => {
  invoke.mockResolvedValue({
    data: null,
    error: { code: "TIMEOUT", message: "La réponse peut encore arriver." },
  });
  const error = await studioRequest({ action: "message" }).catch((e) => e);
  expect(error).toBeInstanceOf(StudioRequestError);
  expect(error.code).toBeUndefined();
  expect(error.message).toBe("La réponse peut encore arriver.");
  expect(invoke).toHaveBeenCalledTimes(1);
});
