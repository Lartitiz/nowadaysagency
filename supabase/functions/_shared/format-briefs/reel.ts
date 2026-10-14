// Déplacé à l'identique depuis _shared/format-briefs.ts (lot 3 du découpage, 14/10/2026,
// docs/robustesse/gros-fichiers.md fiche 10). format-briefs.ts le réexporte.

import {
  REEL_COUVERTURE,
  REEL_SECTIONS,
  REEL_TEXTE_ECRAN,
  UNE_IDEE_REEL,
  numerotationConsigne,
  planAngleIndicatif,
  VOIX_ORALE,
} from "../socle.ts";
import { annoncedItems } from "./common.ts";
import { recapReelBlock } from "../multi-subject.ts";

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
  relié à un fait concret du métier. Une norme sociale ou une injonction
  (ce qu'on attend des femmes, des indépendantes, de « la bonne pro ») est une
  mécanique du SUJET, pas de la psychologie : elle a toute sa place ici, et
  l'émotion courante qu'elle soulève (peur du jugement, honte, fatigue) peut
  être nommée comme une expérience partagée.
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

══ PROFONDEUR ORALE ══
Explique le mécanisme, développe ce qui change le regard et ajoute les nuances utiles. Les transitions viennent des idées et de la façon de parler de la personne. Aucun nombre de marqueurs oraux imposé : on doit suivre le raisonnement sans entendre une collection de formules.
${VOIX_ORALE}

══ ORALITÉ : MONOLOGUE, PAS SCRIPT TÉLÉ ══

L'utilisatrice va lire ce script FACE CAM, en une prise, comme si elle parlait
à une amie en visio. Le découpage par sections est TECHNIQUE (pour le tournage),
mais le texte parlé doit s'enchaîner comme UN SEUL monologue continu.

CONTINUITÉ ENTRE SECTIONS, règle stricte :
- Le texte_parle de chaque section body poursuit la section précédente.
  Utilise un connecteur seulement s’il aide à suivre le raisonnement ;
  la continuité peut aussi venir du sens.
- Première phrase de chaque section ≠ phrase autonome qu'on pourrait poster.
  C'est la SUITE de la phrase précédente.
- Hook + body 1 = paire question/réponse (ou affirmation/preuve), pas 2
  affirmations indépendantes.
- Si tu peux supprimer une section sans casser le sens du reste → elle est
  mal écrite, elle ne s'enchaîne pas.

L'oral naturel inclut ~25-30% de mots-outils ("alors", "donc", "tu vois",
"en fait"). Ne les compte PAS comme du gras à supprimer.

AVANT D'ÉCRIRE, identifie aussi :

1. QUEL EST LE SEUL POINT que le spectateur retient ?
   Si tu ne peux pas le résumer en 1 phrase, le reel est trop dispersé.
   Pas "5 conseils pour..." mais "le truc que personne ne dit sur [sujet]".

2. QUELLE SITUATION CONCRÈTE illustre ce point ?
   Un reel qui RACONTE une scène (un moment, un échange, un avant/après) 
   fonctionne bien mieux qu'un reel qui EXPLIQUE un concept.

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

${UNE_IDEE_REEL}

${REEL_TEXTE_ECRAN}

══ RÈGLE SPÉCIALE FRAME 1 (overlay du hook 0-3s) ══

50% des viewers regardent en MUTE. L'overlay de la frame 1 doit fonctionner SEUL,
sans le son : c'est le passage du hook parlé qui se comprend seul (promesse
concrète, situation reconnaissable, ou affirmation contre-intuitive), recopié
tel quel.

