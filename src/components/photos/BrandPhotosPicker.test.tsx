import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  demo: false,
  website: "www.mon-site.fr" as string | null,
  instagram: false,
  profileInstagram: null as string | null,
  connectedInstagram: null as string | null,
  activityType: "artisane" as string,
  productOrService: "services" as string,
  existingSources: [] as string[],
  scan: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-test" } }) }));
vi.mock("@/contexts/DemoContext", () => ({ useDemoContext: () => ({ isDemoMode: m.demo }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "ws-1" }));
vi.mock("@/hooks/use-social-connections", () => ({
  useSocialConnections: () => ({
    connected: { instagram: m.instagram },
    accountNames: { instagram: m.connectedInstagram },
    loading: false,
  }),
}));
vi.mock("@/hooks/use-user-photos", () => ({ useUploadLibraryPhotos: () => ({ mutate: m.upload }) }));
vi.mock("@/lib/posthog", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.scan }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => table === "user_photos"
      ? { select: () => {
          const query = {
            eq: () => query,
            is: () => query,
            in: async () => ({ data: m.existingSources.map(source_image_url => ({ source_image_url, status: "ready", removed_from_library_at: null })) }),
          };
          return query;
        } }
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { website_url: m.website, instagram_username: m.profileInstagram, instagram_url: null, type_activite: m.activityType, product_or_service: m.productOrService },
        }) }) }) },
  },
}));
import { BrandPhotosPicker } from "@/components/photos/BrandPhotosPicker";

