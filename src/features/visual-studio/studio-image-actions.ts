// Actions d'une image prête du Studio : la télécharger, et renouveler son lien
// quand il a expiré (les liens signés durent 15 minutes) au lieu d'afficher
// « L'aperçu a expiré ».
export async function downloadImage(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("expired");
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

// Une adresse d'image qui ne s'affiche plus déclenche une seule relecture de la
// session (qui signe de nouveaux liens). Si la nouvelle adresse échoue encore,
// on le dit.
export function createLinkRenewer(refresh: () => Promise<unknown>, onGiveUp: () => void) {
  const retried = new Set<string>();
  let running: Promise<unknown> | null = null;
  return (url: string) => {
    if (retried.has(url)) { onGiveUp(); return; }
    retried.add(url);
    if (!running) running = refresh().finally(() => { running = null; });
  };
}
