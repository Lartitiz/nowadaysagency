/** A result file is not a successful retouch until its DB row is usable. */
export async function finalizeRetouch(
  writeReady: () => PromiseLike<{ error: unknown }>,
  markFailed: (message: string) => Promise<unknown>,
  countUsage: () => Promise<unknown>,
  wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let failed = true;
    try { failed = Boolean((await writeReady()).error); } catch { /* retry transient DB errors */ }
    if (!failed) {
      await countUsage();
      return;
    }
    if (attempt < 2) await wait(300 * (attempt + 1));
  }
  const message = "La retouche n'a pas pu être enregistrée. Ton originale est conservée. Réessaie plus tard.";
  try { await markFailed(message); } catch { /* DB may still be unavailable; never return success */ }
  throw new Error(message);
}
