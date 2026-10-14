// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 4 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.
// getStoriesVenteInstructions reste interne à ce fichier.

import type { AudienceAddress } from "../audience-address.ts";
import {
  STORIES_MAX,
  STORIES_QUICK_MAX,
  STORIES_QUICK_RULE,
  STORY1_ACCROCHE,
  UNE_IDEE_STORIES,
  numerotationConsigne,
  VOIX_ORALE_STORIES,
} from "../socle.ts";
import { annoncedItems } from "./common.ts";
import { recapStoriesBlock } from "../multi-subject.ts";

export interface StoriesBriefParams {
  objective?: string | null;
  price_range?: string | null;
  time_available?: string | null;
  face_cam?: string | null;
  is_launch?: boolean | null;
  gardeFouAlerte?: string | null;
  pre_gen_answers?: { vecu?: string; energy?: string; message_cle?: string } | null;
  subject?: string | null;
  /**
   * Catalogue de la bibliothèque photos du workspace (lot B) : descriptions
   * écrites par photo-describe à l'upload. L'IA référence une photo par son
   * `index` (petit entier — jamais d'UUID dans le prompt) ; creative-flow
   * résout ensuite index → user_photos.id de façon déterministe.
   */
  photo_catalog?: { index: number; description: string; chosen?: boolean }[] | null;
  /**
   * Tu ou vous réglé dans la fiche de marque (04/10/2026). Quand il existe, les
   * consignes d'adresse ci-dessous ne fixent plus de forme : elles renvoient
   * au réglage. Sans réglage, elles restent mot pour mot celles d'avant.
   */
  audienceAddress?: AudienceAddress | null;
}

/** Consignes d'adresse des stories : figées sans réglage (historique), alignées sur la fiche sinon. */
export function storiesAddressLines(addr: AudienceAddress | null | undefined): { voice: string; hook: string; oral: string } {
  if (!addr) {
    return {
      voice: `- Le "TU" n'arrive que dans les moments d'interpellation directe ou les CTA, JAMAIS comme ton dominant.
- Le "VOUS" inclusif ("qui ici…", "est-ce que ça vous parle…") est préféré au "tu" pour les questions.`,
      hook: `IMPORTANT : Le hook par défaut est en "JE" ou en "VOUS inclusif". Le "TU" direct est réservé UNIQUEMENT à l'angle "interpellation communauté" et doit rester rare.`,
      oral: `Le "JE" raconte, le "VOUS/TU" n'intervient que ponctuellement pour interpeller.`,
    };
  }
  const form = addr === "vous" ? `"VOUS" (vouvoiement)` : `"TU" (tutoiement)`;
  return {
    voice: `- L'adresse directe au public (interpellation, questions, CTA) reste ponctuelle, jamais le ton dominant, et elle est TOUJOURS au ${form} : c'est le réglage de sa fiche de marque, règle ferme.`,
    hook: `IMPORTANT : Le hook par défaut est en "JE" ou s'adresse au public au ${form}, selon sa fiche de marque. L'interpellation directe reste rare.`,
    oral: `Le "JE" raconte, l'adresse au public (au ${form}) n'intervient que ponctuellement pour interpeller.`,
  };
}