const images = [
  { url: "https://mon-site.fr/a.jpg", alt: "Atelier" },
  { url: "https://mon-site.fr/b.jpg", alt: "Portrait" },
];

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1000, height: 1000, close: vi.fn() })));
  m.demo = false;
  m.website = "www.mon-site.fr";
  m.instagram = false;
  m.profileInstagram = null;
  m.connectedInstagram = null;
  m.activityType = "artisane";
  m.productOrService = "services";
  m.existingSources = [];
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("BrandPhotosPicker", () => {
  it("importe automatiquement les photos des fiches produit et conserve leur URL d'origine", async () => {
    m.productOrService = "produits";
    m.scan.mockImplementation(async (_fn: string, { body }: { body: { mode: string } }) =>
      body.mode === "product-scan"
        ? { data: { images: [{ url: "https://mon-site.fr/produits/savon.jpg", alt: "Savon" }] } }
        : { data: { base64: btoa("x"), contentType: "image/jpeg" } },
    );
    m.upload.mockImplementation(async (_files, sourceUrls) => {
      m.existingSources = sourceUrls;
      return { uploaded: 1, failed: 0, photoIds: ["p1"] };
    });
    const onReadyChange = vi.fn();
    render(<BrandPhotosPicker placement="welcome" onReadyChange={onReadyChange} />);

    await screen.findByText(/1 photo de produit prête dans Mes photos/);
    expect(m.scan).toHaveBeenCalledWith("site-photos-scan", {
      body: { mode: "product-scan", websiteUrl: "www.mon-site.fr" },
    }, 45000);
    expect(m.upload.mock.calls[0][1]).toEqual(["https://mon-site.fr/produits/savon.jpg"]);
    expect(onReadyChange).toHaveBeenLastCalledWith(true);
  });

  it("ne réimporte pas une photo produit déjà présente", async () => {
    m.productOrService = "les_deux";
    m.existingSources = ["https://mon-site.fr/produits/savon.jpg"];
    m.scan.mockResolvedValue({ data: { images: [{ url: m.existingSources[0], alt: "Savon" }] } });
    render(<BrandPhotosPicker placement="welcome" />);
    await screen.findByText(/1 photo de produit prête dans Mes photos/);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("écarte automatiquement une vignette trop petite et permet de poursuivre manuellement", async () => {
    m.productOrService = "produits";
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));
    m.scan.mockImplementation(async (_fn: string, { body }: { body: { mode: string } }) =>
      body.mode === "product-scan"
        ? { data: { images: [{ url: "https://mon-site.fr/tiny.jpg", alt: "Petit produit" }] } }
        : { data: { base64: btoa("x"), contentType: "image/jpeg" } },
    );
    render(<BrandPhotosPicker placement="welcome" />);
    await screen.findByText(/Je n'ai pas trouvé de photo de produit exploitable/);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("permet de relancer une recherche de produits après une erreur réseau", async () => {
    m.productOrService = "produits";
    m.scan
      .mockResolvedValueOnce({ error: { message: "réseau" } })
      .mockResolvedValueOnce({ data: { images: [] } });
    render(<BrandPhotosPicker placement="welcome" />);
    fireEvent.click(await screen.findByRole("button", { name: "Réessayer la recherche" }));
    await screen.findByText(/Je n'ai pas trouvé de photo de produit exploitable/);
    expect(m.scan).toHaveBeenCalledTimes(2);
  });
  it("scanne le site tout seul, puis ajoute les photos cochées à la bibliothèque", async () => {
    m.scan.mockImplementation(async (_fn: string, { body }: { body: { mode: string } }) =>
      body.mode === "scan"
        ? { data: { images } }
        : { data: { base64: btoa("x"), contentType: "image/jpeg" } },
    );
    m.upload.mockResolvedValue({ uploaded: 1, failed: 0, photoIds: ["p1"] });
    render(<BrandPhotosPicker placement="welcome" />);

    fireEvent.click(await screen.findByAltText("Portrait"));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter 1 photo à ma bibliothèque" }));

    await screen.findByText(/1 photo ajoutée à ta bibliothèque/);
    expect(m.scan).toHaveBeenCalledWith(
      "site-photos-scan",
      { body: { mode: "scan", websiteUrl: "www.mon-site.fr" } },
      45000,
    );
    expect(m.scan).toHaveBeenCalledWith(
      "site-photos-scan",
      { body: { mode: "fetch", imageUrl: "https://mon-site.fr/b.jpg" } },
      45000,
    );
    const files = m.upload.mock.calls[0][0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("b.jpg");
  });

  it("ne s'affiche pas sans site ni Instagram connecté (aucun scan)", async () => {
    m.website = "je fais des bougies";
    const { container } = render(<BrandPhotosPicker placement="welcome" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(m.scan).not.toHaveBeenCalled();
  });

  it("se retire si le site ne donne aucune photo", async () => {
    m.scan.mockResolvedValue({ data: { images: [] } });
    const { container } = render(<BrandPhotosPicker placement="brand_review" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("ajoute les photos Instagram quand le compte est connecté", async () => {
    m.instagram = true;
    m.profileInstagram = "@monatelier";
    m.connectedInstagram = "monatelier";
    m.website = null;
    m.scan.mockResolvedValue({ data: { images: [{ url: "https://cdn.ig/1.jpg", alt: "Post" }] } });
    render(<BrandPhotosPicker placement="welcome" />);
    await screen.findByAltText("Post");
    expect(m.scan).toHaveBeenCalledWith(
      "site-photos-scan",
      { body: { mode: "instagram", workspace_id: "ws-1" } },
      45000,
    );
    expect(screen.getByText(/sur ton Instagram/)).toBeInTheDocument();
  });

  it("écarte les photos d'un compte Instagram relié à une autre marque", async () => {
    m.instagram = true;
    m.profileInstagram = "https://www.instagram.com/lamaiastra/";
    m.connectedInstagram = "nowadaysagency";
    m.scan.mockResolvedValue({ data: { images } });

    render(<BrandPhotosPicker placement="welcome" />);
    await screen.findByAltText("Portrait");

    expect(m.scan).toHaveBeenCalledWith(
      "site-photos-scan",
      { body: { mode: "scan", websiteUrl: "www.mon-site.fr" } },
      45000,
    );
    expect(m.scan.mock.calls.some(([, options]) => options?.body?.mode === "instagram")).toBe(false);
    expect(screen.getByText(/compte Instagram connecté.*n'est pas celui de cette marque/)).toBeInTheDocument();
  });

  it("écarte les photos Instagram quand le compte connecté n'est pas identifiable", async () => {
    m.instagram = true;
    m.profileInstagram = "@lamaiastra";
    m.connectedInstagram = null;
    m.scan.mockResolvedValue({ data: { images } });

    render(<BrandPhotosPicker placement="welcome" />);
    await screen.findByAltText("Portrait");

    expect(m.scan.mock.calls.some(([, options]) => options?.body?.mode === "instagram")).toBe(false);
    expect(screen.getByText(/compte Instagram connecté n'a pas pu être identifié/)).toBeInTheDocument();
  });

  it("reste masqué en mode démo", () => {
    m.demo = true;
    const { container } = render(<BrandPhotosPicker placement="welcome" />);
    expect(container).toBeEmptyDOMElement();
    expect(m.scan).not.toHaveBeenCalled();
  });
});
