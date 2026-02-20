// ========================================================
// D1 – Structures détaillées Framework Nowadays
// Chaque guide donne une structure slide-par-slide ou étape-par-étape
// ========================================================

export interface GuideStep {
  label: string;
  detail: string;
}

export const PRODUCTION_GUIDES: Record<string, GuideStep[]> = {
  "Storytelling": [
    { label: "Slide 1 – Accroche", detail: "Une phrase choc ou une question qui plonge directement dans l'histoire. Ex : « Le jour où j'ai failli tout abandonner… »" },
    { label: "Slide 2 – Le décor", detail: "Plante la scène en 2-3 phrases : où tu étais, quand, comment tu te sentais. Crée de l'empathie." },
    { label: "Slide 3 – Le problème", detail: "Décris le blocage ou la galère. Sois honnête et spécifique." },
    { label: "Slide 4 – Le tournant", detail: "Le déclic, la rencontre, la décision qui a tout changé." },
    { label: "Slide 5 – L'action", detail: "Ce que tu as fait concrètement. Montre la transformation en actes." },
    { label: "Slide 6 – Le résultat", detail: "Où tu en es maintenant. Sois factuelle (chiffres, ressentis, changements visibles)." },
    { label: "Slide 7 – La leçon", detail: "Qu'est-ce que ça change pour ta lectrice ? Rends la leçon universelle." },
    { label: "Slide 8 – Ouverture", detail: "Finis par une question ouverte ou une invitation à partager son expérience." },
  ],
  "Mythe à déconstruire": [
    { label: "Slide 1 – Le mythe", detail: "Formule le mythe entre guillemets, en gros. Ex : « Il faut poster tous les jours pour réussir sur Insta »" },
    { label: "Slide 2 – Pourquoi on y croit", detail: "Explique l'origine du mythe et pourquoi il est si répandu." },
    { label: "Slide 3 – La faille", detail: "Montre en quoi c'est faux ou incomplet. Utilise un exemple précis." },
    { label: "Slide 4 – Preuve / données", detail: "Donne un fait, un chiffre, une étude, ou un témoignage qui démonte le mythe." },
    { label: "Slide 5 – L'impact négatif", detail: "Explique le mal que ce mythe fait aux créatrices qui le suivent." },
    { label: "Slide 6 – La vraie leçon", detail: "Propose ce qu'il faudrait croire/faire à la place." },
    { label: "Slide 7 – Comment appliquer", detail: "Un conseil actionnable pour remplacer le mythe par la bonne pratique." },
    { label: "Slide 8 – CTA doux", detail: "Invite à réfléchir : « Quel mythe tu as arrêté de croire récemment ? »" },
  ],
  "Coup de gueule": [
    { label: "Étape 1 – L'élément déclencheur", detail: "Commence par ce qui t'a fait réagir. Sois directe et authentique." },
    { label: "Étape 2 – Le constat", detail: "Décris le problème précisément, avec un exemple concret." },
    { label: "Étape 3 – Pourquoi c'est grave", detail: "Explique l'impact réel sur les créatrices/entrepreneures." },
    { label: "Étape 4 – Les coupables", detail: "Qui propage cette idée ? (sans attaque personnelle – vise le système, pas les gens)" },
    { label: "Étape 5 – Ton expérience", detail: "Raconte comment toi aussi tu es tombée dans le piège, ou ce que tu as observé." },
    { label: "Étape 6 – Le déclic", detail: "Ce qui t'a fait changer d'avis ou de pratique." },
    { label: "Étape 7 – L'alternative", detail: "Propose une autre façon de voir ou de faire. Sois constructive." },
    { label: "Étape 8 – Appel à la réflexion", detail: "Invite ta communauté à se positionner, sans imposer." },
  ],
  "Enquête / décryptage": [
    { label: "Slide 1 – L'observation", detail: "« J'ai remarqué que… » – Pose le sujet avec une observation concrète." },
    { label: "Slide 2 – Le contexte", detail: "Donne les clés de compréhension : dates, chiffres, tendance." },
    { label: "Slide 3 – Point clé 1", detail: "Premier angle d'analyse avec un exemple concret." },
    { label: "Slide 4 – Point clé 2", detail: "Deuxième angle d'analyse, complémentaire ou contradictoire." },
    { label: "Slide 5 – Point clé 3", detail: "Troisième angle : la nuance que personne ne mentionne." },
    { label: "Slide 6 – Ce que ça change", detail: "L'impact pour ton audience : pourquoi elles doivent s'en soucier." },
    { label: "Slide 7 – Ton take", detail: "Donne ta position personnelle, assume-la." },
    { label: "Slide 8 – Question ouverte", detail: "Invite à la discussion : « Et toi, qu'est-ce que tu en penses ? »" },
  ],
  "Conseil contre-intuitif": [
    { label: "Slide 1 – Le conseil mainstream", detail: "Cite le conseil que tout le monde donne, en le formulant clairement." },
    { label: "Slide 2 – Pourquoi c'est populaire", detail: "Explique pourquoi ce conseil est répandu (facilité, autorité, effet de mode)." },
    { label: "Slide 3 – Le problème", detail: "Montre les limites ou les dégâts que ce conseil provoque." },
    { label: "Slide 4 – Ton contre-conseil", detail: "Annonce ton alternative (formule-la de manière percutante)." },
    { label: "Slide 5 – Pourquoi ça marche", detail: "Explique la logique derrière ton approche alternative." },
    { label: "Slide 6 – Preuve / exemple", detail: "Donne un cas concret (le tien ou celui d'une cliente)." },
    { label: "Slide 7 – Comment commencer", detail: "Un premier pas simple pour appliquer ce contre-conseil dès aujourd'hui." },
    { label: "Slide 8 – Ouverture", detail: "« Le meilleur conseil que tu aies reçu et que personne ne donne ? »" },
  ],
  "Test grandeur nature": [
    { label: "Slide 1 – Accroche", detail: "« J'ai testé [X] pendant [durée] – voici ce qui s'est passé »" },
    { label: "Slide 2 – Pourquoi ce test", detail: "Explique ta motivation : curiosité, frustration, défi." },
    { label: "Slide 3 – Les conditions", detail: "Comment tu as fait : contexte, méthode, contraintes." },
    { label: "Slide 4 – Semaine(s) 1", detail: "Premiers résultats, premières impressions honnêtes." },
    { label: "Slide 5 – Le milieu", detail: "L'évolution : ce qui s'est amélioré ou dégradé." },
    { label: "Slide 6 – Les résultats finaux", detail: "Chiffres, ressentis, screenshots si possible." },
    { label: "Slide 7 – Verdict", detail: "« Ça vaut le coup si… » / « Skip si… » – Sois tranchée." },
    { label: "Slide 8 – Et toi ?", detail: "Demande si d'autres ont testé, ou ce qu'elles aimeraient que tu testes." },
  ],
  "Before / After": [
    { label: "Slide 1 – Teasing", detail: "Annonce la transformation : « Ce que [X mois/action] a changé pour moi »" },
    { label: "Slide 2 – Le AVANT (situation)", detail: "Décris honnêtement ta situation de départ. Pas de honte." },
    { label: "Slide 3 – Le AVANT (ressenti)", detail: "Comment tu te sentais : doutes, frustration, confusion." },
    { label: "Slide 4 – Le déclic", detail: "L'événement ou la décision qui a enclenché le changement." },
    { label: "Slide 5 – Les actions clés", detail: "Les 2-3 choses concrètes que tu as mises en place." },
    { label: "Slide 6 – Le APRÈS (situation)", detail: "Où tu en es maintenant. Sois factuelle, pas exagérée." },
    { label: "Slide 7 – Le APRÈS (ressenti)", detail: "Comment tu te sens maintenant. La vraie différence." },
    { label: "Slide 8 – Leçon universelle", detail: "Ce que ta lectrice peut en tirer pour elle-même." },
  ],
  "Histoire cliente": [
    { label: "Slide 1 – Le verbatim", detail: "Commence par une citation directe : « Elle m'a dit : … »" },
    { label: "Slide 2 – Le contexte", detail: "Qui est cette personne ? (sans la nommer – décris son profil)" },
    { label: "Slide 3 – Son blocage", detail: "Le problème qu'elle vivait avant de travailler avec toi." },
    { label: "Slide 4 – Ce qu'elle avait déjà essayé", detail: "Les solutions qui n'avaient pas marché (et pourquoi)." },
    { label: "Slide 5 – Le déclic", detail: "Le moment où quelque chose a changé dans l'accompagnement." },
    { label: "Slide 6 – Les actions", detail: "Ce qu'elle a mis en place concrètement." },
    { label: "Slide 7 – Le résultat", detail: "Les résultats tangibles (chiffres, ressentis, avant/après)." },
    { label: "Slide 8 – La leçon universelle", detail: "Ce que ton audience peut en retenir, même sans être cliente." },
  ],
  "Regard philosophique": [
    { label: "Slide 1 – L'observation", detail: "Pars d'une observation large : société, rapport au temps, au travail, aux réseaux." },
    { label: "Slide 2 – Le paradoxe", detail: "Mets en lumière une contradiction ou un non-dit." },
    { label: "Slide 3 – Développe", detail: "Creuse ton analyse avec des exemples du quotidien." },
    { label: "Slide 4 – Le lien avec la com", detail: "Fais le pont : en quoi ça impacte la communication et le business." },
    { label: "Slide 5 – Ta position", detail: "Assume un point de vue personnel, même nuancé." },
    { label: "Slide 6 – Pas de solution facile", detail: "Reconnais la complexité. Pas de « 5 étapes pour… »." },
    { label: "Slide 7 – Ouverture", detail: "Pose une question philosophique qui fait réfléchir." },
  ],
  "Surf sur l'actu": [
    { label: "Slide 1 – L'actu en 1 phrase", detail: "Résume l'événement/tendance de manière factuelle et accrocheuse." },
    { label: "Slide 2 – Le contexte", detail: "Donne les infos nécessaires pour que tout le monde comprenne." },
    { label: "Slide 3 – Ce que ça révèle", detail: "Ton analyse : au-delà du buzz, qu'est-ce que ça dit de notre époque ?" },
    { label: "Slide 4 – Le lien avec ton audience", detail: "Pourquoi tes abonnées sont concernées." },
    { label: "Slide 5 – Ta position", detail: "Ce que tu en penses, sans langue de bois." },
    { label: "Slide 6 – Appel à réagir", detail: "Demande l'avis de ta communauté." },
  ],
  "Identification / quotidien": [
    { label: "Slide 1 – POV / « Toi aussi tu… »", detail: "Accroche immersive : une situation ultra-concrète que ta cible vit au quotidien." },
    { label: "Slide 2 – La scène", detail: "Décris avec des détails sensoriels : le matin, l'écran, le café, les doutes." },
    { label: "Slide 3 – Le ressenti", detail: "Nomme l'émotion : frustration, imposture, fatigue, excitation." },
    { label: "Slide 4 – « Et pourtant… »", detail: "Le retournement : ce qu'on ne voit pas, ce qu'on ne dit pas." },
    { label: "Slide 5 – La validation", detail: "Montre que tu comprends parfaitement, que c'est normal." },
    { label: "Slide 6 – Ouverture", detail: "« Dis-moi en commentaire si toi aussi… » – crée la connexion." },
  ],
  "Build in public": [
    { label: "Slide 1 – Le projet", detail: "Annonce clairement ce sur quoi tu travailles en ce moment." },
    { label: "Slide 2 – Les coulisses", detail: "Montre ce qu'on ne voit pas : les doutes, les chiffres bruts, l'envers du décor." },
    { label: "Slide 3 – Ce qui marche", detail: "Partage une victoire, même petite. Sois honnête." },
    { label: "Slide 4 – Ce qui coince", detail: "Un blocage, un échec, une question non résolue." },
    { label: "Slide 5 – La décision à prendre", detail: "Présente un choix que tu dois faire et ton raisonnement." },
    { label: "Slide 6 – Les prochaines étapes", detail: "Ton plan pour la suite, même flou." },
    { label: "Slide 7 – Appel à participation", detail: "Demande un avis, un vote, un feedback. Implique ta communauté." },
  ],
  "Analyse en profondeur": [
    { label: "Slide 1 – Le sujet", detail: "Annonce clairement le sujet et pourquoi il mérite une analyse." },
    { label: "Slide 2 – Point clé 1", detail: "Premier axe d'analyse avec un exemple concret ou une donnée." },
    { label: "Slide 3 – Point clé 2", detail: "Deuxième axe, complémentaire. Ajoute de la nuance." },
    { label: "Slide 4 – Point clé 3", detail: "Troisième axe : l'angle que personne ne prend." },
    { label: "Slide 5 – Point clé 4", detail: "Quatrième axe ou approfondissement d'un point précédent." },
    { label: "Slide 6 – Point clé 5", detail: "Cinquième axe ou conclusion intermédiaire." },
    { label: "Slide 7 – Synthèse", detail: "Résume les points clés en 3 phrases maximum." },
    { label: "Slide 8 – Ton take", detail: "Ta position personnelle sur le sujet. Assume." },
    { label: "Slide 9 – CTA", detail: "Enregistre pour y revenir / Partage si ça t'a aidée." },
  ],
};