function getStoriesVenteInstructions(priceRange?: string | null): string {
  const instructions: Record<string, string> = {
    petit: `SÉQUENCE PETIT PRIX (<100€) : 3-4 stories
1. Story contexte : ton décontracté, annoncer qu'on a créé quelque chose
2. Story offre : visuel + bénéfice principal + prix
3. Story preuve : screenshot témoignage
4. Story CTA : proposer un mot-clé à envoyer en DM (mot choisi dans le sujet)`,
    moyen: `SÉQUENCE MOYEN (100-500€) : 5-7 stories
1. Story émotion : face cam intime, confidence directe
2. Story problème : identification + sondage
3. Story solution : concept clé en face cam
4. Story offre : visuel + prix + dates
5. Story preuve : témoignage
6. Story interaction : sondage qui propose les détails en DM
7. Story CTA : proposer un mot-clé à envoyer en DM (mot choisi dans le sujet)`,
    premium: `SÉQUENCE PREMIUM (500€+) : 7-10 stories
1. Hook : confidence directe, ancrée dans l'offre
2-3. Contexte perso : pourquoi tu as créé cette offre
4. Problème : identification forte
5-6. Transformation : before/after cliente
7. Offre : format, pour qui
8. Pratique : prix, dates, modalités
9. Objection principale : face cam douce
10. CTA : inviter à écrire en DM, en mode permission`,
    physique: `SÉQUENCE PRODUIT PHYSIQUE : 4-6 stories
1. Teasing : gros plan détail
2. Révélation : produit entier
3. Making-of : process de création
4. Details : prix, matériaux, dispo
5. Preuve : photo cliente OU avis
6. CTA : lien boutique`,
    gratuit: `SÉQUENCE FREEBIE : 3-4 stories
1. Problème : la galère concrète que le freebie résout
2. Solution : ce qu'on a créé gratuitement et ce que ça apporte
3. Preuve : capture d'écran + résultat
4. CTA : proposer un mot-clé à envoyer en DM (mot choisi dans le sujet)`,
  };
  return instructions[priceRange || ""] || "";
}

export function storiesBrief(p: StoriesBriefParams = {}): string {
  const address = storiesAddressLines(p.audienceAddress);
  const objective = p.objective || "connexion";
  const time_available = p.time_available || "flexible";
  const face_cam = p.face_cam || "flexible";
  const isQuick = time_available === "5min";
  const priceBlock = objective === "vente" && p.price_range ? `\n- Gamme de prix : ${p.price_range}` : "";
  const launchBlock = p.is_launch ? "\n- Phase : LANCEMENT (orienter vers vente + preuve sociale)" : "\n- Phase : croisière";
  // Liste annoncée avec un nombre : numérotation 1..N (socle, décision du 05/10/2026).
  const storiesNumbering = numerotationConsigne(annoncedItems(p.subject), "stories");
  // Brief à plusieurs sujets, choix « séquence récap » à l'écran format (09/10/2026).
  const recapBlock = recapStoriesBlock(p.subject, isQuick ? STORIES_QUICK_MAX : STORIES_MAX);

  let preGenBlock = "";
  if (p.pre_gen_answers && (p.pre_gen_answers.vecu || p.pre_gen_answers.energy || p.pre_gen_answers.message_cle)) {
    preGenBlock = `

═══════════════════════════════════════════════════
ÉLÉMENTS PERSONNELS DE L'UTILISATEUR·ICE (PRIORITÉ HAUTE)
═══════════════════════════════════════════════════

${p.pre_gen_answers.vecu ? `VÉCU RÉCENT : "${p.pre_gen_answers.vecu}"
→ C'est du contenu authentique. UTILISE ses mots exacts, ses formulations, ses images.
→ Intègre-le dans la story 1 (hook) ou story 2 (identification).
→ Ne reformule PAS son vécu en langage corporate. Garde le côté brut.
→ N'ajoute AUCUN moment ni date qui n'est pas dans son vécu (pas de "hier", "ce matin", "hier soir", "la semaine dernière" inventé).` : ""}

${p.pre_gen_answers.energy ? `ÉNERGIE CHOISIE : ${p.pre_gen_answers.energy}
→ L'énergie guide le ton de TOUTE la séquence, pas juste une story :
  🔥 Punchy = rythme rapide, affirmations assumées, pas de détour, mais en phrases complètes et parlées qui s'enchaînent (jamais de fragments sans verbe ni de phrases-slogans en série)
  🫶 Intime = face cam, ton doux, confidence, proximité
  📚 Pédago = structure claire, tips concrets, progression logique
  😄 Drôle = auto-dérision, observations du quotidien, décalage
  😤 Coup de gueule doux = position affirmée mais bienveillante, pas de jugement` : ""}

${p.pre_gen_answers.message_cle ? `MESSAGE CLÉ : "${p.pre_gen_answers.message_cle}"
→ Ce message doit apparaître TEXTUELLEMENT (ou très proche) dans la story 4 ou 5, au moment du climax ou de la conclusion.
→ NE CHANGE PAS le sens de ses mots. Tu peux ajuster la structure mais les mots restent les siens.
→ C'est la phrase que les gens doivent retenir.` : ""}

RÈGLE D'OR : Si la personne a fourni ces éléments, ils sont plus importants que n'importe quel template. La séquence doit sonner authentique, pas comme un framework appliqué mécaniquement.
`;
  } else {
    preGenBlock = `

La personne n'a pas fourni d'éléments personnels.
Génère normalement, sans inventer de vécu. Remplis le champ "personal_tip" du JSON avec UN conseil court et concret (une phrase, sans chiffre, sans emoji) : quel moment perso, lié à CE sujet, elle pourrait ajouter en story 1 ou 2 avant de publier.
`;
  }

  const venteBlock = isQuick && objective === "vente"
    ? getStoriesVenteInstructions("petit")
    : (objective === "vente" ? getStoriesVenteInstructions(p.price_range) : "");

  const hookBlock = isQuick
    ? (face_cam === "oui"
      ? `HOOK STORY 1, RÈGLES :

La story 1 décide de TOUT : une grande partie de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

FORMAT : face cam
- Les 5-10 premiers mots ouvrent une attente, mais ils ne sont PAS toute la story
- Continue dans le même champ "text" avec 1-2 phrases naturelles : une vraie entrée de message vocal, 15-30 secondes au total
- Ton conversationnel : la première phrase d'un vocal à une amie, avec SES mots à elle, jamais une amorce passe-partout
- Sous-titres OBLIGATOIRES (la plupart regardent sans le son)
`
      : `HOOK STORY 1, RÈGLES :

La story 1 décide de TOUT : une grande partie de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

FORMAT : texte sur fond
- ${STORY1_ACCROCHE}
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)
`)
    : `HOOK STORY 1, RÈGLES :

La story 1 décide de TOUT : une grande partie de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

SELON LE FORMAT DE LA STORY 1 :

Si format = texte sur fond :
- ${STORY1_ACCROCHE}
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)

