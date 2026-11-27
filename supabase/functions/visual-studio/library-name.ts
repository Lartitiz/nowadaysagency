// Nom d'une image du Studio rangée dans « Mes photos » (27/11/2026).
// Avant : « <nom de la séance> — Studio » pour toutes les images, et la séance
// reprenait le nom de la photo : la bibliothèque alignait quatre « IMG_5315 —
// Studio », puis des « IMG_5315 — Studio — Studio ». Maintenant : le nom de la
// photo de départ, puis ce que l'image montre de nouveau (« IMG_5315 — bureau et
// plante verte »). Sans titre donné par le modèle, on prend le premier
// changement confirmé ; sans rien, l'ancien nom reste.

type NamedProposal = {
  image_title?: string | null;
  change?: string[] | null;
  series_size?: number | null;
  series_index?: number | null;
};

const clean = (value: string) => value.replace(/\s+/g, " ").replace(/[.!?…]+$/, "").trim();

export function studioLibraryName(sessionName: string | null | undefined, proposal: NamedProposal): string | null {
  const first = (proposal.change || []).find((item) => item?.trim()) || "";
  // Essai en ligne du 27/11/2026 : le modèle laisse souvent image_title vide.
  // Le premier changement confirmé sert alors de nom, sans son verbe d'action
  // (« ajout d'une petite étagère » → « petite étagère »).
  const fromChange = clean(first).replace(/^(ajout|ajouter|remplacement|remplacer|installation|installer|mise en place)\s+(d['’]\s*|de\s+|du\s+|des\s+)?(une?\s+|la\s+|le\s+|les\s+|l['’])?/i, "");
  let label = clean(proposal.image_title || "") || fromChange || clean(first);
  if (!label) return null;
  if (label.length > 48) label = `${label.slice(0, 47).replace(/\s+\S*$/, "")}…`;
  if (proposal.series_size) label += ` ${(proposal.series_index || 0) + 1}`;
  let base = clean(sessionName || "");
  while (/\s[—-]\sStudio$/i.test(base)) base = base.replace(/\s[—-]\sStudio$/i, "").trim();
  if (base.length > 60) base = `${base.slice(0, 59).trim()}…`;
  return (base ? `${base} — ${label}` : label.charAt(0).toUpperCase() + label.slice(1)).slice(0, 120);
}
