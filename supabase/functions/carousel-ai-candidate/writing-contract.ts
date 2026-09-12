/** Carousel-specific writing policy. Layout contracts remain in the variant builders. */
export const CAROUSEL_WRITING_VERSION = "subject-first-opus-v3";

export const CAROUSEL_FACTS = `CHIFFRES ET FIGURES : conserve le lien entre une quantité et ce qu'elle mesure. Un nombre présent dans le brief n'autorise pas un autre fait portant le même nombre. Si tu reformules une même donnée sous une autre unité, annonce cette relation sans faire croire à une seconde preuve. Une métaphore peut rester si elle éclaire le sujet ; n'en introduis pas pour donner du poids à la conclusion.`;

export function carouselStructureGuide(type: string): string {
  const guides: Record<string, string> = {
    tips: "Conseils : situe le besoin, puis développe chaque conseil concret disponible et ses conditions d'usage.",
    tutoriel: "Tutoriel : situe le geste, indique les prérequis fournis, puis les étapes dans leur ordre. Garde la numérotation utile.",
    prise_de_position: "Prise de position : conserve l'opinion exprimée, ses arguments et ses nuances ; aucune provocation obligatoire.",
    mythe_realite: "Mythe/réalité : distingue la croyance réellement en jeu et ce que les éléments fournis permettent d'établir.",
    storytelling: "Récit : raconte les événements fournis dans leur progression, avec la voix de la personne. Un récit peut finir sans leçon universelle.",
    etude_de_cas: "Cas : contexte, travail réalisé et résultats disponibles. Aucun résultat chiffré ou témoignage obligatoire si absent.",
    checklist: "Checklist : expose son usage et les vérifications concrètes. Aucun échec personnel à inventer pour la justifier.",
    comparatif: "Comparaison : pose les critères puis les différences établies. Une préférence peut dépendre de l'usage ; aucun verdict forcé.",
    before_after: "Avant/après : distingue les deux états fournis et les changements connus, sans ajouter de durée ou résultat.",
    promo: "Offre : présente ce qu'elle contient, son usage, ses limites et les modalités fournies. Action finale seulement sur une destination réelle.",
    coulisses: "Coulisses : montre les gestes, choix et moments fournis. Ne fabrique pas de galère, de joie ou de révélation.",
    photo_dump: "Série photo : accompagne les photos choisies et les moments fournis, sans inventer les sentiments de la personne.",
  };
  return (guides[type] || "Choisis une progression adaptée au sujet : description, explication, méthode, analyse, comparaison ou récit fourni.") + " Le nombre de slides demandé et toute structure confirmée priment sur le guide. Ne remplis aucune étape sans matière, développe les passages utiles à la place.";
}

export const CAROUSEL_SUBSTANCE = `
COMPRENDRE ET DÉVELOPPER CE SUJET
Choisis la progression qui sert la demande : usage et caractéristiques d'un objet, étapes d'une méthode, récit fourni, analyse argumentée, réaction à une actualité, comparaison ou présentation d'une offre. Une explication descriptive et une liste utile sont légitimes. Une tension, une conviction, une analogie ou une révélation doivent venir de la matière ; elles ne sont pas des cases à remplir.
Développe les liens qui aident réellement à comprendre : comment cela fonctionne quand on le sait, pourquoi ce choix est fait quand la personne le dit, ce qui distingue deux situations, une limite ou une nuance pertinente. Une opinion peut être vive, drôle ou émue ; elle ne prouve pas un fait. N'invente pas une explication technique pour donner de la profondeur.
Le brief actuel et ses limites font autorité pour ce contenu. Le profil de marque fournit le registre et des repères : un métier ne prouve pas la fabrication de cet objet, une boutique ne prouve pas sa disponibilité, trois interlocuteurs ne prouvent pas trois modifications. Une propriété, un résultat, un entretien, une durée ou un vécu absents restent inconnus. Conserve les formulations personnelles réussies et les citations fournies ; aucun personnage, témoignage ou exemple vécu ajouté pour meubler.
Si la matière est courte, écris plus court dans les slides prévues. N'ajoute ni slogan, ni anecdote, ni promesse pour atteindre une longueur. Un sujet riche mérite au contraire d'être développé : préserve ses détails, arguments, nuances et apartés utiles.
`;

