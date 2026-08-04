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

export interface ReelBriefParams {
  effectiveObjective?: string | null;
  face_cam?: string | null;
  time_available?: string | null;
  is_launch?: boolean | null;
  selected_hook?: any;
  pre_gen_answers?: { anecdote?: string; emotion?: string; conviction?: string } | null;
  subject?: string | null;
  editorial_angle?: string | null;
  content_structure?: string | null;
  inspiration_context?: string | null;
}

/**
 * reelBrief, accepte SOIT une string (legacy: objectif seul), SOIT un objet ReelBriefParams complet.
 * Quand des params reels-spécifiques sont fournis (subject, selected_hook, pre_gen_answers, etc.),
 * impose le JSON de sortie complet (caption, hashtags, cover_text, alt_text, amplification_stories, checklist).
 */
export function reelBrief(arg: string | null | ReelBriefParams = null): string {
  // Backward-compat: accept (effectiveObjective: string | null) signature
  const params: ReelBriefParams =
    arg && typeof arg === "object" ? arg : { effectiveObjective: arg as string | null };
  const effectiveObjective = params.effectiveObjective ?? null;
  const base = `FORMAT : SCRIPT REEL (30-60 secondes)

══ AVANT D'ÉCRIRE : UN REEL = UNE SEULE IDÉE ══

Le reel n'est pas un carrousel raccourci ni un post filmé. C'est UNE idée 
percutante, développée à l'oral, en 30-60 secondes.

══ PROFONDEUR DE RÉFLEXION OBLIGATOIRE ══

Un reel n'est PAS une liste de constats filmée. C'est une réflexion qui CREUSE
un sujet en 30-60s, comme une amie qui prend le temps de t'expliquer ce qu'elle
a compris. La densité de pensée doit être COMPARABLE à celle d'un carrousel,
mais dite à l'oral, pas écrite.

3 COUCHES OBLIGATOIRES dans le script (peuvent se chevaucher entre sections) :

1. LE SYMPTÔME : ce qu'on observe, ce qui coince, le constat de surface.
   (1 section, souvent le hook.)

2. LE MÉCANISME, POURQUOI ça se passe comme ça : le rouage caché, le truc
   psychologique, la croyance de fond, la mécanique économique/sociale derrière.
   (1-2 sections, le CŒUR du reel. C'est ici que se joue la profondeur.)

3. LA REFORMULATION, comment on regarde ça AUTREMENT : le déplacement de
   regard, la nuance, le contre-pied, la conséquence pratique nouvelle.
   (1 section, souvent le CTA ou juste avant.)

TEST DÉCISIF : si tu enlèves la couche "mécanisme", il reste un constat + un
conseil = LISTICLE FILMÉ. C'est cassé. Recommence.

══ SINGULARITÉ DE L'IDÉE (aussi importante que la profondeur) ══

TEST : si n'importe quel compte de la même niche pouvait sortir ce script tel
quel, il est raté. Au moins UNE idée du script doit faire dire "j'avais jamais
vu ça comme ça".

- Le MÉCANISME (couche 2) porte sur LE SUJET : une mécanique économique,
  sectorielle, culturelle, un fonctionnement concret du métier ou du marché.
  PAS un décryptage psychologique de la spectatrice ("tu as peur de…", "ta
  posture de…", "ton cerveau te dit…"). Un mécanisme psychologique n'est
  autorisé QUE s'il est nommé précisément (biais cognitif identifiable) ET
  relié à un fait concret du métier.
- Sans vécu fourni : ancre l'idée dans UN élément spécifique du contexte de
  marque (son process, sa matière, ses contraintes réelles, sa clientèle) pour
  la rendre NON-TRANSPOSABLE à un autre compte.
- INTERDIT de livrer le conseil consensuel de la niche tel quel (ex : "ta bio
  doit parler de ta cliente, pas de toi" : vu dix mille fois). Si le sujet
  amène naturellement à ce conseil, creuse le POURQUOI inattendu, le
  contre-exemple honnête, ou l'angle contre-intuitif qui le renouvelle.

══ CE QU'ON BANNIT (ANTI-LISTICLE) ══

❌ Sections juxtaposées qui énumèrent ("d'abord X, puis Y, puis Z") sans
   creuser le pourquoi.
❌ Conseil parachuté sans explication du mécanisme ("la solution c'est X" →
   mais pourquoi ça marche ? d'où vient le problème vraiment ?).
❌ Schéma "hook constat → body conseil → CTA" : c'est plat. Il manque le
   "POURQUOI personne ne le voit".
❌ Phrases qui sonnent comme des slogans LinkedIn ("Le secret c'est X",
   "Voilà la vérité", "Spoiler : ça marche pas").
❌ Conclusion qui répète le hook au lieu de le RETOURNER.
❌ Texte parlé qui ressemble à un post écrit lu à voix haute.

══ MARQUEURS DE PROFONDEUR ORALE (utilise-en au moins 2) ══

Au-delà des "alors", "tu vois" cosmétiques, il faut des marqueurs qui
SIGNALENT qu'on est en train de creuser une idée :

• Bascule de regard : "et en vrai, le truc qu'on voit pas c'est que…",
  "ce qu'il se passe vraiment c'est…", "le vrai problème c'est pas X, c'est Y".
• Mécanisme révélé : "tu sais pourquoi ? parce que…", "ce qui se joue
  là-dessous c'est…", "la mécanique c'est…".
• Contre-pied assumé : "sauf que…", "et c'est là que ça devient intéressant…",
  "en fait on s'est trompé d'endroit…".
• Nuance honnête : "alors attention, je dis pas que…", "c'est pas aussi
  simple, mais…".

Ces marqueurs ≠ remplisseurs. Chacun introduit une VRAIE idée nouvelle.

══ ORALITÉ : MONOLOGUE, PAS SCRIPT TÉLÉ ══

L'utilisatrice va lire ce script FACE CAM, en une prise, comme si elle parlait
à une amie en visio. Le découpage par sections est TECHNIQUE (pour le tournage),
mais le texte parlé doit s'enchaîner comme UN SEUL monologue continu.

CONTINUITÉ ENTRE SECTIONS, règle stricte :
- Le texte_parle de chaque section body DOIT commencer par un connecteur qui
  enchaîne sur la section précédente ("Et là…", "Sauf que…", "Le truc c'est
  que…", "Donc…", "Attends…").
- Première phrase de chaque section ≠ phrase autonome qu'on pourrait poster.
  C'est la SUITE de la phrase précédente.
- Hook + body 1 = paire question/réponse (ou affirmation/preuve), pas 2
  affirmations indépendantes.
- Si tu peux supprimer une section sans casser le sens du reste → elle est
  mal écrite, elle ne s'enchaîne pas.

L'oral naturel inclut ~25-30% de mots-outils ("alors", "donc", "tu vois",
"en fait", "le truc c'est"). Ne les compte PAS comme du gras à supprimer.

AVANT D'ÉCRIRE, identifie aussi :

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
   Au moins UN moment dans le corps doit créer un déplacement.

5. À QUI CE REEL DONNE ENVIE D'ÊTRE ENVOYÉ EN DM, ET POURQUOI ?
   Trois leviers possibles (en choisir UN dominant) :
     • RECONNAISSANCE : "C'est exactement ce qu'elle vit"
     • VALIDATION : "Ça va lui faire du bien d'entendre ça"
     • CONTRE-INTUITION DÉBATTABLE : "Tiens, ça va la faire réagir"
   La qualité send-worthy doit être INTRINSÈQUE au contenu, pas un CTA explicite.

══ RÈGLES DE SCRIPT ══

STRUCTURE :
- Hook (0-3s) : texte à l'écran + ce que tu dis. 1 phrase max. TENSION.
  PRÉFÉRENCE FORTE : commencer par "Je" ou "Ma/Mon" (vécu personnel).
  ❌ "Une com' complète en une minute" → ✅ "J'ai créé une com' complète en une minute"
- Corps (3-45s) : développe avec une SCÈNE CONCRÈTE + le MÉCANISME.
  Chaque section body = 25-50 mots de texte parlé (oral dense, pas
  télégraphique). Au moins UNE section body explique le POURQUOI (mécanisme).
- CTA (45-60s) : reformulation finale. Pas de répétition du hook.

OVERLAY, 3 RÔLES POSSIBLES (choisir 1 par section) :
- ANCRAGE : mot-clé ou concept qui reste à l'écran (ex: "POSITIONNEMENT")
- CONTREPOINT : info que le texte parlé ne dit PAS (un chiffre, un fait complémentaire)
- PUNCHLINE : chute visuelle, phrase d'impact différente du texte parlé
INTERDIT : overlay qui résume ou condense le texte parlé. L'overlay COMPLÈTE, il ne RÉPÈTE PAS.
3-8 mots max par overlay.

══ RÈGLE SPÉCIALE FRAME 1 (overlay du hook 0-3s) ══

50% des viewers regardent en MUTE. L'overlay de la frame 1 doit fonctionner SEUL,
sans le son. C'est un MINI-HOOK lisible seul (promesse concrète, situation
reconnaissable, ou affirmation contre-intuitive).

❌ MAUVAIS : "POSITIONNEMENT" / "Stratégie Instagram" / "Mes conseils"
✅ BON : "10K abonnés. Zéro client." / "Pourquoi j'ai supprimé tous mes posts."

══ DENSITÉ DE TEXTE PARLÉ (règle d'or : 1 seconde ≈ 2,5 mots) ══

Le rythme parlé naturel est ~150 mots/minute, soit 2,5 mots par seconde.
La durée affichée DOIT découler du texte : secondes = total de mots ÷ 2,5.

- Reel court (15-30s) : 40-75 mots. La couche mécanisme reste obligatoire (en condensé).
- Reel moyen (30-60s) : 75-150 mots (marqueurs d'oralité inclus).
- Reel long (60-90s) : 150-220 mots. Profondeur pleine sur les 3 couches étalées.

AVANT de fixer "duree_cible" : compte les mots de TOUS les texte_parle, divise
par 2,5, et vérifie que le résultat correspond à la durée annoncée. Un script
de 200 mots annoncé "50 sec" est un MENSONGE : il dure 80 secondes en vrai, et
au-delà de 90 secondes l'algo pénalise la distribution.

Si tu dépasses le plafond de mots → COUPE dans le contexte et les redites,
jamais dans la couche "mécanisme". Si tu es sous le plancher → DÉVELOPPE la
couche "mécanisme", ne resserre PAS le reste.
Une section body de 8 mots = slogan, pas du parlé. Vise 25-50 mots par section body.

══ EXEMPLE AVANT / APRÈS ══

Sujet : "tarifer ses prestations".

❌ AVANT (listicle filmé, sans profondeur, sans oralité) :
Hook  : "Tu n'oses pas augmenter tes prix ?"
Body 1: "Tu te dis que tes clients vont fuir."
Body 2: "Mais en vrai, c'est l'inverse : les bons clients respectent les prix justes."
CTA   : "Augmente, tu verras."
→ 4 affirmations plates. Aucun mécanisme expliqué. Aucun connecteur oral. Plat.

✅ APRÈS (profondeur + oralité, 3 couches identifiables) :
Hook  : "Tu sais le truc bizarre avec les prix ? On pense que c'est une question
         de calcul. C'est pas ça."
Body 1: "En vrai, quand tu galères à fixer tes tarifs, c'est rarement un problème
         de marché. Le marché il s'en fout, il s'aligne. Le truc c'est que TOI,
         tu te demandes en boucle si tu vaux ça. Et cette question-là, elle se
         voit dans ta voix au moment où tu annonces le prix."
Body 2: "Et c'est ÇA que les clients captent. Pas le chiffre. L'hésitation derrière
         le chiffre. Ils achètent ta certitude, pas ton tarif. C'est pour ça que
         deux freelances avec le même tarif vendent pas pareil."
CTA   : "Donc avant de toucher à tes prix, regarde plutôt comment tu les dis.
         C'est là que tout se joue."
→ Symptôme (galère à tarifer) → Mécanisme (l'hésitation perçue) → Reformulation
   (regarde comment tu les dis). Connecteurs oraux ("en vrai", "le truc c'est
   que", "et c'est ÇA", "donc"). ~145 mots ≈ 58 secondes. Profondeur + monologue continu.

INTERDITS :
- Script qui LISTE des conseils au lieu de RACONTER + EXPLIQUER LE POURQUOI
- Hook descriptif ("Aujourd'hui on va parler de...")
- Hook impersonnel sans sujet humain
- Texte overlay qui répète mot pour mot le texte parlé
- Script qu'on ne peut pas dire à voix haute naturellement
- Sections juxtaposées sans connecteur oral
- Conseil sans mécanisme expliqué`;

  let calibrage = "";
  if (effectiveObjective === "visibilite") {
    calibrage = `

══ CALIBRAGE DURÉE : OBJECTIF VISIBILITÉ (REACH) ══

Pour ce Reel, l'objectif est d'atteindre des NON-ABONNÉS. L'algo Instagram pousse
vers les non-followers les Reels avec un FORT COMPLETION RATE (% de viewers qui
regardent jusqu'au bout). Donc : court = mieux.

CONTRAINTES SPÉCIFIQUES :
- DURÉE CIBLE : 15-25 secondes (PAS 30-60s comme le format standard).
- TEXTE PARLÉ : 40-80 mots maximum (25 secondes × 2,5 mots/s = 62 mots : reste sous la barre).
- STRUCTURE RAMASSÉE :
  • Hook (0-3s) : 1 phrase ultra-directe, overlay autoporteur.
  • Corps (3-18s) : UNE seule scène ou UN seul déplacement de perspective.
    Pas de mise en contexte longue. On entre direct dans le vif.
  • CTA (18-25s) : 1 phrase de chute. Question courte ou affirmation finale.
- AUCUNE digression. Aucune nuance. UNE idée, UN angle, UN punch.
- Le viewer doit pouvoir tout consommer en moins de 25 secondes.

Privilégier la structure REEL FACE CAM ramassée OU REEL HOOK LOOP court.
Éviter REEL VOIX OFF + B-ROLL (trop long pour ce format).`;
  } else if (effectiveObjective === "confiance" || effectiveObjective === "vente" || effectiveObjective === "credibilite") {
    calibrage = `

══ CALIBRAGE DURÉE : OBJECTIF ${effectiveObjective.toUpperCase()} (NURTURE) ══

Pour ce Reel, l'objectif est de NOURRIR la relation avec l'audience existante
(abonnés, prospects chauds). L'algo autorise et récompense les Reels plus longs
quand la rétention tient. On peut développer la scène et le récit.

CONTRAINTES SPÉCIFIQUES :
- DURÉE CIBLE : 45-75 secondes (storytelling assumé).
- TEXTE PARLÉ : 110-190 mots (rythme parlé naturel ~150 mots/min).
- STRUCTURE NARRATIVE DÉVELOPPÉE :
  • Hook (0-3s) : ouvre une boucle de curiosité forte.
  • Corps (3-60s) : développe la SCÈNE COMPLÈTE, contexte, déclic, déplacement,
    résolution. Le viewer doit ressentir une progression émotionnelle.
  • CTA (60-75s) : invitation cohérente avec l'objectif (dialogue / offre / approfondissement).
- ATTENTION : ne JAMAIS dépasser 90 secondes (au-delà = pénalité de distribution).
- Si le sujet ne porte pas 60s de contenu dense, RACCOURCIR plutôt que diluer.

Toutes les structures Reel sont possibles (FACE CAM, VOIX OFF + B-ROLL, HOOK LOOP).`;
  }

  // ── Bloc personnel (pre_gen_answers) ──
  const pg = params.pre_gen_answers;
  const personalBlock = (pg && (pg.anecdote || pg.emotion || pg.conviction))
    ? `

═══════════════════════════════════════════════════
ÉLÉMENTS PERSONNELS (PRIORITÉ HAUTE)
═══════════════════════════════════════════════════

${pg.anecdote ? `MOMENT PERSO : "${pg.anecdote}"
→ Intègre dans les 3 premières secondes ou dans le développement. Utilise SES mots, pas une reformulation IA.` : ""}

${pg.emotion ? `ÉNERGIE : ${pg.emotion}
→ Guide le rythme, le ton, les coupes du script entier.` : ""}

${pg.conviction ? `PUNCHLINE : "${pg.conviction}"
→ Cette phrase doit apparaître quasi textuellement dans le script, au moment du twist ou de la conclusion.` : ""}

RÈGLE : ces éléments sont plus importants que le template. Le script doit sonner comme l'utilisatrice, pas comme un framework.`
    : `

L'utilisatrice n'a pas fourni d'éléments personnels.
Génère le script normalement mais REMPLIS le champ "personal_tip" du JSON :
"Ce script sera 10x plus fort avec ton anecdote perso. Ajoute un truc vécu avant de filmer."`;

  // ── Hook choisi (fallback auto champ par champ) ──
  // Un hook récupéré côté `step:"hooks"` peut n'avoir que son `text`. On fusionne
  // sur les valeurs auto plutôt que de remplacer le bloc entier : sinon les champs
  // absents partaient en « undefined » littéral dans le prompt de génération.
  const HOOK_AUTO = {
    type: "auto",
    type_label: "Auto-généré",
    text: "(génère un hook percutant de 5-12 mots adapté au sujet)",
    text_overlay: "(génère un text overlay de 3-6 mots en MAJUSCULES)",
    format_label: "Auto",
    format_recommande: "auto",
    duree_cible: "30-45 sec",
  };
  const providedHook =
    params.selected_hook && typeof params.selected_hook === "object"
      ? Object.fromEntries(
          Object.entries(params.selected_hook).filter(
            ([, v]) => typeof v === "string" && v.trim(),
          ),
        )
      : {};
  const selectedHook = { ...HOOK_AUTO, ...providedHook } as typeof HOOK_AUTO;
  const hookBlock = `

HOOK CHOISI :
- Type : ${selectedHook.type} (${selectedHook.type_label})
- Texte : "${selectedHook.text}"
- Texte overlay : "${selectedHook.text_overlay}"
- Format recommandé : ${selectedHook.format_label}
- Durée cible : ${selectedHook.duree_cible}`;

  // ── Ancrage sujet ──
  const subject = params.subject || "";
  const subjectBlock = `

ANCRAGE SUJET, RÈGLE CRITIQUE :
Le script ENTIER doit rester ancré dans le sujet "${subject || '(basé sur le hook)'}".
Ne PAS élargir au sujet général.`;

  // ── Inspiration ──
  const inspirationBlock = params.inspiration_context
    ? `

INSPIRATION ANALYSÉE :
${params.inspiration_context}
INSPIRE-TOI du style identifié. NE COPIE PAS le contenu.`
    : "";

  // ── Angle éditorial imposé ──
  const angleBlock = (params.editorial_angle && params.content_structure)
    ? `

ANGLE ÉDITORIAL IMPOSÉ : ${params.editorial_angle}

STRUCTURE À SUIVRE (obligatoire) :
${params.content_structure}

Chaque section du script DOIT correspondre aux étapes de cette structure. Adapte les timings pour que le script respecte ce déroulé.`
    : "";

  // ── Métadonnées contextuelles ──
  const metaBlock = `

CONTEXTE GÉNÉRATION :
- Objectif : ${effectiveObjective || "non précisé"}
- Face cam : ${params.face_cam || "flexible"}
- Temps tournage : ${params.time_available || "flexible"}
- En lancement : ${params.is_launch ? "oui" : "non"}

══ CHOIX DE STRUCTURE (à faire AVANT d'écrire) ══

3 structures possibles, choisis celle qui sert LE sujet (pas ta préférée) :
- face_cam_confession : elle parle à la caméra (confession, décryptage, coup de gueule).
- voix_off_broll : elle FAIT (gestes du métier filmés), sa voix raconte par-dessus.
  Idéal pour montrer le process, l'atelier, le concret.
- hook_loop : boucle courte et percutante, la fin renvoie au début (replays).
Ne choisis PAS face_cam_confession par réflexe : "duree_justification" doit dire
en 1 phrase pourquoi CETTE structure sert CE sujet.${params.face_cam === "non" ? `

⚠️ CONTRAINTE ABSOLUE : FACE CAM = NON. L'utilisatrice NE VEUT PAS se montrer
en train de parler à la caméra.
- format_type INTERDIT : face_cam_confession (et toute variante face cam).
- Structure imposée : voix_off_broll (ou hook_loop porté par les plans).
- "format_visuel" de CHAQUE section : plans b_roll/insert de son activité,
  JAMAIS "face cam".
- "plan_tournage" : AUCUN plan de type "face_cam". Que du b_roll et des inserts.
- Le message passe par la VOIX OFF + les overlays + les sous-titres.` : ""}`;

  // ── JSON de sortie complet (parité avec reels-ai) ──
  const jsonBlock = `

Génère un script complet structuré avec timing seconde par seconde.
Chaque section body DOIT inclure une indication de CUT (changement de plan).

Retourne UNIQUEMENT ce JSON valide, sans texte avant ou après, sans backticks :
{
  "format_type": "LA STRUCTURE CHOISIE : face_cam_confession | voix_off_broll | hook_loop",
  "format_label": "le label lisible de la structure choisie",
  "duree_cible": "durée RÉELLE calculée : total mots parlés ÷ 2,5 = secondes (ex: '45 sec')",
  "duree_justification": "1 phrase : pourquoi CETTE structure et CETTE durée servent CE sujet",
  "objectif": "${effectiveObjective || "non précisé"}",
  "editorial_angle_used": "${params.editorial_angle || "auto"}",
  "personal_tip": null,
  "lecture_test": "MONOLOGUE CONTINU : concatène ici tous les texte_parle des sections dans l'ordre, sans coupure, comme un seul paragraphe lisible d'une traite face cam. Doit contenir les 3 couches (symptôme + mécanisme + reformulation) et au moins 2 marqueurs de profondeur orale.",
  "accroche": "le hook des 3 premières secondes (pour le calendrier)",
  "pillar": "le pilier de contenu",
  "script": [
    {
      "section": "hook",
      "timing": "0-3 sec",
      "format_visuel": "Face cam, regarde la caméra, ton direct",
      "texte_parle": "${selectedHook.text}",
      "texte_overlay": "${selectedHook.text_overlay}",
      "cut": null,
      "tip": "1,7 sec pour décider de rester ou scroller."
    },
    {
      "section": "body",
      "timing": "3-15 sec",
      "format_visuel": "Face cam + plans de coupe",
      "texte_parle": "...",
      "texte_overlay": null,
      "cut": "capture ecran ou plan de coupe",
      "tip": null
    },
    {
      "section": "body",
      "timing": "15-35 sec",
      "format_visuel": "...",
      "texte_parle": "...",
      "texte_overlay": "3-5 MOTS MAX",
      "cut": "changement de plan",
      "tip": null
    },
    {
      "section": "cta",
      "timing": "35-45 sec",
      "format_visuel": "Retour face cam",
      "texte_parle": "...",
      "texte_overlay": "PUNCHLINE FINALE 3-8 mots (JAMAIS le mot 'SAUVEGARDE' seul : une vraie chute)",
      "cut": null,
      "tip": null
    }
  ],
  "sections": "DUPLIQUE ICI le contenu du tableau script (mêmes objets, même ordre) pour compat UI ReelResult",
  "caption": {
    "text": "...",
    "cta": "..."
  },
  "hashtags": ["#...", "#...", "#...", "#...", "#..."],
  "cover_text": "...",
  "alt_text": "...",
  "amplification_stories": [
    {
      "text": "1re story : rejoue la TENSION du reel avec complicité (INTERDIT de commencer par 'Nouveau Reel' ou d'annoncer le reel : on entre direct dans le sujet)",
      "sticker_type": "sondage",
      "sticker_options": ["option courte 1", "option courte 2"]
    },
    {
      "text": "2e story : question qui prolonge le sujet (pas une redite de la 1re)",
      "sticker_type": "question_ouverte",
      "sticker_options": null
    }
  ],
  "checklist": [
    { "item": "Hook dans les 1,5 premières secondes", "auto": true },
    { "item": "Format vertical 9:16", "auto": false },
    { "item": "Sous-titres ajoutés", "auto": false },
    { "item": "Qualité vidéo (lumière, stabilité, son)", "auto": false },
    { "item": "Pas de watermark", "auto": false },
    { "item": "Pattern interrupts (cuts toutes les 3-5 sec)", "auto": true },
    { "item": "CTA clair", "auto": true },
    { "item": "Caption avec hook + mots-clés + CTA", "auto": true },
    { "item": "Cover custom lisible", "auto": false },
    { "item": "Alt text ajouté", "auto": false },
    { "item": "Repartagé en story dans l'heure", "auto": false }
  ],
  "plan_tournage": [
    ${params.face_cam === "non"
      ? `{ "plan": "Tes mains en train de [geste précis du métier], plan fixe posé sur la table", "type": "b_roll", "sert_pour": "hook + body (la voix off se pose dessus)", "duree": "20 sec de rush", "conseil": "Téléphone calé contre un objet stable, lumière de la fenêtre" },`
      : `{ "plan": "Toi face caméra, assise à ton poste de travail habituel, lumière de la fenêtre sur le visage", "type": "face_cam", "sert_pour": "hook + cta", "duree": "1 prise de 60 sec (tout le monologue)", "conseil": "Téléphone calé à hauteur des yeux, pas en contre-plongée" },`}
    { "plan": "Gros plan sur tes mains en train de [geste précis du métier]", "type": "b_roll", "sert_pour": "plan de coupe section body 1", "duree": "10 sec de rush", "conseil": null },
    { "plan": "…", "type": "insert", "sert_pour": "…", "duree": "…", "conseil": null }
  ],
  "garde_fou_alerte": null
}

IMPORTANT :
- Le tableau "script" doit avoir entre 3 et 6 sections (hook + body segments + cta)
- DUPLIQUE le contenu de "script" dans un champ "sections" (même structure) pour compat UI
- Chaque section body a une indication de cut
- Le texte overlay est COURT (3-5 mots), en MAJUSCULES
- La caption ne répète PAS le script, elle offre un angle complémentaire
- Les hashtags : 3-5 max, mix large + niche
- Les amplification_stories : 2 stories à poster dans l'heure
- "plan_tournage" = la SHOT LIST du reel : 3 à 6 plans à tourner AU TÉLÉPHONE, listés dans l'ordre de TOURNAGE le plus simple (toutes les prises face cam d'abord, puis les plans de coupe). Chaque "plan" est CONCRET et ancré dans l'activité RÉELLE de la marque (son lieu, ses gestes, ses objets — d'après le contexte de marque fourni ; JAMAIS un "plan de coupe générique" ni un décor qu'elle n'a probablement pas). Types : "face_cam" (elle parle), "b_roll" (elle fait, sans parler), "insert" (gros plan objet/écran/détail). Cohérence : chaque cut du script doit correspondre à un plan de cette liste ("sert_pour" le dit). Si le format est face cam pur, prévois quand même 1-2 plans de coupe b_roll pour faire respirer le montage. Bonus malin : indique quand un plan b_roll est RÉUTILISABLE pour de futurs reels.
- Pas de markdown dans les valeurs JSON`;

  return base + calibrage + metaBlock + inspirationBlock + hookBlock + subjectBlock + angleBlock + personalBlock + jsonBlock;
}

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
}