// Instagram format recommendations per angle
export const INSTAGRAM_FORMAT_RECO: Record<string, string> = {
  "Storytelling": "Ce sujet se prête bien à un carrousel 8 slides ou un post texte long.",
  "Mythe à déconstruire": "Ce sujet se prête bien à un carrousel éducatif 8 slides.",
  "Coup de gueule": "Ce sujet se prête bien à un reel face caméra ou un post texte percutant.",
  "Enquête / décryptage": "Ce sujet se prête bien à un carrousel 8 slides ou un reel explicatif.",
  "Conseil contre-intuitif": "Ce sujet se prête bien à un carrousel 8 slides ou un reel court.",
  "Test grandeur nature": "Ce sujet se prête bien à un reel ou un carrousel avant/après 8 slides.",
  "Before / After": "Ce sujet se prête bien à un carrousel visuel 8 slides ou un reel.",
  "Histoire cliente": "Ce sujet se prête bien à un carrousel storytelling 8 slides ou un post texte.",
  "Regard philosophique": "Ce sujet se prête bien à un post texte long ou un carrousel 7 slides.",
  "Surf sur l'actu": "Ce sujet se prête bien à un reel réactif ou une story.",
  "Identification / quotidien": "Ce sujet se prête bien à un reel POV ou un post texte court.",
  "Build in public": "Ce sujet se prête bien à un carrousel coulisses 7 slides ou un reel.",
  "Analyse en profondeur": "Ce sujet se prête bien à un carrousel éducatif 8-10 slides.",
};

// Normalize angle string for lookup
export function getGuide(angle: string): GuideStep[] | null {
  const normalized = angle.trim();
  if (PRODUCTION_GUIDES[normalized]) return PRODUCTION_GUIDES[normalized];
  const key = Object.keys(PRODUCTION_GUIDES).find(
    (k) => k.toLowerCase().replace(/\s+/g, "") === normalized.toLowerCase().replace(/\s+/g, "")
  );
  return key ? PRODUCTION_GUIDES[key] : null;
}

export function getInstagramFormatReco(angle: string): string | null {
  const normalized = angle.trim();
  if (INSTAGRAM_FORMAT_RECO[normalized]) return INSTAGRAM_FORMAT_RECO[normalized];
  const key = Object.keys(INSTAGRAM_FORMAT_RECO).find(
    (k) => k.toLowerCase().replace(/\s+/g, "") === normalized.toLowerCase().replace(/\s+/g, "")
  );
  return key ? INSTAGRAM_FORMAT_RECO[key] : null;
}
