/**
 * Centralised branding utilities – parsing helpers used across the branding module.
 */

/**
 * Parse a value (string, array, or JSON-stringified array) into a string[].
 * Splits on common bullet / list characters and strips leading numbering.
 */
export function parseToArray(value: any): string[] {
  if (!value) return [];

  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  if (typeof value === "string") {
    // Try JSON first (handles stringified arrays)
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // not JSON – continue
    }

    return value
      .split(/[\n•\-●]/)
      .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Parse a value into tag-style tokens split by comma, semicolon, slash, or newline.
 * Cleans surrounding quotes, dashes and bullets from each token.
 */
export function parseToTags(value: any): string[] {
  if (!value) return [];

  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // not JSON – continue
    }

    return value
      .split(/[,;/\n]/)
      .map((s) => s.replace(/^[\s"'\-•●]+|[\s"'\-•●]+$/g, "").trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Safely parse a JSON string or return the value as-is if already an object.
 * Returns null on failure or falsy input.
 */
export function safeParseJson(val: any): any {
  if (!val) return null;
  if (typeof val === "object") return val;

  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/**
 * Like parseToArray but also splits on long dashes (– and —).
 */
export function parseStringList(value: any): string[] {
  if (!value) return [];

  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // not JSON – continue
    }

    return value
      .split(/[\n•\-●–—]/)
      .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean);
  }

  return [];
}
