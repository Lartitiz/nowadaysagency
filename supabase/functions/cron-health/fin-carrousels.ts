// Fin des carrousels (13/11/2026) — bilan hebdo, testable, sans IA.
//
// #1937/#1947 puis la PR « fin du carrousel texte » : la dernière slide conclut
// puis finit sur UNE ouverture (geste précis ou question simple). Un geste ne se
// reconnaît pas sans IA ; une question, si. On relit donc les carrousels GARDÉS
// de la semaine (generated_carousels, texte complet) et on compte ceux dont la
// dernière slide ne contient aucune question. Seuil de lecture : au moins 2
// carrousels sur la semaine et plus de la moitié sans question → alerte, à lire
// dans l'échantillon (geste concret, ou fin qui tombe à plat ?). « Photos
// brutes » (aucun texte) exclus. Seuls les carrousels créés depuis la mise en
// ligne comptent, sinon le premier lundi alerterait sur l'ancien comportement.

export const FIN_DEPUIS = "2026-11-14T00:00:00Z";
export const FIN_MIN_CARROUSELS = 2;

export interface FinCarrousels {
  carrousels: number;
  fin_question: number;
  sans_question: number;
  par_type: Record<string, { carrousels: number; sans_question: number }>;
  alerte: string | null;
}

const texteSlide = (s: any) => [s?.title, s?.body, s?.overlay_text, s?.kicker, s?.detail, s?.cta_label]
  .filter((t) => typeof t === "string" && t.trim()).join(" ");

export function finCarrouselsStats(
  rows: { carousel_type?: string | null; created_at: string | null; slides?: unknown }[],
  inWindow: (iso: string | null) => boolean,
  depuis = FIN_DEPUIS,
): FinCarrousels {
  let carrousels = 0, question = 0;
  const par_type: FinCarrousels["par_type"] = {};
  for (const r of rows) {
    if (!inWindow(r.created_at) || !r.created_at || r.created_at < depuis || !Array.isArray(r.slides)) continue;
    const textes = r.slides.map(texteSlide);
    const derniere = [...textes].reverse().find(Boolean);
    if (!derniere || textes.length < 2) continue;
    carrousels++;
    const type = r.carousel_type || "inconnu";
    const t = (par_type[type] ??= { carrousels: 0, sans_question: 0 });
    t.carrousels++;
    if (derniere.includes("?")) question++;
    else t.sans_question++;
  }
  const sans = carrousels - question;
  return {
    carrousels, fin_question: question, sans_question: sans, par_type,
    alerte: carrousels >= FIN_MIN_CARROUSELS && sans * 2 > carrousels
      ? `${sans} carrousel(s) sur ${carrousels} finissent sans question : lire leur dernière slide (geste concret ou fin à plat ?) (carousel-ai/writing-contract.ts, continuous-narrative.ts)`
      : null,
  };
}
