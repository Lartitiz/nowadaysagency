/**
 * Libellé lisible d'un canal stocké en clé technique (« instagram » → « Instagram »,
 * « website » → « Site web »). Les fiches recopient souvent les listes de l'IA
 * telles quelles : on ne montre jamais la clé brute (passe du 16/10/2026).
 */
const CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  newsletter: "Newsletter",
  email: "E-mail",
  website: "Site web",
  site: "Site web",
  site_web: "Site web",
  blog: "Blog",
  seo: "Référencement",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
};

export function channelLabel(channel: string | null | undefined): string {
  const raw = (channel || "").trim();
  if (!raw) return "";
  return CHANNEL_LABELS[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
}
