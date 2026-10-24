// Petits éléments d'affichage de la relecture de marque (confiance lue,
// pastille). Le badge de confiance et les sources affichées sont retirés le 24/10/2026.
// Sortis de BrandingReview.tsx (fiche 14, lot 1).

export function getConfidence(section: any): string {
  return section?.confidence || "low";
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-block px-3 py-1 text-sm rounded-[8px] bg-[#ffa7c6]/20 text-bordeaux font-medium">{children}</span>;
}
