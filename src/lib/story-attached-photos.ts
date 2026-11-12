// Photos attachées à la création (lot D), sorti de StoryResult le 12/11/2026.
// 1 photo = fil visuel de toute la séquence (comportement historique) ;
// 2+ photos = réparties UNE par story à fond photo, dans l'ordre. Les photos
// venues de la bibliothèque (userPhotoId) sont déjà placées par la génération
// (photo_id) : on ne distribue que les uploads frais, sans doublonner.
//
// Chantier 4 : une story qu'on déplace ou duplique garde SA photo. Avant un
// geste de séquence, StoryResult note le numéro de photo sur la story
// (visual.attached_slot) ; ce numéro passe avant la répartition dans l'ordre.

export interface AttachedPhotoLike {
  preview?: string;
  base64?: string;
  mimeType?: string;
  userPhotoId?: string;
}

export function attachedPhotoUrl(ph: AttachedPhotoLike | undefined): string | null {
  return ph?.preview || (ph?.base64 ? `data:${ph.mimeType || "image/jpeg"};base64,${ph.base64}` : null);
}

/** Numéro de la photo attachée (dans `photos`) que montre chaque story. */
export function attachedPhotoSlots(stories: any[], photos: AttachedPhotoLike[] | undefined): Map<number, number> {
  const map = new Map<number, number>();
  if (!photos?.length) return map;
  const pinned = (v: any) => Number.isInteger(v?.attached_slot) && !!attachedPhotoUrl(photos[v.attached_slot]);

  if (photos.length === 1) {
    if (!attachedPhotoUrl(photos[0])) return map;
    stories.forEach((s: any, i: number) => {
      if (s?.visual?.background === "photo") map.set(i, 0);
    });
    return map;
  }

  stories.forEach((s: any, i: number) => {
    const v = s?.visual;
    if (v?.background === "photo" && !v.photo_id && !v.photo_url && pinned(v)) map.set(i, v.attached_slot);
  });
  const used = new Set(map.values());
  const assignedLibraryIds = new Set(stories.map((s: any) => s?.visual?.photo_id).filter(Boolean));
  const pool = photos
    .map((p, index) => ({ p, index }))
    .filter(({ p, index }) => !used.has(index) && (!p.userPhotoId || !assignedLibraryIds.has(p.userPhotoId)));
  let k = 0;
  stories.forEach((s: any, i: number) => {
    const v = s?.visual;
    if (!v || v.background !== "photo" || v.photo_id || v.photo_url || map.has(i) || pinned(v)) return;
    if (k >= pool.length) return;
    if (attachedPhotoUrl(pool[k].p)) {
      map.set(i, pool[k].index);
      k++;
    }
  });
  return map;
}

/** Note sur chaque story le numéro de sa photo attachée, avant un geste de séquence. */
export function pinAttachedPhotos(stories: any[], slots: Map<number, number>): any[] {
  return stories.map((s, i) => {
    const slot = slots.get(i);
    if (slot === undefined || !s?.visual || s.visual.attached_slot === slot) return s;
    return { ...s, visual: { ...s.visual, attached_slot: slot } };
  });
}
