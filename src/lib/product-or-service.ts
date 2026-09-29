export type ProductOrService = "produits" | "services" | "les_deux";

const isChoice = (value: string | null | undefined): value is ProductOrService =>
  value === "produits" || value === "services" || value === "les_deux";

export function rememberProductOrService(userId: string, choice: string): void {
  if (!isChoice(choice)) return;
  try { localStorage.setItem(`lac_product_or_service:${userId}`, choice); }
  catch { /* la sauvegarde du profil reste prioritaire */ }
}

export function productOrServiceFromProfile(profile: {
  product_or_service?: string | null;
  type_activite?: string | null;
} | null | undefined, userId?: string): ProductOrService | null {
  const choice = profile?.product_or_service || profile?.type_activite;
  if (isChoice(choice)) return choice;
  if (!userId) return null;
  try {
    const saved = localStorage.getItem(`lac_product_or_service:${userId}`);
    return isChoice(saved) ? saved : null;
  } catch { return null; }
}

export function sellsProducts(profile: Parameters<typeof productOrServiceFromProfile>[0], userId?: string): boolean {
  const choice = productOrServiceFromProfile(profile, userId);
  return choice === "produits" || choice === "les_deux";
}
