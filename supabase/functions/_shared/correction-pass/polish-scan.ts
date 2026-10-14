// Déplacé à l'identique depuis _shared/correction-pass.ts (lot 2 du découpage,
// 14/10/2026, docs/robustesse/gros-fichiers.md fiche 9). correction-pass.ts le réexporte.

// ── Scan déterministe « faut-il corriger ? » (audit photo 22/07) ──────────────
// La passe de correction Haiku tournait sur CHAQUE carrousel, même déjà propre :
// latence + coût + un round-trip de réécriture = un vecteur de mots collés en
// plus. Ce scan (zéro LLM) repère les tics que la passe sait traiter ; s'il ne
// trouve rien, on saute l'appel. Conservateur : au moindre doute (JSON illisible,
// structure inattendue) → true, on lance la passe (comportement historique).
const CONSEIL_NUM_RE = /\b(conseil|erreur|astuce|[ée]tape|secret|r[èe]gle|le[çc]on)\s*(n[°ºo]?\s*)?\d+/i;
const CTA_GENERIC_RE = /\bet\s+(toi|vous)\s*,?\s*(qu[' ]?en\s+(penses|pensez)|comment\b|que\s+(fais|faites|pens))/i;
const SLOGAN_PATTERNS: RegExp[] = [
  /quand la magie op[eè]re/i,
  /un instant suspendu/i,
  /l['’]art (du|de la) d[ée]tail/i,
  /l['’]essentiel est (invisible|ailleurs)/i,
  /la beaut[ée] (est|réside) dans/i,
];

function splitSentences(text: string): string[] {
  return (text || "").split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
}

function firstWordNorm(sentence: string): string {
  const m = (sentence || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9']+/);
  return m ? m[0] : "";
}

/**
 * Le carrousel présente-t-il un tic que la passe de correction sait traiter ?
 * Les champs « prose » (title/body/caption) sont scannés pour rafales de phrases
 * courtes + anaphores ; les champs « overlay » (courts par nature en mode photo)
 * ne le sont QUE pour les slogans manufacturés — jamais pour la longueur.
 * Exporté pour être testé directement.
 */
export function carouselNeedsPolish(jsonContent: string): boolean {
  let parsed: any;
  try {
    const m = jsonContent.match(/\{[\s\S]*\}/);
    if (!m) return true;
    parsed = JSON.parse(m[0]);
  } catch {
    return true;
  }
  const slides: any[] = Array.isArray(parsed?.slides)
    ? parsed.slides
    : Array.isArray(parsed?.carousel?.slides)
      ? parsed.carousel.slides
      : [];
  if (slides.length === 0) return true;

  const proseFields: string[] = [];
  for (const s of slides) {
    for (const k of ["title", "body", "punchline"]) {
      if (typeof s?.[k] === "string" && s[k].trim()) proseFields.push(s[k]);
    }
  }
  const cap = parsed?.caption;
  const captionText = cap && typeof cap === "object"
    ? [cap.hook, cap.body, cap.cta].filter(Boolean).join(" ")
    : typeof cap === "string" ? cap : "";
  if (captionText.trim()) proseFields.push(captionText);

  // Tout le texte affiché (overlays courts compris) pour les motifs "présence".
  const shortFields: string[] = [];
  for (const s of slides) {
    for (const k of ["overlay_text", "kicker", "detail", "cta_label", "attribution"]) {
      if (typeof s?.[k] === "string" && s[k].trim()) shortFields.push(s[k]);
    }
    if (Array.isArray(s?.points)) {
      for (const p of s.points) if (typeof p === "string" && p.trim()) shortFields.push(p);
    }
  }
  const allText = [...proseFields, ...shortFields].join("\n");

  if (CONSEIL_NUM_RE.test(allText)) return true;
  if (CTA_GENERIC_RE.test(allText)) return true;
  if (SLOGAN_PATTERNS.some((re) => re.test(allText))) return true;

  // Anaphores : 3 phrases consécutives d'un même champ prose démarrant pareil.
  for (const field of proseFields) {
    const sentences = splitSentences(field);
    let run = 1;
    for (let i = 1; i < sentences.length; i++) {
      const a = firstWordNorm(sentences[i - 1]);
      const b = firstWordNorm(sentences[i]);
      if (a && a === b) {
        run++;
        if (run >= 3) return true;
      } else {
        run = 1;
      }
    }
  }

  // Rafales : 2 phrases consécutives < 7 mots dans un champ prose (broetry).
  for (const field of proseFields) {
    const sentences = splitSentences(field);
    for (let i = 1; i < sentences.length; i++) {
      const w1 = sentences[i - 1].split(/\s+/).filter(Boolean).length;
      const w2 = sentences[i].split(/\s+/).filter(Boolean).length;
      if (w1 > 0 && w1 < 7 && w2 > 0 && w2 < 7) return true;
    }
  }

  // Slide TEXTE (pas une slide photo à overlay) anormalement courte hors slide 1 :
  // la passe la développe (règle « slide-titre → 2-4 phrases »). On n'applique
  // ceci QU'aux slides texte — un overlay photo court est voulu.
  for (let i = 1; i < slides.length; i++) {
    const s = slides[i];
    const isPhotoSlide = typeof s?.overlay_text === "string" && s.overlay_text.trim();
    if (isPhotoSlide) continue;
    const proseWc = [s?.title, s?.body].filter((v) => typeof v === "string" && v.trim()).join(" ").split(/\s+/).filter(Boolean).length;
    if (proseWc > 0 && proseWc < 12) return true;
  }

  return false;
}
