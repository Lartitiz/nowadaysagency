/**
 * Attend que les polices de chaque bloc de texte soient chargées dans `doc`.
 * Les fontes de marque vivent dans le srcdoc, pas toujours dans la page React.
 * Une demande explicite par graisse/taille évite qu'un export lancé juste
 * après l'affichage capture la police de secours pendant le chargement.
 */
export async function waitForTextFonts(doc: Document, timeoutMs: number): Promise<void> {
  try {
    if (!doc.fonts?.ready) return;
    await Promise.race([
      doc.fonts.ready,
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);
    const textElements = Array.from(doc.querySelectorAll<HTMLElement>("[data-story-pptx], [data-pptx-editable], [data-slide-text]"));
    const requested = new Set<string>();
    const loads = textElements.flatMap((el) => {
      const cs = doc.defaultView?.getComputedStyle(el);
      if (!cs) return [];
      const shorthand = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const key = `${shorthand}|${el.textContent || ""}`;
      if (requested.has(key)) return [];
      requested.add(key);
      return [doc.fonts.load(shorthand, el.textContent || "")];
    });
    if (loads.length > 0) {
      await Promise.race([
        Promise.allSettled(loads),
        new Promise((r) => setTimeout(r, timeoutMs)),
      ]);
    }
  } catch {
    /* noop */
  }
}

/**
 * html2canvas recopie la slide dans un second document et y mesure la place
 * de chaque mot. Ce document recharge les feuilles Google Fonts : si la police
 * n'y est pas encore prête, les mots sont placés avec la police de secours
 * (plus étroite) puis dessinés avec la vraie, et se chevauchent (« Pourtoiqui… »).
 * On attend donc les feuilles de style puis les polices dans la copie.
 */
export async function waitForClonedTextFonts(doc: Document, timeoutMs = 8000): Promise<void> {
  const pending = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((link) => !link.sheet)
    .map((link) => new Promise<void>((resolve) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
    }));
  if (pending.length > 0) {
    await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, timeoutMs))]);
  }
  await waitForTextFonts(doc, timeoutMs);
}
