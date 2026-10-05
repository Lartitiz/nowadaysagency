// Familles d'angles éditoriaux — table UNIQUE « identifiant d'angle → famille »
// (socle commun, étape 1, 05/10/2026 ; audit
// reference-carrousel-ia/socle-etat-des-lieux.md, sections 2a et annexe A).
//
// Plus de 100 identifiants d'angles, de types, de structures et de scénarios
// existent dans le code, répartis en une quinzaine de listes qui ne se
// correspondent pas. Ils se rangent en 11 familles ; chaque famille a le même
// rapport aux 7 règles du socle (socle.ts, SOCLE_FAMILLES).
//
// Module PUR, sans dépendance : utilisable tel quel côté serveur (Deno) et
// côté front (Vite). DESCRIPTIF pour l'instant : aucune consigne ne le lit
// encore (aucun changement de sortie).
//
// Lecture : `angleFamily(id, source?)`. L'identifiant est normalisé (casse,
// accents, tirets, soulignés, espaces, apostrophes, émojis) : « before-after »,
// « before_after » et « Before / After » donnent la même clé. Un texte libre
// (idée de la boîte à idées) ou un identifiant inconnu renvoie null.
// `source` sert quand une même clé change de famille selon la liste
// (« recit_experience » : récit perso dans les suggestions de la semaine, actu
// dans les véhicules du newsjacking).

export type AngleFamily = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

