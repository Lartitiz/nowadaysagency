// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

import { VOIX_ORALE_LEGENDE_PHOTO } from "../socle.ts";

export function photoCaptionBrief(photo_description: string | null | undefined): string {
  return `FORMAT : LÉGENDE PHOTO INSTAGRAM (400-800 caractères)

══ AVANT D'ÉCRIRE : LA LÉGENDE EST LE HORS-CHAMP DE LA PHOTO ══

La légende évite la paraphrase visuelle, mais nomme le produit, le projet ou la situation si nécessaire pour comprendre. La photo se suffit visuellement. La légende raconte ce que la photo NE PEUT PAS montrer : le contexte invisible, l'émotion derrière le geste, ce qui s'est passé juste avant ou juste après.

${photo_description ? `PHOTO DÉCRITE PAR L'UTILISATRICE : "${photo_description}"` : ""}

AVANT DE RÉDIGER, identifie :

1. QU'EST-CE QUE LA PHOTO NE MONTRE PAS ?
   La photo montre une scène. Mais qu'est-ce qu'il y a AUTOUR ? L'odeur du café, la fatigue dans les jambes, la conversation qui vient de finir, l'heure qu'il était, ce qu'on pensait à ce moment-là.
   ❌ "Voici mon bureau du matin avec mon café" (description de ce qu'on voit)
   ✅ "C'était la 3e tasse. Et j'avais toujours pas commencé à écrire." (le hors-champ)

2. QUELLE ÉMOTION SPÉCIFIQUE est associée à ce moment ?
   Pas "j'aime mon métier" (générique). Une émotion PRÉCISE et NOMMABLE : la fierté qui surprend, l'agacement qui retombe, la fatigue heureuse, le doute qui s'installe.

3. QUELLE EST LA PHRASE QUI DÉPLACE LE REGARD ?
   La meilleure légende fait dire au lecteur "tiens, c'est vrai, j'avais jamais vu ça comme ça". Ce n'est pas une morale, c'est un angle inattendu sur quelque chose de banal.

══ RÈGLES DE RÉDACTION ══

ACCROCHE :
- Fait ÉCHO à l'image sans la décrire
- Court, ancré dans un détail concret
- ❌ "Voici un moment de mon quotidien"
- ✅ "Il était 23h. La cliente n'avait toujours pas répondu."

CORPS :
- Développe ce que la photo NE DIT PAS
- Ton SENSORIEL : texture, lumière, chaleur, poids, odeur, son
- 2-4 phrases qui avancent. Chaque phrase apporte du nouveau.
- ${VOIX_ORALE_LEGENDE_PHOTO}

FIN :
- CTA doux : invitation, question, ou rien si la phrase finale se suffit
- JAMAIS de vente agressive ni de promesse marketing

FORMAT :
- 400-800 caractères. La photo fait la moitié du travail.
- 5-10 hashtags niche en fin

INTERDITS :
- Décrire inutilement toute l'image ; nommer le sujet et expliquer son usage restent nécessaires
- "Voici / Voilà / Aujourd'hui je vous partage" en accroche
- Ton "fiche produit" ou "présentation"
- Légende qui pourrait fonctionner avec n'importe quelle autre photo`;
}
