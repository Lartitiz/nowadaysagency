import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Écran « Monter la vidéo » d'un reel (fiche 16 de docs/robustesse/gros-fichiers.md,
   lot T, 15/10/2026). Filet posé AVANT le découpage de ReelMontage.tsx : il
   complète reel-montage-publication.test.tsx (cycle de vie du MP4) avec ce qui
   n'était jamais testé sur le composant : voix manquante, phrase enregistrée sans
   clip, plan envoyé au moteur selon le mode, texte à revérifier, dépôt de vidéo,
   fenêtre de lecture, plans du Studio, boîte de dialogue Studio, phases,
   recherche manuelle et forme du projet sauvegardé. */

const m = vi.hoisted(() => ({
  submit: vi.fn(), poll: vi.fn(), archive: vi.fn(), suggest: vi.fn(), search: vi.fn(), readStudio: vi.fn(),
  list: vi.fn(), duration: vi.fn(), upload: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  charter: null as Record<string, string> | null,
  panelProps: [] as Record<string, unknown>[],
  studioJob: { id: "studio-job", video_url: "https://clips.test/studio.mp4", duration: 5, source_name: "Atelier" },
  voices: [] as ({ url: string; duration: number } | null)[],
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("sonner", () => ({ toast: m.toast }));
vi.mock("@/hooks/use-branding", () => ({ useBrandCharter: () => ({ data: m.charter }) }));
vi.mock("@/lib/stock-videos", () => ({ suggestStockKeywords: m.suggest, searchStockVideos: m.search }));
vi.mock("@/lib/reel-user-videos", () => ({ listReelVideos: m.list, loadVideoDuration: m.duration, uploadReelVideo: m.upload }));
vi.mock("@/lib/reel-render", async () => ({ ...await vi.importActual("@/lib/reel-plan"), submitReelRender: m.submit, pollReelRender: m.poll, archiveReelMp4: m.archive }));
vi.mock("@/features/studio-video/api", () => ({ readStudioVideo: m.readStudio }));
vi.mock("@/features/studio-video/StudioVideoPanel", () => ({
  StudioVideoPanel: (props: { onPickClip?: (job: typeof m.studioJob) => void }) => {
    m.panelProps.push(props);
    return <button onClick={() => props.onPickClip?.(m.studioJob)}>Tester le clip Studio</button>;
  },
}));
vi.mock("@/components/creer/ReelVoiceRecorder", () => ({
  default: ({ onVoicesChange }: { onVoicesChange: (v: typeof m.voices) => void }) => (
    <button onClick={() => onVoicesChange(m.voices)}>Poser les voix de test</button>
  ),
}));

import ReelMontage, { type ReelMontageProject } from "@/components/creer/ReelMontage";
import { buildRenderPlan } from "@/lib/reel-plan";

const SECTIONS = [
  { section: "hook", texte_parle: "Phrase un", texte_overlay: "Un", timing: "0-3 sec" },
  { section: "body", texte_parle: "Phrase deux", texte_overlay: "Deux", timing: "3-6 sec" },
];
const TEXTS = SECTIONS.map(s => s.texte_parle);
const stock = (n: number, extra: Record<string, unknown> = {}) => ({ id: `stock-${n}`, url: `https://clips.test/stock-${n}.mp4`, thumbnail: null, duration: 5, source: "stock" as const, label: `Fond ${n}`, seek: 0, ...extra });
const mine = (n: number, duration = 5) => ({ id: `mine-${n}`, url: `https://clips.test/mine-${n}.mp4`, thumbnail: null, duration, source: "mine" as const, label: `Prise ${n}`, seek: 0 });
const voice = (n: number, duration = 2) => ({ url: `https://voix.test/${n}.webm`, duration });
const project = (p: Partial<ReelMontageProject>): ReelMontageProject => ({
  version: 1, sectionTexts: TEXTS, montageMode: "cache", voiceMode: "recorded",
  clips: [null, null], cutaways: [null, null], voiceClips: [null, null], ...p,
});
const assemble = () => fireEvent.click(screen.getByRole("button", { name: "Assembler mon reel" }));
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  m.charter = null; m.panelProps.length = 0; m.voices = [];
  m.studioJob = { id: "studio-job", video_url: "https://clips.test/studio.mp4", duration: 5, source_name: "Atelier" };
  m.submit.mockResolvedValue("render-project");
  m.poll.mockResolvedValue("https://renderer.test/temp.mp4");
  m.archive.mockResolvedValue("https://stockage.test/reel.mp4");
  m.suggest.mockResolvedValue({ keywords: [], primary: "" });
  m.search.mockResolvedValue([]);
  m.readStudio.mockResolvedValue({ job: { status: "ready", video_url: "https://clips.test/fresh.mp4" } });
  m.list.mockResolvedValue([]);
  m.duration.mockResolvedValue(5);
});
afterEach(() => { window.history.replaceState(null, "", "/"); sessionStorage.clear(); vi.restoreAllMocks(); });

describe("ReelMontage — voix enregistrée manquante", () => {
  it("une phrase avec clip sans prise → refus au singulier, aucun rendu", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ clips: [stock(1), stock(2)], voiceClips: [voice(1), null] })} />);
    await settle();
    assemble();
    expect(m.toast.error).toHaveBeenCalledWith("Enregistre la voix de cette phrase, ou choisis « Sans voix » pour monter un reel muet.");
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("deux phrases sans prise → message au pluriel avec le nombre", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ clips: [stock(1), stock(2)] })} />);
    await settle();
    assemble();
    expect(m.toast.error).toHaveBeenCalledWith("Enregistre les 2 phrases sans voix, ou choisis « Sans voix » pour monter un reel muet.");
    expect(m.submit).not.toHaveBeenCalled();
  });
});

