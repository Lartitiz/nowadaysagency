/**
 * real-microphone — ouvrir le VRAI micro, pas un micro fantôme.
 *
 * Teams et Zoom installent sur l'ordinateur un « micro » virtuel qui n'envoie que du silence
 * tant que leur appel n'est pas ouvert. Chrome peut le garder comme micro choisi : la dictée et
 * l'enregistrement de la voix démarrent alors sans erreur, n'entendent rien, et l'écran répond
 * « parle plus fort » (vu sur le Mac de Laetitia le 27/11/2026 : niveau mesuré à zéro pile sur
 * « Microsoft Teams Audio Device », alors que le micro du MacBook marchait).
 *
 * Liste volontairement étroite : seuls les micros connus pour être muets hors appel. Un micro
 * virtuel choisi exprès (Krisp, BlackHole, Loopback) fait passer du son, on n'y touche pas.
 */

const SILENT_VIRTUAL_MIC = /microsoft teams audio|zoomaudiodevice/i;

export function isSilentVirtualMic(label: string | undefined | null): boolean {
  return !!label && SILENT_VIRTUAL_MIC.test(label);
}

/** Nom du micro à montrer à la personne, sans la mention technique de Chrome. */
export function micDisplayName(label: string | undefined | null): string {
  return (label ?? "").replace(/\s*\((virtual|built-in)\)\s*$/i, "").replace(/^par défaut - |^default - /i, "").trim();
}

type DeviceLike = Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">;

/**
 * Le micro réel à ouvrir à la place : celui du système (« default ») s'il est réel, sinon le
 * premier micro réel de la liste. null si l'ordinateur n'a que des micros fantômes.
 */
export function pickRealMic(devices: DeviceLike[]): string | null {
  const real = devices.filter((d) => d.kind === "audioinput" && d.deviceId && d.label && !isSilentVirtualMic(d.label));
  const system = real.find((d) => d.deviceId === "default");
  if (system) return system.deviceId;
  return real.find((d) => d.deviceId !== "communications")?.deviceId ?? real[0]?.deviceId ?? null;
}

function stop(stream: MediaStream) {
  stream.getTracks().forEach((t) => t.stop());
}

/** Si `stream` vient d'un micro fantôme, rend le flux d'un vrai micro ; sinon null. */
async function realStreamInsteadOf(stream: MediaStream): Promise<MediaStream | null> {
  const label = stream.getAudioTracks?.()[0]?.label;
  if (!isSilentVirtualMic(label)) return null;
  try {
    const deviceId = pickRealMic(await navigator.mediaDevices.enumerateDevices());
    if (!deviceId) return null;
    return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
  } catch {
    return null;
  }
}

/**
 * Ouvre le micro pour un enregistrement. Si le navigateur donne un micro fantôme, on rouvre
 * le vrai à sa place, sans rien demander.
 */
export async function openMicrophone(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const real = await realStreamInsteadOf(stream);
  if (!real) return stream;
  stop(stream);
  return real;
}

/**
 * Pour la dictée, qui écoute toujours le micro choisi dans le navigateur : rend le flux d'un
 * vrai micro SEULEMENT si ce micro choisi est un fantôme, sinon null (cas normal, rien à faire).
 * Ne fait jamais apparaître de demande d'autorisation : sans accord déjà donné, rend null.
 */
export async function realMicIfBrowserListensToSilentOne(): Promise<MediaStream | null> {
  try {
    const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (permission.state !== "granted") return null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const real = await realStreamInsteadOf(stream);
    stop(stream);
    return real;
  } catch {
    return null;
  }
}
