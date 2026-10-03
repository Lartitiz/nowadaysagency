// SCHÉMAS dessinés PAR LE CODE dans le carrousel mixte (03/10/2026, piste B
// choisie par Laetitia sur maquette « Schémas du carrousel mixte ») : la slide
// texte qui porte un schéma devient une slide « pause » sur l'aplat de charte,
// texte entier en haut, schéma en cartes claires en dessous.
//
// Seuls les types listés ici sont dessinés ; l'étage de schémas ne propose que
// ceux-là pour le mixte (MIX_SCHEMA_TYPES). Le dessin reprend les libellés du
// schéma tels quels (déjà validés contre le texte de la slide) ; aucun cercle,
// aucun numéro (méthode design de Laetitia) : les repères sont des losanges.

export const MIX_SCHEMA_TYPES = [
  "before_after", "comparison", "timeline", "process_visible", "story_arc", "checklist", "stats", "quote_big", "objection_response",
] as const;

export interface MixSchemaColors {
  card: string;      // fond des cartes (fond de charte)
  cardAlt: string;   // carte mise en avant (après, droite, réponse)
  ink: string;       // texte dans les cartes
  soft: string;      // texte secondaire, filets
  accent: string;    // dernier repère d'une suite
}
export interface MixSchemaFonts { title: string; body: string }

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const str = (v: unknown) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

/** Lignes estimées (même règle prudente que la composition du mixte). */
function lines(text: string, width: number, size: number): number {
  if (!text) return 0;
  const capacity = Math.max(1, Math.floor(width / (size * .56)));
  let count = 1, used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > capacity) { count += Math.floor(word.length / capacity); used = word.length % capacity; }
    else if (used && used + word.length + 1 > capacity) { count++; used = word.length; }
    else used += word.length + (used ? 1 : 0);
  }
  return count;
}
const textH = (text: string, width: number, size: number, lh: number) => Math.ceil(lines(text, width, size) * size * lh);

// Plancher 32 px partout : sous 32 px l'éditeur bloque la publication (mobile).
const LABEL = 32, ITEM = 34, DESC = 32, PAD = 32, GAP = 24, RADIUS_MAX = 16;

function diamond(color: string, size = 16): string {
  return `<span style="display:inline-block;flex:none;width:${size}px;height:${size}px;background:${color};transform:rotate(45deg);"></span>`;
}

function card(bg: string, radius: number, inner: string, extra = ""): string {
  return `<div style="background:${bg};border-radius:${radius}px;padding:${PAD - 4}px ${PAD}px ${PAD - 8}px;box-sizing:border-box;${extra}">${inner}</div>`;
}

/** Deux colonnes étiquetées (avant/après, comparaison). */
function twoColumns(left: { label: string; items: string[] }, right: { label: string; items: string[] }, w: number, c: MixSchemaColors, f: MixSchemaFonts, r: number) {
  const colW = (w - GAP) / 2, inner = colW - 2 * PAD;
  const col = (side: { label: string; items: string[] }, bg: string) => {
    const items = side.items.map(i => `<div style="padding:12px 0;border-top:1px solid ${c.soft};font-family:${f.body};font-size:${ITEM}px;line-height:1.3;color:${c.ink};">${esc(i)}</div>`).join("");
    return card(bg, r, `<div style="font-family:${f.body};font-size:${LABEL}px;letter-spacing:.12em;text-transform:uppercase;line-height:1.3;color:${c.ink};padding-bottom:14px;">${esc(side.label)}</div>${items}`);
  };
  const colH = (side: { label: string; items: string[] }) => PAD - 4 + Math.ceil(LABEL * 1.3) + 14 + side.items.reduce((h, i) => h + 25 + textH(i, inner, ITEM, 1.3), 0) + PAD - 8;
  return {
    html: `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${GAP}px;align-items:stretch;">${col(left, c.card)}${col(right, c.cardAlt)}</div>`,
    height: Math.max(colH(left), colH(right)),
  };
}

/** Frise horizontale à losanges (étapes, chronologie, arc). Plus de 4 étapes :
 * liste verticale, toujours lisible. */