describe("ReelMontage — phrase enregistrée sans clip", () => {
  it("« Annuler » → aucun rendu ; « OK » → rendu lancé sans cette phrase", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ReelMontage sections={SECTIONS} initialProject={project({ clips: [stock(1), null], voiceClips: [voice(1), voice(2)] })} />);
    await settle();
    assemble();
    expect(confirm).toHaveBeenLastCalledWith("La phrase 2 est enregistrée mais n'a aucun clip : elle ne sera PAS dans la vidéo, ta voix non plus. Assembler quand même ?");
    expect(m.submit).not.toHaveBeenCalled();
    assemble();
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
  });

  it("plusieurs phrases → message au pluriel", async () => {
    const sections = [...SECTIONS, { section: "cta", texte_parle: "Phrase trois", texte_overlay: "Trois", timing: "6-9 sec" }];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ReelMontage sections={sections} initialProject={project({
      sectionTexts: sections.map(s => s.texte_parle), clips: [stock(1), null, null], cutaways: [null, null, null], voiceClips: [voice(1), voice(2), voice(3)],
    })} />);
    await settle();
    assemble();
    expect(confirm).toHaveBeenCalledWith("Les phrases 2, 3 sont enregistrées mais n'ont aucun clip : elles ne seront PAS dans la vidéo, ta voix non plus. Assembler quand même ?");
  });
});