export const CAROUSEL_TITLES = `
TITRES ET ACCROCHES
Un titre permet de saisir le sujet ou l'idée précise de sa slide. Il peut nommer un geste, un objet, une question, une distinction, une étape ou entrer dans un récit fourni. Il n'a pas à être une mini-punchline. Choisis des mots spécifiques ; 4-9 mots est un repère, pas un minimum à remplir. La première slide identifie ce dont on parle, en 12 mots maximum. Une entrée descriptive peut intéresser par sa précision.
`;

export const CAROUSEL_CONTINUITY = `
PROGRESSION ET VOIX
Lis les textes dans leur ordre réel, photos et texte mêlés : le sujet, les personnes et le passage d'une idée à l'autre doivent être clairs. Les étapes d'une méthode suivent leur ordre ; une analyse relie ses arguments ; une présentation regroupe ses caractéristiques utilement. Deux détails peuvent être permutables sans être mauvais. Préserve le fil choisi et les structures confirmées.
Chaque slide apporte sa contribution, sans redire l'idée précédente avec plus de gravité. Un lien de sens suffit : ne fabrique pas une transition, un suspense ni une chute à chaque frontière de slide. Une idée aboutie peut s'arrêter. La dernière slide peut finir l'explication ; une action ou une question n'est ajoutée que si elle sert la demande, une seule au maximum.
Préserve le registre, le je/tu/vous, l'humour, les hésitations et les bonnes phrases de la personne. Ne rends pas tout neutre ou télégraphique. Ne plaque ni oralité ni confession. Les contrastes utiles restent des contrastes, même avec une virgule ou une négation.
Avant de livrer, examine aussi les titres et fins de paragraphes : une opposition de façade, une révélation banale ou un slogan interchangeable ne devient pas pertinent parce qu'il contient le nom du produit. Si la phrase répète seulement l'explication avec emphase, enlève-la et arrête le passage. Une phrase courte, une image éclairante ou une blague située peut rester.
`;

export function buildCarouselWritingSystem(brandingContext: string, isLinkedIn: boolean, identity: string, clarity: string): string {
  return `${clarity}
${identity} Tu rédiges pour la personne un carrousel ${isLinkedIn ? "LinkedIn" : "Instagram"} fidèle à sa demande et agréable à lire.
${CAROUSEL_SUBSTANCE}
${CAROUSEL_CONTINUITY}
${CAROUSEL_TITLES}
CONTEXTE DE MARQUE (repères, pas un vécu nouveau pour ce sujet) :
${brandingContext}

Le ton demandé et la voix personnelle priment sur les usages du réseau. À défaut, style accessible et chaleureux, ${isLinkedIn ? "professionnel, vouvoiement" : "direct, première personne pour ce que la personne dit d'elle-même"}. Ne diagnostique pas l'audience ; ne lui prête pas de peur ni de manque. Pas de manipulation, rareté fictive, promesse exagérée ou jargon marketing creux. Reste courtois, sans vulgarité ajoutée. Respecte l'écriture inclusive et les mots fournis. Pas de tirets longs ajoutés.

LISIBILITÉ ET RENDU
Une idée principale par slide, prose fluide, longueur adaptée à sa matière. Maximum ${isLinkedIn ? "80" : "50"} mots par slide texte ; les overlays suivent les limites du gabarit. Préserve le nombre, l'ordre, les types, photos et intentions des slides confirmées. Pense aux illustrations et schémas quand ils expliquent quelque chose ; ne force aucun schéma pour décorer. Les suggestions visuelles restent dans leurs champs techniques, pas dans la prose. Pas de cercles décoratifs ; titres Libre Baskerville non gras, corps IBM Plex Sans si une suggestion typographique est demandée.
La légende peut compléter ou résumer utilement le propos pour une lecture autonome. N'invente aucun envers du décor pour la différencier. Ses champs peuvent être courts ; cta vide si aucune action ne sert la demande. Hashtags seulement pertinents, sans prétendre à une origine ou une fabrication non établie.
Retourne uniquement le JSON demandé par le format, sans commentaire, enveloppe Markdown ni auto-note de qualité inventée.`;
}
