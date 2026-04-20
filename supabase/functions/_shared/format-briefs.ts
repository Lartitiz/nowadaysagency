// Format-specific depth mandates for the `generate` step.
// Extracted verbatim from index.ts to keep prompt quality identical.
// Each function returns the exact same string literal that was previously inlined.

import { ANTI_BROETRY_LINKEDIN, LINKEDIN_TEMPLATES } from "./copywriting-prompts.ts";

export function carouselBrief(): string {
  return `FORMAT : CARROUSEL INSTAGRAM (8 slides minimum)

══ AVANT D'ÉCRIRE : LE CARROUSEL N'EST PAS UNE LISTE ══

Le piège n°1 des carrousels IA : transformer un sujet en "5 conseils" ou "7 erreurs" où chaque slide est un tip numéroté. Ce format est mort. L'algorithme le catégorise comme générique, le lecteur le scrolle.

Un bon carrousel raconte un MOUVEMENT : situation → tension → compréhension → ouverture.
Chaque slide fait AVANCER ce mouvement. Pas "Conseil 1... Conseil 2..." mais "Voilà ce qui se passe... Voilà pourquoi... Voilà ce que ça change...".

AVANT DE RÉDIGER, identifie :

1. QUEL EST L'ARC NARRATIF ?
   - Récit d'expérience → situation de départ → ce qui s'est passé → ce que ça a révélé
   - Déconstruction → croyance répandue → pourquoi elle existe → pourquoi elle est fausse → ce qui est vrai
   - Coulisses/process → le résultat visible → ce qu'on ne voit pas derrière → les choix et les galères → la leçon
   - Prise de position → constat terrain → pourquoi ça pose problème → ce que ça devrait être → invitation

2. QUEL EST LE HOOK VISUEL (Slide 1) ?
   Pas un titre ("5 erreurs de..."). Une PHRASE qui crée une tension, une curiosité, un décalage.
   ❌ "5 erreurs de communication à éviter"
   ❌ "Comment créer du contenu qui engage"
   ✅ "J'ai perdu ma meilleure cliente en mars."
   ✅ "Tout le monde te dit de poster tous les jours. C'est probablement le pire conseil."
   ✅ "Ce que j'aurais aimé savoir avant de lancer mon premier carrousel."

3. OÙ EST LA PROFONDEUR ?
   Au moins 2 slides doivent contenir un DÉTAIL CONCRET : un chiffre, un cas client, une phrase entendue, un avant/après mesurable. C'est ce qui fait la différence entre un carrousel "tips qu'on a déjà lus 100 fois" et un carrousel "elle sait de quoi elle parle".

══ RÈGLES DE RÉDACTION ══

STRUCTURE DES SLIDES :
- Slide 1 (hook) : 1-2 phrases max, 12 mots max. Crée la tension. PAS de titre listicle.
- Slides 2-7 : chacune a un RÔLE dans l'arc narratif (pas un numéro de conseil).
  Chaque slide = 2-4 phrases qui DÉVELOPPENT le point. Pas un header + une ligne.
- Slide finale : punchline mémorable qui OUVRE (pas qui résume) + CTA léger.
- TOTAL : 1500-3000 caractères de contenu textuel (slides + caption).

SLIDE DE PROFONDEUR (obligatoire) :
Au moins 1 slide doit être un "zoom" : UN point creusé avec un exemple terrain, un cas réel, ou une analyse fine.

INTERDITS :
- Numéroter les conseils ("Conseil 1", "Erreur n°2", "Astuce 3")
- Slides d'une seule phrase ou d'un seul mot
- Toutes les slides de la même longueur (varier le rythme)
- Slide qui reformule la précédente
- Punchlines isolées style broetry

Formate le contenu avec des marqueurs clairs :
📌 SLIDE 1 : [contenu]
📌 SLIDE 2 : [contenu]
etc.
Après les slides, ajoute :
📝 CAPTION : [hook différent de slide 1 + corps + CTA + hashtags]`;
}