describe("ReelMontage — plan envoyé au moteur", () => {
  it("« Je me filme » : durées des prises, sous-titres à la charte", async () => {
    m.charter = { font_title: "Lora", color_accent: "#FB3D80" };
    render(<ReelMontage sections={SECTIONS} initialProject={project({ montageMode: "filme", clips: [mine(1, 4), mine(2, 7)] })} />);
    await settle();
    assemble();
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
    const expected = buildRenderPlan(SECTIONS, [{ url: mine(1).url, seek: 0 }, { url: mine(2).url, seek: 0 }], {
      mode: "filme", voice_mode: "tts", clipDurations: [4, 7], brollBySection: [null, null],
    });
    expect(m.submit.mock.calls[0][0]).toEqual({ ...expected, subtitle_settings: { "font-family": "Lora", "word-color": "#FB3D80" } });
  });

  it("« Je ne me montre pas » + ma voix : URL et durées des prises", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ clips: [stock(1), stock(2)], voiceClips: [voice(1, 2.5), voice(2, 4)] })} />);
    await settle();
    assemble();
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
    const expected = buildRenderPlan(SECTIONS, [{ url: stock(1).url, seek: 0 }, { url: stock(2).url, seek: 0 }], {
      mode: "cache", voice_mode: "recorded", voiceAudioUrls: [voice(1).url, voice(2).url], voiceDurations: [2.5, 4], brollBySection: [null, null],
    });
    expect(m.submit.mock.calls[0][0]).toEqual({ ...expected, subtitle_settings: {} });
  });

  it("« Je ne me montre pas » + sans voix", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ voiceMode: "silent", clips: [stock(1), stock(2)] })} />);
    await settle();
    assemble();
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
    const expected = buildRenderPlan(SECTIONS, [{ url: stock(1).url, seek: 0 }, { url: stock(2).url, seek: 0 }], {
      mode: "cache", voice_mode: "silent", voiceAudioUrls: [null, null], voiceDurations: [null, null], brollBySection: [null, null],
    });
    expect(m.submit.mock.calls[0][0]).toEqual({ ...expected, subtitle_settings: {} });
  });
});

describe("ReelMontage — texte modifié depuis le montage", () => {
  it("bandeau, bouton désactivé, puis « J’ai vérifié les passages » enregistre les nouveaux textes", async () => {
    const onProjectChange = vi.fn();
    render(<ReelMontage sections={SECTIONS} onProjectChange={onProjectChange}
      initialProject={project({ montageMode: "filme", sectionTexts: ["Ancien texte", "Phrase deux"], clips: [mine(1), mine(2)] })} />);
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Le texte du Reel a changé depuis ce montage");
    expect(screen.getByRole("button", { name: "Assembler mon reel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "J’ai vérifié les passages" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Assembler mon reel" })).toBeEnabled();
    await waitFor(() => expect(onProjectChange).toHaveBeenLastCalledWith(expect.objectContaining({ sectionTexts: TEXTS })));
  });
});

describe("ReelMontage — mes vidéos", () => {
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  const fichier = new File(["x"], "prise.mp4", { type: "video/mp4" });

  it("dépôt réussi sur la phrase visée : badge, message, champ vidé ; boutons bloqués pendant l'envoi", async () => {
    let finish!: (v: { url: string; name: string }) => void;
    m.upload.mockImplementation(() => new Promise(r => { finish = r; }));
    render(<ReelMontage sections={SECTIONS} initialProject={project({ montageMode: "filme" })} />);
    await settle();
    fireEvent.click(screen.getAllByRole("button", { name: "Ma vidéo" })[1]);
    fireEvent.change(fileInput(), { target: { files: [fichier] } });
    await waitFor(() => { for (const b of screen.getAllByRole("button", { name: "Ma vidéo" })) expect(b).toBeDisabled(); });
    await act(async () => finish({ url: "https://clips.test/nouvelle.mp4", name: "Nouvelle prise" }));
    expect(await screen.findByText("Ma vidéo · Nouvelle prise")).toBeInTheDocument();
    expect(m.toast.success).toHaveBeenCalledWith("Ta vidéo est prête pour cette section.");
    expect(fileInput().value).toBe("");
    for (const b of screen.getAllByRole("button", { name: "Ma vidéo" })) expect(b).toBeEnabled();
    // La vidéo est rangée sur la 2e phrase : « 1 clip sur 2 prêt ».
    expect(screen.getByText("1 clip sur 2 prêt")).toBeInTheDocument();
  });

  it("dépôt raté → message d'erreur, aucun clip changé", async () => {
    m.upload.mockRejectedValue(new Error("Vidéo trop lourde"));
    render(<ReelMontage sections={SECTIONS} initialProject={project({ montageMode: "filme" })} />);
    await settle();
    fireEvent.change(fileInput(), { target: { files: [fichier] } });
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
    expect(screen.queryByText(/Ma vidéo ·/)).toBeNull();
    expect(screen.getByText("0 clip sur 2 prêt")).toBeInTheDocument();
  });
});

