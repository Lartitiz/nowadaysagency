// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

export function pinterestBrief(pinterest_link: string | null, pinterest_board: string | null): string {
  const pinterestContext = (pinterest_link || pinterest_board)
    ? `\nDÉTAILS DE L'ÉPINGLE :
${pinterest_link ? `- Lien de destination : ${pinterest_link}` : "- Pas de lien fourni"}
${pinterest_board ? `- Tableau de destination : "${pinterest_board}"` : ""}
${pinterest_link ? `\nLa description doit donner envie de cliquer sur ce lien. Mentionne ce que la personne va trouver en cliquant.` : ""}
`
    : "";

  return `FORMAT : ÉPINGLE PINTEREST (titre + description)

Pinterest est un MOTEUR DE RECHERCHE VISUEL, pas un réseau social. Le contenu est optimisé pour la RECHERCHE.
${pinterestContext}

TITRE (max 100 caractères) :
- Mot-clé principal dans les 3 premiers mots
- Descriptif et utile, pas accrocheur clickbait
- "Idées décoration salon bohème" > "Vous n'allez pas croire cette déco"
- "Comment [verbe] [complément]" fonctionne très bien
- Penser : qu'est-ce que ma cible taperait dans la barre de recherche Pinterest ?

DESCRIPTION (100-200 mots, 2-3 paragraphes) :
- Décrire CE QUE la personne va trouver en cliquant sur le lien
- Intégrer les mots-clés naturellement dans le texte (pas de keyword stuffing)
- Ton clair, utile, descriptif. Moins de personnalité qu'Instagram.
- PAS de hashtags (inutiles sur Pinterest)
- Inclure un appel à l'action doux en fin ("Découvre le guide complet", "Retrouve toutes les étapes sur le site", "Enregistre cette épingle pour plus tard")
- Écriture inclusive avec point médian

TU NE FAIS JAMAIS :
- Hashtags (ça ne sert à rien sur Pinterest)
- Titres clickbait ou accrocheurs style Instagram ("Vous n'allez pas croire...")
- Jargon marketing (funnel, lead magnet, ROI)
- Ton trop personnel ou émotionnel (c'est du SEO, pas du storytelling)
- Tiret cadratin (—)

STRUCTURE DE RÉPONSE :
📌 TITRE : [titre SEO optimisé, max 100 caractères]

📝 DESCRIPTION :
[paragraphe 1 : ce que la personne va trouver/apprendre]
[paragraphe 2 : détails, bénéfices concrets]
[paragraphe 3 : appel à l'action doux]`;
}