export function reelBrief(effectiveObjective: string | null): string {
  const base = `FORMAT : SCRIPT REEL (30-60 secondes)

══ AVANT D'ÉCRIRE : UN REEL = UNE SEULE IDÉE ══

Le reel n'est pas un carrousel raccourci ni un post filmé. C'est UNE idée 
percutante, développée à l'oral, en 30-60 secondes.

AVANT DE SCRIPTER, identifie :

1. QUEL EST LE SEUL POINT que le spectateur retient ?
   Si tu ne peux pas le résumer en 1 phrase, le reel est trop dispersé.
   Pas "5 conseils pour..." mais "le truc que personne ne dit sur [sujet]".

2. QUELLE SITUATION CONCRÈTE illustre ce point ?
   Un reel qui RACONTE une scène (un moment, un échange, un avant/après) 
   fonctionne 10x mieux qu'un reel qui EXPLIQUE un concept.

3. QUEL EST LE HOOK DES 3 PREMIÈRES SECONDES ?
   Le spectateur décide en 1-3 secondes de rester ou scroller. Le hook 
   doit créer une TENSION immédiate.
   ❌ "Aujourd'hui je vais te parler de..."
   ❌ "3 erreurs à éviter sur Instagram"
   ✅ "Arrête de poster tous les jours." (affirmation choc)
   ✅ "Ma cliente avait 10K abonnés et zéro client." (fait concret)
   ✅ "'C'est trop cher.' En vrai, c'est pas le prix le problème." (objection retournée)

4. QUEL EST LE MOUVEMENT NARRATIF ?
   Avant d'écrire, identifie le déplacement :
   situation → déplacement de perspective → nouvelle compréhension.
   Au moins UN moment dans le corps doit créer un déplacement :
   nouvelle info, contre-pied, zoom sur un détail inattendu.
   Ce n'est PAS un "retournement" dramatique obligatoire, c'est un CHANGEMENT
   de regard sur le sujet.

5. À QUI CE REEL DONNE ENVIE D'ÊTRE ENVOYÉ EN DM, ET POURQUOI ?
   Les sends en DM sont le signal algorithmique LE PLUS FORT pour atteindre
   les non-abonnés sur Instagram. Un Reel qui ne donne envie d'être envoyé
   à personne reste invisible.
   
   Avant d'écrire, identifie EXPLICITEMENT :
   - QUI : à quelle personne précise (pas "ma communauté", pas "les femmes
     entrepreneures") quelqu'un aurait envie d'envoyer ce Reel ?
     Exemple : "à une amie qui vient de lancer son freelance et galère
     à fixer ses prix", "au copain qui doute toujours de sa légitimité".
   - POURQUOI : quelle est la qualité INTRINSÈQUE qui déclenche le partage ?
     Trois leviers possibles (en choisir UN dominant) :
     • RECONNAISSANCE — "C'est exactement ce qu'elle vit en ce moment"
       (situation ultra-spécifique, scène vécue qui résonne)
     • VALIDATION — "Ça va lui faire du bien d'entendre ça"
       (un ressenti non-dit nommé, une permission donnée, une vérité libératrice)
     • CONTRE-INTUITION DÉBATTABLE — "Tiens, ça va la faire réagir"
       (prise de position qui bouscule un consensus, info qui mérite discussion)
   
   ❌ MAUVAIS critère send-worthy :
   - "Ce Reel sera utile à beaucoup de gens" (trop large = personne envoie)
   - "Mes abonnées vont aimer" (aimer ≠ envoyer)
   - "Il y a un CTA 'partage ce reel'" (le CTA explicite ne fonctionne pas seul)
   
   ✅ BON critère send-worthy :
   - "Toute personne qui a déjà baissé son prix par culpabilité va vouloir
     l'envoyer à une amie qui fait pareil" → reconnaissance + validation
   - "Quiconque pense que poster tous les jours est obligatoire va vouloir
     en débattre avec son binôme de travail" → contre-intuition débattable
   
   IMPORTANT : la qualité send-worthy doit être INTRINSÈQUE au contenu,
   pas un CTA explicite "partage ce reel". Le viewer envoie parce que le
   contenu lui-même mérite d'être partagé, pas parce qu'on le lui demande.

══ RÈGLES DE SCRIPT ══

STRUCTURE :
- Hook (0-3s) : texte à l'écran + ce que tu dis. 1 phrase max. TENSION.
  PRÉFÉRENCE FORTE : commencer par "Je" ou "Ma/Mon" (vécu personnel).
  Le hook doit ancrer le spectateur dans une expérience, pas dans un concept.
  ❌ "Une com' complète en une minute" → ✅ "J'ai créé une com' complète en une minute"
- Corps (3-45s) : développe avec une SCÈNE CONCRÈTE. Raconte, ne liste pas.
  Chaque section du corps = 2-4 phrases COMPLÈTES de texte parlé.
  PAS de one-liners enchaînés. Le corps raconte UNE scène, pas 3 micro-conseils.
- CTA (45-60s) : fermeture naturelle. Question ou invitation.

OVERLAY — 3 RÔLES POSSIBLES (choisir 1 par section) :
- ANCRAGE : mot-clé ou concept qui reste à l'écran (ex: "POSITIONNEMENT")
- CONTREPOINT : info que le texte parlé ne dit PAS (un chiffre, un fait complémentaire)
- PUNCHLINE : chute visuelle, phrase d'impact différente du texte parlé
INTERDIT : overlay qui résume ou condense le texte parlé. L'overlay COMPLÈTE, il ne RÉPÈTE PAS.
3-8 mots max par overlay.

══ RÈGLE SPÉCIALE FRAME 1 (overlay du hook 0-3s) ══

50% des viewers regardent en MUTE. L'overlay de la frame 1 doit fonctionner SEUL,
sans le son. Un viewer qui ne voit QUE ce texte doit comprendre la promesse du Reel
et avoir envie de rester pour la suite.

L'overlay frame 1 n'est PAS un mot-clé décoratif. C'est un MINI-HOOK lisible seul.
Il doit contenir : soit une promesse concrète, soit une situation reconnaissable,
soit une affirmation contre-intuitive. JAMAIS juste un thème.

❌ MAUVAIS overlay frame 1 (mot-clé seul, sans contexte) :
- "POSITIONNEMENT"
- "Stratégie Instagram"
- "Mes conseils"
- "Astuce du jour"
→ Le viewer en mute ne sait pas pourquoi rester. Il scroll.

✅ BON overlay frame 1 (autoporteur, donne envie de rester) :
- "10K abonnés. Zéro client."
- "Pourquoi j'ai supprimé tous mes posts."
- "Ta cliente ne lit pas tes carrousels."
- "Le truc que personne ne te dit sur le pricing."
→ Le viewer en mute comprend l'enjeu et reste pour comprendre.

Cette règle s'applique UNIQUEMENT à l'overlay de la section 0-3s (hook).
Les overlays des sections suivantes peuvent rester en mode ancrage/contrepoint/punchline classique.

FORMAT DE SORTIE :
- Indique le timing, le texte parlé, le texte overlay (+ son rôle : ancrage/contrepoint/punchline), 
  les cuts visuels et le cadrage pour chaque section.
- TOTAL : 150-300 mots de texte parlé (rythme parlé = ~150 mots/minute).

══ EXEMPLE QUALITÉ ══

❌ SCRIPT GÉNÉRIQUE (listicle filmé) :
Hook: "3 erreurs sur Instagram"
Corps: "Erreur 1 : pas de stratégie. Erreur 2 : pas de régularité. Erreur 3 : pas de CTA."
→ Zéro scène, zéro tension, zéro déplacement. C'est un post lu à voix haute.

✅ SCRIPT QUI RACONTE (scène + déplacement) :
Hook: "Ma cliente avait 10K abonnés et zéro client."
Corps: "Je lui ai demandé : 'Tu postes pour qui ?'. Silence.
Elle postait 5 fois par semaine. Des tips, des infographies, des reels tendance.
Mais son audience idéale, elle scroll pas des tips. Elle cherche quelqu'un 
qui comprend SON problème. On a tout arrêté. 2 posts par semaine. 
Chaque post = une situation que sa cliente vit."
CTA: "Résultat 3 mois plus tard : 4 appels découverte par semaine."
→ Une scène, un déplacement narratif, un résultat concret.

INTERDITS :
- Script qui LISTE des conseils au lieu de RACONTER
- Hook descriptif ("Aujourd'hui on va parler de...")
- Hook impersonnel sans sujet humain ("Une stratégie simple", "3 étapes pour...")
- Texte overlay qui répète mot pour mot le texte parlé
- Script qu'on ne peut pas dire à voix haute naturellement
- One-liners enchaînés sans lien narratif`;

  if (effectiveObjective === "visibilite") {
    return base + `

══ CALIBRAGE DURÉE — OBJECTIF VISIBILITÉ (REACH) ══

Pour ce Reel, l'objectif est d'atteindre des NON-ABONNÉS. L'algo Instagram pousse
vers les non-followers les Reels avec un FORT COMPLETION RATE (% de viewers qui
regardent jusqu'au bout). Donc : court = mieux.

CONTRAINTES SPÉCIFIQUES :
- DURÉE CIBLE : 15-25 secondes (PAS 30-60s comme le format standard).
- TEXTE PARLÉ : 40-80 mots maximum (PAS 150-300 mots).
- STRUCTURE RAMASSÉE :
  • Hook (0-3s) : 1 phrase ultra-directe, overlay autoporteur.
  • Corps (3-18s) : UNE seule scène ou UN seul déplacement de perspective.
    Pas de mise en contexte longue. On entre direct dans le vif.
  • CTA (18-25s) : 1 phrase de chute. Question courte ou affirmation finale.
- AUCUNE digression. Aucune nuance. UNE idée, UN angle, UN punch.
- Le viewer doit pouvoir tout consommer en moins de 25 secondes.

Privilégier la structure REEL FACE CAM ramassée OU REEL HOOK LOOP court.
Éviter REEL VOIX OFF + B-ROLL (trop long pour ce format).`;
  }

  if (effectiveObjective === "engagement" || effectiveObjective === "vente" || effectiveObjective === "credibilite") {
    return base + `

══ CALIBRAGE DURÉE — OBJECTIF ${effectiveObjective.toUpperCase()} (NURTURE) ══

Pour ce Reel, l'objectif est de NOURRIR la relation avec l'audience existante
(abonnés, prospects chauds). L'algo autorise et récompense les Reels plus longs
quand la rétention tient. On peut développer la scène et le récit.

CONTRAINTES SPÉCIFIQUES :
- DURÉE CIBLE : 45-75 secondes (storytelling assumé).
- TEXTE PARLÉ : 110-190 mots (rythme parlé naturel ~150 mots/min).
- STRUCTURE NARRATIVE DÉVELOPPÉE :
  • Hook (0-3s) : ouvre une boucle de curiosité forte.
  • Corps (3-60s) : développe la SCÈNE COMPLÈTE — contexte, déclic, déplacement,
    résolution. Le viewer doit ressentir une progression émotionnelle.
  • CTA (60-75s) : invitation cohérente avec l'objectif (dialogue / offre / approfondissement).
- ATTENTION : ne JAMAIS dépasser 90 secondes (au-delà = pénalité de distribution).
- Si le sujet ne porte pas 60s de contenu dense, RACCOURCIR plutôt que diluer.

Toutes les structures Reel sont possibles (FACE CAM, VOIX OFF + B-ROLL, HOOK LOOP).`;
  }

  return base;
}