Si format = face cam :
- Les 5-10 premiers mots arrêtent le swipe, puis la personne continue 15-30 secondes
- Écris tout ce qu'elle dit dans le même champ "text" : 2-3 phrases orales maximum
- Ton conversationnel : la première phrase d'un vocal à une amie, avec SES mots à elle, jamais une amorce passe-partout
- Sous-titres OBLIGATOIRES (la plupart regardent sans le son)

Si format = visuel/photo :
- Même règle : l'accroche seule (une vraie phrase parlée de 4 à 15 mots) qui se comprend immédiatement, avec son "mot_cle" ; le récit commence en story 2
- L'image fait le travail visuel ; l'accroche ouvre l'attente
`;

  const structuresBlock = isQuick
    ? `STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 2-3 stories
- probleme_solution : Éducation, 2-3 stories
- vente_douce : Vente, 2-3 stories (max)
`
    : `STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 3-5 stories
- probleme_solution : Éducation, 4-6 stories
- storytime : Connexion, 5-8 stories
- vente_douce : Vente, 5-7 stories
- faq_live : Vente/Éducation, 5-8 stories
- build_in_public : Connexion, 3-5 stories
- micro_masterclass : Éducation, 6-10 stories
- teasing : Amplification, 3-5 stories
`;

  return `FORMAT : SÉQUENCE STORIES INSTAGRAM (séquence narrative complète)

══ AVANT D'ÉCRIRE : LES STORIES, C'EST UN MESSAGE VOCAL ÉCRIT ══

Les stories sont le format LE PLUS INTIME d'Instagram. Le spectateur les regarde généralement seul, souvent dans un moment d'attente, et il peut sortir à tout moment. C'est exactement comme un message vocal d'une amie qui te raconte un truc en marchant.

