/** À partir de ce nombre de photos dans « Mes photos », on conseille le carrousel « Tes photos en fond » (choix de Laetitia du 16/10/2026). */
export const LIBRARY_PHOTOS_FOR_PHOTO_CAROUSEL = 3;

/** L'idée demande explicitement un Reel (« je veux un reel », « en Reels »). */
export function ideaAsksForReel(idea: string): boolean {
  return /(^|[^\p{L}])reels?(?![\p{L}])/iu.test(idea);
}

/** L'idée demande explicitement des stories (« en story », « mes stories »). */
export function ideaAsksForStory(idea: string): boolean {
  return /(^|[^\p{L}])stor(?:y|ys|ies)(?![\p{L}])/iu.test(idea);
}

export function recommendContentFormat(channel: string, photoCount: number, idea: string, libraryPhotoCount = 0) {
  if (channel === "newsletter") return { format: "newsletter", label: "Newsletter", reason: "Pour développer ton sujet dans un email." };
  // Elle a écrit « reel » : on suit sa demande, même avec plusieurs photos (vu le 12/11/2026 : seul le carrousel était proposé).
  if (channel === "instagram" && ideaAsksForReel(idea)) return { format: "reel", label: "Reel", reason: photoCount > 0 ? "Tu as demandé un Reel : on écrit le script et le plan de tournage à partir de ton idée et de tes photos." : "Tu as demandé un Reel : on écrit le script et le plan de tournage à partir de ton idée." };
  // Elle a écrit « story » : même logique (QA du 12/11/2026 : avec des photos, la Story était masquée).
  if (channel === "instagram" && ideaAsksForStory(idea)) return { format: "story", label: "Story", reason: photoCount > 0 ? "Tu as demandé des stories : une photo par story, avec un texte court." : "Tu as demandé des stories : une séquence courte, une idée par story." };
  // Plusieurs photos chargées sur LinkedIn : le carrousel est conseillé (vu en
  // live le 12/11/2026 : « Post » restait conseillé avec 4 photos).
  if (channel === "linkedin" && photoCount > 1) return { format: "carousel", mode: "photo" as const, label: "Carrousel avec tes photos", reason: "Tu as plusieurs photos : une image et un texte court par slide permettent de les raconter." };
  if (channel === "linkedin") return { format: "linkedin", label: "Post LinkedIn", reason: "Pour partager une idée clairement, avec une photo si tu le souhaites." };
  if (channel === "pinterest") return { format: "pinterest", label: "Épingle", reason: "Pour présenter ton sujet et guider vers une page de ton site." };
  if (photoCount > 1) return { format: "carousel", mode: "photo" as const, label: "Carrousel avec tes photos", reason: "Tu as plusieurs photos : une image et un texte court par slide permettent de les raconter." };
  if (photoCount === 1) return { format: "post", label: "Post avec ta photo", reason: "Ta photo porte le sujet ; une légende permet de le préciser simplement." };
  if (libraryPhotoCount >= LIBRARY_PHOTOS_FOR_PHOTO_CAROUSEL) return { format: "carousel", mode: "photo" as const, label: "Carrousel avec tes photos", reason: "Tu as des photos dans « Mes photos » : une image et un texte court par slide les mettent en valeur." };
  if (/\b(tuto|tutoriel|étapes|conseils|erreurs|expliquer|comprendre)\b/i.test(idea)) return { format: "carousel", mode: "text" as const, label: "Carrousel texte", reason: "Ton sujet se prête à plusieurs points : une idée par slide le rend facile à suivre." };
  return { format: "post", label: "Post", reason: "Un format simple pour commencer avec une idée. Tu peux ensuite choisir un carrousel, une story ou un Reel." };
}