export function storiesBrief(): string {
  return `FORMAT : SÉQUENCE STORIES (5-7 stories)

══ AVANT D'ÉCRIRE : LES STORIES, C'EST UN MESSAGE VOCAL ÉCRIT ══

Les stories sont le format LE PLUS INTIME d'Instagram. Le spectateur les regarde généralement seul, souvent dans un moment d'attente, et il peut sortir à tout moment. C'est exactement comme un message vocal d'une amie qui te raconte un truc en marchant.

AVANT DE RÉDIGER, identifie :

1. QU'EST-CE QUE TU NE DIRAIS À PERSONNE D'AUTRE QU'À UNE AMIE PROCHE ?
   Les bonnes stories partagent un truc qu'on ne mettrait jamais dans un post : un doute, une réaction sur le vif, une observation banale qu'on trouve drôle, un échange qui nous a marqué·e.
   ❌ "Voici 5 conseils pour..." (c'est un post, pas une story)
   ✅ "Bon, je viens de finir un appel client et il faut que je vous raconte un truc" (intimité)

2. QUELLE EST LA VRAIE QUESTION QUE TU TE POSES ?
   La meilleure interaction (sondage/question) ne sert PAS à animer la communauté. Elle sert à apprendre quelque chose que TU veux savoir.
   ❌ "Quel est votre format préféré ? A) Carrousel B) Reel" (sondage générique pour likes)
   ✅ "Vous faites comment quand un client vous demande de baisser vos prix ?" (vraie question)

3. OÙ EST LA TENSION ENTRE LES STORIES ?
   Une bonne séquence n'est pas 5 stories indépendantes. C'est UN fil narratif qui donne envie de taper pour voir la suite. Chaque story laisse une mini-tension.

══ RÈGLES DE RÉDACTION ══

STRUCTURE NARRATIVE :
- Story 1 : amorce qui crée la curiosité. Pas de contexte, direct dans le vif. "Bon, faut que je vous raconte" / "OK, je viens de comprendre un truc"
- Stories 2-4 : développement avec ton naturel, comme si tu parlais à voix haute. Chaque story = 1 écran, 2-4 lignes MAX + indication visuelle.
- Story 4 ou 5 : INTERACTION (sondage, question, quiz) qui révèle quelque chose. Pas une animation creuse.
- Story finale : conclusion qui ouvre, pas qui ferme. Question, invitation, ou cliff-hanger pour la prochaine séquence.

POUR CHAQUE STORY, INDIQUE :
- Le TEXTE affiché (court, comme une bulle de pensée)
- Le TYPE : texte seul, photo+texte, vidéo, sondage, quiz, question ouverte
- L'AMBIANCE visuelle si pertinent (selfie cuisine, photo bureau, capture d'écran...)

INTERDITS :
- Stories qui sonnent comme un mini-post (formel, structuré, "voici X conseils")
- Sondages génériques pour faire "interactif"
- Conclusion qui résume au lieu d'ouvrir
- Stories trop longues (la lecture doit prendre 3-5 secondes max par story)
- Ton "marketing" : c'est une amie, pas une experte qui vend`;
}