export const ANGLE_FAMILY_IDS: readonly AngleFamily[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

export const ANGLE_FAMILIES: Record<AngleFamily, { nom: string; definition: string }> = {
  A: { nom: "Récit personnel", definition: "Son vécu à elle est la matière." },
  B: { nom: "Cas client / témoignage", definition: "Le vécu d'une autre personne, fourni." },
  C: { nom: "Actu", definition: "La thèse vient d'un fait extérieur." },
  D: { nom: "Opinion / analyse", definition: "Une position ou un décryptage." },
  E: { nom: "Liste / tuto / checklist", definition: "Des éléments ou des étapes, souvent numérotés." },
  F: { nom: "Comparatif / avant-après factuel", definition: "Deux états ou options comparés." },
  G: { nom: "Offre / produit / vente", definition: "Présenter et donner envie." },
  H: { nom: "Identification / quotidien", definition: "Une scène où l'on se reconnaît." },
  I: { nom: "FAQ / objections", definition: "Questions-réponses." },
  J: { nom: "Série photo / inspiration", definition: "Les photos ou une source portent le propos." },
  K: { nom: "Repris d'un texte existant", definition: "Sa matière est déjà écrite." },
};

/** Listes du code qui portent des identifiants d'angle, de type ou de scénario. */
export type AngleSource =
  | "instagram_angles"
  | "linkedin_angles"
  | "linkedin_templates"
  | "pinterest_angles"
  | "content_structures"
  | "carousel_types"
  | "editorial_intent"
  | "newsjacking"
  | "weekly_suggestions"
  | "calendar_quick"
  | "calendar_coaching"
  | "idea_lenses"
  | "stories_structures"
  | "stories_narration"
  | "stories_vente"
  | "reel_structures"
  | "reel_hooks"
  | "launch"
  | "photo_series"
  | "reprise";

/** Normalise un identifiant ou un libellé : minuscules, sans accents, mots séparés par « _ ». */
export function normalizeAngleId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Identifiants (et libellés affichés) de chaque liste, tels qu'écrits dans le
 * code. La clé est normalisée à la lecture. Où vit chaque liste :
 * - instagram_angles : src/lib/content-structures.ts EDITORIAL_ANGLES (id + label) ;
 * - linkedin_angles : content-structures.ts LINKEDIN_EDITORIAL_ANGLES ;
 * - linkedin_templates : _shared/copywriting-prompts.ts LINKEDIN_TEMPLATES ;
 * - pinterest_angles : content-structures.ts PINTEREST_EDITORIAL_ANGLES + PINTEREST_VISUAL_ANGLES ;
 * - content_structures : content-structures.ts CONTENT_STRUCTURES ;
 * - carousel_types : carousel-ai/writing-contract.ts carouselStructureGuide (types de carrousel) ;
 * - editorial_intent : _shared/carousel-editorial-contract.ts PLAN (editorial_intent.mode) ;
 * - newsjacking : newsjacking-angles/index.ts (véhicules) ;
 * - weekly_suggestions : generate-content/index.ts (suggestions de la semaine) ;
 * - calendar_quick : src/lib/calendar-constants.ts ANGLES (libellés) ;
 * - calendar_coaching : calendar-coaching/index.ts (13 angles, libellés) ;
 * - idea_lenses : _shared/copywriting-prompts.ts IDEA_LENSES ;
 * - stories_structures / stories_narration / stories_vente : _shared/format-briefs.ts (storiesBrief) ;
 * - reel_structures : format-briefs.ts reelBrief ; reel_hooks : creative-flow/index.ts HOOKS_TOOL ;
 * - launch : src/lib/launch-templates.ts CONTENT_TYPES ;
 * - photo_series : photo-dump-plan, inspire-ai ; reprise : recyclage, crosspost, slides fournies.
 */
export const ANGLE_SOURCES: Record<AngleSource, Record<string, AngleFamily | null>> = {
  instagram_angles: {
    "enquete": "D", "Enquête / décryptage": "D",
    "test": "A", "Test grandeur nature": "A",
    "coup-de-gueule": "D",
    "mythe": "D", "Mythe à déconstruire": "D",
    "storytelling": "A",
    "histoire-cliente": "B",
    "mise-en-valeur": "G", "Mise en valeur produit / création": "G",
    "surf-actu": "C", "Surf sur l'actu": "C",
    "regard-philo": "D", "Regard philosophique": "D",
    "conseil-contre-intuitif": "D",
    // Avant/après : comparatif par défaut (ne présume pas d'un vécu à elle).
    "before-after": "F",
    "identification": "H", "Identification / quotidien": "H",
    "build-in-public": "A",
    "analyse-profondeur": "D", "Analyse en profondeur": "D",
  },
  linkedin_angles: {
    "decryptage_expert": "D", "Décryptage expert": "D",
    "prise_de_position": "D",
    "mythe_deconstruire": "D", "Mythe à déconstruire": "D",
    "storytelling_pro": "A",
    "etude_de_cas": "B",
    "coulisses_metier": "A",
    "conseil_contre_courant": "D", "Conseil contre-courant": "D",
    "reflexion_de_fond": "D",
  },
  linkedin_templates: {
    "decryptage_expert": "D", "prise_de_position": "D", "mythe_deconstruire": "D", "storytelling_pro": "A",
    "etude_de_cas": "B", "coulisses_metier": "A", "conseil_contre_courant": "D", "reflexion_de_fond": "D",
  },
  pinterest_angles: {
    "epingle_produit": "G", "Épingle produit / offre": "G",
    "epingle_conseil": "E", "Épingle conseil / tuto": "E",
    "epingle_inspiration": "J",
    "epingle_article": "D", "Épingle article / blog": "D",
    "infographie": "E",
    "checklist": "E",
    "mini_tuto": "E",
    "avant_apres": "F",
    "schema_visuel": "E",
  },
  content_structures: {
    "educationnelle": "D", "conseil_pratique": "E", "coup_de_gueule": "D", "storytelling": "A",
    "tuto": "E", "etude_de_cas": "B", "lancement": "G",
  },
  carousel_types: {
    "tips": "E", "tutoriel": "E", "prise_de_position": "D", "mythe_realite": "D", "storytelling": "A",
    "etude_de_cas": "B", "checklist": "E", "comparatif": "F", "before_after": "F", "promo": "G",
    "coulisses": "A", "photo_dump": "J",
  },
  editorial_intent: {
    "recit": "A", "explication": "D", "argumentation": "D", "reflexion": "D", "comparaison": "F",
    "liste": "E", "serie_visuelle": "J",
  },
  newsjacking: {
    // Avec une actu, même le récit d'expérience reste de l'actu (vécu en appui).
    "recit_experience": "C", "declencheur_externe": "C", "constat_decale": "C",
    "montrer_plutot_quexpliquer": "C", "parallele_absurde": "C",
  },
  weekly_suggestions: {
    "recit_experience": "A", "declencheur_externe": "C", "constat_decale": "D", "coup_de_gueule": "D",
    "mythe_a_deconstruire": "D", "histoire_cliente": "B", "before_after": "F", "identification": "H",
    "build_in_public": "A", "regard_philosophique": "D", "surf_actu": "C",
  },
  calendar_quick: {
    "Storytelling": "A", "Mythe à déconstruire": "D", "Coup de gueule": "D", "Enquête / décryptage": "D",
    "Conseil contre-intuitif": "D", "Test grandeur nature": "A", "Before / After": "F",
    "Histoire cliente": "B", "Regard philosophique": "D", "Surf sur l'actu": "C",
  },
  calendar_coaching: {
    "Enquête / Décryptage": "D", "Test grandeur nature": "A", "Coup de gueule": "D",
    "Mythe à déconstruire": "D", "Storytelling + leçon": "A", "Histoire cliente / Cas réel": "B",
    "Surf sur l'actu": "C", "Regard philo / sociétal": "D", "Conseil contre-intuitif": "D",
    "Before / After": "F", "Identification / Quotidien": "H", "Build in public": "A",
    "Analyse en profondeur": "D",
  },
  idea_lenses: {
    "expertise_pratique": "E", "contre_pied_pairs": "D", "perspective_elargie": "D",
    "analogie_inattendue": "D", "confession_couteuse": "A", "observation_silencieuse": "D",
    "micro_scene": "H", "question_taboue": "I", "archive_retour": "F", "inversion": "D",
    "coulisses_brutes": "A", "moment_bascule": "A", "arc_narratif": "A",
    // Combinaison de deux angles : sa famille est celle des angles combinés.
    "intersection_angles": null,
  },
  stories_structures: {
    "journal_bord": "A", "probleme_solution": "D", "storytime": "A", "vente_douce": "G",
    "faq_live": "I", "build_in_public": "A", "micro_masterclass": "E", "teasing": "G",
  },
  stories_narration: {
    "coulisses": "A", "reflexion": "D", "interpellation": "H", "conseil_vecu": "A",
    "storytime_client": "B", "coup_de_gueule": "D",
  },
  // Séquences de vente par gamme de prix ou type d'offre (storiesBrief) : toutes G.
  stories_vente: { "petit": "G", "moyen": "G", "premium": "G", "physique": "G", "gratuit": "G" },
  reel_structures: { "face_cam_confession": "A", "voix_off_broll": "E", "hook_loop": "D" },
  reel_hooks: {
    "vecu_perso": "A", "contre_intuition": "D", "objection_retournee": "D", "question_choc": "D",
    // Fait brut : opinion par défaut ; C quand le contenu part d'une actu (news_context).
    "fait_brut": "D", "scene_coupee": "D",
  },
  launch: {
    "coup_de_gueule_doux": "D", "conseil_contre_intuitif": "D", "enigme_teaser": "G", "tendance": "C",
    "storytelling_personnel": "A", "coulisses": "A", "educatif_autorite": "D", "question_engagement": "H",
    "valeurs_combat": "D", "annonce_revelation": "G", "presentation_offre": "G", "objections_faq": "I",
    "preuve_sociale": "B", "pour_qui": "G", "derniere_chance": "G", "bonus_early_bird": "G",
    "story_sequence_vente": "G", "story_sequence_faq": "I", "story_sequence_temoignage": "B",
    "story_sequence_objection": "I", "story_sequence_last_call": "G", "story_sequence_bienvenue": "G",
    "live_qa": "I", "dm_strategiques": "G", "diagnostic": "E", "comparatif": "F", "mini_fiction": "A",
    "remerciement": "A", "bilan": "A",
  },
  photo_series: {
    "photo_dump": "J", "serie_photo": "J", "pure_photo": "J", "inspiration": "J", "inspire": "J",
  },
  reprise: {
    "recyclage": "K", "recycle": "K", "crosspost": "K", "slides_fournies": "K", "user_slides": "K",
    "contenu_existant": "K",
  },
};

/** Listes dont les clés sont trop génériques (« petit », « moyen ») pour la table globale : lues seulement avec leur source. */
const SCOPED_ONLY: ReadonlySet<AngleSource> = new Set(["stories_vente"]);

/**
 * Clés présentes dans plusieurs listes avec des familles différentes : la
 * famille retenue SANS source. Avec une source, c'est celle de la liste.
 */
export const ANGLE_FAMILY_DEFAULTS: Record<string, AngleFamily> = {
  recit_experience: "A",
  constat_decale: "D",
};

const normalizedSources: Record<AngleSource, Map<string, AngleFamily | null>> = Object.fromEntries(
  Object.entries(ANGLE_SOURCES).map(([source, table]) => [
    source,
    new Map(Object.entries(table).map(([k, v]) => [normalizeAngleId(k), v])),
  ]),
) as Record<AngleSource, Map<string, AngleFamily | null>>;

/** Table globale (sans source) : union des listes, conflits tranchés par ANGLE_FAMILY_DEFAULTS. */
export const ANGLE_FAMILY_TABLE: Readonly<Record<string, AngleFamily | null>> = (() => {
  const out: Record<string, AngleFamily | null> = {};
  for (const [source, table] of Object.entries(normalizedSources) as [AngleSource, Map<string, AngleFamily | null>][]) {
    if (SCOPED_ONLY.has(source)) continue;
    for (const [k, v] of table) if (!(k in out) || out[k] === null) out[k] = v;
  }
  for (const [k, v] of Object.entries(ANGLE_FAMILY_DEFAULTS)) out[normalizeAngleId(k)] = v;
  return Object.freeze(out);
})();

/** Clés qui changent de famille selon la liste (doivent toutes avoir un défaut). */
export function angleFamilyConflicts(): Record<string, AngleFamily[]> {
  const seen: Record<string, Set<AngleFamily>> = {};
  for (const [source, table] of Object.entries(normalizedSources) as [AngleSource, Map<string, AngleFamily | null>][]) {
    if (SCOPED_ONLY.has(source)) continue;
    for (const [k, v] of table) if (v) (seen[k] ||= new Set()).add(v);
  }
  return Object.fromEntries(Object.entries(seen).filter(([, s]) => s.size > 1).map(([k, s]) => [k, [...s].sort()]));
}

/**
 * Famille d'un identifiant d'angle, de type, de structure ou de scénario.
 * `source` : la liste d'où vient l'identifiant, quand elle est connue (une clé
 * absente de cette liste est cherchée dans la table globale). Identifiant
 * inconnu, vide ou texte libre : null.
 */
export function angleFamily(raw: unknown, source?: AngleSource | null): AngleFamily | null {
  const key = normalizeAngleId(raw);
  if (!key) return null;
  if (source) {
    const scoped = normalizedSources[source]?.get(key);
    if (scoped !== undefined) return scoped;
  }
  return ANGLE_FAMILY_TABLE[key] ?? null;
}