describe("ReelMontage — fenêtre de lecture", () => {
  const slider = () => screen.queryByLabelText("Choisir la fenêtre de lecture dans ma vidéo");

  it("visible en « Je ne me montre pas » avec une vidéo plus longue que la scène ; le seek part au moteur", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ voiceMode: "silent", clips: [mine(1, 10), stock(2)] })} />);
    await settle();
    expect(screen.getAllByLabelText("Choisir la fenêtre de lecture dans ma vidéo")).toHaveLength(1);
    fireEvent.change(slider()!, { target: { value: "4" } });
    assemble();
    await waitFor(() => expect(m.submit).toHaveBeenCalledOnce());
    const expected = buildRenderPlan(SECTIONS, [{ url: mine(1).url, seek: 4 }, { url: stock(2).url, seek: 0 }], {
      mode: "cache", voice_mode: "silent", voiceAudioUrls: [null, null], voiceDurations: [null, null], brollBySection: [null, null],
    });
    expect(m.submit.mock.calls[0][0]).toEqual({ ...expected, subtitle_settings: {} });
  });

  it("absente en « Je me filme » et pour une vidéo courte", async () => {
    const { unmount } = render(<ReelMontage sections={SECTIONS} initialProject={project({ montageMode: "filme", clips: [mine(1, 10), null] })} />);
    await settle();
    expect(slider()).toBeNull();
    unmount();
    render(<ReelMontage sections={SECTIONS} initialProject={project({ voiceMode: "silent", clips: [mine(1, 3), null] })} />);
    await settle();
    expect(slider()).toBeNull();
  });
});