function getStoriesVenteInstructions(priceRange?: string | null): string {
  const instructions: Record<string, string> = {
    petit: `SÉQUENCE PETIT PRIX (<100€) : 3-4 stories
1. Story contexte : ton décontracté, "j'ai créé un truc"
2. Story offre : visuel + bénéfice principal + prix
3. Story preuve : screenshot témoignage
4. Story CTA : "Écris [MOT] en DM"`,
    moyen: `SÉQUENCE MOYEN (100-500€) : 5-7 stories
1. Story émotion : face cam intime, "faut que je te parle"
2. Story problème : identification + sondage
3. Story solution : concept clé en face cam
4. Story offre : visuel + prix + dates
5. Story preuve : témoignage
6. Story interaction : sondage "tu veux les détails en DM ?"
7. Story CTA : "Écris [MOT] en DM"`,
    premium: `SÉQUENCE PREMIUM (500€+) : 7-10 stories
1. Hook : "j'ai un truc à te dire"
2-3. Contexte perso : pourquoi tu as créé cette offre
4. Problème : identification forte
5-6. Transformation : before/after cliente
7. Offre : format, pour qui
8. Pratique : prix, dates, modalités
9. Objection principale : face cam douce
10. CTA : "écris-moi pour en parler"`,
    physique: `SÉQUENCE PRODUIT PHYSIQUE : 4-6 stories
1. Teasing : gros plan détail
2. Révélation : produit entier
3. Making-of : process de création
4. Details : prix, matériaux, dispo
5. Preuve : photo cliente OU avis
6. CTA : lien boutique`,
    gratuit: `SÉQUENCE FREEBIE : 3-4 stories
1. Problème : "si tu galères avec [sujet]"
2. Solution : "j'ai créé un [type] gratuit qui [bénéfice]"
3. Preuve : capture d'écran + résultat
4. CTA : "Écris [MOT] en DM"`,
  };
  return instructions[priceRange || ""] || "";
}

