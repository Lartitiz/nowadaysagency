/**
 * « Dis ce que tu veux changer » sur l'aperçu d'un reel sans voix.
 *
 * L'IA ne voit ni n'écrit JAMAIS la page de montage : elle remplit un
 * formulaire de réglages (outil forcé), que `sanitizeTweaks` borne ensuite en
 * code. Ce qu'elle ne sait pas faire (changer le texte, une couleur, un clip),
 * elle le dit dans `message`, sans rien changer.
 *
 * Fonctions pures ici (prompt, outil, lecture de la réponse), testées dans
 * tweaks_test.ts ; l'appel lui-même (quota → IA → logUsage) est dans index.ts.
 */
import type { AnthropicTool } from "../_shared/anthropic.ts";
import { sanitizeTweaks, type ReelTweaks } from "./tweaks.ts";

export interface TweakPassage { duration: number; text: string }

export const TWEAK_TOOL: AnthropicTool = {
  name: "reglages_reel",
  description: "Réglages bornés du montage d'un reel. Ne remplis que ce que la demande change.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "Une phrase courte en français, tutoiement : ce que tu as changé, ou pourquoi tu ne peux pas." },
      understood: { type: "boolean", description: "false si la demande sort des réglages possibles." },
      durationScale: { type: "number", description: "Multiplicateur de toutes les durées, 0.5 à 1.3." },
      durations: {
        type: "array",
        description: "Durée voulue pour certains passages.",
        items: { type: "object", properties: { passage: { type: "integer" }, seconds: { type: "number" } }, required: ["passage", "seconds"] },
      },
      order: { type: "array", items: { type: "integer" }, description: "Nouvel ordre : TOUS les numéros de passage, chacun une fois." },
      textScale: { type: "number", description: "Taille du texte, 0.8 à 1.4 (1 = départ)." },
      calm: { type: "boolean", description: "true = mouvements doux, false = dynamique." },
      sounds: { type: "boolean", description: "Sons de design et nappe." },
      volume: { type: "number", description: "Volume des sons, 0 à 1.5 (1 = départ)." },
    },
    required: ["message", "understood"],
  },
};

export const TWEAK_SYSTEM = `Tu règles le montage d'un reel Instagram vertical sans voix (clips + texte à l'écran, mots qui apparaissent, sons de design).
Tu ne peux changer QUE ces réglages : durée de tous les passages ou d'un passage, ordre des passages, taille du texte, ambiance calme ou dynamique, sons oui ou non, volume des sons.
Tu ne peux PAS changer le texte, les mots, les couleurs, la police, les clips ou les photos : dans ce cas, mets understood à false et explique en une phrase où le faire (« Change le texte avec Éditer le texte », « Change le clip dans le passage »).
Ne renvoie que les réglages que la demande change. Réponds avec l'outil reglages_reel.`;

export function tweakPrompt(request: string, passages: TweakPassage[], current: ReelTweaks): string {
  const list = passages.map((p, i) => `Passage ${i + 1} (${p.duration.toFixed(1)} s) : ${p.text.slice(0, 160)}`).join("\n");
  const order = current.order ? current.order.map((i) => i + 1).join(", ") : "ordre du script";
  return `Passages du reel, dans l'ordre du script :
${list}

Réglages actuels : durées ×${current.durationScale}, taille du texte ×${current.textScale}, ${current.calm ? "ambiance calme" : "ambiance dynamique"}, ${current.sounds ? `sons au volume ×${current.volume}` : "sans sons"}, ordre : ${order}.

Demande de la créatrice : « ${request} »`;
}

/** Réponse de l'outil → nouvelles retouches bornées (part des réglages actuels). */
export function tweaksFromAi(raw: unknown, current: ReelTweaks, n: number): { tweaks: ReelTweaks; message: string; understood: boolean } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };
  for (const key of ["durationScale", "textScale", "volume"] as const) if (typeof r[key] === "number") next[key] = r[key];
  for (const key of ["calm", "sounds"] as const) if (typeof r[key] === "boolean") next[key] = r[key];
  if (Array.isArray(r.durations)) {
    const durations = [...current.durations];
    for (const d of r.durations) {
      const p = (d as Record<string, unknown>)?.passage;
      const s = (d as Record<string, unknown>)?.seconds;
      if (Number.isInteger(p) && (p as number) >= 1 && (p as number) <= n && typeof s === "number") durations[(p as number) - 1] = s;
    }
    next.durations = durations;
  }
  if (Array.isArray(r.order)) next.order = r.order.map((v) => (typeof v === "number" ? v - 1 : -1));
  const understood = r.understood !== false;
  const tweaks = understood ? sanitizeTweaks(next, n) : sanitizeTweaks(current, n);
  const message = typeof r.message === "string" && r.message.trim()
    ? r.message.trim().slice(0, 240)
    : understood ? "C'est changé." : "Je ne peux pas faire ça ici.";
  return { tweaks, message, understood };
}
