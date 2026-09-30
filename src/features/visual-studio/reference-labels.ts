import type { StudioReference } from "./api";

export const referenceLabels: Record<StudioReference["role"], string> = {
  person_product: "Personne et produit",
  auto: "À déterminer dans le chat", person: "Personne", product: "Produit / objet",
  scene: "Décor à conserver", style: "Inspiration", edit_source: "Image à retoucher",
  subject: "Autre sujet à préserver", casting: "Mannequin enregistré", composition: "Composition", logo: "Logo",
};

