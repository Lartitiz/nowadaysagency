// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

import { VOIX_ORALE } from "../socle.ts";

export function captionBrief(effectiveObjective: string | null): string {
  const lengthBlock = effectiveObjective === "visibilite" || effectiveObjective === "visibilité" ? `
══ OBJECTIF : VISIBILITÉ ══
LONGUEUR : 300-600 caractères. Court, percutant. L'idée doit claquer en quelques phrases.
Le hook fait tout le travail. Le corps développe UNE seule idée. Pas de remplissage.
Privilégie une prise de position ou un constat décalé qui donne envie de partager.
` : effectiveObjective === "confiance" ? `
══ OBJECTIF : CONFIANCE ══
LONGUEUR : 400-800 caractères. Assez pour raconter, pas assez pour perdre l'attention.
Le hook crée la connexion. Le corps partage du vécu ou pose une question qui touche. La fin invite au dialogue (question précise, pas générique).
` : effectiveObjective === "vente" || effectiveObjective === "conversion" ? `
══ OBJECTIF : VENTE ══
LONGUEUR : 600-1200 caractères. Assez pour dérouler la preuve et l'invitation.
Le hook nomme un problème concret. Le corps montre la transformation par un cas réel (pas d'argumentaire abstrait). La fin ouvre la porte sans forcer.
` : `
══ LONGUEUR ══
600-1200 caractères. Adapte au sujet : si l'idée tient en 600 caractères, ne l'étire pas.
`;

  return `FORMAT : CAPTION INSTAGRAM

══ AVANT D'ÉCRIRE : LA CAPTION EST UNE CONVERSATION ══

Une bonne caption Instagram ne ressemble pas à un mini-article. C'est un moment de conversation entre la créatrice et son audience. Le ton, la structure, le rythme doivent donner l'impression que la personne s'est posée et a écrit comme elle parlerait.

AVANT DE RÉDIGER, identifie :

1. QU'EST-CE QUE TU AS À DIRE QUE PERSONNE D'AUTRE NE DIRAIT ?
   Une caption qui dit "il faut être authentique" pourrait être écrite par n'importe qui. Une caption qui dit "j'ai mis 3 ans à comprendre que l'authenticité ne s'apprend pas en suivant des conseils" porte une voix.

2. QUELLE SITUATION CONCRÈTE ancre ce que tu veux dire ?
   Un moment fourni par la personne (avec sa date seulement si elle la donne) ou, à défaut, une situation précise et reconnaissable du sujet, sans « hier » ni « la semaine dernière » inventés. Le concret rend la voix crédible.

3. QUELLE TENSION OU QUELLE NUANCE ouvre la fin ?
   La meilleure caption laisse une question, un "et si", un doute productif. Pas une morale, pas un résumé, pas un CTA générique.
${lengthBlock}
══ RÈGLES DE RÉDACTION ══

ACCROCHE (les 125 premiers caractères) :
- C'est la phrase la plus importante. C'est ce qui décide si on clique "voir plus".
- Un FAIT CONCRET, une ÉMOTION, ou une SITUATION précise. Jamais une promesse.
- Patterns qui marchent : "Il y a [durée], [situation]. Aujourd'hui..." / "Quand [situation concrète]..." / "J'ai [action concrète]."
- Patterns INTERDITS : "Aujourd'hui je voulais te parler de..." / "Tu fais sûrement cette erreur..." / "[Sujet] n'aura plus de secrets pour toi"

CORPS :
- Développe UNE idée en profondeur. Pas 3 idées survolées.
- Un exemple ou un détail fourni quand il est utile ; sinon, une explication précise, sans anecdote ni chiffre à inventer.
- Apartés entre parenthèses *(comme ça)* ou en italique pour la respiration humaine.
- Bucket brigades naturelles, variées d'une caption à l'autre : ne réutilise pas systématiquement la même cheville
- ${VOIX_ORALE}

FIN :
- Question PRÉCISE liée au sujet (pas "Et toi, qu'en penses-tu ?")
- OU invitation au dialogue spécifique
- OU phrase qui ouvre une tension (pas qui résume)
- NE PAS étirer pour atteindre une longueur cible. Si c'est dit en 400 caractères, c'est 400.

INTERDITS :
- Caption qui décrit un sujet sans prendre position
- Conclusion qui résume ce qui a été dit
- Liste de conseils numérotés
- Ton "experte qui explique" sans incarnation`;
}
