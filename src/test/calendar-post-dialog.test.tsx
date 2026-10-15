import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fiche 13 de docs/robustesse/gros-fichiers.md, lot T (tests 1 à 8) : la
   fenêtre d'un post du calendrier rendue pour de vrai, AVANT tout découpage.
   Les morceaux d'affichage déjà sortis (CalendarPostContent, Metadata, Preview)
   sont remplacés par des faux qui exposent leurs props : on teste ici la
   fenêtre elle-même (chargement, auto-save, remise à zéro par la clé,
   navigation vers /creer, publication, programmation, brouillon rapide,
   lecteur plein écran). Les menus Radix sont rendus ouverts (faux) pour que
   leurs entrées soient cliquables en jsdom. */

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  user: { id: "u1" } as { id: string } | null,
  workspace: { column: "user_id", value: "u1" },
  workspaceId: "u1",
  social: { connected: true, known: true, expiry: null as string | null, refresh: vi.fn() },
  updates: [] as { table: string; patch: any; id: string }[],
  updateError: [] as (object | null)[],
  brief: null as any,
  uploads: [] as { bucket: string; path: string }[],
  invoke: vi.fn(),
  publishIg: vi.fn(),
  publishReel: vi.fn(),
  publishLi: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  confirm: vi.fn(async () => true),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => m.navigate }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: m.user }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceFilter: () => m.workspace, useWorkspaceId: () => m.workspaceId }));
vi.mock("@/hooks/use-profile", () => ({ useProfile: () => ({ data: { prenom: "Léa", instagram_username: "lea" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-social-connections", () => ({
  useSocialConnections: () => ({
    isConnected: () => m.social.connected, getTokenExpiry: () => m.social.expiry,
    known: m.social.known, loading: false, refresh: m.social.refresh,
  }),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => m.confirm }));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/lib/error-tracker", () => ({ trackError: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: m.invoke }));
vi.mock("@/lib/instagram-publish", async (orig) => ({
  ...(await orig<typeof import("@/lib/instagram-publish")>()),
  publishToInstagram: m.publishIg, publishReelToInstagram: m.publishReel,
}));
vi.mock("@/lib/linkedin-publish", async (orig) => ({
  ...(await orig<typeof import("@/lib/linkedin-publish")>()),
  publishTextToLinkedIn: m.publishLi,
}));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: table === "content_briefs" ? m.brief : null, error: null }),
      update: (patch: any) => ({
        eq: async (_c: string, id: string) => { m.updates.push({ table, patch, id }); return { error: m.updateError.shift() ?? null }; },
      }),
    };
    return q;
  };
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => { m.uploads.push({ bucket, path }); return { error: null }; },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
    }),
  };
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) }, storage } };
});
// Champs à dictée : de simples champs.
vi.mock("@/components/ui/input-with-voice", () => ({ InputWithVoice: (p: any) => <input {...p} /> }));
vi.mock("@/components/ui/textarea-with-voice", () => ({ TextareaWithVoice: (p: any) => <textarea {...p} /> }));
// Menus et volets : rendus ouverts, entrées cliquables.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: any) => <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
}));
// Morceaux déjà sortis : faux qui exposent leurs props.
vi.mock("@/components/calendar/CalendarPostContent", () => ({
  CalendarPostContent: (p: any) => (
    <div>
      <textarea aria-label="brouillon" value={p.contentDraft ?? ""} onChange={(e) => p.setContentDraft(e.target.value)} />
      <button onClick={p.onSmartGenerate}>faux:générer</button>
      <button onClick={p.onOpenAtelier}>faux:atelier</button>
      <button onClick={p.onNavigateToDeepen}>faux:approfondir</button>
      <button onClick={() => p.onNavigateToFormat("reel")}>faux:format-reel</button>
      <button onClick={() => p.onNavigateToFormat("autre")}>faux:format-autre</button>
    </div>
  ),
}));
vi.mock("@/components/calendar/CalendarPostMetadata", async (orig) => ({
  FORMAT_OPTIONS_BY_CANAL: (await orig<typeof import("@/components/calendar/CalendarPostMetadata")>()).FORMAT_OPTIONS_BY_CANAL,
  CalendarPostMetadata: (p: any) => (
    <div>
      <span data-testid="meta">{JSON.stringify({ canal: p.postCanal, format: p.format, angle: p.angle, objectif: p.objectif, status: p.status })}</span>
      <select aria-label="canal" value={p.postCanal} onChange={(e) => p.setPostCanal(e.target.value)}>
        {["instagram", "linkedin", "newsletter", "pinterest"].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input aria-label="format" value={p.format ?? ""} onChange={(e) => p.setFormat(e.target.value || null)} />
      <input aria-label="angle" value={p.angle ?? ""} onChange={(e) => p.setAngle(e.target.value || null)} />
      <input aria-label="objectif" value={p.objectif ?? ""} onChange={(e) => p.setObjectif(e.target.value || null)} />
    </div>
  ),
}));
vi.mock("@/components/calendar/CalendarPostPreview", () => ({
  CalendarPostPreview: (p: any) => <div>{p.onFullscreen && <button onClick={p.onFullscreen}>faux:plein-écran</button>}</div>,
}));
vi.mock("@/components/calendar/PostCommentsSection", () => ({ PostCommentsSection: () => null }));
vi.mock("@/components/SavedContentPreview", () => ({ SavedContentPreview: (p: any) => <div data-testid="viewer">{String(p.editable)}</div> }));
vi.mock("@/components/ContentPreview", () => ({ RevertToOriginalButton: (p: any) => <button onClick={p.onRevert}>faux:original</button> }));

import { CalendarPostDialog } from "@/components/calendar/CalendarPostDialog";

const VIDEO = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/calendar-media/u1/reel.mp4`;
const IMG = (i: number) => `https://cdn.test/img-${i}.png`;

function post(extra: Record<string, any> = {}): any {
  return { id: "p1", date: "2026-11-03", theme: "Mon sujet", angle: null, status: "idea", notes: "", canal: "instagram", objectif: null, ...extra };
}

function renderDialog(props: Record<string, any> = {}) {
  const base = {
    open: true, onOpenChange: vi.fn(), editingPost: null, selectedDate: "2026-11-03", defaultCanal: "all",
    onSave: vi.fn(), onDelete: vi.fn(), onAutoSave: vi.fn(async (..._args: any[]) => ({ post: { id: "neuf-1" } })), ...props,
  };
  const r = render(<CalendarPostDialog {...(base as any)} />);
  return { ...r, props: base, rerenderWith: (more: Record<string, any>) => r.rerender(<CalendarPostDialog {...(base as any)} {...more} />) };
}

const theme = () => screen.getByPlaceholderText("De quoi parle ce post ?") as HTMLTextAreaElement;
const draft = () => screen.getByLabelText("brouillon") as HTMLTextAreaElement;
const meta = () => JSON.parse(screen.getByTestId("meta").textContent!);
const item = (name: RegExp | string) => screen.getByRole("menuitem", { name });

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "u1" }; m.workspace = { column: "user_id", value: "u1" }; m.workspaceId = "u1";
  m.social = { connected: true, known: true, expiry: null, refresh: vi.fn() };
  m.updates.length = 0; m.updateError.length = 0; m.brief = null; m.uploads.length = 0;
  m.confirm.mockResolvedValue(true);
});

