/**
 * Helper Recraft partagé — génère une illustration vectorielle (SVG) « aplat
 * 2 tons » aux couleurs de la charte, et compose une slide de couverture.
 *
 * Leçon lot 1 + lot 2 : Recraft V3 vectoriel illustre toujours une SCÈNE (il
 * ne sait pas faire un picto nu). On l'assume : c'est parfait pour une grande
 * illustration de couverture. Les couleurs sont IMPOSÉES via `controls`, le
 * texte interdit nativement (`no_text` + negative_prompt).
 */

const RECRAFT_URL = "https://external.api.recraft.ai/v1/images/generations";
const RECRAFT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface RecraftColors {
  primary: Rgb;
  secondary: Rgb;
  background: Rgb;
}

/**
 * Appelle Recraft et renvoie le SVG brut (string). Retry 1× sur 5xx/timeout.
 * Lance une Error (message parlant, détail 4xx inclus) en cas d'échec — les
 * logs edge étant inaccessibles, l'appelant peut la remonter.
 */
export async function fetchRecraftIllustrationSvg(
  concept: string,
  colors: RecraftColors,
  recraftKey: string,
  opts?: { substyle?: string; promptSuffix?: string; timeoutMs?: number },
): Promise<string> {
  const substyle = opts?.substyle || "roundish_flat";
  const prompt =
    `flat vector illustration of ${concept}, ` +
    "clean composition, friendly, minimal, editorial" +
    (opts?.promptSuffix ? `, ${opts.promptSuffix}` : "");

  const payload = {
    prompt,
    negative_prompt:
      "text, letters, numbers, words, watermark, frame, border, photorealistic, 3d, harsh shadows",
    model: "recraftv3",
    style: "vector_illustration",
    substyle,
    size: "1024x1024",
    n: 1,
    controls: {
      colors: [{ rgb: colors.primary }, { rgb: colors.secondary }],
      background_color: { rgb: colors.background },
      no_text: true,
    },
  };

  let res: Response | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(RECRAFT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${recraftKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(opts?.timeoutMs ?? RECRAFT_TIMEOUT_MS),
      });
      if (res.ok) break;
      if (res.status >= 500 && attempt === 0) {
        await res.text().catch(() => "");
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      break;
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      lastError = isTimeout ? "Recraft timeout" : (e instanceof Error ? e.message : "fetch error");
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      res = null;
    }
  }

  if (!res) throw new Error(`Recraft indisponible: ${lastError || "réseau"}`);
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Recraft ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const json = await res.json().catch(() => null);
  const imageUrl: string | undefined = json?.data?.[0]?.url;
  if (!imageUrl) throw new Error("Réponse Recraft sans URL");

  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`Téléchargement illustration impossible (${imgRes.status})`);
  return await imgRes.text();
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface CoverCharter {
  color_primary: string;
  color_text: string;
  color_background: string;
  font_title: string;
  font_body: string;
  texture_url?: string;
}

/**
 * Compose la slide de couverture EN DUR (layout A validé : titre en haut,
 * illustration pleine largeur ancrée en bas). Déterministe — pas de l'IA —
 * pour coller à la maquette. L'illustration est embarquée en data-URI (zéro
 * dépendance réseau à l'export html2canvas). Le titre porte l'ancre
 * `data-slide-text="title"` (compat édition live).
 */
export function buildCoverSlideHtml(params: {
  title: string;
  kicker?: string;
  illustrationSvg: string;
  ch: CoverCharter;
}): string {
  const { title, kicker, illustrationSvg, ch } = params;
  const safeFontTitle = (ch.font_title || "Libre Baskerville").replace(/[<>"'&]/g, "");
  const safeFontBody = (ch.font_body || "Inter").replace(/[<>"'&]/g, "");
  const dataUri = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(illustrationSvg)));

  const bg = ch.texture_url
    ? `url('${ch.texture_url}') center/cover`
    : (ch.color_background || "#F6F4F0");

  const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(safeFontTitle)}:ital,wght@0,400;0,700;1,400&family=${encodeURIComponent(safeFontBody)}:wght@400;500;600;700&display=swap" rel="stylesheet">`;

  const kickerHtml = kicker
    ? `<span style="font-family:'${safeFontBody}',sans-serif;font-size:26px;letter-spacing:5px;text-transform:uppercase;color:${ch.color_primary};font-weight:600">${escapeHtml(kicker)}</span>`
    : "";

  return (
    fontsLink +
    `<div style="width:1080px;height:1350px;background:${bg};position:relative;overflow:hidden">` +
    `<div style="padding:96px 84px 0;position:relative;z-index:2">` +
    kickerHtml +
    `<h1 data-slide-text="title" style="font-family:'${safeFontTitle}',serif;font-weight:400;font-size:78px;line-height:1.16;color:${ch.color_text};margin:${kicker ? "32px" : "0"} 0 0">${escapeHtml(title)}</h1>` +
    `</div>` +
    `<img src="${dataUri}" alt="" style="position:absolute;bottom:0;left:0;width:1080px;height:680px;object-fit:cover;object-position:bottom;z-index:1"/>` +
    `</div>`
  );
}