export function linkedinBrief(editorialFormat: string | null): string {
  const linkedinTemplateContent = editorialFormat && (LINKEDIN_TEMPLATES as any)[editorialFormat]
    ? (LINKEDIN_TEMPLATES as any)[editorialFormat]
    : "";

  return `${ANTI_BROETRY_LINKEDIN}

FORMAT : POST LINKEDIN (1300-2000 caractères)

══ ÉTAPE 1 : AVANT D'ÉCRIRE, IDENTIFIE CES 3 ÉLÉMENTS ══

Avant de rédiger une seule ligne, tu DOIS répondre mentalement à ces 3 questions :

1. QUELLE CONVICTION ou ÉMOTION porte ce post ?

   Chaque bon post LinkedIn est porté par un ressort émotionnel : fierté d'un aboutissement, indignation face à un constat, enthousiasme pour une découverte, gratitude envers un parcours, frustration face à une norme...

   → Si tu ne trouves pas l'émotion, le post sera un communiqué. Cherche : qu'est-ce qui ANIME l'auteur·ice sur ce sujet ?

2. QUEL DÉTAIL CONCRET ancre le post dans le réel ?

   Un chiffre précis, une date, un lieu, une phrase entendue, une durée, un nom d'outil, un avant/après mesurable. C'est le détail qui fait que le lecteur se dit "c'est du vécu" et pas "c'est du ChatGPT".

   → Si le sujet ne contient pas de détail, INVENTE-EN PAS. Pose la question dans les réponses de l'utilisatrice, ou ancre dans le contexte branding.

3. QUEL EST LE MOUVEMENT NARRATIF ?

   Un post LinkedIn n'est pas une fiche info. C'est un MOUVEMENT qui embarque :

   - Annonce/événement → ne PAS décrire l'événement. Raconter le CHEMIN qui y mène ou la CONVICTION derrière.

   - Partage d'expertise → ne PAS lister des conseils. Partir d'un CONSTAT TERRAIN et creuser le POURQUOI.

   - Milestone/bilan → ne PAS énumérer les accomplissements. Choisir UN fil rouge émotionnel (ce qui n'a pas changé, ce qui a été le plus dur, ce qu'on referait).

   - Collaboration/rencontre → ne PAS présenter les personnes. Raconter ce que cette rencontre a PROVOQUÉ ou RÉVÉLÉ.

${linkedinTemplateContent ? `STRUCTURE ÉDITORIALE CHOISIE :\n${linkedinTemplateContent}\n\nSuis cette structure pour organiser le post.` : ""}

══ ÉTAPE 2 : ÉCRITURE ══

ACCROCHE (< 210 caractères) :

- Un FAIT CONCRET ou une ÉMOTION SINCÈRE. Jamais une promesse marketing, un teaser, ou un slogan.

- Exemples de patterns qui marchent : "Ça y est, [fait concret] !" / "Il y a [durée], [situation de départ]. Aujourd'hui, [contraste]." / "Quand [situation concrète], [réaction ou constat]."

- Exemples de patterns INTERDITS : "[Sujet] n'aura plus de secrets pour vous !" / "Je voulais partager avec vous..." / "Et si on parlait de [sujet] ?"

CORPS :

- LinkedIn = conversation entre pro. Le ton est direct, chaleureux, engagé. L'oral est OK : "en vrai", "le truc c'est que", "bon", "franchement".

- 2-3 paragraphes de prose fluide. UNE idée creusée, pas 5 survolées.

- Chaque paragraphe apporte du NOUVEAU. Si tu reformules le paragraphe précédent, coupe.

- Le rythme vient du CONTRASTE (longue phrase qui déroule → courte qui claque), pas de rafales.

- PRENDS POSITION. Un bon post LinkedIn dit avec quoi l'auteur·ice n'est PAS d'accord, ce qui l'étonne, ce qui le/la dérange. Pas de "chacun son avis".

FIN :

- Question PRÉCISE liée au sujet, ou rien du tout si le texte se suffit.

- La dernière phrase apporte du NOUVEAU ou laisse une tension ouverte.

- JAMAIS de résumé, JAMAIS de crescendo rhétorique.

FORMAT :

- 0-2 emojis max, jamais en puces

- 0-2 hashtags niche en fin

- Écriture inclusive avec point médian

- Pas de tirets cadratin (—), utiliser : ou ;

- DENSE : 1300-2000 caractères. Zéro remplissage.

══ INTERDITS ABSOLUS ══

- Storytelling fabriqué ("Et là, tout a basculé", "Le déclic ?", "Ce jour-là j'ai compris")

- Phrases courtes en rafale pour l'effet dramatique

- Listes à puces inspirationnelles

- Promesses marketing en accroche

- "Et vous, qu'en pensez-vous ?" comme CTA

- Flex déguisé en humilité

- Étirer une idée de 3 phrases sur 8 paragraphes

- Post qui DÉCRIT un sujet sans PRENDRE POSITION dessus`;
}

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

