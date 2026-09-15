/** Embed web fonts because an SVG foreignObject cannot load external resources. */
export async function embedExportFonts(doc: Document): Promise<string> {
  const usedFamilies = new Set<string>();
  for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (!Array.from(element.childNodes).some((node) => node.nodeType === 3 && node.textContent?.trim())) continue;
    const family = doc.defaultView?.getComputedStyle(element).fontFamily || "";
    family.split(",").forEach((name) => usedFamilies.add(name.trim().replace(/["']/g, "").toLowerCase()));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const urls = [...new Set(Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) => link.href))];
    const sheets = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) throw new Error("La police du visuel n’a pas pu être chargée.");
      const css = await response.text();
      return css.replace(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi, (_, resource: string) => `url("${new URL(resource, url).href}")`);
    }));
    sheets.push(...Array.from(doc.querySelectorAll("style")).map((style) => style.textContent || ""));
    const rules = sheets.flatMap((css) => css.match(/@font-face\s*\{[^}]*\}/gi) || []).filter((rule) => {
      const family = rule.match(/font-family\s*:\s*([^;]+)/i)?.[1].trim().replace(/["']/g, "").toLowerCase();
      return family && usedFamilies.has(family);
    });
    const resources = new Map<string, Promise<string>>();
    const embed = (url: string) => {
      if (!resources.has(url)) resources.set(url, (async () => {
        const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error("La police du visuel n’a pas pu être intégrée.");
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Lecture de police impossible."));
          reader.readAsDataURL(blob);
        });
      })());
      return resources.get(url)!;
    };
    return (await Promise.all(rules.map(async (rule) => {
      const matches = Array.from(rule.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi));
      const replacements = await Promise.all(matches.map(async (match) => [match[0], match[1].startsWith("data:") ? match[1] : await embed(match[1])]));
      for (const [original, data] of replacements) rule = rule.replace(original, `url("${data}")`);
      return rule;
    }))).join("\n");
  } finally {
    clearTimeout(timeout);
  }
}