AVANT DE RÉDIGER, RÉFLÉCHIS EN INTERNE (ne montre PAS) : Quel est le problème ? Quelle émotion ? Quelle accroche est la MEILLEURE ? Mon output a-t-il du slop ?

ANALOGIES VISUELLES, DOSAGE :
1 analogie max dans la séquence. Parfois 0. Si l'idée est claire sans, n'en mets pas.
L'analogie doit être du QUOTIDIEN et VISUELLE. Jamais forcée.

${preGenBlock}

DEMANDE :
- Objectif : ${objective}${priceBlock}
- Temps disponible : ${time_available}
- Face cam : ${face_cam}
- Sujet : ${p.subject || "au choix selon la ligne éditoriale"}${launchBlock}
${storiesNumbering ? `\n${storiesNumbering}\n` : ""}${recapBlock ? `\n${recapBlock}\n` : ""}
${structuresBlock}

CORRESPONDANCE objectif x temps :
- Connexion + 5min → journal_bord | + 15min → build_in_public | + 30min → storytime
- Éducation + 5min → 1-2 stories astuce | + 15min → probleme_solution | + 30min → micro_masterclass
- Vente + 5min → 1-2 stories mention | + 15min → vente_douce | + 30min → séquence complète 7-10
- Engagement + 5min → sondage+question 2 stories | + 15min → quiz+question 3-5
- Amplification + 5min → repartage+question 2 | + 15min → teasing 3-5


ANGLE DE NARRATION, CHOISIS LE PLUS ADAPTÉ AU SUJET :

Chaque séquence de stories doit avoir UN angle de narration dominant. C'est l'angle qui détermine la VOIX de toute la séquence.

1. 🎬 COULISSES ("Je vous montre")
   Story 1 : une action concrète en cours, décrite comme si on filmait par-dessus l'épaule
   Voix : narrateur·ice de son propre quotidien pro
   Le fil : on suit une action en cours, comme si on filmait par-dessus l'épaule
   Idéal pour : process de création, journée type, préparation d'un lancement

2. 💭 RÉFLEXION PERSO (la pensée à voix haute)
   Voix : pensée à voix haute, introspective
   Story 1 : entrer par la prise de conscience elle-même (sans date fabriquée si ce n'est pas un vrai moment vécu)
   Le fil : une prise de conscience qui se déroule story après story
   Idéal pour : partager une leçon, un déclic, un changement de perspective

3. 🙋 INTERPELLATION COMMUNAUTÉ ("Et vous ?")
   Voix : on s'adresse au groupe, on inclut
   Story 1 : une question au groupe sur un problème concret du sujet
   Le fil : on part d'un problème partagé, on explore ensemble, on ouvre le dialogue
   Idéal pour : engagement, sondages, créer de la conversation

4. 📖 CONSEIL PAR L'EXPÉRIENCE ("J'ai appris")
   Voix : retour d'expérience personnel, pas de leçon descendante
   Story 1 : l'erreur qu'on faisait avant, dite simplement
   Le fil : MON parcours → ce que j'en ai tiré → ce que ça peut t'apporter
   Idéal pour : tips, bonnes pratiques, éducation douce

5. 💬 STORYTIME CLIENT ("Je vous raconte")
   Voix : narrateur·ice d'une histoire vraie (anonymisée)
   Story 1 : la situation client réelle (anonymisée) SI l'utilisatrice l'a fournie. Sinon, ne pas fabriquer : généraliser ("ce qui revient souvent chez mes clientes…"). Pas de "la semaine dernière" inventé.
   Le fil : situation client → problème → ce qu'on a fait → résultat
   Idéal pour : preuve sociale, démontrer son expertise, humaniser

6. 🔥 COUP DE GUEULE DOUX (la position affirmée)
   Voix : position affirmée mais bienveillante
   Story 1 : le constat qui agace, formulé avec les mots du sujet (pas une amorce générique)
   Le fil : constat → pourquoi ça pose problème → ce que j'en pense, assumé → question ou sondage qui fait réagir
   Idéal pour : se positionner, affirmer ses valeurs, créer du débat sain

══ SI UN CONTENU SOURCE EST FOURNI (bloc « CONTENU SOURCE » ou fichiers) ══

Ce texte, c'est ELLE qui l'a écrit : c'est la matière, pas un point de départ à résumer.
- Garde TOUTES ses idées, ses étapes, ses chiffres, ses exemples. Améliore l'oral, les transitions, le rythme ; ne compresse jamais deux idées en une phrase, ne saute aucune étape. Une story qu'on ne comprend pas sans avoir lu le texte d'origine est ratée.
- UNE idée par story. Le NOMBRE de stories découle du texte : autant qu'il en faut pour tout dire clairement (jusqu'à 10), pas un nombre décidé d'avance. Cette règle PRIME sur la contrainte de temps : si elle a écrit 8 idées, il y a 8 stories, pas 4.
- Ses mots à elle passent avant les tiens : reprends ses formulations quand elles sont vivantes, ne les remplace pas par des tournures plus « propres ».

