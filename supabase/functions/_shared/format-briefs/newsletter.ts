// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 1 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

import { VOIX_ORALE } from "../socle.ts";

export function newsletterBrief(): string {
  return `FORMAT : NEWSLETTER / EMAIL (1500-3000 caractères)

══ AVANT D'ÉCRIRE : LA NEWSLETTER N'EST PAS UN POST RALLONGÉ ══

La newsletter est le format le plus INTIME. Le lecteur a donné son email : 
il a dit "oui, je veux t'entendre". C'est une conversation privée, 
pas un broadcast.

AVANT DE RÉDIGER, identifie :

1. QUELLE EST L'HISTOIRE PERSONNELLE qui porte ce sujet ?
   Si un VÉCU est fourni, pars de ce moment : un moment de la semaine,
   une conversation, une lecture, un échec, une découverte. 
   Pas "je vais te parler de [sujet]" mais "il m'est arrivé un truc 
   cette semaine et ça m'a fait réaliser quelque chose sur [sujet]".

2. QUEL EST L'INSIGHT que le lecteur ne trouvera nulle part ailleurs ?
   La newsletter ne résume pas un article ou un post. Elle offre une 
   RÉFLEXION qui n'existe que dans ta tête. Le "comment je vois les choses" 
   que personne d'autre ne peut écrire.

3. OÙ EST LE MOMENT "AH, JE N'AVAIS JAMAIS VU ÇA COMME ÇA" ?
   Si le lecteur peut refermer l'email en se disant "oui, je savais déjà", 
   la newsletter a échoué. Il doit y avoir UN point qui déplace le regard.

══ RÈGLES DE RÉDACTION ══

OBJET D'EMAIL :
- Max 50 caractères. Accrocheur mais pas clickbait.
- Le meilleur test : "est-ce que j'ouvrirais cet email entre 2 réunions ?"
- Patterns possibles : question courte, constat décalé, confidence réellement fournie. Si l'objet est allusif, l'aperçu nomme le sujet ; le corps tient cette promesse.
- ❌ "Ma newsletter #12" / "Les news du mois"
- ✅ "J'ai failli tout annuler" / "Le conseil que je regrette d'avoir suivi"

INTRO (2-3 phrases) :
- Direct dans le vif. Pas de "Bonjour, j'espère que tu vas bien".
- Installer le sujet et la situation en 2-3 phrases : scène réellement fournie, observation ou fait concret. Sans vécu fourni, entrer par le sujet ; ne pas fabriquer de confidence.
- ❌ "Aujourd'hui je voulais te parler de..."
- ✅ (si ce retour est fourni) "Mardi, une cliente m'a renvoyé son brouillon avec ce commentaire : '...'"
- ✅ (sans vécu fourni) un constat net sur le sujet, sans cliente ni conversation inventée

CORPS :
- Développe en profondeur. C'est le format France Culture de la com.
- Apartés personnels entre parenthèses seulement s’ils apportent une nuance propre au sujet et correspondent à la voix. JAMAIS d'italique ni de gras : l'email part en texte brut, le markdown (**, *) s'afficherait tel quel.
- Développe les exemples fournis et les explications utiles ; aucun quota d’anecdotes et aucun vécu à inventer.
- Des nuances, des "oui mais", des zones grises. La newsletter n'est pas 
  un cours : c'est une réflexion partagée.
- ${VOIX_ORALE}

CONCLUSION :
- JAMAIS de résumé ("Pour résumer, retiens que...").
- Une ouverture : question qui reste, tension non résolue, invitation.
- ✅ "Je n'ai pas la réponse. Mais je crois que la question mérite qu'on s'y arrête."
- ❌ "En résumé, les 3 points à retenir sont..."

CTA : doux, en lien avec le sujet. Pas de vente agressive.

LONGUEUR : repère 1500-3000 caractères selon la matière. La demande de longueur de la personne prime. Développe les explications utiles sans remplir artificiellement.`;
}
