// Appel à investir (QA du 12/11/2026, usage « attirer des investisseurs ») :
// « je cherche 2 ou 3 investisseurs… ma dernière opé a fait 18 % de marge,
// je veux un post qui donne envie d'investir avec moi » donnait un post qui
// vendait la marge passée comme argument (« c'est le point qui doit vous amener
// à poser des questions »), parlait de « potentiel de valorisation », de
// « deal », de « répartition de la marge », sans un mot sur le risque.
//
// Règle GLOBALE, valable pour tout métier (levée de fonds d'une marque,
// financement participatif d'un atelier, cofinancement d'une opération
// immobilière, entrée au capital…) : aucune promesse ni suggestion de gain,
// un résultat passé n'est jamais un argument, le risque est dit.
// Le bloc n'est ajouté au prompt QUE si la demande parle de faire entrer
// l'argent d'autres personnes : rien ne change pour les autres contenus.

/** Formulations d'une demande d'argent à d'autres personnes (texte replié sans accents, en minuscules). */
const SOLICITATION_PATTERNS: RegExp[] = [
  /\binvestisseu(?:r|rs|se|ses)\b/,
  /\binvestir (?:avec (?:moi|nous)|a mes cotes|a nos cotes|dans (?:mon|notre|ce) (?:projet|operation|immeuble|entreprise|activite))/,
  /\bco-?financ/,
  /\blev(?:ee|er|ons|e) (?:de |des )?fonds\b/,
  /\bfinancement participatif\b/,
  /\bcrowd(?:funding|lending|equity)\b/,
  /\bticket (?:d'entree|d entree|minimum|mini|a partir de)\b/,
  /\b(?:entrer|entree|ouvr(?:e|ir|ons)|ouverture) (?:au|a mon|a notre|du|le|mon|notre) capital\b/,
  /\bassocie(?:e|s|es)? financi(?:er|ere|ers|eres)\b/,
  /\bpreter de l'argent\b|\bpret participatif\b/,
];

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’ʼ]/g, "'").toLowerCase();

/** La demande (sujet, réponses, actu) parle-t-elle de faire investir ou prêter d'autres personnes ? */
export function isInvestmentSolicitation(...parts: unknown[]): boolean {
  const text = fold(parts.map((p) => (typeof p === "string" ? p : p == null ? "" : JSON.stringify(p))).join("\n"));
  return SOLICITATION_PATTERNS.some((re) => re.test(text));
}

export const INVESTMENT_SOLICITATION_RULE = `APPEL À INVESTIR (RÈGLE FERME) : la demande parle de faire entrer l'argent d'autres personnes (investisseurs, cofinancement, levée de fonds, financement participatif, prêt). Si le contenu invite des personnes à investir ou à prêter :
- Aucune promesse ni suggestion de gain pour le projet proposé : pas de rendement, de marge, de rentabilité, de plus-value ni de « potentiel » chiffré ou laissé espérer, même au conditionnel.
- Un résultat passé qu'elle a donné reste un fait de son parcours, recopié tel quel, jamais un argument pour investir ni une indication de ce que gagneront les autres. S'il apparaît, la même phrase ou la suivante dit qu'un résultat passé ne présage pas du suivant.
- Aucun calcul à partir de ses chiffres (marge, rendement, multiple, gain par part) et aucun chiffre financier qu'elle n'a pas écrit.
- Une phrase simple dit que tout investissement comporte un risque de perte.
- Ni urgence ni rareté (« places limitées », « dernière chance »), ni vocabulaire de produit financier (« deal », « opportunité à saisir », « placement sûr »).
- L'appel à l'action propose un échange privé pour présenter le projet, jamais d'envoyer de l'argent ou de « réserver sa part ».`;

/** Bloc à ajouter au prompt (vide si la demande ne parle pas d'investir). */
export function investmentSolicitationBlock(...parts: unknown[]): string {
  return isInvestmentSolicitation(...parts) ? `\n${INVESTMENT_SOLICITATION_RULE}\n` : "";
}
