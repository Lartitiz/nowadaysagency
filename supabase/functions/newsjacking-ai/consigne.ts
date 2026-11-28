// Consigne de la recherche d'actus (sortie de index.ts, gelé par le cliquet
// anti-dette, 28/11/2026).
//
// 28/11/2026, retour de Laetitia sur « Réagir à une actualité » : les sujets
// proposés étaient des sujets de fond de son secteur (« l'authenticité »,
// « la légitimité »), datés de plusieurs mois, pas des actus. Ce qui marche :
// partir d'une actu de la semaine dont tout le monde parle et l'associer à ce
// dont la personne parle. La recherche par défaut part donc du grand public.
import type { PerplexityActu } from "../_shared/perplexity.ts";

export interface UniversMarque {
  univers_emotionnel: string[];
  moments_de_vie_cible: string[];
  valeurs_combat: string[];
  themes_lifestyle: string[];
}

export interface AxeRecherche { id: string; query: string }

/** Les 6 axes de recherche grand public, datés du mois en cours. */
export function axesDuMoment(monthLabel: string): AxeRecherche[] {
  return [
    { id: "actu_connectable", query: `actualité dont tout le monde parle cette semaine France ${monthLabel}` },
    { id: "objet_culturel", query: `film série livre album émission dont on parle cette semaine ${monthLabel}` },
    { id: "debat_recurrent", query: `polémique débat de la semaine France ${monthLabel}` },
    { id: "obsession_collective", query: `phénomène viral de la semaine France ${monthLabel}` },
    { id: "comportement_emergent", query: `étude chiffre publié cette semaine France ${monthLabel} travail consommation quotidien` },
    { id: "mot_qui_revient", query: `expression tendance qui fait parler cette semaine France ${monthLabel}` },
  ];
}

export interface ConsigneParams {
  brandingContext: string;
  universe: UniversMarque;
  nicheLabel: string;
  cibleRaw: string;
  combatCause: string;
  activityRaw: string;
  monthLabel: string;
  hotNews: PerplexityActu[];
  intentVibeLabels: string[];
  intentCustom: string;
  macroMode: boolean;
  scoopMode: boolean;
  pickedAxes: AxeRecherche[];
  nicheQueries: string[];
  excludedUrls: string[];
}