══ FIL NARRATIF : UNE SEULE HISTOIRE, PAS UNE SUITE DE STORIES ══

On regarde les stories UNE PAR UNE, en tapotant. Si la story 4 pourrait être lue avant la story 2 sans rien perdre, la séquence n'est pas une histoire, c'est une liste. Règles :
- La story 1 pose UNE situation précise (un moment, un détail, une phrase entendue) et ouvre une attente : quelque chose reste en suspens.
- Chaque story suivante REPREND là où la précédente s'est arrêtée : elle commence par la conséquence, la suite ou la réaction de ce qui vient d'être dit (« Et là… », « Sauf que… », « Du coup… », « Ce que j'ai fait : … »), varié d'une story à l'autre, jamais deux fois la même cheville. Pas de nouveau sujet en cours de route.
- L'attente ouverte en story 1 est résolue dans l'avant-dernière ou la dernière story. Le sticker ou l'invitation finale découle de cette résolution, il ne tombe pas du ciel.
- Test avant de rendre : relis les "text" à la suite comme un seul message vocal. Si ça ne s'enchaîne pas à voix haute, réécris les transitions, pas les stories.

RÈGLE D'OR DE LA VOIX :
- AUCUNE amorce passe-partout : la première phrase de la séquence doit être IMPOSSIBLE à coller sur un autre sujet ou un autre métier. Si elle pourrait ouvrir n'importe quelle story de n'importe quel compte, réécris-la à partir d'un détail de CE sujet.
- Le "JE" narratif est la voix PAR DÉFAUT. On raconte depuis son expérience.
${address.voice}
- Une bonne story donne l'impression de surprendre quelqu'un en train de réfléchir ou de vivre quelque chose. Ce n'est PAS un post reformaté en slides.
- Chaque story doit donner envie de voir la SUIVANTE. Il y a une tension narrative, un fil. Pas juste des affirmations empilées.

${venteBlock}

${hookBlock}

══ TEXTE ET PHOTO DE CHAQUE STORY ══

Tu écris le TEXTE de chaque story (et son petit titre éventuel) et tu dis quelle PHOTO la porte (objet "visual"). La mise en page de l'image (pastilles, liste, citation, fond, position) est décidée APRÈS, à partir de ton texte : tu n'en écris rien.

RÈGLES :
0. "title_pill" : OPTIONNEL, et null le plus souvent. Une story native, c'est UN bloc de texte posé sur la photo ; un titre + un texte dessous sur chaque story, c'est la signature d'un outil, pas d'une personne. Ne mets un "title_pill" (3-7 mots, pas de point final, affiché en capitales condensées type "Strong") QUE si la story annonce quelque chose qui se lit d'abord : une liste, une question posée à l'audience, une offre, une date. Jamais de titre qui répète ou résume le "text". Sur une séquence de 5 stories, 1 ou 2 titres maximum.
1. "text" : LE TEXTE DE LA STORY, 350 caractères MAX. Ce qui est écrit sur la story, c'est ce qu'on lit : pas de résumé, pas de version raccourcie, pas de "titre puis texte". Un texte de 3-4 phrases qui raconte vraiment, c'est ce qui fait lire ; une accroche de 8 mots, on la swipe (sauf la story 1 texte ou photo, qui est l'accroche seule). Écrit comme on parle, jamais en formule. ${UNE_IDEE_STORIES}
2. Verbatim client : court, jamais inventé. S'il n'y a pas de vrai retour client fourni, n'en cite pas.
3. Les stories, ce sont des IMAGES : une photo est le fond de TOUTES les stories (hors face cam), et elle illustre CE QUE DIT la story.
4. Pour CHAQUE story non face-cam, remplis TOUJOURS "photo_directive" (quelle photo prendre ou choisir, CONCRÈTE et ancrée dans l'activité réelle, comme un plan de tournage : "ton plan de travail avec les pots en cours de séchage", pas "une jolie photo") ET "photo_query_en" (2-4 mots EN ANGLAIS décrivant une scène photographiable concrète équivalente, pour la recherche de photos libres de droits, ex "hands shaping clay bowl"). Jamais null.${p.photo_catalog && p.photo_catalog.length > 0 ? (() => {
    const chosen = p.photo_catalog!.filter((ph) => ph.chosen);
    const others = p.photo_catalog!.filter((ph) => !ph.chosen);
    return `

══ BIBLIOTHÈQUE DE PHOTOS DE LA MARQUE ══
${chosen.length > 0 ? `
PHOTOS CHOISIES PAR L'UTILISATRICE POUR CETTE SÉQUENCE (priorité absolue) :
${chosen.map((ph) => `- photo ${ph.index} : ${ph.description}`).join("\n")}

Elle a sélectionné CES photos pour cette séquence : construis les stories de façon à ce que CHACUNE trouve sa place (une story chacune, via "photo_index"). Assigne chaque photo à la story où elle raconte le mieux. Le nombre de stories à fond photo doit permettre de toutes les placer.
` : ""}${others.length > 0 ? `
${chosen.length > 0 ? "Autres photos disponibles dans sa bibliothèque" : "L'utilisatrice a déjà ces photos (décrites automatiquement)"} :
${others.map((ph) => `- photo ${ph.index} : ${ph.description}`).join("\n")}
` : ""}
RÈGLES BIBLIOTHÈQUE :
- Pour chaque story non face cam, ${chosen.length > 0 ? "place d'abord les PHOTOS CHOISIES, puis regarde" : "regarde D'ABORD"} si une photo ci-dessus illustre VRAIMENT ce moment précis. Si oui, mets son numéro dans "photo_index". Sinon "photo_index": null.
- ${chosen.length > 0 ? "Pour les photos NON choisies, correspondance EXIGEANTE" : "Correspondance EXIGEANTE"} : la photo doit coller à la scène de CETTE story. Un rapport vague ou décoratif = null (on cherchera ailleurs), c'est mieux qu'une photo hors sujet.
- Ne mets JAMAIS le même "photo_index" sur deux stories de la séquence.
- Remplis quand même "photo_directive" et "photo_query_en" dans tous les cas (l'utilisatrice peut préférer reprendre la photo elle-même).`;
  })() : ""}