function frise(steps: Array<{ label: string; desc: string }>, w: number, c: MixSchemaColors, f: MixSchemaFonts, r: number) {
  const innerW = w - 2 * PAD;
  if (steps.length <= 4) {
    const colW = (innerW - (steps.length - 1) * GAP) / steps.length;
    const cell = (s: { label: string; desc: string }, i: number) => `<div style="display:flex;flex-direction:column;gap:10px;min-width:0;">${diamond(i === steps.length - 1 ? c.accent : c.ink)}<div style="margin-top:6px;font-family:${f.title};font-size:36px;line-height:1.2;color:${c.ink};">${esc(s.label)}</div>${s.desc ? `<div style="font-family:${f.body};font-size:${DESC}px;line-height:1.3;color:${c.ink};opacity:1;">${esc(s.desc)}</div>` : ""}</div>`;
    const h = Math.max(...steps.map(s => 16 + 16 + textH(s.label, colW, 36, 1.2) + (s.desc ? 10 + textH(s.desc, colW, DESC, 1.3) : 0)));
    const inner = `<div style="position:relative;"><div style="position:absolute;left:8px;right:0;top:8px;height:2px;background:${c.soft};"></div><div style="position:relative;display:grid;grid-template-columns:repeat(${steps.length},minmax(0,1fr));gap:${GAP}px;">${steps.map(cell).join("")}</div></div>`;
    return { html: card(c.card, r, inner), height: PAD - 4 + h + PAD - 8 };
  }
  const textW = innerW - 40;
  const rows = steps.map((s, i) => `<div style="display:flex;align-items:baseline;gap:24px;padding:12px 0;${i ? `border-top:1px solid ${c.soft};` : ""}">${diamond(i === steps.length - 1 ? c.accent : c.ink, 14)}<div style="min-width:0;"><span style="font-family:${f.title};font-size:36px;line-height:1.25;color:${c.ink};">${esc(s.label)}</span>${s.desc ? `<span style="font-family:${f.body};font-size:${DESC}px;line-height:1.3;color:${c.ink};"> · ${esc(s.desc)}</span>` : ""}</div></div>`).join("");
  const h = steps.reduce((sum, s) => sum + 24 + textH(s.label + (s.desc ? " · " + s.desc : ""), textW, 36, 1.3), 0);
  return { html: card(c.card, r, rows), height: PAD - 4 + h + PAD - 8 };
}

