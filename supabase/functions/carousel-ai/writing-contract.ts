import { COMMON, WRITE } from "../_shared/carousel-editorial-contract.ts";
import { COVER_WRITING } from "../_shared/carousel-cover.ts";
import { LIVED_CASE_FIRST } from "../_shared/lived-case.ts";
/** Carousel-specific writing policy. Layout contracts remain in the variant builders. */
export const CAROUSEL_WRITING_VERSION = "fil-v11-couverture-accroche";

export const CAROUSEL_FACTS = `CHIFFRES ET FIGURES : conserve le lien entre une quantité et ce qu'elle mesure. Un nombre présent dans le brief n'autorise pas un autre fait portant le même nombre. Si tu reformules une même donnée sous une autre unité, annonce cette relation sans faire croire à une seconde preuve. Une métaphore peut rester si elle éclaire le sujet ; n'en introduis pas pour donner du poids à la conclusion.`;

export function carouselStructureGuide(type: string): string {
  const guides: Record<string, string> = {
    tips: "Conseils : situe le besoin, puis développe chaque conseil concret disponible et ses conditions d'usage.",
    tutoriel: "Tutoriel : situe le geste, indique les prérequis fournis, puis les étapes dans leur ordre. Garde la numérotation utile.",
    prise_de_position: "Prise de position : assume l'opinion en première personne, avec ses arguments et une nuance qui la renforce ; pas de provocation creuse désamorcée aussitôt.",
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

/** Lecture sociale (#1292) : réservée aux sujets SANS vécu fourni (« Ton cas d'abord », 04/10/2026). */
export const SOCIAL_READING = "Creuse sous le sujet : ce qu'il révèle quand il en touche un (norme sociale, injonction faite aux femmes ou aux indépendantes, rapport de pouvoir, mécanisme du métier) ; pour un sujet de société, un « on » ou « nous » collectif peut porter cette lecture.";

export const CAROUSEL_SUBSTANCE = `
COMPRENDRE ET DÉVELOPPER CE SUJET
Choisis la progression qui sert la demande : usage et caractéristiques d'un objet, étapes d'une méthode, récit fourni, analyse argumentée, réaction à une actualité, comparaison ou présentation d'une offre. Une explication descriptive et une liste utile sont légitimes lorsqu’elles répondent à la demande ; une présentation automatique de marque doit développer une proposition, pas inventorier ses caractéristiques. Une tension, une conviction, une analogie ou une révélation doivent venir de la matière ; elles ne sont pas des cases à remplir.
Développe les liens qui aident réellement à comprendre : comment cela fonctionne quand on le sait, pourquoi ce choix est fait quand la personne le dit, ce qui distingue deux situations, une limite ou une nuance pertinente. Une opinion peut être vive, drôle ou émue ; elle ne prouve pas un fait. N'invente pas une explication technique pour donner de la profondeur.
Le brief actuel et ses limites font autorité pour ce contenu. Le profil de marque fournit le registre et des repères : un métier ne prouve pas la fabrication de cet objet, une boutique ne prouve pas sa disponibilité, trois interlocuteurs ne prouvent pas trois modifications. Une propriété, un résultat, un entretien, une durée ou un vécu absents restent inconnus. Conserve les formulations personnelles réussies et les citations fournies ; aucun personnage, témoignage ou exemple vécu ajouté pour meubler.
PROFONDEUR ET PRISE DE POSITION
Sauf liste, tutoriel, checklist ou présentation d'offre demandés, un carrousel défend une position. Tire-la de l'angle choisi, de l'accroche, des réponses de la personne, de ses convictions et de ses combats de marque, puis assume-la en première personne au lieu de la diluer dans une distinction abstraite ou un concept. Une idée forte de l'angle (un parallèle, une comparaison, une formule qui fait réagir) reste le fil du carrousel. ${SOCIAL_READING} Nomme les émotions concrètes que ce sujet soulève couramment (peur du jugement, honte, fatigue, colère) comme une expérience partagée, jamais comme le diagnostic de la personne qui lit. Une opinion n'a pas besoin de source ; un fait, un chiffre ou un vécu, si. Une nuance assumée (« ça peut aussi être un vrai choix ») renforce la position. Une précaution sur ce que le texte n'affirme pas l'affaiblit : n'écris ni « sans garantie », ni « hypothèse de travail », ni « je n'affirme rien sur l'algorithme ». Une accroche provocante n'est pas désamorcée par une excuse (« ok je suis peut-être un peu too much »). Les premières slides entrent directement dans la position ou dans le fait qui frappe, sans annonce prudente (« j'aimerais le regarder de plus près », « avant de leur donner tort, je voudrais comprendre »). Une réponse de la personne sur ce qu'elle observe ou entend est du terrain : utilise-la en première personne (« quand je donne ce conseil, on me répond… »).
Si la matière est courte, écris plus court dans les slides prévues. N'ajoute ni slogan, ni anecdote, ni promesse pour atteindre une longueur. Un sujet riche mérite au contraire d'être développé : préserve ses détails, arguments, nuances et apartés utiles.
`;

export const CAROUSEL_TITLES = `
TITRES ET ACCROCHES
Un titre permet de saisir le sujet ou l'idée précise de sa slide. Il peut nommer un geste, un objet, une question, une distinction, une étape ou entrer dans un récit fourni. Il n'a pas à être une mini-punchline. Choisis des mots spécifiques ; 4-9 mots est un repère, pas un minimum à remplir. Ces repères valent pour les slides de développement ; la couverture suit ses propres règles.
${COVER_WRITING}
`;

export const CAROUSEL_CONTINUITY = `
FIL DU CARROUSEL
Construis d'abord le propos entier, avant de rédiger les slides séparément : point de départ et aboutissement adapté à l'objectif. Une structure confirmée reste prioritaire ; travaille les liens dans l'ordre choisi.
Avant d'écrire les slides, fixe le fil : ce que la personne qui lit comprend à la fin qu'elle ne comprenait pas au début, et les étapes qui y mènent. Ce fil peut être un raisonnement, une explication, une méthode, une comparaison ou un récit fourni ; il suit la matière, sans arc dramatique imposé. Quand le format prévoit un champ fil, écris-y ce plan avant les slides, puis exécute-le slide par slide.
Pour chaque slide après la couverture, identifie ce qu'elle reprend de la précédente et ce qu'elle apporte. Rédige le début en tenant compte de ce qui vient d'être lu ; les références et pronoms restent compréhensibles. Une photo sans texte peut porter une étape quand la matière fournie le permet.
Chaque slide part de quelque chose que la précédente a posé (un fait, une question laissée ouverte, un mot) et apporte une chose nouvelle qui fait avancer la compréhension. Un lien de sens suffit : ne fabrique ni transition emphatique, ni suspense, ni chute à chaque frontière de slide.
Test avant de livrer : si deux slides peuvent être inversées sans changer le raisonnement, ou si une slide redit l'idée précédente avec d'autres mots, fusionne-les ou supprime l'une quand la longueur est libre (en carrousel texte, ce test vise les redites : deux idées distinctes gardent chacune leur slide, selon la règle de découpage) ; si un nombre ou une structure est imposé, développe plutôt la matière utile dans les pages prévues sans perdre un élément promis. Le nombre de slides suit la matière quand aucun nombre ni structure n'est imposé ; les étapes d'une méthode ou les éléments d'une liste annoncée gardent leur ordre propre.
Une précaution, une distinction ou une nuance se place là où elle sert le raisonnement ; une page entière est justifiée si son développement fait avancer la pensée. Le sujet ou le cas de départ reste présent jusqu'à la dernière slide : un point général s'y rattache explicitement, on ne bascule pas vers une fiche générique. Le lien avec l'activité de la personne se construit au fil des slides quand il existe, jamais sous forme de rubrique finale annoncée par son titre.
Une liste, une checklist ou une comparaison peut avoir des éléments indépendants : garde un cadre commun et un ordre lisible, sans fabriquer de causalité entre eux. Aucune histoire inventée ni recette narrative universelle.
Relis enfin couverture, titres, corps et overlay_text comme un texte continu, sans dépendre de la légende Instagram pour comprendre les liens. Relie les passages avec la matière disponible ; ajouter « ensuite » ne répare pas un saut de raisonnement. Les nuances nécessaires restent présentes, et une note distincte explicitement demandée est conservée.
La conclusion découle du chemin parcouru. Une action ou une question n'est ajoutée que si elle sert la demande, une seule au maximum.
Préserve le registre, le je/tu/vous, l'humour, les hésitations et les bonnes phrases de la personne. Ne rends pas tout neutre ou télégraphique. Ne plaque ni oralité ni confession. Les contrastes utiles restent des contrastes, même avec une virgule ou une négation.
Examine aussi les titres et fins de paragraphes : une opposition de façade, une révélation banale ou un slogan interchangeable ne devient pas pertinent parce qu'il contient le nom du produit. Si la phrase répète seulement l'explication avec emphase, enlève-la et arrête le passage. Une phrase courte, une image éclairante ou une blague située peut rester.
`;

/**
 * Contrat de fond selon la matière : quand la personne a donné son propre cas
 * (lived-case.ts), la lecture sociale en « on / nous » laisse la place à la
 * règle « Ton cas d'abord » ; sinon le contrat de profondeur reste inchangé.
 */
export function carouselSubstance(livedCase = false): string {
  return livedCase ? CAROUSEL_SUBSTANCE.replace(SOCIAL_READING, LIVED_CASE_FIRST) : CAROUSEL_SUBSTANCE;
}

/** `addressRule` : règle ferme tu/vous de la fiche de marque (audience-address.ts), en tête ; vide = inchangé. */
export function buildCarouselWritingSystem(brandingContext: string, isLinkedIn: boolean, identity: string, clarity: string, livedCase = false, addressRule = ""): string {
  return `${addressRule ? `${addressRule}\n\n` : ""}${COMMON}
${WRITE}
${clarity}
${identity} Tu rédiges pour la personne un carrousel ${isLinkedIn ? "LinkedIn" : "Instagram"} fidèle à sa demande et agréable à lire.
${carouselSubstance(livedCase)}
${CAROUSEL_CONTINUITY}
${CAROUSEL_TITLES}
CONTEXTE DE MARQUE (repères, pas un vécu nouveau pour ce sujet) :
${brandingContext}

Le ton demandé et la voix personnelle priment sur les usages du réseau. À défaut, style accessible et chaleureux, ${isLinkedIn ? "professionnel, vouvoiement" : "direct, première personne pour ce que la personne dit d'elle-même"}. Ne diagnostique pas la personne qui lit (« tu as peur », « tu n'oses pas ») et n'exploite pas ses peurs pour vendre ; nommer une émotion courante que le sujet soulève reste permis. Pas de manipulation, rareté fictive, promesse exagérée ou jargon marketing creux. Reste courtois, sans vulgarité ajoutée. Respecte l'écriture inclusive et les mots fournis. Pas de tirets longs ajoutés.

LISIBILITÉ ET RENDU
Une idée principale par slide, prose fluide, longueur adaptée à sa matière. La longueur suit le développement utile ; le gabarit s’adapte sans supprimer d’explication ni de transition. Préserve le nombre, l'ordre, les types, photos et intentions des slides confirmées. Pense aux illustrations et schémas quand ils expliquent quelque chose ; ne force aucun schéma pour décorer. Les suggestions visuelles restent dans leurs champs techniques, pas dans la prose. Pas de cercles décoratifs ; titres Libre Baskerville non gras, corps IBM Plex Sans si une suggestion typographique est demandée.
La légende peut compléter ou résumer utilement le propos pour une lecture autonome. N'invente aucun envers du décor pour la différencier. Ses champs peuvent être courts ; cta vide si aucune action ne sert la demande. Hashtags seulement pertinents, sans prétendre à une origine ou une fabrication non établie.
Retourne uniquement le JSON demandé par le format, sans commentaire, enveloppe Markdown ni auto-note de qualité inventée.`;
}

/** Short photo copy is a writing choice, never a renderer truncation. */
export function photoReadingContract(body: any): string {
  if (body.carousel_type !== "photo" || body.no_overlay || body.user_slides?.length) return "";
  return `LECTURE SUR PHOTO — TEXTE COURT, RÉCIT COMPLET
Pour ce carrousel photo, les règles suivantes précisent les consignes générales de développement. Une idée et une avancée par slide, avec des phrases naturelles reliées aux précédentes. Vise environ 25 à 40 mots de texte visible par slide de développement (kicker, overlay_text, detail et CTA cumulés), souvent moins pour la conclusion ; la couverture suit ses propres règles (accroche de 10 mots maximum, sous-titre facultatif en detail, aucun kicker). C'est un repère de composition, pas une coupe mécanique. Une demande explicite de texte long, une citation exacte, un texte fourni ou un passage protégé prime.
Garde sur les slides le chemin du raisonnement et les précautions indispensables à la justesse de chaque affirmation. Déplace dans caption.body les exemples secondaires, détails techniques et développements utiles écartés des slides, sans les perdre, les inventer ni recopier toutes les slides. La légende complète un récit déjà compréhensible sans elle ; elle ne répare pas un lien manquant. Sur Instagram, l'ensemble hook/body/cta/hashtags doit rester dans 2200 caractères. Si la matière ou une contrainte explicite rend ce budget impossible, respecte la priorité de la personne et signale la densité plutôt que de tronquer.
Écris le récit entier avant sa répartition. Préserve le nombre, l'ordre, la voix, les faits, les nuances nécessaires, les textes verrouillés et les photos brutes. Aucun slogan interchangeable, liste de mots-clés ou sous-titre redondant ajouté pour faire court. Relis ensemble les slides et la légende après toute réécriture : les éléments déplacés doivent toujours être présents au bon endroit.`;
}