describe("ReelMontage — plans du Studio", () => {
  const pickStudio = async (index = 0) => {
    fireEvent.click(screen.getAllByRole("button", { name: "Choisir un clip du Studio" })[index]);
    fireEvent.click(await screen.findByRole("button", { name: "Tester le clip Studio" }));
    await screen.findByText(/Prévisualisation pour ce passage/);
  };

  it("clip trop court pour porter la voix d'un passage sans fond → refus, rien d'inséré", async () => {
    m.studioJob = { ...m.studioJob, duration: 2 };
    const onProjectChange = vi.fn();
    render(<ReelMontage sections={SECTIONS} workspaceId="space" onProjectChange={onProjectChange} initialProject={project({ voiceMode: "silent" })} />);
    await settle();
    await pickStudio();
    fireEvent.click(screen.getByRole("button", { name: "Insérer dans ce passage" }));
    expect(m.toast.error).toHaveBeenCalledWith("Ce clip est trop court pour porter toute la voix de ce passage. Choisis une vidéo de fond, puis ajoute-le comme plan.");
    expect(screen.getByText(/Prévisualisation pour ce passage/)).toBeInTheDocument();
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it("« Je me filme » sans prise → « Insérer dans ce passage » désactivé", async () => {
    render(<ReelMontage sections={SECTIONS} workspaceId="space" initialProject={project({ montageMode: "filme" })} />);
    await settle();
    await pickStudio();
    expect(screen.getByRole("button", { name: "Insérer dans ce passage" })).toBeDisabled();
    expect(screen.getByText(/Choisis d’abord ta prise face caméra/)).toBeInTheDocument();
  });

  it("plan inséré : déplacer son début puis le retirer met à jour le projet", async () => {
    const onProjectChange = vi.fn();
    const cutaway = { jobId: "studio-job", url: "", duration: 2, start: 0, seek: 0, label: "Atelier" };
    render(<ReelMontage sections={SECTIONS} workspaceId="space" onProjectChange={onProjectChange}
      initialProject={project({ montageMode: "filme", clips: [mine(1, 6), mine(2)], cutaways: [cutaway, null] })} />);
    await settle();
    expect(screen.getByText("Plan inséré : Atelier · 2 s")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Placer le plan du Studio dans ce passage"), { target: { value: "1.5" } });
    await waitFor(() => expect(onProjectChange).toHaveBeenLastCalledWith(expect.objectContaining({ cutaways: [{ ...cutaway, start: 1.5 }, null] })));
    fireEvent.click(screen.getByRole("button", { name: "Retirer ce plan" }));
    await waitFor(() => expect(onProjectChange).toHaveBeenLastCalledWith(expect.objectContaining({ cutaways: [null, null] })));
  });
});

describe("ReelMontage — boîte de dialogue Studio", () => {
  it("« Choisir » : lecture seule, sans consigne ; brouillon propre au passage", async () => {
    render(<ReelMontage sections={SECTIONS} subject="Savon" workspaceId="space" initialProject={project({ montageMode: "filme" })} />);
    await settle();
    fireEvent.click(screen.getAllByRole("button", { name: "Choisir un clip du Studio" })[1]);
    await screen.findByRole("button", { name: "Tester le clip Studio" });
    expect(m.panelProps.at(-1)).toMatchObject({
      workspaceId: "space", writable: false, showComposer: false, initialPrompt: "",
      draftKey: `studio-video:test-user:space:reel:${JSON.stringify(["Savon", TEXTS, 1])}`,
    });
  });

  it("« Créer » : écriture, consigne préremplie avec le texte parlé coupé à 680 caractères", async () => {
    const long = "a".repeat(700);
    const sections = [{ ...SECTIONS[0], texte_parle: long }, SECTIONS[1]];
    render(<ReelMontage sections={sections} subject="Savon" workspaceId="space"
      initialProject={project({ montageMode: "filme", sectionTexts: [long, TEXTS[1]] })} />);
    await settle();
    fireEvent.click(screen.getAllByRole("button", { name: "Créer un clip dans le Studio" })[0]);
    await screen.findByRole("button", { name: "Tester le clip Studio" });
    const props = m.panelProps.at(-1)!;
    expect(props).toMatchObject({ writable: true, showComposer: true });
    expect(props.initialPrompt).toBe(`Plan de coupe sans texte à l'écran : montrer concrètement l'idée « ${"a".repeat(680)} ». Le plan doit pouvoir se placer sous la voix du Reel.`);
  });
});

describe("ReelMontage — phases remontées à la page", () => {
  it("idle → rendering → done", async () => {
    const onPhaseChange = vi.fn();
    render(<ReelMontage sections={SECTIONS} onPhaseChange={onPhaseChange} initialProject={project({ montageMode: "filme", clips: [mine(1), mine(2)] })} />);
    await settle();
    assemble();
    await waitFor(() => expect(onPhaseChange).toHaveBeenLastCalledWith("done"));
    expect(onPhaseChange.mock.calls.map(c => c[0])).toEqual(["idle", "rendering", "done"]);
  });

  it("rendu raté → error", async () => {
    m.submit.mockRejectedValue(new Error("Moteur indisponible"));
    const onPhaseChange = vi.fn();
    render(<ReelMontage sections={SECTIONS} onPhaseChange={onPhaseChange} initialProject={project({ montageMode: "filme", clips: [mine(1), mine(2)] })} />);
    await settle();
    assemble();
    await screen.findByText("Moteur indisponible");
    expect(onPhaseChange.mock.calls.map(c => c[0])).toEqual(["idle", "rendering", "error"]);
  });
});

describe("ReelMontage — recherche manuelle dans la banque libre", () => {
  const video = { id: 9, url: "https://clips.test/pexels-9.mp4", thumbnail: "https://clips.test/t9.jpg", duration: 6 };

  it("Entrée ou loupe → recherche avec le nouveau mot-clé ; une vidéo à moi n'est pas remplacée", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ voiceMode: "silent", clips: [mine(1), null] })} />);
    await settle();
    await waitFor(() => expect(m.suggest).toHaveBeenCalledOnce());
    m.search.mockResolvedValue([video]);
    const champs = screen.getAllByPlaceholderText("mots-clés du plan (ex: mains savon atelier)");
    fireEvent.change(champs[0], { target: { value: "savon" } });
    fireEvent.keyDown(champs[0], { key: "Enter" });
    await waitFor(() => expect(m.search).toHaveBeenCalledWith("savon", { perPage: 6, orientation: "portrait", locale: "en-US" }));
    await screen.findAllByRole("button", { name: "Choisir ce clip" });
    expect(screen.getByText("Ma vidéo · Prise 1")).toBeInTheDocument();
    // Loupe de la 2e phrase : le 1er résultat devient le clip (pas de vidéo à moi).
    fireEvent.change(champs[1], { target: { value: "atelier" } });
    const loupes = champs.map(c => c.parentElement!.querySelector("button")!);
    fireEvent.click(loupes[1]);
    await waitFor(() => expect(m.search).toHaveBeenLastCalledWith("atelier", expect.any(Object)));
    await screen.findByRole("button", { name: "Clip sélectionné" });
    expect(screen.getByText("2 clips sur 2 prêts")).toBeInTheDocument();
  });

  it("erreur de recherche → message", async () => {
    render(<ReelMontage sections={SECTIONS} initialProject={project({ voiceMode: "silent" })} />);
    await settle();
    m.search.mockRejectedValue(new Error("Pexels indisponible"));
    const champ = screen.getAllByPlaceholderText("mots-clés du plan (ex: mains savon atelier)")[0];
    fireEvent.change(champ, { target: { value: "savon" } });
    fireEvent.keyDown(champ, { key: "Enter" });
    await waitFor(() => expect(m.toast.error).toHaveBeenCalled());
  });
});

