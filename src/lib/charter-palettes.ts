export const SECTOR_PALETTES: Record<string, { name: string; colors: { primary: string; secondary: string; accent: string; background: string; text: string } }[]> = {
  "Photographie": [
    { name: "Studio Épuré", colors: { primary: "#2C2C2C", secondary: "#F5F0EB", accent: "#C4956A", background: "#FFFFFF", text: "#2C2C2C" } },
    { name: "Lumière Douce", colors: { primary: "#8B7355", secondary: "#F2E8DC", accent: "#D4A574", background: "#FBF7F2", text: "#3D3226" } },
    { name: "Moderne Bold", colors: { primary: "#1A1A1A", secondary: "#E8E8E8", accent: "#FF6B35", background: "#FFFFFF", text: "#1A1A1A" } },
  ],
  "Mode éthique": [
    { name: "Terracotta Sauge", colors: { primary: "#C4724E", secondary: "#8B9E7E", accent: "#E8C9A0", background: "#FAF5F0", text: "#3D2E24" } },
    { name: "Minéral", colors: { primary: "#7A6F5D", secondary: "#C2B8A3", accent: "#D4C5A9", background: "#F5F1EB", text: "#3A3428" } },
    { name: "Lin & Argile", colors: { primary: "#9C7C5C", secondary: "#D4C4A8", accent: "#E8D5B7", background: "#FDFAF5", text: "#4A3F35" } },
  ],
  "Coach bien-être": [
    { name: "Sérénité", colors: { primary: "#6B8FA3", secondary: "#B8CDD6", accent: "#E8C97A", background: "#F8FAFB", text: "#2C3E4A" } },
    { name: "Lavande & Or", colors: { primary: "#7B68AE", secondary: "#D4CCE8", accent: "#E8C97A", background: "#FAF8FF", text: "#3D3456" } },
    { name: "Zen", colors: { primary: "#5C7A6E", secondary: "#A8C5B8", accent: "#D4B896", background: "#F5FAF7", text: "#2D3E36" } },
  ],
  "Artisanat": [
    { name: "Atelier", colors: { primary: "#8B6F47", secondary: "#C9B18C", accent: "#D4956A", background: "#FBF6EF", text: "#3E3020" } },
    { name: "Fait Main", colors: { primary: "#A67C52", secondary: "#E8D5B7", accent: "#C4724E", background: "#FFFAF3", text: "#3D2E24" } },
    { name: "Brut & Doux", colors: { primary: "#6B5B4A", secondary: "#D4C4A8", accent: "#E8A87C", background: "#F8F4EE", text: "#3A3428" } },
  ],
  "Créatif digital": [
    { name: "Pop Studio", colors: { primary: "#E91E8C", secondary: "#1A1A2E", accent: "#FFE561", background: "#FFFFFF", text: "#1A1A2E" } },
    { name: "Néon Doux", colors: { primary: "#6C63FF", secondary: "#2D2B55", accent: "#FF6B6B", background: "#F8F7FF", text: "#2D2B55" } },
    { name: "Électrique", colors: { primary: "#00D2FF", secondary: "#1A1A2E", accent: "#FF4081", background: "#0D0D1A", text: "#FFFFFF" } },
  ],
  "Consultant·e / Services": [
    { name: "Pro Classique", colors: { primary: "#2B5C8A", secondary: "#E8EEF4", accent: "#D4A04E", background: "#FFFFFF", text: "#1A2A3A" } },
    { name: "Confiance", colors: { primary: "#1A3A5C", secondary: "#D4E4F0", accent: "#E8A84C", background: "#FAFCFE", text: "#1A2A3A" } },
    { name: "Moderne Pro", colors: { primary: "#2C3E50", secondary: "#ECF0F1", accent: "#3498DB", background: "#FFFFFF", text: "#2C3E50" } },
  ],
};

// Map activity keys from onboarding to palette sectors
export const ACTIVITY_TO_SECTOR: Record<string, string> = {
  artisane: "Artisanat",
  mode_textile: "Mode éthique",
  art_design: "Créatif digital",
  deco_interieur: "Artisanat",
  beaute_cosmetiques: "Coach bien-être",
  bien_etre: "Coach bien-être",
  coach: "Coach bien-être",
  coach_sportive: "Coach bien-être",
  consultante: "Consultant·e / Services",
  formatrice: "Consultant·e / Services",
};

export const DEFAULT_SECTOR = "Créatif digital";
