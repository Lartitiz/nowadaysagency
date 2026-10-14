// Échecs de génération étiquetés par FORMAT dans Sentry (lot 5 « robustesse
// création de contenu », 13/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// Les trois chemins d'appel des générateurs (invokeWithTimeout,
// invokeWithHeartbeat, useStreamingInvoke) passent ici quand une génération
// échoue. Sentry reçoit un message groupé par fonction + format + type
// d'erreur, avec des tags filtrables : on voit tout de suite « LinkedIn
// échoue depuis le dernier déploiement » au lieu d'erreurs anonymes.
//
// Ne part JAMAIS : le contenu de la requête (sujet, réponses, brouillon),
// le message d'erreur brut. Seulement des catégories fermées.
// Ne compte pas comme un échec : quota atteint, session expirée, accès refusé.

import { Sentry } from "@/lib/sentry";

/** Edge functions de création de contenu suivies (les autres sont ignorées). */
export const GENERATION_FUNCTIONS = new Set([
  "creative-flow", "carousel-ai", "carousel-visual", "carousel-slide-image",
  "generate-content", "linkedin-ai", "pinterest-ai", "pinterest-visual", "pinterest-photo-brief",
  "pinterest-inspiration", "storytelling-ai", "inspire-ai", "ai-text-action",
  "newsjacking-ai", "newsjacking-angles", "newsjacking-from-url", "content-coaching",
]);

const IGNORED_CODES = new Set(["AUTH", "RATE_LIMIT", "FORBIDDEN", "SESSION_UNAVAILABLE"]);

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  // Valeurs d'énumération seulement : jamais un texte libre de l'utilisatrice.
  return /^[a-z0-9_-]{1,40}$/.test(s) ? s : null;
};

/** Format de creative-flow à partir de contentType (noms variables selon l'écran). */
export function creativeFlowFormat(contentType: unknown): string {
  const c = clean(contentType) ?? "";
  if (c.includes("linkedin")) return "linkedin";
  if (c.includes("newsletter") || c === "email") return "newsletter";
  if (c.includes("pinterest")) return "pinterest";
  if (c.includes("stor")) return "stories";
  if (c.includes("reel")) return "reel";
  if (c.includes("carrousel") || c.includes("carousel")) return "carousel";
  if (c.includes("recycl")) return "recycle";
  if (c.includes("post") || c.includes("instagram") || c.includes("caption")) return "post";
  return "inconnu";
}

/** { format, step } d'une requête de génération, sans rien lire d'autre que des énumérations. */
export function describeGeneration(functionName: string, body: any): { format: string; step: string } {
  const b = body && typeof body === "object" ? body : {};
  switch (functionName) {
    case "creative-flow": {
      const format = creativeFlowFormat(b.contentType);
      return { format: b.photo_mode === true ? `${format}+photo` : format, step: clean(b.step) ?? "inconnu" };
    }
    case "carousel-ai":
      return { format: `carousel:${clean(b.carousel_type) ?? "text"}`, step: clean(b.type) ?? "inconnu" };
    case "carousel-visual":
      return { format: `carousel:${clean(b.carousel_type) ?? "text"}`, step: "visual" };
    case "carousel-slide-image":
      return { format: "carousel", step: "slide-image" };
    case "generate-content":
      return { format: clean(b.type) ?? "inconnu", step: "generate" };
    case "linkedin-ai":
    case "pinterest-ai":
      return { format: functionName.replace("-ai", ""), step: clean(b.action) ?? "inconnu" };
    case "pinterest-visual":
    case "pinterest-photo-brief":
      return { format: "pinterest", step: clean(b.pin_type) ?? functionName };
    case "storytelling-ai":
      return { format: "storytelling", step: clean(b.type) ?? "inconnu" };
    default:
      return { format: functionName, step: clean(b.mode) ?? clean(b.action) ?? "generate" };
  }
}

/**
 * Signale l'échec d'une génération. Ne lève jamais : la télémétrie ne doit
 * pas créer une deuxième erreur dans le parcours.
 */
export function reportGenerationFailure(functionName: string, body: any, code: string | undefined): void {
  try {
    if (!GENERATION_FUNCTIONS.has(functionName)) return;
    const errorCode = code || "UNKNOWN";
    if (IGNORED_CODES.has(errorCode)) return;
    const { format, step } = describeGeneration(functionName, body);
    if (!import.meta.env.PROD) return;
    (Sentry as any).captureMessage(`Génération échouée : ${functionName} / ${format}`, {
      level: "error",
      tags: { generation_function: functionName, generation_format: format, generation_step: step, generation_error: errorCode },
      fingerprint: ["generation-failure", functionName, format, errorCode],
    });
  } catch {
    // Silence voulu : ne jamais casser le parcours pour de la télémétrie.
  }
}
