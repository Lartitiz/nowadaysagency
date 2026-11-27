/**
 * Micro fantôme (27/11/2026) : sur le Mac de Laetitia, Chrome écoutait « Microsoft Teams Audio
 * Device », qui n'envoie que du silence hors appel. La dictée et la voix du reel démarraient
 * sans erreur et n'entendaient rien. L'outil doit basculer tout seul sur le vrai micro.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { isSilentVirtualMic, micDisplayName, openMicrophone, pickRealMic } from "@/lib/real-microphone";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

const TEAMS = "Microsoft Teams Audio Device (Virtual)";
const ZOOM = "ZoomAudioDevice (Virtual)";
const MACBOOK = "Micro MacBook Pro (Built-in)";

const input = (deviceId: string, label: string) => ({ kind: "audioinput" as const, deviceId, label });
const DEVICES = [input("t", TEAMS), input("z", ZOOM), input("m", MACBOOK), input("default", `Par défaut - ${MACBOOK}`)];

function fakeStream(label: string) {
  const track = { label, stop: vi.fn() };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream & { track: typeof track };
}

/** Navigateur dont le micro choisi est `chosen` ; un micro demandé par son identifiant est rendu tel quel. */
function installMics(chosen: string, permission = "granted") {
  const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
    const exact = typeof c.audio === "object" ? (c.audio.deviceId as { exact: string }).exact : null;
    return fakeStream(exact ? DEVICES.find((d) => d.deviceId === exact)!.label : chosen);
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices: async () => DEVICES },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: async () => ({ state: permission }) },
  });
  return getUserMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe("repérer le micro fantôme", () => {
  it("Teams et Zoom sont muets, un vrai micro ou un micro virtuel choisi exprès ne l'est pas", () => {
    expect(isSilentVirtualMic(TEAMS)).toBe(true);
    expect(isSilentVirtualMic(ZOOM)).toBe(true);
    expect(isSilentVirtualMic(MACBOOK)).toBe(false);
    expect(isSilentVirtualMic("Krisp Microphone (Virtual)")).toBe(false);
    expect(isSilentVirtualMic("")).toBe(false);
  });

  it("choisit le micro du système, sinon le premier vrai micro, sinon rien", () => {
    expect(pickRealMic(DEVICES)).toBe("default");
    expect(pickRealMic([input("default", `Par défaut - ${TEAMS}`), input("t", TEAMS), input("m", MACBOOK)])).toBe("m");
    expect(pickRealMic([input("t", TEAMS), input("z", ZOOM)])).toBeNull();
  });

  it("montre un nom de micro lisible", () => {
    expect(micDisplayName(TEAMS)).toBe("Microsoft Teams Audio Device");
    expect(micDisplayName(`Par défaut - ${MACBOOK}`)).toBe("Micro MacBook Pro");
  });
});

describe("voix du reel : ouvrir le micro", () => {
  it("rouvre le vrai micro quand le navigateur donne celui de Teams, et referme le fantôme", async () => {
    const getUserMedia = installMics(TEAMS);
    const stream = await openMicrophone();
    expect(stream.getAudioTracks()[0].label).toContain("Micro MacBook Pro");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const first = (await getUserMedia.mock.results[0].value) as ReturnType<typeof fakeStream>;
    expect(first.track.stop).toHaveBeenCalled();
  });

  it("ne touche à rien quand le micro choisi est un vrai micro", async () => {
    const getUserMedia = installMics(MACBOOK);
    const stream = await openMicrophone();
    expect(stream.getAudioTracks()[0].label).toBe(MACBOOK);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});

describe("dictée", () => {
  class FakeRecognition {
    static made: FakeRecognition[] = [];
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn(() => this.onend?.());
    abort = vi.fn(() => this.onend?.());
    constructor() {
      FakeRecognition.made.push(this);
    }
  }
  const install = () => {
    FakeRecognition.made = [];
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
  };
  const result = (text: string, isFinal: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });

  it("relance la dictée sur le vrai micro quand le navigateur écoute celui de Teams", async () => {
    install();
    installMics(TEAMS);
    const onResult = vi.fn();
    const { result: hook } = renderHook(() => useSpeechRecognition(onResult));
    act(() => hook.current.toggle());
    await waitFor(() => expect(FakeRecognition.made).toHaveLength(2));
    const [first, second] = FakeRecognition.made;
    expect(first.start).toHaveBeenCalledWith();
    expect(first.abort).toHaveBeenCalled();
    expect(second.start.mock.calls[0][0].label).toContain("Micro MacBook Pro");
    expect(hook.current.isListening).toBe(true);
    act(() => second.onresult?.(result("bonjour je teste la dictée", true)));
    expect(onResult).toHaveBeenCalledWith("bonjour je teste la dictée");
  });

  it("ne relance rien quand le micro choisi est un vrai micro", async () => {
    install();
    const getUserMedia = installMics(MACBOOK);
    const { result: hook } = renderHook(() => useSpeechRecognition(vi.fn()));
    act(() => hook.current.toggle());
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(FakeRecognition.made).toHaveLength(1);
    expect(hook.current.isListening).toBe(true);
  });

  it("n'ouvre pas le micro pour vérifier tant que l'autorisation n'est pas donnée", async () => {
    install();
    const getUserMedia = installMics(TEAMS, "prompt");
    const { result: hook } = renderHook(() => useSpeechRecognition(vi.fn()));
    act(() => hook.current.toggle());
    await act(async () => { await Promise.resolve(); });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(FakeRecognition.made).toHaveLength(1);
  });

  it("rend à l'arrêt les mots entendus que le moteur n'avait pas encore validés", async () => {
    install();
    installMics(MACBOOK);
    const onResult = vi.fn();
    const { result: hook } = renderHook(() => useSpeechRecognition(onResult));
    act(() => hook.current.toggle());
    const [rec] = FakeRecognition.made;
    act(() => rec.onresult?.(result("une phrase coupée en route", false)));
    expect(onResult).not.toHaveBeenCalled();
    act(() => hook.current.toggle());
    expect(onResult).toHaveBeenCalledWith("une phrase coupée en route");
  });
});
