export function isTechnicalPhotoName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  const stem = name.trim().replace(/\.(?:jpe?g|png|webp|heic|avif)$/i, "");
  const normalized = stem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /^[a-f\d]{32}$/.test(normalized)
    || /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(normalized)
    || /^(?:img|dsc)[_-]?\d+$/.test(normalized)
    || /^(?:capture d['’]ecran|screenshot)\b/.test(normalized)
    || /^[_\W]+$/.test(normalized);
}

export function photoDisplayLabel(name: string | null | undefined, description: string | null | undefined): string {
  return isTechnicalPhotoName(name) ? description?.trim() || "Photo à identifier" : name!.trim();
}