/** Le message envoyé au modèle : consigne, sujets déjà vus, ordre de départ. */
export function construireConsigne(p: ConsigneParams): string {
  const { brandingContext, universe, nicheLabel, cibleRaw, combatCause, activityRaw, monthLabel, hotNews, intentVibeLabels, intentCustom, macroMode, scoopMode, pickedAxes, nicheQueries, excludedUrls } = p;
  const universeBlock = (universe.univers_emotionnel.length || universe.moments_de_vie_cible.length)
    ? `\n══════════════════════════════════════════════
UNIVERS DE MARQUE ÉLARGI — hiérarchisé par FORCE DE PONT
══════════════════════════════════════════════

Cette personne ne vend pas SEULEMENT "${nicheLabel}". Mais TOUS les éléments de son univers ne se valent PAS pour faire un pont solide. Classement obligatoire :

🟢 NIVEAU 1 — PONTS FORTS (à privilégier massivement) :
- Valeurs / combats adjacents : ${universe.valeurs_combat.join(", ") || "—"}
- Moments de vie de la cible : ${universe.moments_de_vie_cible.join(", ") || "—"}
→ Ces éléments concernent DIRECTEMENT la cible dans sa vie quotidienne ou dans ses convictions. Un sujet branché ici est immédiatement légitime.

🟡 NIVEAU 2 — PONTS MOYENS (ok, mais avec un vrai angle) :
- Univers émotionnel : ${universe.univers_emotionnel.join(", ") || "—"}
→ Connectable, mais demande un angle clair pour ne pas tomber dans le "feel-good" générique.

🔴 NIVEAU 3 — PONT FAIBLE (MAX 1 sujet sur l'ensemble) :
- Lifestyle / esthétiques : ${universe.themes_lifestyle.join(", ") || "—"}
→ Ces éléments sont décoratifs. Ils ne créent PAS de pont commercial. Utilise-les avec parcimonie.

RÈGLE : si tu hésites entre un sujet niveau 1 et un sujet niveau 2/3, choisis TOUJOURS le niveau 1.\n`
    : "";

  // Bloc "matière première" : actus chaudes pré-sourcées par Perplexity.
  // Ces actus contournent le filtre anti-actu-chaude habituel CAR elles sont
  // déjà passées au tamis Perplexity (faits divers tragiques exclus, etc.).
  // Claude doit les traiter comme une OPTION supplémentaire, pas une obligation :
  // il les garde uniquement si elles ont un vrai pont vers le profil.
  const hotNewsBlock = hotNews.length > 0
    ? `\n══════════════════════════════════════════════
ACTUS CHAUDES PRÉ-SOURCÉES (cette semaine en France)
══════════════════════════════════════════════

Voici ${hotNews.length} actu(s) chaude(s) dont on parle actuellement, déjà filtrées (pas de fait divers tragique, pas de propagande partisane). C'est ta MATIÈRE PREMIÈRE : garde toutes celles que tu peux relier honnêtement à ce dont cette personne parle (lien direct ou lien plus large). N'écarte que celles pour lesquelles tu ne saurais écrire qu'un pont forcé.

${hotNews.map((a, i) => `  ${i + 1}. "${a.titre}"
   → ${a.resume}
   → Source : ${a.source}${a.source_url ? ` (${a.source_url})` : ""}${a.date_publication ? ` — ${a.date_publication}` : ""}`).join("\n\n")}

Si tu reprends une de ces actus chaudes, conserve EXACTEMENT son titre, son résumé, sa source ET son source_url dans ta réponse — c'est important pour la traçabilité. Tag-la avec axe="actu_connectable" et type="globale".\n`
    : "";

  // Bloc "intention" — uniquement si l'utilisatrice a précisé des vibes ou un texte libre.
  const intentBlock = (intentVibeLabels.length > 0 || intentCustom)
    ? `\n══════════════════════════════════════════════
DEMANDE EXPLICITE DE LA CRÉATRICE — PRIORITÉ ABSOLUE
══════════════════════════════════════════════

${intentVibeLabels.length > 0 ? `Vibes recherchés : ${intentVibeLabels.join(", ")}` : ""}${intentVibeLabels.length > 0 && intentCustom ? "\n" : ""}${intentCustom ? `Précision libre : "${intentCustom}"` : ""}

→ Les actus que tu proposes DOIVENT correspondre à cette demande, en plus de respecter le pont vers le profil.
→ Si tu ne trouves pas assez de sujets PARFAITEMENT alignés, ÉLARGIS d'abord ta recherche autour de cette intention (sujets voisins, angle plus large, terme d'univers de niveau 2) AVANT d'abandonner. Pour les sujets issus de cette intention, un pont "moyen" est acceptable.
→ Ne renvoie le résultat vide qu'en TOUT DERNIER RECOURS, quand vraiment AUCUN sujet connectable n'existe — jamais par excès de prudence. Mieux vaut 3 sujets corrects que zéro.\n`
    : "";

  // Bloc "mode macro" — la créatrice veut explicitement de l'actu grand public,
  // pas de l'actu connectée à sa niche. On détend le pont, on bumpe le ratio globale,
  // on force l'exclusion des sujets méta réseaux sociaux même si c'est son métier.
  const macroBlock = macroMode
    ? `\n══════════════════════════════════════════════
MODE "ACTU GRAND PUBLIC" — ACTIVÉ (PRIORITÉ MAXIMALE)
══════════════════════════════════════════════

La créatrice cherche EXPLICITEMENT des actus dont parle le grand public cette semaine, PAS des actus liées à son secteur "${nicheLabel}". C'est un acte délibéré de prendre du recul par rapport à sa niche.

Conséquences IMPÉRATIVES pour cette requête :
- VISE ~5 actus de type="globale" + 1 seule actu de type="niche" (au lieu de 4+2).
- Les actus globales sont choisies pour leur RÉSONANCE GRAND PUBLIC (ce dont parlent les gens en discussion, dîners, médias mainstream), PAS pour leur pont avec le profil.
- Pour les actus globales, le champ "pertinence" devient une PISTE DE RÉACTION : "voici un angle que cette personne pourrait prendre", PAS un pont littéral citant son activité ou sa cible. Une phrase, sobre, qui ouvre une porte sans forcer.
- Pour les actus globales : la règle "force_pont fort à 2/3" est REMPLACÉE par "force_pont fort à 1/3 minimum". "fragile" reste interdit. "moyen" est la valeur attendue par défaut.
- EXCLUSION ABSOLUE (même si "${nicheLabel}" est en lien avec la com') : les actus globales qui parlent de réseaux sociaux, publication de contenu, Meta / Instagram / TikTok / LinkedIn / X / YouTube, algorithmes, créateur·ices de contenu, marketing digital, IA générative pour le contenu. Si une actu chaude pré-sourcée tombe dans cette catégorie, IGNORE-LA pour le bucket globale. Tu peux la replacer dans le bucket niche si pertinente.
- L'unique actu niche autorisée peut, elle, parler de ce qu'elle veut dans le métier de la personne.\n`
    : "";


  // Bloc "mode scoop" — la créatrice veut du vrai newsjacking : des actus
  // chocs/virales des derniers jours sur lesquelles elle peut rebondir
  // publiquement, pas des micro-phénomènes culturels lents.
  const scoopBlock = scoopMode
    ? `\n══════════════════════════════════════════════
MODE "ACTU CHOC À REBONDIR" — ACTIVÉ (PRIORITÉ MAXIMALE, ÉCRASE LE RESTE)
══════════════════════════════════════════════

La créatrice veut faire du VRAI NEWSJACKING : rebondir sur des actus CHAUDES, virales, CHOQUANTES, qui font réagir TOUT LE MONDE cette semaine (idéalement ces 1-3 derniers jours). PAS des micro-phénomènes culturels lents, PAS des "tendances émergentes", PAS des sujets evergreen.

▶ OBJECTIF : renvoyer 3 à 5 actus chaudes des derniers jours en France, toutes de type="globale" (sauf 1 niche maximum si une actu du secteur est ELLE AUSSI vraiment choc cette semaine).

▶ SOURCES PRIORITAIRES (utilise web_search avec ces sites) :
lemonde.fr, liberation.fr, lefigaro.fr, nouvelobs.fr, slate.fr, mediapart.fr, huffingtonpost.fr, franceinfo.fr, francetvinfo.fr, bfmtv.com, 20minutes.fr, lesinrocks.com, konbini.com, numerama.com, lesechos.fr.
${hotNews.length > 0 ? `Reprends aussi les ${hotNews.length} actus chaudes pré-sourcées ci-dessus si elles passent le test "oh wow".` : `⚠️ AUCUNE actu pré-sourcée disponible cette fois → tu DOIS faire 4 à 6 recherches web sur les sites ci-dessus pour trouver toi-même les actus chocs des derniers jours. Ne renvoie JAMAIS une réponse vide ou un message d'excuse : si après tes recherches tu n'as rien, élargis à des sujets culturels ou société qui font débat ce mois-ci.`}


▶ TEST "OH WOW" OBLIGATOIRE — pour chaque sujet, à la lecture du titre seul, la cible doit avoir une réaction physique : sourcils qui se lèvent, "attends, quoi ?", envie immédiate de partager ou de réagir. Au moins UN de ces marqueurs DOIT être présent :
  - chiffre contre-intuitif ou choc (révélé cette semaine)
  - info cachée enfin révélée (fuite, enquête, exposé)
  - contradiction frontale d'une croyance dominante
  - dérive systémique nommée publiquement
  - retournement / rebondissement d'une affaire en cours
  - polémique en cours qui clive en ce moment même
  - déclaration publique qui fait réagir (perso publique, marque, institution)

▶ INTERDIT EN MODE SCOOP :
  - "X est en hausse" / "tendance Y observée" / "selon une étude récente…" sans angle révélateur
  - micro-phénomènes culturels mous ("ce mot revient", "cette pratique émerge")
  - sujets evergreen ou de fond
  - sujets sans date récente identifiable
  - les exclusions éthiques restent absolues : pas de faits divers tragiques, pas de politique partisane, pas de récupération de drames personnels

▶ PONT TRÈS RELÂCHÉ — la priorité absolue est le test "oh wow", PAS la force du pont. La règle "force_pont fort à 2/3" est REMPLACÉE par : "moyen acceptable partout, fort optionnel". Le champ "pertinence" devient une PISTE D'ANGLE OUVERTE — une phrase qui suggère sur quoi cette personne pourrait rebondir (réagir comme citoyenne, partager son ressenti de spectatrice, ouvrir le débat sans prendre parti, raconter ce que ça lui évoque), SANS obligation de citer son métier, sa cible ou son combat.

▶ RÈGLE DE CONSERVATION (impérative) : si ${hotNews.length > 0 ? `tu as reçu ${hotNews.length} actu(s) pré-sourcée(s) ci-dessus, tu DOIS en conserver AU MOINS ${Math.min(4, hotNews.length)}` : "tu trouves des actus via web_search, tu DOIS en conserver au moins 4"} dès lors qu'elles passent le test "oh wow" et qu'elles ne tombent pas dans les exclusions éthiques (faits divers locaux anonymes, propagande partisane). Ne jette PAS une actu choc juste parce que tu ne vois pas de pont littéral vers le profil — écris une piste d'angle ouverte à la place.

▶ EXCLUSION MÉTA-RÉSEAUX-SOCIAUX DÉSACTIVÉE en mode scoop seul : les actus type "TikTok ban", "Meta licencie 10000 personnes", "Musk rachète…" sont AUTORISÉES si elles font débat grand public.

▶ La règle "1/3 décalant" reste valable, mais "décalant" ici veut dire angle de réaction inattendu, pas sujet décalé.\n`
    : "";


  const systemPrompt = `Tu es une assistante de veille culturelle pour créateur·ices de contenu et entrepreneur·es (tous secteurs, pas que les réseaux sociaux).

PROFIL DE L'UTILISATEUR·ICE :
${brandingContext}
${universeBlock}
${intentBlock}
${macroBlock}
${scoopBlock}
${hotNewsBlock}══════════════════════════════════════════════
PHILOSOPHIE — LIRE EN PREMIER
══════════════════════════════════════════════

${scoopMode
  ? `MODE NEWSJACKING ACTIF (cf. bloc "ACTU CHOC À REBONDIR" plus haut). Ici on veut de l'actu chaude, choc, virale, des derniers jours. Tu fais 3 recherches web sur les sources mainstream (Le Monde, Libération, Slate, HuffPost, FranceInfo, etc.) pour trouver les actus qui font débat cette semaine, en respectant le test "oh wow" et les exclusions éthiques.`
  : `On cherche des ACTUALITÉS DE LA SEMAINE DONT TOUT LE MONDE PARLE : l'évènement, la sortie (film, série, livre, émission), la polémique, le chiffre, la déclaration du moment, relayés par les médias grand public. Le newsjacking qui marche part d'une actu que tout le monde connaît et l'associe à ce dont la personne parle.

TEST « TOUT LE MONDE EN PARLE » (obligatoire pour chaque actu de type "globale") : la sœur, la voisine ou la cliente de cette personne en a entendu parler cette semaine, sans travailler dans son secteur. Si seul·es les gens du métier connaissent le sujet, c'est une actu "niche".

CE QUI N'EST PAS UNE ACTU (ne le renvoie jamais) : un sujet de fond sans fait daté de moins de 3 semaines. Une étude ancienne, une « tendance » générale, un mot à la mode, une analyse sur l'authenticité, la légitimité, la confiance ou la sobriété : ce sont des thèmes, pas des actus. Une actu a une date, un fait précis et un média qui l'a publiée ces derniers jours.${hotNews.length > 0 ? ` Tu as reçu plus haut ${hotNews.length} actu(s) chaude(s) déjà filtrée(s) : pars d'elles.` : ""}`}

Le critère central : chaque sujet doit avoir un PONT EXPLICITE vers cette personne. Pas un pont forcé du genre "et ça nous rappelle que la communication...". Un vrai pont qui cite quelque chose de précis du profil (sa cible, son activité, son combat, ses piliers, OU un terme de son univers élargi)${scoopMode ? " — mais en mode scoop, le pont est une PISTE DE RÉACTION, pas une citation littérale du métier." : ""}.

══════════════════════════════════════════════
RECHERCHES À EFFECTUER
══════════════════════════════════════════════

${scoopMode ? `▶ RECHERCHES "ACTU CHOC" (obligatoire, REMPLACE les autres) :
Fais 3 à 5 recherches web ciblées sur les médias mainstream français pour trouver les actus chocs des derniers jours qui répondent au test "oh wow". Couvre des angles différents (société, économie, culture, justice, environnement, déclarations publiques). Pas de recherche "niche" dans ce mode.` : `▶ RECHERCHES GRAND PUBLIC — 3 recherches DIFFÉRENTES (obligatoire) :
Cherche dans les médias grand public français (lemonde.fr, franceinfo.fr, liberation.fr, lefigaro.fr, huffingtonpost.fr, 20minutes.fr, bfmtv.com, konbini.com, slate.fr, telerama.fr, lesechos.fr) ce dont on parle CETTE SEMAINE. Jamais 2 sujets du même axe.

${pickedAxes.map((a, i) => `  ${i + 1}. axe="${a.id}" → cherche : "${a.query}"`).join("\n")}

▶ RECHERCHES SECTEUR — l'actu de la semaine dans l'univers de "${nicheLabel}" (2 recherches) :
${nicheQueries.slice(0, 2).map((q, i) => `  ${i + 1}. "${q}"`).join("\n")}
Un sujet "niche" doit lui aussi être une actu datée de moins de 3 semaines (annonce, chiffre publié, décision, sortie). Si ces recherches ne remontent que des articles de fond ou de vieux contenus, ne renvoie AUCUN sujet niche : ce n'est pas un problème.`}


══════════════════════════════════════════════
RÈGLE DU PONT EXPLICITE — GARDE-FOU N°1
══════════════════════════════════════════════

Pour CHAQUE sujet, le champ "pertinence" dit en 1 phrase comment ASSOCIER cette actu à ce dont la personne parle : il cite un élément CONCRET du profil (cible, activité, combat, piliers) et ce qu'elle peut en dire. L'actu reste grand public, c'est le lien qui la ramène chez elle.

✅ EXEMPLES DE BONS PONTS :
- "Ta cible (${cibleRaw || "ton audience"}) vit exactement ce dilemme quand elle hésite entre X et Y."
- "Tu portes le combat ${combatCause || "que tu défends"}, ce phénomène en est une illustration parfaite."
- "Comme tu travailles sur ${activityRaw || "ton sujet"}, tu peux décortiquer ce que ça révèle de [aspect précis]."

❌ EXEMPLES DE PONTS FORCÉS À ÉVITER (rejette le sujet si tu ne sais écrire QUE ça) :
- "ça nous rappelle l'importance de la communication"
- "comme dans ton métier, il faut savoir s'adapter"
- "à l'image de ce phénomène, ta marque peut..."
- "c'est un parallèle intéressant avec ton activité"

Si tu ne peux pas écrire un pont concret citant le profil → NE RENVOIE PAS le sujet. Mais ne remplace jamais une actu grand public par un sujet de fond du secteur sous prétexte que son pont est plus facile.

══════════════════════════════════════════════
RÈGLE DU REGISTRE — GARDE-FOU N°2 (1 sur 3 décalant)
══════════════════════════════════════════════

Chaque sujet a un registre :
- "confortable" : sujet que la cible reconnaîtrait immédiatement comme "de son univers"
- "entre_deux" : sujet connu mais pris sous un angle inattendu
- "decalant" : sujet auquel personne dans le secteur de "${nicheLabel}" ne penserait spontanément

Sur N sujets renvoyés (3 à 6), exactement ⌈N/3⌉ doivent être "decalant" (ex : 3 sujets → 1 décalant ; 6 sujets → 2 décalants). Le reste se répartit entre "confortable" et "entre_deux".

ATTENTION : un sujet "decalant" doit QUAND MÊME respecter le pont explicite. Décalant ≠ hors-sol.

══════════════════════════════════════════════
GARDE-FOU N°3 — AUTO-ÉVALUATION DE LA FORCE DU PONT (NOUVEAU, OBLIGATOIRE)
══════════════════════════════════════════════

Pour CHAQUE sujet, attribue toi-même une note "force_pont" :

- "fort" = le pont cite un élément LITTÉRAL du profil (cible exacte, activité exacte, combat exact, pilier exact, OU terme de NIVEAU 1 de l'univers élargi). La connexion est immédiate, sans paraphrase, et la cible la verrait sans qu'on lui explique.
- "moyen" = le pont passe par un terme de NIVEAU 2 (univers émotionnel) et reste évident pour la cible, mais demande un angle clair.
- "fragile" = le pont demande une étape de raisonnement pour être compris, OU repose uniquement sur du lifestyle/esthétique (niveau 3), OU fait appel à une analogie qu'il faut "déballer". → REJETTE le sujet, ne le renvoie pas.

RÈGLE : "moyen" est une note normale pour une actu grand public (le lien passe par ce que vit la cible ou par une valeur de la marque). Aucun quota de "fort". Un "fragile" n'est jamais renvoyé.

Avant d'écrire chaque sujet, demande-toi : "Si je montre cette pertinence à la personne sans contexte, est-ce qu'elle dit 'évidemment, c'est pour moi' ou est-ce qu'elle dit 'euh, pourquoi tu me parles de ça ?'". Si c'est la 2e → fragile → jette.

══════════════════════════════════════════════
INTERDIT
══════════════════════════════════════════════

🚫 Politique partisane, lois, élections, faits divers tragiques (sauf si c'est littéralement le métier de la personne)
🚫 Communiqués de presse d'entreprises tech mainstream (Meta, Google, OpenAI, Apple)
🚫 Marronniers vides ("tendances de l'année", "comment bien commencer l'année")
🚫 Sujets de fond sans fait daté de moins de 3 semaines (étude ancienne, analyse générale, article de blog d'expert, « tendance » sans évènement précis)
🚫 Sujets qui parlent UNIQUEMENT de réseaux sociaux ou de création de contenu, sauf si c'est le métier de "${nicheLabel}"
🚫 Sujets génériques sur "l'IA" ou "ChatGPT"
🚫 INTERDIT ABSOLU — événements datés (passés OU à venir) : webinaires, conférences, masterclass, colloques, séminaires, salons, tables rondes, journées professionnelles, pages d'inscription, replays, "save the date". Même si l'événement est récent ou "fait encore parler", il ne compte pas comme actu chaude. Date du jour : ${monthLabel}. Toute mention d'une date d'événement passé (ex : "le 7 mai", "édition 2025") → JETTE le sujet immédiatement.

══════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT (pas de markdown, pas de backticks)
══════════════════════════════════════════════

{
  "actus": [
  {
    "titre": "Titre court du phénomène (max 80 caractères)",
    "resume": "Résumé factuel en 2 phrases courtes du phénomène et pourquoi on en parle",
    "source": "Nom du média, de l'institution ou de l'étude (jamais un blog de marque, une boutique ni un concurrent)",
    "source_url": "URL EXACTE d'une page trouvée par ta recherche web (OBLIGATOIRE : un sujet sans page trouvée est retiré)", "date_publication": "AAAA-MM-JJ, date de cette page",
    "type": "globale" | "niche",
    "axe": "mot_qui_revient" | "obsession_collective" | "comportement_emergent" | "debat_recurrent" | "objet_culturel" | "actu_connectable",
    "ton": "confortable" | "entre_deux" | "decalant",
    "force_pont": "fort" | "moyen",
    "pertinence": "Pont explicite citant un élément précis du profil (cible/activité/combat/piliers), écrit en « tu » à la personne (jamais son prénom ni « elle »)"
  }
  ]
}

IMPORTANT : si tu reprends une actu chaude pré-sourcée (bloc plus haut), recopie son source_url tel quel.

RÉPARTITION — entre 3 et 6 sujets, qualité avant quantité :
- Idéalement 4 actus "globale" (dont tout le monde parle) + 1 ou 2 actus "niche" (l'actu de la semaine dans son secteur).
- Jamais plus de sujets "niche" que de sujets "globale". Zéro sujet niche est acceptable.
- Minimum : 3 sujets au total, dont au moins 2 "globale".
- Jamais 2 sujets du même axe parmi les globales.
- Sur N sujets, ⌈N/3⌉ sont "decalant". Aucun "fragile" ne doit être renvoyé.
- Chaque sujet porte la date de sa page ("date_publication") : moins de 3 semaines.

Si vraiment rien ne fonctionne (moins de 3 actus de la semaine que tu sais relier à cette personne), retourne :
{ "actus": [], "message": "Pas de phénomène suffisamment connectable trouvé cette semaine. Réessaie dans quelques jours !" }`;

  const exclusionBlock = excludedUrls.length > 0
    ? `\n\nSUJETS DÉJÀ PROPOSÉS À L'UTILISATRICE — ne reprends AUCUNE de ces sources, ni le même sujet reformulé depuis une autre source :\n` +
      excludedUrls.map((u) => `- ${u}`).join("\n")
    : "";
  return systemPrompt + exclusionBlock + `\n\nFais les recherches maintenant. Pour chaque sujet candidat : (1) c'est une actu datée de ces derniers jours, pas un sujet de fond ; (2) le pont cite le profil sans être forcé ; (3) registre tagué + ⌈N/3⌉ décalants ; (4) auto-évalue "force_pont" : si "fragile", jette. Écris le JSON final dès que tu as tes sujets.`;
}
