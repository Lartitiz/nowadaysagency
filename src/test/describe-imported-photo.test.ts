// Légende automatique d'une photo importée dans /creer (26/11/2026).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), downscale: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/image-vision", () => ({ downscaleBase64ForVision: mocks.downscale }));

import { describeImportedPhoto, DESCRIBE_IMPORTED_TIMEOUT_MS } from "@/features/creer/describe-imported-photo";

describe("describeImportedPhoto", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.downscale.mockResolvedValue("data:image/jpeg;base64,LEGER"); });

  it("envoie l'image allégée au mode describe_image et rend la légende", async () => {
    mocks.invoke.mockResolvedValue({ data: { description: " La façade côté rue " }, error: null });
    expect(await describeImportedPhoto({ base64: "LOURD", mimeType: "image/png" }, "ws-1")).toBe("La façade côté rue");
    expect(mocks.downscale).toHaveBeenCalledWith("LOURD");
    const [fn, opts, timeout] = mocks.invoke.mock.calls[0];
    expect(fn).toBe("photo-describe");
    expect(opts.body).toEqual({ mode: "describe_image", workspace_id: "ws-1", image: { base64: "data:image/jpeg;base64,LEGER", mimeType: "image/png" } });
    expect(timeout).toBe(DESCRIBE_IMPORTED_TIMEOUT_MS);
  });

  it("rend une ligne vide, sans bloquer, quand rien n'est possible", async () => {
    expect(await describeImportedPhoto({})).toBe("");
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.downscale.mockResolvedValueOnce(null);
    expect(await describeImportedPhoto({ base64: "X" })).toBe("");
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("500") });
    expect(await describeImportedPhoto({ base64: "X" })).toBe("");
    mocks.invoke.mockRejectedValueOnce(new Error("réseau"));
    expect(await describeImportedPhoto({ base64: "X" })).toBe("");
    mocks.invoke.mockResolvedValueOnce({ data: { description: 42 }, error: null });
    expect(await describeImportedPhoto({ base64: "X" })).toBe("");
  });

  it("coupe une légende trop longue à la place laissée par le marqueur avant / après", async () => {
    mocks.invoke.mockResolvedValue({ data: { description: "a".repeat(400) }, error: null });
    expect((await describeImportedPhoto({ base64: "X" })).length).toBe(192);
  });
});