export function newsletterBrief(): string {
  return `FORMAT : NEWSLETTER / EMAIL (1500-3000 caractères)

══ AVANT D'ÉCRIRE : LA NEWSLETTER N'EST PAS UN POST RALLONGÉ ══

La newsletter est le format le plus INTIME. Le lecteur a donné son email : 
il a dit "oui, je veux t'entendre". C'est une conversation privée, 
pas un broadcast.

AVANT DE RÉDIGER, identifie :

1. QUELLE EST L'HISTOIRE PERSONNELLE qui porte ce sujet ?
   Chaque bonne newsletter part d'un VÉCU : un moment de la semaine, 
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
- Patterns qui marchent : question courte, constat décalé, confession
- ❌ "Ma newsletter #12" / "Les news du mois"
- ✅ "J'ai failli tout annuler" / "Le conseil que je regrette d'avoir suivi"

INTRO (2-3 phrases) :
- Direct dans le vif. Pas de "Bonjour, j'espère que tu vas bien".
- Commencer par le VÉCU : la scène, le moment, la phrase entendue.
- ❌ "Aujourd'hui je voulais te parler de..."
- ✅ "Mardi, une cliente m'a renvoyé son brouillon avec ce commentaire : '...'"

CORPS :
- Développe en profondeur. C'est le format France Culture de la com.
- Apartés personnels en italique ou entre parenthèses.
- Au moins 2 exemples concrets ou anecdotes.
- Des nuances, des "oui mais", des zones grises. La newsletter n'est pas 
  un cours : c'est une réflexion partagée.

CONCLUSION :
- JAMAIS de résumé ("Pour résumer, retiens que...").
- Une ouverture : question qui reste, tension non résolue, invitation.
- ✅ "Je n'ai pas la réponse. Mais je crois que la question mérite qu'on s'y arrête."
- ❌ "En résumé, les 3 points à retenir sont..."

CTA : doux, en lien avec le sujet. Pas de vente agressive.

LONGUEUR : vise 2000+ caractères. La profondeur justifie la longueur ici.`;
}

