type CharterColors = {
  confidence?: string;
  color_primary?: string | null;
  color_secondary?: string | null;
  color_accent?: string | null;
  color_background?: string | null;
  color_text?: string | null;
};

const COLOR_FIELDS = ["color_primary", "color_secondary", "color_accent", "color_background", "color_text"] as const;

function normalizeHex(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(hex)) return hex.slice(0, 7);
  if (/^#[0-9a-f]{4}$/.test(hex)) return `#${[...hex.slice(1, 4)].map((digit) => digit + digit).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map((digit) => digit + digit).join("")}`;
  return null;
}

/** A color described as detected must occur in the site's collected CSS hints. */
export function validateSitePalette<T extends CharterColors>(charter: T, styleHints: string): T {
  const observed = new Set(
    (styleHints.match(/#[0-9a-fA-F]{3,8}\b/g) || [])
      .map(normalizeHex)
      .filter((hex): hex is string => !!hex),
  );
  const result = { ...charter };
  if (charter.confidence !== "high") return result;

  let accepted = 0;
  for (const field of COLOR_FIELDS) {
    const value = charter[field];
    if (!value) continue;
    const normalized = normalizeHex(value);
    if (normalized && observed.has(normalized)) {
      result[field] = normalized as T[typeof field];
      accepted++;
    } else {
      result[field] = null as T[typeof field];
    }
  }
  if (accepted === 0) result.confidence = "low";
  return result;
}