TYPES DE HOOKS STORIES (adaptés à l'angle choisi) :
1. Coulisses en direct : une action précise, en cours, nommée avec le vocabulaire du métier.
2. Confidence / pensée à voix haute : la prise de conscience elle-même, sans moment inventé (pas de "ce matin" fabriqué).
3. Question communautaire : une question au groupe sur une situation concrète du sujet.
4. Retour d'expérience : l'erreur d'avant ou ce qu'on aurait voulu savoir, sans durée inventée.
5. Storytime : un vécu réel fourni par l'utilisatrice, anonymisé. Si rien n'est fourni, ne pas fabriquer de date ni d'anecdote : généraliser.
6. Prise de position : le constat précis qui dérange, ancré dans le sujet, pas une formule d'agacement générique.
Dans tous les cas : ne recycle JAMAIS une amorce vue ailleurs, écris la phrase à partir d'un détail de CE sujet.
${address.hook}

GARDE-FOUS OBLIGATOIRES :
1. Max 10 stories par séquence
2. TOUJOURS au moins 1 sticker interactif (DM>Question>Sondage>Slider>Lien)
3. Sticker lien JAMAIS sur story 1 ou 2, toujours avant-dernière ou dernière
4. JAMAIS de CTA agressif. Toujours en mode permission : une invitation qu'on peut ignorer sans gêne, formulée avec un mot ou une image de la séquence (pas une formule de CTA réutilisable telle quelle)
5. Si face cam → TOUJOURS mentionner sous-titres
6. Story 1 = hook fort (c'est là que l'audience décroche)
7. Publier TOUTE la séquence à la suite, dans un seul bloc. Choisis UN créneau conseillé (matin, midi ou soir) dans "publication_time" ; ne répartis jamais les stories d'une même histoire sur plusieurs moments.
8. ${VOIX_ORALE_STORIES} ${address.oral}
9. Écriture inclusive point médian
10. Expressions naturelles et orales, variées d'une story à l'autre : évite de réutiliser toujours la même cheville
11. Aparté entre parenthèses : 1 MAXIMUM par séquence, jamais dans deux stories de suite, et uniquement s'il dit quelque chose de propre à ce sujet (un aparté qui pourrait aller dans n'importe quelle story est un tic : supprime-le)
12. JAMAIS de jargon marketing
13. JAMAIS de tiret cadratin (—)
14. PRIORITÉ ABSOLUE : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature, imite les patterns de structure et de ton.
15. Ne JAMAIS utiliser les expressions interdites du profil de voix.
16. Le résultat doit sonner comme si l'utilisateur·ice l'avait écrit.
17. ${STORIES_QUICK_RULE}
18. La longueur du texte de chaque story doit être RÉALISTE : une story texte = quelques phrases complètes et parlées (350 caractères au plus) ; si c'est trop long, découpe en deux stories, ne compresse jamais en fragments pour tenir. Une story face cam = 15-30 secondes de parole (50-80 mots). Ne génère pas des pavés pour des stories.

