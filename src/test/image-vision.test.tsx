/**
 * Garde anti-546 de l'analyse vision (src/lib/image-vision.ts) :
 * une photo indécodable (HEIC, corrompue…) ne doit JAMAIS repartir en plein
 * format vers l'edge quand elle dépasse le plafond — à ~28 Mo de corps la
 * passerelle Supabase répond 546 WORKER_RESOURCE_LIMIT (mesuré 21/07).
 * Et on ne filtre jamais : l'alignement d'index photo↔slide doit tenir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import {
  downscaleBase64ForVision,
  downscalePhotosForVision,
  VISION_UNDECODABLE_MAX_CHARS,
} from "@/lib/image-vision";

// jsdom ne décode pas d'images : on pilote le décodage nous-mêmes.
// Décodable ssi la data URL est en image/jpeg ; largeur configurable.
const imageConfig = { width: 800, height: 600 };
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  set src(value: string) {
    queueMicrotask(() => {
      if (value.startsWith("data:image/jpeg")) {
        this.width = imageConfig.width;
        this.height = imageConfig.height;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
}

const SMALL_JPEG = "data:image/jpeg;base64,AAAABBBB";
const SMALL_UNDECODABLE = "data:image/heic;base64,CCCCDDDD";
const HUGE_UNDECODABLE =
  "data:image/heic;base64," + "A".repeat(VISION_UNDECODABLE_MAX_CHARS + 1000);

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  imageConfig.width = 800;
  imageConfig.height = 600;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.toast.warning.mockReset();
});

describe("downscaleBase64ForVision", () => {
  it("renvoie l'original si l'image est décodable et déjà petite", async () => {
    await expect(downscaleBase64ForVision(SMALL_JPEG)).resolves.toBe(SMALL_JPEG);
  });

  it("tolère une image indécodable si elle reste sous le plafond (comportement historique)", async () => {
    await expect(downscaleBase64ForVision(SMALL_UNDECODABLE)).resolves.toBe(
      SMALL_UNDECODABLE,
    );
  });

  it("renvoie null (à écarter) si l'image est indécodable ET dépasse le plafond", async () => {
    await expect(downscaleBase64ForVision(HUGE_UNDECODABLE)).resolves.toBeNull();
  });

  it("secours createImageBitmap : décode et réduit ce que <img> refuse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ blob: async () => ({}) })),
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 2000, height: 1000, close: vi.fn() })),
    );
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toDataURL: () => "data:image/jpeg;base64,DOWNSCALED",
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      fakeCanvas as unknown as HTMLElement,
    );
    await expect(downscaleBase64ForVision(HUGE_UNDECODABLE)).resolves.toBe(
      "data:image/jpeg;base64,DOWNSCALED",
    );
  });
});

describe("downscalePhotosForVision", () => {
  it("remplace une photo indécodable trop lourde par un pavé minuscule SANS changer la longueur du tableau", async () => {
    const photos = [
      { base64: SMALL_JPEG, context: "photo 1" },
      { base64: HUGE_UNDECODABLE, context: "photo 2" },
      { base64: SMALL_JPEG, context: "photo 3" },
    ];
    const out = await downscalePhotosForVision(photos);
    expect(out).toHaveLength(3);
    // Les photos saines sont intactes, contexte conservé
    expect(out![0].base64).toBe(SMALL_JPEG);
    expect(out![2].base64).toBe(SMALL_JPEG);
    expect(out![1].context).toBe("photo 2");
    // La photo illisible est devenue un pavé minuscule (jamais l'original)
    expect(out![1].base64).not.toBe(HUGE_UNDECODABLE);
    expect(out![1].base64.startsWith("data:image/")).toBe(true);
    expect(out![1].base64.length).toBeLessThan(5000);
    // L'utilisatrice est prévenue
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(String(mocks.toast.warning.mock.calls[0][0])).toContain("1 photo");
  });

  it("onUnreadable remplace le toast par défaut", async () => {
    const onUnreadable = vi.fn();
    await downscalePhotosForVision(
      [{ base64: HUGE_UNDECODABLE }, { base64: HUGE_UNDECODABLE }],
      { onUnreadable },
    );
    expect(onUnreadable).toHaveBeenCalledWith(2);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it("aucun toast quand toutes les photos sont saines", async () => {
    const out = await downscalePhotosForVision([{ base64: SMALL_JPEG }]);
    expect(out![0].base64).toBe(SMALL_JPEG);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });
});
