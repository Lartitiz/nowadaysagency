export function recommendContentFormat(channel: string, photoCount: number, idea: string) {
  if (channel === "newsletter") return { format: "newsletter", label: "Newsletter", reason: "Pour développer ton sujet dans un email." };
  if (channel === "linkedin") return { format: "linkedin", label: "Post LinkedIn", reason: "Pour partager une idée clairement, avec une photo si tu le souhaites." };
  if (channel === "pinterest") return { format: "pinterest", label: "Épingle", reason: "Pour présenter ton sujet et guider vers une page de ton site." };
  if (photoCount > 1) return { format: "carousel", mode: "photo" as const, label: "Carrousel avec tes photos", reason: "Tu as plusieurs photos : une image et un texte court par slide permettent de les raconter." };
  if (photoCount === 1) return { format: "post", label: "Post avec ta photo", reason: "Ta photo porte le sujet ; une légende permet de le préciser simplement." };
  if (/\b(tuto|tutoriel|étapes|conseils|erreurs|expliquer|comprendre)\b/i.test(idea)) return { format: "carousel", mode: "text" as const, label: "Carrousel texte", reason: "Ton sujet se prête à plusieurs points : une idée par slide le rend facile à suivre." };
  return { format: "post", label: "Post", reason: "Un format simple pour commencer avec une idée. Tu peux ensuite choisir un carrousel, une story ou un Reel." };
}