describe("chargement du post", () => {
  it.each([
    ["content_draft", { content_draft: "Texte enregistré", story_sequence_detail: { full_content: "autre" } }, "Texte enregistré"],
    ["full_content", { story_sequence_detail: { full_content: "Texte complet" } }, "Texte complet"],
    ["stories", { story_sequence_detail: { stories: [{ text: "Story 1" }, { text: "Story 2" }] } }, "Story 1\n\nStory 2"],
    ["script de reel", { story_sequence_detail: { script: [{ texte_parle: "Phrase 1" }, { texte_parle: "Phrase 2" }] } }, "Phrase 1\n\nPhrase 2"],
  ])("brouillon reconstruit depuis %s", (_n, extra, attendu) => {
    renderDialog({ editingPost: post(extra) });
    expect(draft().value).toBe(attendu);
    expect(theme().value).toBe("Mon sujet");
  });

  it("post neuf : canal par défaut Instagram quand le filtre vaut « all », sinon le canal du filtre", () => {
    const { unmount } = renderDialog({ defaultCanal: "all" });
    expect(meta().canal).toBe("instagram");
    unmount();
    renderDialog({ defaultCanal: "linkedin" });
    expect(meta().canal).toBe("linkedin");
  });

  it("prefillData remplit le sujet", () => {
    renderDialog({ prefillData: { theme: "Idée reçue", notes: "n" } });
    expect(theme().value).toBe("Idée reçue");
  });

  it("brief créatif lié affiché (réponses non vides seulement)", async () => {
    m.brief = { subject: "s", created_at: "x", questions: [{ id: "q1", question: "Pourquoi ?" }, { id: "q2", question: "Vide ?" }], answers: { q1: "Parce que", q2: " " } };
    renderDialog({ editingPost: post() });
    expect(await screen.findByText("Parce que")).toBeInTheDocument();
    expect(screen.queryByText("Vide ?")).toBeNull();
  });
});