describe("ReelMontage — projet sauvegardé", () => {
  it("forme exacte envoyée après une modification (URL du Studio vidées)", async () => {
    const onProjectChange = vi.fn();
    const studioClip = { id: "studio-a", studioJobId: "a", url: "https://clips.test/a.mp4", thumbnail: null, duration: 5, source: "studio" as const, label: "A", seek: 0 };
    const cutaway = { jobId: "b", url: "https://clips.test/b.mp4", duration: 2, start: 0, seek: 0, label: "B" };
    render(<ReelMontage sections={SECTIONS} workspaceId="space" onProjectChange={onProjectChange}
      initialProject={project({ voiceMode: "silent", clips: [studioClip, mine(2)], cutaways: [null, cutaway] })} />);
    await settle();
    expect(onProjectChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Ma voix off/ }));
    await waitFor(() => expect(onProjectChange).toHaveBeenCalledOnce());
    expect(onProjectChange.mock.calls[0][0]).toEqual({
      version: 1, sectionTexts: TEXTS, montageMode: "cache", voiceMode: "recorded",
      clips: [{ ...studioClip, url: "" }, mine(2)],
      voiceClips: [null, null],
      cutaways: [null, { ...cutaway, url: "" }],
    });
    expect(Object.keys(onProjectChange.mock.calls[0][0])).toEqual(["version", "sectionTexts", "montageMode", "voiceMode", "clips", "voiceClips", "cutaways"]);
  });

  it("remonter le composant avec le même projet n'efface pas le MP4 restauré", async () => {
    const onMp4Ready = vi.fn();
    const onProjectChange = vi.fn();
    const saved = project({ montageMode: "filme", clips: [mine(1), mine(2)] });
    const { unmount } = render(<ReelMontage sections={SECTIONS} initialProject={saved} onMp4Ready={onMp4Ready} onProjectChange={onProjectChange} />);
    await settle();
    unmount();
    render(<ReelMontage sections={SECTIONS} initialProject={saved} onMp4Ready={onMp4Ready} onProjectChange={onProjectChange} />);
    await settle();
    expect(onMp4Ready).not.toHaveBeenCalled();
    expect(onProjectChange).not.toHaveBeenCalled();
  });

  it("une voix posée par l'enregistreur part dans le projet", async () => {
    const onProjectChange = vi.fn();
    m.voices = [voice(1, 2), null];
    render(<ReelMontage sections={SECTIONS} onProjectChange={onProjectChange} initialProject={project({ clips: [stock(1), stock(2)] })} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Poser les voix de test" }));
    await waitFor(() => expect(onProjectChange).toHaveBeenLastCalledWith(expect.objectContaining({ voiceClips: [voice(1, 2), null] })));
  });
});
