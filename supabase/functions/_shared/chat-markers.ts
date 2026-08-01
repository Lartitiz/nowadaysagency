/**
 * Marqueurs que l'Assistant Com' peut écrire dans sa réponse, et leur parsing.
 *
 * [ACTION_LINK:/route|Libellé]            → un bouton qui OUVRE une page
 * [PLAN_POST:Jour|format|sujet|objectif]  → une carte qui AJOUTE au calendrier
 *
 * Isolé de index.ts pour être testable (index.ts démarre un serveur au chargement).
 */

const ICON_MAP: Record<string, string> = {
  branding: "Palette",
  persona: "Users",
  story: "PenLine",
  proposition: "Target",
  calendar: "CalendarDays",
  calendrier: "CalendarDays",
  post: "PenLine",
  instagram: "PenLine",
  linkedin: "PenLine",
  carrousel: "Layers",
  carousel: "Layers",
  reels: "Film",
  newsletter: "Mail",
  audit: "Search",
  idées: "Lightbulb",
  idees: "Lightbulb",
  contenu: "Sparkles",
  créer: "Sparkles",
  creer: "Sparkles",
  site: "Globe",
  pinterest: "Pin",
  ton: "MessageCircle",
  offres: "ShoppingBag",
  charte: "Palette",
};

export function guessIcon(route: string, label: string): string {
  const text = (route + " " + label).toLowerCase();
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (text.includes(key)) return icon;
  }
  return "ArrowRight";
}

/**
 * Un bouton de navigation ne SAIT PAS ajouter au calendrier : il ne fait
 * qu'ouvrir la page. Si le modèle lui donne un libellé qui promet un ajout
 * ("Ajouter au calendrier", "Planifier ces posts"…), la promesse est fausse et
 * l'utilisatrice atterrit sur un calendrier vide. Garde déterministe : on
 * réécrit le libellé. Le VRAI ajout passe par [PLAN_POST:...] (cartes du chat).
 */
// \b obligatoire : sans lui, "cale" attrapait "calendrier" et un honnête
// "Voir mon calendrier" se faisait réécrire.
const CALENDAR_PROMISE = /\bajout|\bplanifi|\bcaler\b|\bprogramm/i;
export function guardCalendarLabel(route: string, label: string): string {
  if (!route.split("?")[0].startsWith("/calendrier")) return label;
  return CALENDAR_PROMISE.test(label) ? "Ouvrir le calendrier" : label;
}

/**
 * Parse [ACTION_LINK:/route|Label] du texte IA.
 *
 * Le marqueur peut être écrit AU MILIEU d'une phrase ("direction ton
 * [ACTION_LINK:/calendrier|calendrier] pour tout caler"). Le supprimer sèchement
 * laissait un trou dans la phrase ("direction ton  pour tout caler"). On ne
 * retire donc le marqueur que s'il est seul sur sa ligne ; sinon on le remplace
 * par son libellé pour que la phrase reste lisible.
 */
export function parseActionLinks(text: string): { cleanText: string; actions: Array<{ route: string; label: string; icon: string }> } {
  const actions: Array<{ route: string; label: string; icon: string }> = [];
  const regex = /\[ACTION_LINK:([^\]|]+)\|([^\]]+)\]/g;

  const cleanText = text
    .replace(regex, (full, rawRoute, rawLabel, offset: number) => {
      const route = String(rawRoute).trim();
      const rawText = String(rawLabel).trim();
      // Le libellé du BOUTON est gardé (il ne doit rien promettre qu'il ne fait
      // pas) ; le texte réinjecté dans la phrase reste celui écrit par le modèle.
      const label = guardCalendarLabel(route, rawText);
      actions.push({ route, label, icon: guessIcon(route, label) });

      const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
      const lineEndRaw = text.indexOf("\n", offset + full.length);
      const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
      const before = text.slice(lineStart, offset).trim();
      const after = text.slice(offset + full.length, lineEnd).trim();
      const aloneOnItsLine = before === "" && after === "";

      return aloneOnItsLine ? "" : rawText;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText, actions };
}

/** Formats de contenu que le calendrier sait accueillir */
const PLAN_FORMATS: Record<string, string> = {
  post: "post",
  carrousel: "post_carrousel",
  carousel: "post_carrousel",
  post_carrousel: "post_carrousel",
  reel: "reel",
  story: "story_serie",
  story_serie: "story_serie",
  newsletter: "newsletter",
};

/** Seuls objectifs que le reste de l'app sait lire (filtres, couleurs, génération) */
const PLAN_OBJECTIFS = ["visibilite", "confiance", "vente", "credibilite"];

const PLAN_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export interface PlanPost {
  kind: "plan";
  day: string;
  format: string;
  subject: string;
  objective: string;
}

/**
 * Parse [PLAN_POST:Jour|format|sujet|objectif] : une carte de planning que le
 * front transforme en VRAI bouton d'ajout au calendrier (insert), post par post.
 * Une entrée invalide (jour ou format inconnu) est ignorée plutôt que de créer
 * une carte qui écrirait n'importe quoi dans le calendrier.
 */
export function parsePlanPosts(text: string): { cleanText: string; plan: PlanPost[] } {
  const plan: PlanPost[] = [];
  const regex = /\[PLAN_POST:([^\]|]*)\|([^\]|]*)\|([^\]|]*)\|([^\]|]*)\]/g;

  const cleanText = text
    .replace(regex, (_full, rawDay, rawFormat, rawSubject, rawObjective) => {
      const day = PLAN_DAYS.find(
        (d) => d.toLowerCase() === String(rawDay).trim().toLowerCase(),
      );
      const format = PLAN_FORMATS[String(rawFormat).trim().toLowerCase()];
      const subject = String(rawSubject).trim().slice(0, 200);
      const rawObj = String(rawObjective).trim().toLowerCase();
      const objective = PLAN_OBJECTIFS.includes(rawObj) ? rawObj : "visibilite";
      if (day && format && subject) {
        plan.push({ kind: "plan", day, format, subject, objective });
      }
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Jamais deux fois le même jour + sujet (le modèle se répète parfois).
  const seen = new Set<string>();
  const deduped = plan.filter((p) => {
    const key = `${p.day}|${p.subject.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { cleanText, plan: deduped.slice(0, 7) };
}

