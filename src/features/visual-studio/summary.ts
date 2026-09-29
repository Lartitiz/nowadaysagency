/** Removes tool-call envelope text from old Studio proposals shown in the UI. */
export function cleanStudioSummary(value: string) {
  return value.replace(/^\s*<summary>\s*/i, "")
    .split(/<\/summary>|<parameter\s+name=/i, 1)[0].trim();
}
