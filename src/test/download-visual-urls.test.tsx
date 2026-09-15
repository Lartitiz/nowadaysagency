import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadVisualUrls, fetchVisualFiles } from "@/lib/download-visual-urls";

const zipState = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("jszip", () => ({
  default: class {
    file(name: string) {
      zipState.names.push(name);
      return this;
    }
    async generateAsync() {
      return new Blob(["zip"], { type: "application/zip" });
    }
  },
}));

const fetchMock = vi.fn();
const clickMock = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

beforeEach(() => {
  fetchMock.mockReset();
  clickMock.mockClear();
  zipState.names = [];
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:download"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("téléchargement des visuels calendrier", () => {
  it("conserve les sept visuels dans leur ordre et crée une seule archive", async () => {
    const urls = Array.from({ length: 7 }, (_, index) => `https://assets.test/slide-${index + 1}.jpg`);
    fetchMock.mockImplementation(async (url: string) =>
      new Response(new Blob([url], { type: "image/jpeg" }), { status: 200 }),
    );

    const files = await fetchVisualFiles(urls);
    expect(files.map((file) => file.name)).toEqual(urls.map((_, index) => `slide-${index + 1}.jpg`));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls);

    fetchMock.mockClear();
    const count = await downloadVisualUrls(urls, "Mon carrousel");
    expect(count).toBe(7);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(urls);
    expect(zipState.names).toEqual(urls.map((_, index) => `slide-${index + 1}.jpg`));
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect((clickMock.mock.contexts[0] as HTMLAnchorElement).download).toBe("visuels-Mon-carrousel.zip");
  });

  it("télécharge directement l'unique visuel avec son format", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["one"], { type: "image/png" }),
    });
    expect(await downloadVisualUrls(["https://assets.test/cover"], "Post")).toBe(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect((clickMock.mock.contexts[0] as HTMLAnchorElement).download).toBe("slide-1.png");
  });

  it("refuse une archive partielle et nomme le visuel en échec", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Blob(["one"], { type: "image/jpeg" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("expired", { status: 403 }));
    await expect(
      downloadVisualUrls(
        ["https://assets.test/slide-1.jpg", "https://assets.test/slide-2.jpg"],
        "Carrousel",
      ),
    ).rejects.toThrow("Le visuel 2 sur 2 n'a pas pu être téléchargé.");
    expect(clickMock).not.toHaveBeenCalled();
  });
});