export function photoCaptionBrief(photo_description: string | null | undefined): string {
  return `FORMAT : LÉGENDE PHOTO INSTAGRAM (400-800 caractères)

══ AVANT D'ÉCRIRE : LA LÉGENDE EST LE HORS-CHAMP DE LA PHOTO ══

La légende ne décrit JAMAIS la photo. La photo se suffit visuellement. La légende raconte ce que la photo NE PEUT PAS montrer : le contexte invisible, l'émotion derrière le geste, ce qui s'est passé juste avant ou juste après.

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
- 1 imperfection humaine (aparté, autocorrection, mot familier)

FIN :
- CTA doux : invitation, question, ou rien si la phrase finale se suffit
- JAMAIS de vente agressive ni de promesse marketing

FORMAT :
- 400-800 caractères. La photo fait la moitié du travail.
- 5-10 hashtags niche en fin

INTERDITS :
- Décrire ce qu'on voit (la photo le fait)
- "Voici / Voilà / Aujourd'hui je vous partage" en accroche
- Ton "fiche produit" ou "présentation"
- Légende qui pourrait fonctionner avec n'importe quelle autre photo`;
}

export function captionBrief(effectiveObjective: string | null): string {
  const lengthBlock = effectiveObjective === "visibilite" || effectiveObjective === "visibilité" ? `
══ OBJECTIF : VISIBILITÉ ══
LONGUEUR : 300-600 caractères. Court, percutant. L'idée doit claquer en quelques phrases.
Le hook fait tout le travail. Le corps développe UNE seule idée. Pas de remplissage.
Privilégie une prise de position ou un constat décalé qui donne envie de partager.
` : effectiveObjective === "engagement" ? `
══ OBJECTIF : ENGAGEMENT ══
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

2. QUEL EST LE MOMENT CONCRET qui ancre ce que tu veux dire ?
   Pas "en général" mais "la semaine dernière", "hier", "il y a 2 ans", "ce matin". Le concret rend la voix crédible.

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
- Au moins 1 exemple concret, 1 anecdote ou 1 chiffre.
- Apartés entre parenthèses *(comme ça)* ou en italique pour la respiration humaine.
- Bucket brigades naturelles : "Sauf que", "Le truc c'est que", "En vrai", "Bon"
- 1 imperfection humaine par caption : autocorrection, parenthèse, mot familier

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
