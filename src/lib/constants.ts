// ── Laetitia's contact info (centralized) ──
export const LAETITIA_PHONE = "33614133921";
export const LAETITIA_WHATSAPP = `https://wa.me/${LAETITIA_PHONE}`;
export const LAETITIA_EMAIL = "laetitia@nowadaysagency.com";

export function whatsappLink(message?: string) {
  if (!message) return LAETITIA_WHATSAPP;
  return `${LAETITIA_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
