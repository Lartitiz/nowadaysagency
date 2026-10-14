// Échantillon de contenus réels à juger au bilan du lundi (grille /5).
// Ordre des sources :
//   1. content_quality_events des clientes (écrits à CHAQUE génération) ;
//   2. carrousels GARDÉS des clientes (generated_carousels, rows d'avant la
//      colonne content_preview) ;
//   3. (14/10/2026) semaine sans cliente : events des comptes internes, pour
//      que le juge ne reste pas aveugle les semaines calmes. Étiqueté à part :
//      ce n'est pas la qualité vue par les clientes.
import { hasPreviewText } from "./garde-redite.ts";

export type EchantillonSource = "events" | "brouillons" | "comptes_internes";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const trunc = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

const slideApercu = (slides: unknown): string[] => {
  if (!Array.isArray(slides)) return [];
  return slides.slice(0, 4).map((sl: Row | string) => {
    const t = typeof sl === "object" && sl ? sl.title || sl.heading || sl.text || sl.body || sl.content || "" : "";
    if (typeof t === "string" && t.trim()) return trunc(t, 120);
    return trunc(typeof sl === "string" ? sl : JSON.stringify(sl), 120);
  });
};

const depuisEvents = (events: Row[]) =>
  events.slice(0, 15).map((e, i) => {
    const p = e.content_preview || {};
    return {
      ref: `c${i + 1}`,
      format: e.format,
      sujet: trunc(p.sujet, 100),
      hook: trunc(p.hook, 140),
      caption: trunc(p.caption, 300),
      apercu_slides: Array.isArray(p.apercu_slides) ? p.apercu_slides.slice(0, 4) : [],
      quality_score: typeof e.redac_score === "number" ? e.redac_score : null,
    };
  });

export function construireEchantillon(opts: {
  clientEvents: Row[]; // events clientes de la semaine
  internalEvents: Row[]; // events comptes internes de la semaine
  carrouselsGardes: Row[]; // generated_carousels clientes de la semaine
  estRetravaille: (c: Row) => boolean;
}): { echantillon: Row[]; echantillon_source: EchantillonSource } {
  const clients = opts.clientEvents.filter((e) => hasPreviewText(e.content_preview));
  if (clients.length) return { echantillon_source: "events", echantillon: depuisEvents(clients) };
  if (opts.carrouselsGardes.length) {
    return {
      echantillon_source: "brouillons",
      echantillon: opts.carrouselsGardes.slice(0, 15).map((c, i) => ({
        ref: `c${i + 1}`,
        format: c.carousel_type,
        sujet: trunc(c.subject, 100),
        hook: trunc(c.hook_text, 140),
        caption: trunc(c.caption, 300),
        apercu_slides: slideApercu(c.slides),
        quality_score: typeof c.quality_score === "number" ? c.quality_score : null,
        retravaille: opts.estRetravaille(c),
        au_calendrier: !!c.calendar_post_id,
      })),
    };
  }
  const internes = opts.internalEvents.filter((e) => hasPreviewText(e.content_preview));
  if (internes.length) return { echantillon_source: "comptes_internes", echantillon: depuisEvents(internes) };
  return { echantillon_source: "brouillons", echantillon: [] };
}
