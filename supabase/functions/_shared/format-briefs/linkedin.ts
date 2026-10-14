// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 2 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

import { LINKEDIN_STORYTELLING_RULES, LINKEDIN_TEMPLATES } from "../copywriting-prompts.ts";
import { VOIX_ORALE_LINKEDIN } from "../socle.ts";

export function linkedinBrief(editorialFormat: string | null): string {
  const linkedinTemplateContent = editorialFormat && (LINKEDIN_TEMPLATES as any)[editorialFormat]
    ? (LINKEDIN_TEMPLATES as any)[editorialFormat]
    : "";

  return `FORMAT : POST LINKEDIN

${LINKEDIN_STORYTELLING_RULES}

AVANT D'ÉCRIRE :
- Identifie le sujet exact et ce que la personne veut en dire. Sa voix et ses réponses priment sur l'angle suggéré.
- Sépare les faits de ce contenu des informations générales du profil de marque. Un métier, une valeur ou une ancienne histoire ne prouve pas une scène actuelle.
- Si elle raconte un moment vécu, suis un fil simple : situation réelle, ce qu'elle fait ou choisit, ce qu'elle pense ou ressent si elle l'a dit, puis la suite ou le sens qu'elle donne à ce moment.
- Si elle partage une idée ou une expertise sans scène vécue, explique cette idée concrètement sans la déguiser en anecdote.

PROFONDEUR ET PRISE DE POSITION :
- Sauf annonce pratique, remerciement ou présentation d'offre demandés, un post LinkedIn défend une position. Tire-la de l'angle choisi, des réponses de la personne, de ses convictions et de ses combats de marque, puis assume-la en première personne au lieu de la diluer dans une distinction abstraite ou un « chacun son avis ». Ce « je » exprime une opinion au présent (« je trouve », « je pense », « je refuse »), pas un souvenir : sans réponse qui le raconte, pas de « pendant longtemps j'ai cru », « je vois chaque semaine » ni « mes client·es me disent ». De même, aucun témoignage d'une autre personne que le brief ou les réponses ne fournissent : pas de « une cliente me disait », « une céramiste m'a confié », « une amie m'a écrit », « on me dit souvent », « j'ai discuté avec une… ». Une habitude de travail plausible tirée du métier de la marque reste possible. Sans vécu fourni, ouvre sur le constat ou sur ta position. Pour un récit vécu, la position est ce que ce moment lui fait penser de son métier ou de son secteur, quand ses réponses ou sa marque le portent.
- Creuse sous le sujet : ce qu'il révèle (norme sociale, injonction faite aux femmes ou aux indépendant·es, rapport de pouvoir, mécanisme du métier). Pour un sujet de société, un « on » ou « nous » collectif peut porter cette lecture.
- Nomme les émotions concrètes que ce sujet soulève couramment (peur du jugement, honte, fatigue, colère) comme une expérience partagée, jamais comme le diagnostic de la personne qui lit. Une émotion ou une scène attribuée à l'autrice doit venir de ses réponses.
- Une opinion n'a pas besoin de source ; un fait, un chiffre ou un vécu, si. Une nuance assumée renforce la position. Une précaution sur ce que le texte n'affirme pas l'affaiblit : ni « sans garantie », ni « hypothèse de travail », ni « je n'affirme rien sur l'algorithme ». Une accroche tranchée n'est pas désamorcée par une excuse.
- Si le sujet est explicitement fictif ou un essai, rédige un exemple utilisable en indiquant clairement son caractère fictif dans le texte. Ne le présente jamais comme un produit, un lieu ou une expérience réels.

${linkedinTemplateContent ? `STRUCTURE ÉDITORIALE CHOISIE :\n${linkedinTemplateContent}\n\nGarde ses étapes de raisonnement et de position ; une étape qui appelle un fait, un chiffre ou un vécu absent du brief s'écrit sans eux ou se saute. Ses phrases-modèles au passé ou d'observation (« pendant longtemps j'ai cru », « j'observe depuis X mois », « mes client·es me demandent », « la semaine dernière ») ne servent que si les réponses fournissent ce vécu.` : ""}

ÉCRITURE :
- L'ouverture situe le sujet. Pour un récit, elle peut commencer au « je », dans le lieu et l'action fournis ; une introduction logistique n'est pas obligatoire.
- Chaque paragraphe fait avancer le propos avec un fait, un geste, un choix, une pensée ou une nuance nouvelle. Préserve les formulations personnelles réussies.
- Expliquer pourquoi une idée reçue existe ne passe pas par une concession suivie d'un retournement (« C'est logique, sur le papier. Sauf que ce n'est pas comme ça que ça marche. ») : énonce directement le mécanisme réel.
- La fin achève le récit ou la réflexion : elle pose la position, ou une question simple et précise à laquelle on peut répondre en commentaire. Jamais un devoir adressé au lecteur (« il faut », « à vous de », « on doit »). Remercie les personnes citées si le brief le prévoit.
- Aère pour la lecture sans découper mécaniquement chaque phrase. La longueur suit la matière disponible. Aucun chiffre, lieu, dialogue, résultat ou ressenti de l'autrice inventé.
- ${VOIX_ORALE_LINKEDIN}
- 0 à 2 emojis et 0 à 2 hashtags si pertinents. Respecte la voix et les préférences de la marque.`;
}
