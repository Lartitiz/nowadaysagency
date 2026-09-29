export type ProductOrService = "produits" | "services" | "les_deux";

export function productOrServiceFromProfile(profile: {
  product_or_service?: string | null;
  type_activite?: string | null;
} | null | undefined): ProductOrService | null {
  const choice = profile?.product_or_service || profile?.type_activite;
  return choice === "produits" || choice === "services" || choice === "les_deux" ? choice : null;
}

export function sellsProducts(profile: Parameters<typeof productOrServiceFromProfile>[0]): boolean {
  const choice = productOrServiceFromProfile(profile);
  return choice === "produits" || choice === "les_deux";
}
