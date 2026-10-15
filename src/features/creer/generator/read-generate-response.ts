// Lecture de la réponse de `generate` : quota (par le code, AVANT l'erreur
// générique), erreurs du serveur, JSON tolérant, garde de forme et
// renumérotation des slides. Sorti de src/hooks/use-content-generator.ts à
// l'identique (fiche 17 de docs/robustesse/gros-fichiers.md, lot 3). Les photos
// d'ambiance restent dans le hook (vérification d'époque après leur `await`).
import { parseAIJson } from "@/features/creer/generator/tolerant-json";
import { renumberSlides } from "@/features/creer/format-mappers";
import type { GenerateParams } from "@/features/creer/generator/types";

export function readGenerateResponse(format: GenerateParams["format"], data: any, invokeError: any): any {
  // Quota : détection par le CODE structuré, AVANT le throw générique. Les
  // helpers d'invocation renvoient TOUJOURS le couple { data, error.isRateLimit }
  // sur un limit_reached — l'ancien throw générique sur invokeError passait donc
  // en premier, perdait data.quota (plan/usage du QuotaWallModal) et laissait la
  // détection retomber sur des substrings de message (fragiles depuis que les
  // messages quota n'emploient plus les mots « crédit »/« quota », PR #308).
  if (data?.error === "limit_reached" && data?.quota?.reason !== "error") {
    throw Object.assign(new Error(data?.message || invokeError?.message || "limit_reached"), { _isQuota: true, data });
  }
  if (invokeError) throw new Error(invokeError.message || "Erreur edge function");
  if (data?.error) throw new Error(data.message || data.error);

  // Edge functions wrap response in { content: "..." } — unwrap before parsing
  const rawContent = data?.content ?? data;
  const parsed = parseAIJson(rawContent);
  if (!parsed) throw new Error("La génération n'a pas fonctionné comme prévu. Réessaie, ça marche en général au deuxième essai 🌸");

  // Garde de forme : un JSON valide mais sans contenu exploitable (format
  // partiel renvoyé par l'IA) crasherait au rendu (.map sur non-array) et
  // serait persisté → l'ErrorBoundary reboucle. On le traite ici comme un
  // échec propre et réessayable, jamais comme un résultat affichable.
  const p: any = parsed;
  const hasUsableContent =
    format === "carousel"
      ? Array.isArray(p.slides) && p.slides.length > 0
      : format === "reel"
        ? (Array.isArray(p.sections) && p.sections.length > 0) || !!p.full_text
        : format === "story"
          ? Array.isArray(p.stories) || Array.isArray(p.sequences) || Array.isArray(p.slides)
          : true;
  if (!hasUsableContent) throw new Error("La génération n'a pas fonctionné comme prévu. Réessaie, ça marche en général au deuxième essai 🌸");

  // L'IA renvoie parfois des slide_number fantaisistes (« SLIDE 4.5 » vu en
  // live sur un carrousel mixte) : on renumérote 1..N dès la réception —
  // l'ordre du tableau fait foi (rendu, appariement visuels, exports).
  if (format === "carousel" && Array.isArray(p.slides)) {
    p.slides = renumberSlides(p.slides);
  }

  return parsed;
}