describe("en-tête de contexte", () => {
  it("réseau, format, date, objectif, angle, et statut changé depuis le menu", () => {
    renderDialog({ editingPost: post({ format: "reel", objectif: "vente", angle: "storytelling_pro" }) });
    expect(screen.getByText("Reel Instagram")).toBeInTheDocument();
    expect(screen.getByText("💰 Vente")).toBeInTheDocument();
    expect(screen.getByText("Storytelling")).toBeInTheDocument();
    expect(screen.getByLabelText("Changer le statut du post").textContent).toContain("Idée");
    fireEvent.click(item("Prêt à publier"));
    expect(meta().status).toBe("ready");
    expect(screen.getByLabelText("Changer le statut du post").textContent).toContain("Prêt à publier");
  });
});

describe("visuels", () => {
  it("envoi dans calendar-media sous l'id de l'utilisatrice ; fichier trop lourd refusé ; visuel retiré", async () => {
    m.workspaceId = "w2";
    renderDialog({ editingPost: post() });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const ok = new File(["x"], "photo.JPG", { type: "image/jpeg" });
    const lourd = new File(["x"], "lourd.png", { type: "image/png" });
    Object.defineProperty(lourd, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [ok, lourd] } });
    expect(await screen.findByAltText("Visuel 1")).toBeInTheDocument();
    expect(m.uploads).toHaveLength(1);
    expect(m.uploads[0].bucket).toBe("calendar-media");
    expect(m.uploads[0].path).toMatch(/^u1\/\d+-[a-z0-9]+\.jpg$/);
    expect(m.toast.error).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText("Visuel 2")).toBeNull();
    fireEvent.click(screen.getByLabelText("Supprimer le visuel 1"));
    expect(screen.queryByAltText("Visuel 1")).toBeNull();
  });
});