/** HTML et hauteur (px, largeur `w`) du schéma, ou null si le type n'est pas dessiné par le code. */
export function mixSchemaBlock(schema: any, w: number, colors: MixSchemaColors, fonts: MixSchemaFonts, radius: number): { html: string; height: number } | null {
  if (!schema || typeof schema !== "object" || !(MIX_SCHEMA_TYPES as readonly string[]).includes(schema.type)) return null;
  const r = Math.min(RADIUS_MAX, Math.max(0, radius));
  const list = (v: unknown) => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
  let block: { html: string; height: number } | null = null;
  switch (schema.type) {
    case "before_after":
    case "comparison": {
      const [a, b] = schema.type === "before_after" ? [schema.before, schema.after] : [schema.left, schema.right];
      const left = { label: str(a?.label), items: list(a?.items) }, right = { label: str(b?.label), items: list(b?.items) };
      if (!left.label || !right.label || !left.items.length || !right.items.length) return null;
      block = twoColumns(left, right, w, colors, fonts, r);
      break;
    }
    case "timeline":
    case "story_arc":
    case "process_visible": {
      const raw = schema.type === "process_visible" ? schema.stages : schema.steps;
      const steps = (Array.isArray(raw) ? raw : []).map((s: any) => ({ label: str(s?.label), desc: str(s?.desc) })).filter((s: { label: string }) => s.label);
      if (steps.length < 2 || steps.length > 6) return null;
      block = frise(steps, w, colors, fonts, r);
      break;
    }
    case "checklist": {
      const items = (Array.isArray(schema.items) ? schema.items : []).map((x: any) => str(x?.text)).filter(Boolean);
      if (items.length < 2) return null;
      const title = str(schema.title), innerW = w - 2 * PAD - 44;
      const check = `<svg width="28" height="28" viewBox="0 0 28 28" style="flex:none;margin-top:4px;"><path d="M5 15l6 6L23 8" fill="none" stroke="${colors.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const rows = items.map((t: string, i: number) => `<div style="display:flex;gap:16px;align-items:flex-start;padding:10px 0;${i ? `border-top:1px solid ${colors.soft};` : ""}">${check}<div style="font-family:${fonts.body};font-size:${ITEM}px;line-height:1.3;color:${colors.ink};">${esc(t)}</div></div>`).join("");
      const head = title ? `<div style="font-family:${fonts.title};font-size:36px;line-height:1.2;color:${colors.ink};padding-bottom:12px;">${esc(title)}</div>` : "";
      const h = (title ? textH(title, w - 2 * PAD, 36, 1.2) + 12 : 0) + items.reduce((s: number, t: string) => s + 21 + textH(t, innerW, ITEM, 1.3), 0);
      block = { html: card(colors.card, r, head + rows), height: PAD - 4 + h + PAD - 8 };
      break;
    }
    case "stats": {
      const items = (Array.isArray(schema.items) ? schema.items : []).map((x: any) => ({ number: str(x?.number), label: str(x?.label) })).filter((x: { number: string; label: string }) => x.number && x.label).slice(0, 4);
      if (!items.length) return null;
      const n = items.length, colW = (w - (n - 1) * GAP) / n, inner = colW - 2 * PAD;
      const size = n >= 3 ? 72 : 96;
      const cells = items.map((x: { number: string; label: string }, i: number) => card(i === n - 1 ? colors.cardAlt : colors.card, r,
        `<div style="font-family:${fonts.title};font-size:${size}px;line-height:1;color:${colors.ink};">${esc(x.number)}</div><div style="margin-top:12px;font-family:${fonts.body};font-size:${DESC}px;line-height:1.3;color:${colors.ink};">${esc(x.label)}</div>`)).join("");
      const h = Math.max(...items.map((x: { number: string; label: string }) => lines(x.number, inner, size) * size + 12 + textH(x.label, inner, DESC, 1.3)));
      block = { html: `<div style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr));gap:${GAP}px;">${cells}</div>`, height: PAD - 4 + h + PAD - 8 };
      break;
    }
    case "quote_big": {
      const quote = str(schema.quote), who = str(schema.attribution);
      if (!quote) return null;
      const innerW = w - 2 * PAD;
      block = { html: card(colors.card, r, `<div style="font-family:${fonts.title};font-style:italic;font-size:40px;line-height:1.3;color:${colors.ink};">« ${esc(quote)} »</div>${who ? `<div style="margin-top:14px;font-family:${fonts.body};font-size:${LABEL}px;letter-spacing:.08em;text-transform:uppercase;color:${colors.ink};">${esc(who)}</div>` : ""}`),
        height: PAD - 4 + textH(`« ${quote} »`, innerW, 40, 1.3) + (who ? 14 + Math.ceil(LABEL * 1.3) * lines(who, innerW, LABEL) : 0) + PAD - 8 };
      break;
    }
    case "objection_response": {
      const o = str(schema.objection), a = str(schema.response);
      if (!o || !a) return null;
      const innerW = w - 2 * PAD;
      const part = (text: string, bg: string, serif: boolean) => card(bg, r, `<div style="font-family:${serif ? fonts.title : fonts.body};font-size:${serif ? 36 : ITEM}px;line-height:1.3;color:${colors.ink};">${esc(text)}</div>`);
      block = { html: `<div style="display:flex;flex-direction:column;gap:16px;">${part(o, colors.card, true)}${part(a, colors.cardAlt, false)}</div>`,
        height: 2 * (PAD - 4 + PAD - 8) + 16 + textH(o, innerW, 36, 1.3) + textH(a, innerW, ITEM, 1.3) };
      break;
    }
  }
  if (!block) return null;
  return { html: `<div data-mix-schema="${esc(schema.type)}" style="margin-top:40px;">${block.html}</div>`, height: block.height + 40 };
}