export function storiesBrief(p: StoriesBriefParams = {}): string {
  const objective = p.objective || "connexion";
  const time_available = p.time_available || "flexible";
  const face_cam = p.face_cam || "flexible";
  const isQuick = time_available === "5min";
  const priceBlock = objective === "vente" && p.price_range ? `\n- Gamme de prix : ${p.price_range}` : "";
  const launchBlock = p.is_launch ? "\n- Phase : LANCEMENT (orienter vers vente + preuve sociale)" : "\n- Phase : croisière";

  let preGenBlock = "";
  if (p.pre_gen_answers && (p.pre_gen_answers.vecu || p.pre_gen_answers.energy || p.pre_gen_answers.message_cle)) {
    preGenBlock = `

═══════════════════════════════════════════════════
ÉLÉMENTS PERSONNELS DE L'UTILISATEUR·ICE (PRIORITÉ HAUTE)
═══════════════════════════════════════════════════

${p.pre_gen_answers.vecu ? `VÉCU RÉCENT : "${p.pre_gen_answers.vecu}"
→ C'est du contenu authentique. UTILISE ses mots exacts, ses formulations, ses images.
→ Intègre-le dans la story 1 (hook) ou story 2 (identification).
→ Ne reformule PAS son vécu en langage corporate. Garde le côté brut.` : ""}

${p.pre_gen_answers.energy ? `ÉNERGIE CHOISIE : ${p.pre_gen_answers.energy}
→ L'énergie guide le ton de TOUTE la séquence, pas juste une story :
  🔥 Punchy = phrases courtes, affirmations, rythme rapide, pas de détour
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
Génère normalement. Ajoute un champ "personal_tip" dans le JSON :
"Tes stories seront 10x plus engageantes avec un truc vécu. Ajoute un moment perso dans la story 1 ou 2 avant de publier."
`;
  }

  const venteBlock = isQuick && objective === "vente"
    ? getStoriesVenteInstructions("petit")
    : (objective === "vente" ? getStoriesVenteInstructions(p.price_range) : "");

  const hookBlock = isQuick
    ? (face_cam === "oui"
      ? `HOOK STORY 1, RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

FORMAT : face cam
- Hook oral : 5-10 mots max
- Dicible en 2 secondes sans reprendre sa respiration
- Ton conversationnel : "Bon, faut qu'on parle de..."
- Sous-titres OBLIGATOIRES (60-80% regardent sans le son)
`
      : `HOOK STORY 1, RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

FORMAT : texte sur fond
- Hook principal : 8-15 mots max
- 1 phrase. Pas 2.
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)
`)
    : `HOOK STORY 1, RÈGLES :

La story 1 décide de TOUT. 24% de l'audience part après.
Le hook doit arrêter le swipe en 1-2 secondes.

SELON LE FORMAT DE LA STORY 1 :

Si format = texte sur fond :
- Hook principal : 8-15 mots max
- 1 phrase. Pas 2.
- Doit créer l'identification OU la curiosité immédiate
- Le sondage/sticker complète le hook (pas l'inverse)

Si format = face cam :
- Hook oral : 5-10 mots max
- Dicible en 2 secondes sans reprendre sa respiration
- Ton conversationnel : "Bon, faut qu'on parle de..."
- Sous-titres OBLIGATOIRES (60-80% regardent sans le son)

Si format = visuel/photo :
- Text overlay : 3-8 mots en gros
- L'image fait le travail visuel, le texte fait l'accroche
`;

  const structuresBlock = isQuick
    ? `STRUCTURES DISPONIBLES (choisis la plus adaptée) :
- journal_bord : Connexion, 2-3 stories
- probleme_solution : Éducation, 2-3 stories
- vente_douce : Vente, 3-4 stories (max)
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
   Voix : narrateur·ice de son propre quotidien pro
   Story 1 : "Là je suis en train de [action concrète]…"
   Le fil : on suit une action en cours, comme si on filmait par-dessus l'épaule
   Idéal pour : process de création, journée type, préparation d'un lancement

2. 💭 RÉFLEXION PERSO ("J'ai tilté sur un truc")
   Voix : pensée à voix haute, introspective
   Story 1 : entrer par la prise de conscience elle-même : "J'ai tilté sur un truc à propos de [thème]…" (sans date fabriquée si ce n'est pas un vrai moment vécu)
   Le fil : une prise de conscience qui se déroule story après story
   Idéal pour : partager une leçon, un déclic, un changement de perspective

3. 🙋 INTERPELLATION COMMUNAUTÉ ("Et vous ?")
   Voix : on s'adresse au groupe, on inclut
   Story 1 : "Qui ici galère aussi avec [problème concret] ?"
   Le fil : on part d'un problème partagé, on explore ensemble, on ouvre le dialogue
   Idéal pour : engagement, sondages, créer de la conversation

4. 📖 CONSEIL PAR L'EXPÉRIENCE ("J'ai appris")
   Voix : retour d'expérience personnel, pas de leçon descendante
   Story 1 : "Pendant longtemps je faisais [erreur]. Et puis…"
   Le fil : MON parcours → ce que j'en ai tiré → ce que ça peut t'apporter
   Idéal pour : tips, bonnes pratiques, éducation douce

5. 💬 STORYTIME CLIENT ("Je vous raconte")
   Voix : narrateur·ice d'une histoire vraie (anonymisée)
   Story 1 : la situation client réelle (anonymisée) SI l'utilisatrice l'a fournie. Sinon, ne pas fabriquer : généraliser ("ce qui revient souvent chez mes clientes…"). Pas de "la semaine dernière" inventé.
   Le fil : situation client → problème → ce qu'on a fait → résultat
   Idéal pour : preuve sociale, démontrer son expertise, humaniser

6. 🔥 COUP DE GUEULE DOUX ("Faut qu'on en parle")
   Voix : position affirmée mais bienveillante
   Story 1 : "Un truc qui me fatigue dans [secteur/habitude]…"
   Le fil : constat → pourquoi ça pose problème → ce qu'on peut faire autrement
   Idéal pour : se positionner, affirmer ses valeurs, créer du débat sain

RÈGLE D'OR DE LA VOIX :
- Le "JE" narratif est la voix PAR DÉFAUT. On raconte depuis son expérience.
- Le "TU" n'arrive que dans les moments d'interpellation directe ou les CTA, JAMAIS comme ton dominant.
- Le "VOUS" inclusif ("qui ici…", "est-ce que ça vous parle…") est préféré au "tu" pour les questions.
- Une bonne story donne l'impression de surprendre quelqu'un en train de réfléchir ou de vivre quelque chose. Ce n'est PAS un post reformaté en slides.
- Chaque story doit donner envie de voir la SUIVANTE. Il y a une tension narrative, un fil. Pas juste des affirmations empilées.

${venteBlock}

${hookBlock}

══ PLAN VISUEL PAR STORY (champ "visual") ══

Chaque story reçoit un objet "visual" : c'est le plan du visuel 1080×1920 rendu AUTOMATIQUEMENT par l'outil (texte façon natif Instagram : pastilles de texte surlignées posées sur une photo ou un fond aux couleurs de la marque). Le spectateur doit croire que la story a été faite dans l'app Instagram, PAS designée.

GABARITS DISPONIBLES (champ "gabarit") :
- "photo_pills" : photo en fond + pastille titre + pastille texte. Le gabarit par défaut, le plus authentique.
- "fond_pills" : fond uni aux couleurs de la marque + pastilles centrées. EXCEPTIONNEL : ne l'utilise pas, préfère toujours "photo_pills" (une story sur fond uni au milieu de photos casse l'authenticité).
- "interaction" : une question courte en pastille + une ZONE RÉSERVÉE pour le sticker interactif (sondage/question/slider) que l'utilisateur·ice posera dans Instagram. OBLIGATOIRE quand la story a un sticker.
- "liste" : pastille titre + 2-4 pastilles items empilées. Pour les tips et étapes.
- "citation" : verbatim en italique élégant dans une grande pastille. Pour la preuve sociale, les retours clients.

RÈGLES DU PLAN VISUEL :
1. "title_pill" : 3-7 mots MAX, pas de point final (affiché en majuscules condensées type "Strong" Instagram).
2. "body_pill" : 1-2 phrases courtes, 120 caractères MAX (affiché en gras type "Classic" Instagram). Le texte complet de la story reste dans "text" ; les pastilles n'en sont que la version AFFICHABLE.
3. "list_pills" : uniquement pour le gabarit "liste", 2-4 items de 6-10 mots.
4. "quote" : uniquement pour le gabarit "citation". Verbatim court, jamais inventé : s'il n'y a pas de vrai retour client fourni, n'utilise PAS ce gabarit.
5. "background" : "photo" ou "fond_couleur". Les stories, ce sont des IMAGES : "photo" est le fond de TOUTES les stories (hors face cam) — le fond de chaque story illustre CE QU'ELLE DIT. La SEULE exception tolérée : le gabarit "citation" (verbatim sur fond couleur, choix design). Une story texte sur fond coloré au milieu de photos casse l'authenticité : n'en produis pas.
6. Pour CHAQUE story non face-cam (même "citation"), remplis TOUJOURS "photo_directive" (quelle photo prendre ou choisir, CONCRÈTE et ancrée dans l'activité réelle, comme un plan de tournage : "ton plan de travail avec les pots en cours de séchage", pas "une jolie photo") ET "photo_query_en" (2-4 mots EN ANGLAIS décrivant une scène photographiable concrète équivalente, pour la recherche de photos libres de droits, ex "hands shaping clay bowl"). Jamais null.
7. Varie les gabarits dans la séquence : jamais deux fois le même d'affilée si la séquence fait 3+ stories.
8. Story avec sticker → gabarit "interaction" (le sticker a besoin de sa zone).${p.photo_catalog && p.photo_catalog.length > 0 ? (() => {
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
- Pour chaque story avec "background": "photo", ${chosen.length > 0 ? "place d'abord les PHOTOS CHOISIES, puis regarde" : "regarde D'ABORD"} si une photo ci-dessus illustre VRAIMENT ce moment précis. Si oui, mets son numéro dans "photo_index". Sinon "photo_index": null.
- ${chosen.length > 0 ? "Pour les photos NON choisies, correspondance EXIGEANTE" : "Correspondance EXIGEANTE"} : la photo doit coller à la scène de CETTE story. Un rapport vague ou décoratif = null (on cherchera ailleurs), c'est mieux qu'une photo hors sujet.
- Ne mets JAMAIS le même "photo_index" sur deux stories de la séquence.
- Remplis quand même "photo_directive" et "photo_query_en" dans tous les cas (l'utilisatrice peut préférer reprendre la photo elle-même).`;
  })() : ""}

POUR LA STORY 1, GÉNÈRE 2 OPTIONS DE HOOK dans le champ "hook_options" :
- Option A : hook court (le plus percutant, 5-10 mots)
- Option B : hook développé (pour ceux·celles qui préfèrent contextualiser, 10-15 mots)

TYPES DE HOOKS STORIES (adaptés à l'angle choisi) :
1. Coulisses en direct : "Là je suis en train de [action]…" / "Bon, je vous montre un truc."
2. Confidence / pensée à voix haute : "J'ai réalisé un truc ce matin." / "Faut que je vous parle de quelque chose."
3. Question communautaire : "Qui ici a déjà [situation] ?" / "Est-ce que ça vous fait ça aussi ?"
4. Retour d'expérience : "Pendant longtemps je faisais [erreur]." / "Ce que j'aurais aimé savoir il y a 6 mois."
5. Storytime : un vécu réel fourni par l'utilisatrice, anonymisé. Si rien n'est fourni, ne pas fabriquer de date ni d'anecdote : généraliser ("ce qui revient souvent…").
6. Prise de position : "Un truc qui me fatigue dans [secteur]." / "Je vais dire un truc qui ne va pas plaire à tout le monde."
IMPORTANT : Le hook par défaut est en "JE" ou en "VOUS inclusif". Le "TU" direct est réservé UNIQUEMENT à l'angle "interpellation communauté" et doit rester rare.

GARDE-FOUS OBLIGATOIRES :
1. Max 10 stories par séquence
2. TOUJOURS au moins 1 sticker interactif (DM>Question>Sondage>Slider>Lien)
3. Sticker lien JAMAIS sur story 1 ou 2, toujours avant-dernière ou dernière
4. JAMAIS de CTA agressif. Toujours en mode permission : "si ça te parle", "écris-moi"
5. Si face cam → TOUJOURS mentionner sous-titres
6. Story 1 = hook fort (24% de l'audience part après)
7. Étaler les stories : matin/midi/soir
8. Ton oral, décontracté, comme si on parlait face caméra ou en message vocal. Le "JE" raconte, le "VOUS/TU" n'intervient que ponctuellement pour interpeller.
9. Écriture inclusive point médian
10. Expressions naturelles : "bon", "en vrai", "franchement", "le truc c'est que"
11. Apartés entre parenthèses : "(oui oui, même moi)", "(je sais, c'est contre-intuitif)", "(pas besoin de se ruiner)"
12. JAMAIS de jargon marketing
13. JAMAIS de tiret cadratin (—)
14. PRIORITÉ ABSOLUE : si un profil de voix existe dans le contexte, reproduis ce style. Réutilise les expressions signature, imite les patterns de structure et de ton.
15. Ne JAMAIS utiliser les expressions interdites du profil de voix.
16. Le résultat doit sonner comme si l'utilisateur·ice l'avait écrit.
17. Si le temps dispo est "5min", MAXIMUM 3 stories. Ne génère JAMAIS 5+ stories pour quelqu'un qui a 5 minutes.
18. La longueur du texte de chaque story doit être RÉALISTE : une story texte = 2-3 phrases max. Une story face cam = 15-30 secondes de parole (50-80 mots). Ne génère pas des pavés pour des stories.

Réponds en JSON strict :
{
  "structure_type": "...",
  "structure_label": "...",
  "narrative_angle": "coulisses | reflexion | interpellation | conseil_vecu | storytime_client | coup_de_gueule",
  "total_stories": N,
  "estimated_time": "X min",
  "stickers_used": ["sondage", "question_ouverte"],
  "garde_fou_alerte": ${p.gardeFouAlerte ? `"${p.gardeFouAlerte.replace(/"/g, '\\"')}"` : "null"},
  "personal_tip": null,
  "stories": [
    {
      "number": 1,
      "timing": "matin",
      "timing_emoji": "🌅",
      "role": "Hook",
      "format": "photo",
      "format_label": "📸 Photo avec texte",
      "text": "...",
      "hook_options": {
        "option_a": {
          "text": "[hook court 5-10 mots]",
          "word_count": 7,
          "label": "Court et percutant"
        },
        "option_b": {
          "text": "[hook développé 10-15 mots]",
          "word_count": 13,
          "label": "Contextualisé"
        }
      },
      "sticker": {
        "type": "sondage",
        "label": "Sondage",
        "options": ["Oui", "Non"],
        "placement": "bas de la story"
      },
      "visual": {
        "gabarit": "interaction",
        "background": "photo",
        "title_pill": "[3-7 mots]",
        "body_pill": "[1-2 phrases courtes, 120 car. max]",
        "list_pills": null,
        "quote": null,
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
- Seule la story 1 a "hook_options". Les autres stories ont "hook_options": null
- Le champ "text" de la story 1 contient le hook option_a par défaut
- CHAQUE story a un "visual", SAUF les stories face cam : si "face_cam": true → "visual": null (c'est une vidéo à filmer, pas un visuel à rendre)
- Le champ "narrative_angle" indique l'angle de narration choisi pour la séquence
- Pas de markdown dans les valeurs JSON

Réponds UNIQUEMENT avec le JSON, rien d'autre.`;
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
- Apartés personnels entre parenthèses. JAMAIS d'italique ni de gras : l'email part en texte brut, le markdown (**, *) s'afficherait tel quel.
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
