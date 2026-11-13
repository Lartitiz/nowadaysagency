// Fin des carrousels (13/11/2026) — bilan hebdo, testable, sans IA.
//
// #1937/#1947 puis la PR « fin du carrousel texte » : la dernière slide conclut
// puis finit sur UNE ouverture (geste précis ou question simple). Un geste ne se
// reconnaît pas sans IA ; une question, si. On relit donc les carrousels GARDÉS
// de la semaine (generated_carousels, texte complet) et on compte ceux dont ni
// la dernière slide ni la fin de la légende ne posent de question. La légende
// compte aussi (essai réel du 13/11 : fin de slide en geste, « isolez ce lot… »,
// et la question en légende) ; une fin en geste ET une légende sans question
// reste comptée, d'où le seuil à la moitié. Seuil de lecture : au moins 2
// carrousels sur la semaine et plus de la moitié sans question → alerte, à lire
// dans l'échantillon (geste concret, ou fin qui tombe à plat ?). « Photos
// brutes » (aucun texte) exclus. Seuls les carrousels créés depuis la mise en
// ligne comptent, sinon le premier lundi alerterait sur l'ancien comportement.

export const FIN_DEPUIS = "2026-11-14T00:00:00Z";
export const FIN_MIN_CARROUSELS = 2;

export interface FinCarrousels {
  carrousels: number;
  fin_question: number;
  /** Dernière slide sans question, mais légende finie par une question. */
  legende_question: number;
  sans_question: number;
  par_type: Record<string, { carrousels: number; sans_question: number }>;
  alerte: string | null;
}

const texteSlide = (s: any) => [s?.title, s?.body, s?.overlay_text, s?.kicker, s?.detail, s?.cta_label]
  .filter((t) => typeof t === "string" && t.trim()).join(" ");

/** Dernière ligne de la légende (hashtags retirés) finie par une question. */
export function legendeFinitParQuestion(caption: unknown): boolean {
  const texte = typeof caption === "string" ? caption
    : caption && typeof caption === "object" ? String((caption as any).cta || (caption as any).body || "") : "";
  const lignes = texte.split("\n").map((l) => l.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ").trim()).filter(Boolean);
  return !!lignes.length && /\?\s*$/.test(lignes[lignes.length - 1]);
}

export function finCarrouselsStats(
  rows: { carousel_type?: string | null; created_at: string | null; slides?: unknown; caption?: unknown }[],
  inWindow: (iso: string | null) => boolean,
  depuis = FIN_DEPUIS,
): FinCarrousels {
  let carrousels = 0, question = 0, legende = 0;
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
    else if (legendeFinitParQuestion(r.caption)) legende++;
    else t.sans_question++;
  }
  const sans = carrousels - question - legende;
  return {
    carrousels, fin_question: question, legende_question: legende, sans_question: sans, par_type,
    alerte: carrousels >= FIN_MIN_CARROUSELS && sans * 2 > carrousels
      ? `${sans} carrousel(s) sur ${carrousels} finissent sans question (ni en dernière slide ni en légende) : lire leur dernière slide (geste concret ou fin à plat ?) (carousel-ai/writing-contract.ts, continuous-narrative.ts)`
      : null,
  };
}