describe("enregistrement automatique", () => {
  it("rien à l'ouverture ; une frappe → un seul enregistrement après 1,2 s ; le 2e réutilise l'id du 1er", async () => {
    const { props } = renderDialog();
    await act(async () => { await new Promise((r) => setTimeout(r, 1400)); });
    expect(props.onAutoSave).not.toHaveBeenCalled();

    fireEvent.change(theme(), { target: { value: "Nouveau sujet" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(props.onAutoSave).not.toHaveBeenCalled();
    await waitFor(() => expect(props.onAutoSave).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(props.onAutoSave.mock.calls[0][0]).toMatchObject({ theme: "Nouveau sujet", canal: "instagram", content_draft: null, media_urls: null });
    expect(props.onAutoSave.mock.calls[0][1]).toBeNull();
    expect(await screen.findByText("Enregistré")).toBeInTheDocument();

    fireEvent.change(draft(), { target: { value: "Un brouillon" } });
    await waitFor(() => expect(props.onAutoSave).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(props.onAutoSave.mock.calls[1][1]).toBe("neuf-1");
  }, 10000);

  it("ouvrir un post existant (avec sujet) n'enregistre rien tant qu'on ne touche à rien", async () => {
    const { props } = renderDialog({ editingPost: post({ content_draft: "Texte" }) });
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(props.onAutoSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enregistrement automatique")).toBeInTheDocument();
  }, 5000);

  it("pas d'enregistrement sans sujet", async () => {
    const { props } = renderDialog();
    fireEvent.change(draft(), { target: { value: "Texte sans sujet" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(props.onAutoSave).not.toHaveBeenCalled();
    expect(screen.getByText("Ajoute un sujet pour commencer")).toBeInTheDocument();
  }, 5000);

  it("échec → « Non enregistré » puis « Réessayer » relance", async () => {
    const onAutoSave = vi.fn().mockResolvedValueOnce({ error: true }).mockResolvedValueOnce({ post: { id: "p1" } });
    renderDialog({ editingPost: post(), onAutoSave });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    fireEvent.change(theme(), { target: { value: "Sujet modifié" } });
    expect(await screen.findByText(/Non enregistré/, {}, { timeout: 2500 })).toBeInTheDocument();
    expect(m.toast.error).toHaveBeenCalledWith("Sauvegarde impossible", { description: "Réessaie dans un instant." });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(2));
    expect(onAutoSave.mock.calls[1][1]).toBe("p1");
    expect(await screen.findByText("Enregistré")).toBeInTheDocument();
  }, 6000);
});

describe("remise à zéro par la clé", () => {
  it("changer de post ou d'espace vide les champs (aucune fuite d'un post à l'autre)", () => {
    const { rerenderWith } = renderDialog({ editingPost: post({ content_draft: "Texte A" }) });
    fireEvent.change(draft(), { target: { value: "Texte A modifié" } });
    rerenderWith({ editingPost: post({ id: "p2", theme: "Sujet B", content_draft: "Texte B" }) });
    expect(theme().value).toBe("Sujet B");
    expect(draft().value).toBe("Texte B");
    m.workspace = { column: "workspace_id", value: "w2" };
    rerenderWith({ editingPost: null });
    expect(theme().value).toBe("");
    expect(draft().value).toBe("");
  });
});

describe("navigation vers /creer", () => {
  const full = () => post({
    theme: "Sujet", objectif: "vente", angle: "Storytelling", format: "post_carrousel", notes: "N", content_draft: "Brouillon",
    accroche: "Accroche", launch_id: "L1", content_type: "teasing", category: "cat", objective: "obj", chapter: 2, chapter_label: "Ch", audience_phase: "froid",
  });

  async function suivre(label: string, editingPost: any) {
    const onAutoSave = vi.fn(async () => ({}));
    const onOpenChange = vi.fn();
    renderDialog({ editingPost, onAutoSave, onOpenChange });
    fireEvent.click(screen.getByText(label));
    await waitFor(() => expect(m.navigate).toHaveBeenCalled());
    expect(onAutoSave.mock.invocationCallOrder[0]).toBeLessThan(m.navigate.mock.invocationCallOrder[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    return m.navigate.mock.calls[0];
  }

  it("générer un carrousel avec angle → carousel_type + state complet", async () => {
    expect(await suivre("faux:générer", full())).toMatchSnapshot();
  });

  it.each([
    ["reel", { format: "reel" }], ["stories", { format: "story_serie" }],
    ["LinkedIn", { canal: "linkedin", format: "post_texte" }], ["newsletter", { canal: "newsletter", format: null }],
  ])("générer : %s", async (_n, extra) => {
    expect((await suivre("faux:générer", post({ ...extra, theme: "Sujet" })))[0]).toMatchSnapshot();
  });

  it("autre canal sans format dédié → brouillon rapide sur place, pas de navigation", async () => {
    m.invoke.mockResolvedValue({ data: { content: "Idée. Suite" }, error: null });
    renderDialog({ editingPost: post({ canal: "pinterest", format: "epingle" }) });
    fireEvent.click(screen.getByText("faux:générer"));
    await waitFor(() => expect(m.invoke).toHaveBeenCalled());
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it("approfondir → URL et state exacts", async () => {
    expect(await suivre("faux:approfondir", full())).toMatchSnapshot();
  });

  it("atelier sans resumeIdea → state exact", async () => {
    expect(await suivre("faux:atelier", full())).toMatchSnapshot();
  });

  it("atelier d'un carrousel déjà mis en forme → resumeIdea carrousel", async () => {
    const detail = { type: "carousel_photo", slides: [{ n: 1 }], visual_html: ["<div/>"] };
    const [, opts] = await suivre("faux:atelier", post({ story_sequence_detail: detail }));
    expect(opts.state.resumeIdea).toEqual({ format: "carousel", raw: { ...detail, carousel_type: "photo" } });
  });

  it("changer de format : pas d'enregistrement ni de state", () => {
    const { props } = renderDialog({ editingPost: post({ objectif: "vente" }) });
    fireEvent.click(screen.getByText("faux:format-reel"));
    expect(m.navigate).toHaveBeenLastCalledWith("/creer?format=reel&sujet=Mon+sujet&objectif=vente&calendar_id=p1&from=%2Fcalendrier");
    fireEvent.click(screen.getByText("faux:format-autre"));
    expect(m.navigate).toHaveBeenLastCalledWith("/transformer");
    expect(props.onAutoSave).not.toHaveBeenCalled();
  });
});

describe("publication immédiate", () => {
  it.each([
    ["LinkedIn sans texte", { canal: "linkedin" }, true],
    ["LinkedIn avec texte", { canal: "linkedin", content_draft: "Post" }, false],
    ["stories Instagram", { format: "story_serie", media_urls: [IMG(1)] }, true],
    ["reel sans vidéo", { format: "reel", media_urls: [IMG(1)] }, true],
    ["reel avec vidéo", { format: "reel", media_urls: [VIDEO] }, false],
    ["Instagram sans image", {}, true],
    ["Instagram, 1 image", { media_urls: [IMG(1)] }, false],
    ["Instagram, 11 images", { media_urls: Array.from({ length: 11 }, (_, i) => IMG(i)) }, true],
  ])("%s → « Publier maintenant » désactivé : %s", (_n, extra, disabled) => {
    renderDialog({ editingPost: post(extra) });
    expect((item(/Publier maintenant/) as HTMLButtonElement).disabled).toBe(disabled);
  });

  it("publié avec succès : 2 écritures si la 1re échoue, puis avertissement « Ne le republie pas »", async () => {
    m.publishIg.mockResolvedValue({ permalink: "https://ig/p", postId: "ig-1" });
    m.updateError.push({ message: "réseau" }, { message: "réseau" });
    renderDialog({ editingPost: post({ media_urls: [IMG(1)], content_draft: "Légende" }) });
    fireEvent.click(item(/Publier maintenant/));
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.publishIg).toHaveBeenCalledWith(expect.objectContaining({ caption: "Légende", imageUrls: [IMG(1)], userId: "u1" }));
    expect(m.updates.filter((u) => u.table === "calendar_posts" && u.patch.publish_status === "published")).toHaveLength(2);
    expect(m.toast.warning.mock.calls[0][1].description).toMatch(/Ne le republie pas/);
    // « Publier » disparaît : le post est publié.
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: /Publier maintenant/ })).toBeNull());
  });

  it("post déjà publié (statut ou publish_status) → plus de « Publier »", () => {
    renderDialog({ editingPost: post({ media_urls: [IMG(1)], publish_status: "published" }) });
    expect(screen.queryByRole("menuitem", { name: /Publier maintenant/ })).toBeNull();
    expect(screen.getByText("Options")).toBeInTheDocument();
  });
});

describe("programmation", () => {
  const futur = "2099-01-01T10:00";
  async function programmer(editingPost: any, quand = futur) {
    renderDialog({ editingPost });
    fireEvent.click(item(/Programmer la publication/));
    fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: quand } });
    fireEvent.click(screen.getByRole("button", { name: "Programmer" }));
  }

  it.each([
    ["connexion inconnue", () => { m.social.known = false; }, post({ media_urls: [IMG(1)] }), "Connexion en cours de vérification. Réessaie de programmer dans un instant."],
    ["compte non connecté", () => { m.social.connected = false; }, post({ media_urls: [IMG(1)] }), "Compte Instagram non connecté"],
    ["stories", () => {}, post({ format: "story_serie", media_urls: [IMG(1)] }), "La publication directe des stories arrive bientôt : publie-la depuis l'app Instagram."],
    ["reel sans vidéo", () => {}, post({ format: "reel", media_urls: [IMG(1)] }), undefined],
    ["sans image", () => {}, post(), "Ajoute une image ou monte ta vidéo avant de programmer."],
    ["LinkedIn sans texte", () => {}, post({ canal: "linkedin" }), "Rédige le texte du post avant de programmer."],
  ])("garde : %s", async (_n, prep, p, message) => {
    prep();
    await programmer(p);
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    if (message) expect(m.toast.error.mock.calls[0][0]).toBe(message);
    expect(m.updates).toHaveLength(0);
    if (_n === "connexion inconnue") expect(m.social.refresh).toHaveBeenCalled();
  });

  it.each([["sans date", ""], ["date passée", "2000-01-01T10:00"]])("garde : %s", async (_n, quand) => {
    await programmer(post({ media_urls: [IMG(1)] }), quand);
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(m.toast.error.mock.calls[0][0]).toBe(quand ? "Choisis une date/heure dans le futur." : "Choisis une date et une heure.");
  });

  it("succès : mise à jour envoyée, puis annulation", async () => {
    await programmer(post({ media_urls: [IMG(1)] }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalledWith("Publication programmée ! 🗓️", expect.anything()));
    expect(m.updates[0]).toMatchObject({ table: "calendar_posts", id: "p1", patch: { auto_publish: true, publish_status: "scheduled", publish_error: null, scheduled_publish_at: new Date(futur).toISOString() } });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(m.toast.success).toHaveBeenCalledWith("Programmation annulée."));
    expect(m.updates[1].patch).toMatchObject({ auto_publish: false, publish_status: null });
  });

  it("jeton expiré avant la date → avertissement au lieu du succès", async () => {
    m.social.expiry = "2098-06-01T00:00:00Z";
    await programmer(post({ media_urls: [IMG(1)] }));
    await waitFor(() => expect(m.toast.warning).toHaveBeenCalled());
    expect(m.toast.warning.mock.calls[0][0]).toBe("Programmé : mais reconnecte ton compte d'ici là ⚠️");
  });
});

describe("brouillon rapide", () => {
  it("corps exact envoyé, délai 150 s, statut idée → en rédaction", async () => {
    m.invoke.mockResolvedValue({ data: { content: "Première phrase. Suite" }, error: null });
    renderDialog({ editingPost: post({ canal: "pinterest", format: "epingle", objectif: "hors-liste", angle: "Storytelling", notes: "N" }) });
    fireEvent.click(screen.getByText("faux:générer"));
    await waitFor(() => expect(draft().value).toBe("Première phrase. Suite"));
    expect(m.invoke.mock.calls[0]).toMatchSnapshot();
    expect(meta().status).toBe("drafting");
  });

  it("espace d'une autre personne → workspace_id envoyé", async () => {
    m.workspaceId = "w2";
    m.invoke.mockResolvedValue({ data: { content: "x" }, error: null });
    renderDialog({ editingPost: post({ canal: "pinterest", format: "epingle" }) });
    fireEvent.click(screen.getByText("faux:générer"));
    await waitFor(() => expect(m.invoke).toHaveBeenCalled());
    expect(m.invoke.mock.calls[0][1].body.workspace_id).toBe("w2");
  });

  it("limit_reached → toast doux, brouillon inchangé", async () => {
    m.invoke.mockResolvedValue({ data: { error: "limit_reached", message: "Plus de crédits." }, error: null });
    renderDialog({ editingPost: post({ canal: "pinterest", format: "epingle", content_draft: "Avant" }) });
    fireEvent.click(screen.getByText("faux:générer"));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith("Plus de crédits ce mois-ci 🌸", { description: "Plus de crédits." }));
    expect(draft().value).toBe("Avant");
    expect(m.toast.error).not.toHaveBeenCalled();
  });
});

describe("lecteur plein écran", () => {
  it.each([
    ["reel", "🎬 Script complet", "true"], ["carousel", "📑 Slides détaillées", "false"],
    ["carousel_photo", "📸 Carrousel photo", "false"], ["stories", "📱 Séquence complète", "true"],
  ])("%s : titre et modification", async (type, titre, editable) => {
    renderDialog({ editingPost: post({ story_sequence_detail: { type } }) });
    fireEvent.click(screen.getByText("faux:plein-écran"));
    expect(await screen.findByText(titre)).toBeInTheDocument();
    expect(screen.getByTestId("viewer").textContent).toBe(editable);
    expect(!!screen.queryByText("Modifier dans l’éditeur de carrousel")).toBe(type.startsWith("carousel"));
  });

  it("« Modifier dans l'éditeur de carrousel » ouvre l'atelier", async () => {
    renderDialog({ editingPost: post({ story_sequence_detail: { type: "carousel" } }) });
    fireEvent.click(screen.getByText("faux:plein-écran"));
    fireEvent.click(await screen.findByText("Modifier dans l’éditeur de carrousel"));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith("/creer?canal=instagram", expect.anything()));
  });

  it.each([[null, "success"], [{ message: "refus" }, "error"]])("retour à l'original (erreur : %o)", async (err, issue) => {
    if (err) m.updateError.push(err);
    renderDialog({ editingPost: post({ story_sequence_detail: { type: "reel" }, original_content_data: { type: "reel", v: 0 } }) });
    fireEvent.click(screen.getByText("faux:plein-écran"));
    fireEvent.click(await screen.findByText("faux:original"));
    await waitFor(() => expect(m.updates[0]).toMatchObject({ id: "p1", patch: { story_sequence_detail: { type: "reel", v: 0 } } }));
    if (issue === "success") await waitFor(() => expect(m.toast.success).toHaveBeenCalledWith("Version originale restaurée"));
    else await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
  });
});