❌ MAUVAIS : "Positionnement" / "Stratégie Instagram" / "Mes conseils" (des mots qu'elle ne dit pas)
✅ BON (si elle le dit) : "Plein d'abonnés. Zéro client." / "Pourquoi j'ai supprimé tous mes posts."

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

Si tu dépasses le plafond de mots → COUPE les redites et les détails secondaires ; conserve le sujet, les faits de départ et les attributions,
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
Body 1: "Quand tu galères à fixer tes tarifs, c'est rarement un problème
         de marché. Le marché il s'en fout, il s'aligne. C'est TOI qui
         te demandes en boucle si tu vaux ça. Et cette question-là, elle se
         voit dans ta voix au moment où tu annonces le prix."
Body 2: "Et c'est ÇA que les clients captent. Pas le chiffre. L'hésitation derrière
         le chiffre. Ils achètent ta certitude, pas ton tarif. Deux freelances
         avec le même tarif vendent pas pareil, pour cette raison-là."
CTA   : "Donc avant de toucher à tes prix, regarde plutôt comment tu les dis.
         Tout se joue à cet endroit-là."
→ Symptôme (galère à tarifer) → Mécanisme (l'hésitation perçue) → Reformulation
   (regarde comment tu les dis). Connecteurs oraux variés, sans cheville répétée.
   ~140 mots ≈ 56 secondes. Profondeur + monologue continu.

INTERDITS :
- Script qui LISTE des conseils au lieu de RACONTER + EXPLIQUER LE POURQUOI
- Hook descriptif ("Aujourd'hui on va parler de...")
- Hook impersonnel sans sujet humain
- Texte à l'écran qui dit ce qu'elle ne dit pas (information, chiffre ou formule absents de son texte parlé)
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

${pg.conviction ? `PUNCHLINE (matière, pas texte final — voir CONSIGNE ci-dessous) : "${pg.conviction}"
→ Elle porte le twist ou la conclusion du script. REFORMULE-la avec des mots neufs : garde le sens et l'intensité, ne recopie jamais la phrase telle quelle (elle peut venir de la fiche de marque, réutilisée mot pour mot elle se voit dès que deux contenus cohabitent sur le même feed).` : ""}

RÈGLE : ces éléments sont plus importants que le template. Le script doit sonner comme l'utilisatrice, pas comme un framework.`
    : `

L'utilisatrice n'a pas fourni d'éléments personnels.
Génère le script normalement mais REMPLIS le champ "personal_tip" du JSON :
"Ce script sera bien plus fort avec ton anecdote perso. Ajoute un truc vécu avant de filmer."`;

  // ── Hook choisi (fallback auto champ par champ) ──
  // Un hook récupéré côté `step:"hooks"` peut n'avoir que son `text`. On fusionne
  // sur les valeurs auto plutôt que de remplacer le bloc entier : sinon les champs
  // absents partaient en « undefined » littéral dans le prompt de génération.
  const HOOK_AUTO = {
    type: "auto",
    type_label: "Auto-généré",
    text: "(génère un hook percutant de 5-12 mots adapté au sujet)",
    text_overlay: "(extrait de 3 à 6 mots du hook parlé, recopié tel quel)",
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
  // Plan d'angle INDICATIF (socle, 05/10/2026) : l'ordre des étapes est gardé,
  // le nombre de sections suit le découpage (une idée par plan).
  const angleBlock = (params.editorial_angle && params.content_structure)
    ? `

ANGLE ÉDITORIAL IMPOSÉ : ${params.editorial_angle}

PLAN DE L'ANGLE (dans cet ordre) :
${params.content_structure}

${planAngleIndicatif("section", "sections")} Adapte les timings à ce déroulé ; le reel reste court.`
    : "";
  // Liste annoncée avec un nombre : numérotation 1..N (socle, décision du 05/10/2026).
  const reelNumbering = numerotationConsigne(annoncedItems(params.subject), "sections");
  const numberingBlock = reelNumbering ? `\n\n${reelNumbering}` : "";
  // Brief à plusieurs sujets, choix « récap » à l'écran format (09/10/2026).
  const recapBlock = recapReelBlock(params.subject) ?? "";

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
  "lecture_test": "MONOLOGUE CONTINU : concatène ici tous les texte_parle des sections dans l'ordre, sans coupure, comme un seul paragraphe lisible d'une traite face cam. Doit contenir les 3 couches (symptôme + mécanisme + reformulation) avec des transitions naturelles, sans quota de marqueurs oraux.",
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
      "texte_overlay": "extrait de 3 à 8 mots de CE texte_parle, recopié tel quel",
      "cut": "changement de plan",
      "tip": null
    },
    {
      "section": "cta",
      "timing": "35-45 sec",
      "format_visuel": "Retour face cam",
      "texte_parle": "...",
      "texte_overlay": "la chute de CE texte_parle, extrait de 3 à 8 mots recopié tel quel (JAMAIS le mot 'SAUVEGARDE' seul)",
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
  "cover_text": "l'accroche seule, 4 à 10 mots tirés du hook",
  "cover_mot_cle": "le mot (ou 1 à 3 mots) de cover_text mis en valeur, recopié exactement",
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
- Le tableau "script" doit avoir entre ${REEL_SECTIONS.min} et ${REEL_SECTIONS.max} sections (hook + body segments + cta), une idée par section
- DUPLIQUE le contenu de "script" dans un champ "sections" (même structure) pour compat UI
- Chaque section body a une indication de cut
- Le texte overlay est COURT (3-8 mots), extrait mot pour mot du texte_parle de sa section, sans majuscules imposées
- ${REEL_COUVERTURE}
- La caption ne répète PAS le script, elle offre un angle complémentaire
- Les hashtags : 3-5 max, mix large + niche
- Les amplification_stories : 2 stories à poster dans l'heure
- "plan_tournage" = la SHOT LIST du reel : 3 à 6 plans à tourner AU TÉLÉPHONE, listés dans l'ordre de TOURNAGE le plus simple (toutes les prises face cam d'abord, puis les plans de coupe). Chaque "plan" est CONCRET et ancré dans l'activité RÉELLE de la marque (son lieu, ses gestes, ses objets — d'après le contexte de marque fourni ; JAMAIS un "plan de coupe générique" ni un décor qu'elle n'a probablement pas). Types : "face_cam" (elle parle), "b_roll" (elle fait, sans parler), "insert" (gros plan objet/écran/détail). Cohérence : chaque cut du script doit correspondre à un plan de cette liste ("sert_pour" le dit). Si le format est face cam pur, prévois quand même 1-2 plans de coupe b_roll pour faire respirer le montage. Bonus malin : indique quand un plan b_roll est RÉUTILISABLE pour de futurs reels.
- Pas de markdown dans les valeurs JSON`;

  return base + calibrage + metaBlock + inspirationBlock + hookBlock + subjectBlock + recapBlock + angleBlock + numberingBlock + personalBlock + jsonBlock;
}
