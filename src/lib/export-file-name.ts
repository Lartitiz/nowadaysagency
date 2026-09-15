/** A portable download name; the title inside the document remains untouched. */
export function exportFileName(stem: string, extension: "zip" | "png" | "pptx"): string {
  // Every retained character occupies at most two UTF-8 bytes. Keep room for
  // the extension and filesystem-added suffixes below the 255-byte limit.
  let safe = stem.normalize("NFC")
    .replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\-_.]/g, "-")
    .slice(0, 100)
    .replace(/^[.-]+|[.-]+$/g, "");
  if (!safe) safe = "export";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `export-${safe}`;
  return `${safe}.${extension}`;
}