Réponds en JSON strict :
{
  "structure_type": "...",
  "structure_label": "...",
  "narrative_angle": "coulisses | reflexion | interpellation | conseil_vecu | storytime_client | coup_de_gueule",
  "total_stories": N,
  "publication_time": "matin | midi | soir",
  "estimated_time": "X min",
  "stickers_used": ["sondage", "question_ouverte"],
  "garde_fou_alerte": ${p.gardeFouAlerte ? `"${p.gardeFouAlerte.replace(/"/g, '\\"')}"` : "null"},
  "personal_tip": null,
  "stories": [
    {
      "number": 1,
      "role": "Hook",
      "format": "photo",
      "format_label": "📸 Photo avec texte",
      "text": "...",
      "sticker": {
        "type": "sondage",
        "label": "Sondage",
        "options": ["Oui", "Non"]
      },
      "visual": {
        "title_pill": null,
        "mot_cle": "[story 1 seulement : le mot fort de l'accroche, recopié exactement ; null ailleurs]",
        "photo_directive": "[quelle photo prendre/choisir, concrète, ancrée dans l'activité]",
        "photo_query_en": "[2-4 mots anglais, scène photographiable]"${p.photo_catalog && p.photo_catalog.length > 0 ? `,
        "photo_index": null` : ""}
      },
      "tip": "...",
      "face_cam": false,
      "sous_titres_needed": false
    }
  ]
}

IMPORTANT :
- Story 1 texte ou photo : "text" = l'accroche seule (une seule version, jamais un slogan séparé en plus) ; la suite commence en story 2. Story 1 face cam : ses premiers mots sont le hook, puis elle continue naturellement
- CHAQUE story a un "visual", SAUF les stories face cam : si "face_cam": true → "visual": null (c'est une vidéo à filmer, pas un visuel à rendre)
- Le champ "narrative_angle" indique l'angle de narration choisi pour la séquence
- Pas de markdown dans les valeurs JSON

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;
}
