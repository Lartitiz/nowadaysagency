// ── Réparation LOCALE du fil (08/10/2026) ──
// La réparation du fil réécrivait tout le carrousel (~75-90 s à 12-14 slides) :
// faute de temps elle était sautée (#1385) et le carrousel partait avec ses
// ruptures. Quand le juge nomme des défauts qui touchent peu de slides, le
// rédacteur ne réécrit que ces slides et leurs voisines ; le programme les remet
// à leur place, puis TOUT le carrousel repasse les invariants et le 2e juge
// (un défaut d'ensemble ne se voit pas slide par slide).

/** Défauts qui portent sur le propos entier : seule une réécriture complète les traite. */
const GLOBAL_DEFECT_TYPES = new Set(["unclear_idea", "promise"]);

const slideIndex = (id: unknown): number | null => {
  const m = typeof id === "string" ? /^slides\.(\d+)$/.exec(id) : null;
  return m ? Number(m[1]) : null;
};

export type LocalRepairPlan = { targets: number[] } | { targets: null; reason: string };

/**
 * Positions (0-based) des slides à réécrire, ou la raison qui impose une
 * réécriture complète (défaut global, mal localisé ou trop étendu).
 */
export function localRepairPlan(report: any, slideCount: number): LocalRepairPlan {
  const full = (reason: string): LocalRepairPlan => ({ targets: null, reason });
  if (!report) return full("no-report");
  if (slideCount < 4) return full("short-carousel");
  if (report.trajectory?.kind === "descriptive_catalogue") return full("descriptive_catalogue");
  const defects: any[] = Array.isArray(report.defects) ? report.defects : [];
  const ruptures = (Array.isArray(report.boundaries) ? report.boundaries : []).filter((b: any) => b?.kind === "rupture");
  if (!defects.length && !ruptures.length) return full("unlocated");
  const targets = new Set<number>();
  const add = (i: number | null) => {
    if (i === null || i < 0 || i >= slideCount) return false;
    targets.add(i);
    return true;
  };
  for (const d of defects) {
    if (GLOBAL_DEFECT_TYPES.has(d?.type)) return full(`global-defect:${d.type}`);
    // Une légende ne se répare pas dans les slides : réécriture complète.
    const fieldIds: string[] = Array.isArray(d?.field_ids) ? d.field_ids : [];
    if (fieldIds.length && fieldIds.every((id) => /^(carousel\.)?(caption|instagram_caption)\b/.test(id))) return full("caption");
    const ids: unknown[] = Array.isArray(d?.slide_ids) ? d.slide_ids : [];
    if (!ids.length) return full("unlocated");
    for (const id of ids) {
      const i = slideIndex(id);
      if (!add(i)) return full("unlocated");
      // Contrat REPAIR : un défaut local se travaille avec ses voisins. Une
      // rupture désigne déjà les deux côtés du raccord (frontière ci-dessous).
      if (d.type !== "rupture") {
        add(i! - 1);
        add(i! + 1);
      }
    }
  }
  for (const b of ruptures) {
    if (!add(slideIndex(b.from)) || !add(slideIndex(b.to))) return full("unlocated");
  }
  // Au-delà de la moitié du carrousel, ce n'est plus local.
  if (targets.size > Math.floor(slideCount / 2)) return full(`too-wide:${targets.size}/${slideCount}`);
  return { targets: [...targets].sort((a, b) => a - b) };
}

export function localRepairTargets(report: any, slideCount: number): number[] | null {
  return localRepairPlan(report, slideCount).targets;
}

/**
 * Durée attendue d'une réparation locale : la réflexion du rédacteur ne
 * diminue pas au prorata (Opus 5.5 réfléchit ~50 s avant le 1er mot d'un
 * carrousel de 12 slides, puis écrit en ~17 s), d'où une part fixe.
 */
export function expectedLocalRepairMs(writeMs: number, targets: number, slideCount: number): number {
  if (!writeMs || !slideCount) return 0;
  return Math.round(writeMs * (0.4 + 0.6 * Math.min(1, targets / slideCount)));
}

export function localRepairInstruction(targets: number[], doc: any): string {
  const numbers = targets.map((i) => i + 1).join(", ");
  return `RÉPARATION LOCALE : réécris SEULEMENT les slides ${numbers} (sur ${doc.slides.length}, numérotées à partir de 1) pour corriger les défauts ci-dessus. ` +
    `Toutes les autres slides restent telles quelles : elles sont le contexte que tes slides doivent reprendre et préparer. Les règles de réparation ci-dessus s'appliquent à ces slides ; ne touche ni à la légende, ni au fil, ni à editorial_intent. ` +
    `Cette consigne remplace celle de renvoyer le JSON complet : renvoie UNIQUEMENT un objet JSON {"slides":[...]} contenant ces ${targets.length} slides, dans l'ordre, ` +
    `chacune complète avec tous ses champs et les mêmes slide_number, id, slide_type, photo_index et role que dans le brouillon.`;
}

/**
 * Remet les slides réécrites à leur place. null si la réponse ne correspond pas
 * aux slides demandées (nombre, numéros) : le brouillon jugé reste alors.
 */
export function mergeLocalRepair(doc: any, targets: number[], candidate: any): any | null {
  const returned: any[] = Array.isArray(candidate?.slides) ? candidate.slides : [];
  let byTarget: any[];
  if (returned.length === targets.length) byTarget = returned;
  // Le rédacteur a renvoyé tout le carrousel : on n'en prend que les slides demandées.
  else if (returned.length === doc.slides.length) byTarget = targets.map((i) => returned[i]);
  else return null;
  const slides = doc.slides.slice();
  for (const [j, i] of targets.entries()) {
    const next = byTarget[j];
    if (!next || typeof next !== "object" || Array.isArray(next)) return null;
    const original = slides[i];
    if (original?.slide_number != null && next.slide_number != null && next.slide_number !== original.slide_number) return null;
    slides[i] = { ...original, ...next };
  }
  return { ...doc, slides };
}
