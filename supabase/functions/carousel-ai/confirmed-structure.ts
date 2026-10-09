/** Preserve user decisions without treating an automatic editorial proposal as human instruction. */
export function buildConfirmedStructureBlock(
  confirmed_structure: any,
  opts: {
    contentFields?: string;
    narrativeThread?: string;
    narrativeContext?: string;
    scenarioOrigin?: string;
    withStoryBeat?: boolean;
    extraRules?: string[];
  } = {}
): string {
  if (!confirmed_structure || !Array.isArray(confirmed_structure) || confirmed_structure.length === 0) return "";

  const {
    contentFields = "body, caption",
    narrativeThread,
    narrativeContext = "décidé en voyant les photos",
    withStoryBeat = false,
    extraRules = [],
  } = opts;

  const automatic = opts.scenarioOrigin === "automatic";
  const structureList = confirmed_structure
    .map((s: any) => {
      let line = `  Slide ${s.slide_number} — Rôle : ${s.role} — Titre : "${s.title_suggestion}"`;
      if (s.photo_index) line += ` — Photo n°${s.photo_index}${s.slide_type ? ` (${s.slide_type})` : ""}`;
      if (s.overlay_position) line += ` — Position du texte : ${s.overlay_position}`;
      line += ` — ${s.strategic_note}`;
      // Plan compact : strategic_note et image_role sont reconstitués depuis
      // contribution et image_relation ; ne pas les faire lire deux fois.
      if (s.contribution && s.contribution !== s.strategic_note) line += `\n    → Apport : ${s.contribution}`;
      if (s.inherits) line += `\n    → Reprend : ${s.inherits}`;
      if (s.develops) line += `\n    → Fait avancer : ${s.develops}`;
      if (s.source_ids?.length) line += `\n    → Références : ${s.source_ids.join(", ")}`;
      if (s.image_role && !(withStoryBeat && s.image_role === s.image_relation)) line += `\n    → Fonction de l’image : ${s.image_role}`;
      if (withStoryBeat) {
        if (s.story_beat) line += `\n    → Raconte : ${s.story_beat}`;
        if (s.photo_observation) line += `\n    → Observation visuelle (analyse IA) : ${s.photo_observation}`;
        if (s.image_relation) line += `\n    → Relation image/récit : ${s.image_relation}`;
        if (s.factual_basis) line += `\n    → Sources à vérifier contre le brief et la marque : ${s.factual_basis}`;
        if (s.visual_anchor) line += `\n    → Détail de composition (pas une consigne de texte) : ${s.visual_anchor}`;
      }
      return line;
    })
    .join("\n");

  const narrativeBlock = withStoryBeat && narrativeThread && typeof narrativeThread === "string" && narrativeThread.trim()
    ? `${automatic ? "FIL AUTOMATIQUE À RÉÉVALUER" : "RÉCIT VALIDÉ À EXÉCUTER"} (${narrativeContext}) : ${narrativeThread.trim()}
Chaque slide écrit UNE étape de ce récit. Préserve les choix du scénario, mais ne traite jamais une proposition IA comme une preuve factuelle. Corrige les affirmations non étayées sans changer l’ordre ni les photos. ${opts.scenarioOrigin === "automatic" ? "Ce fil n’est pas une demande humaine. S’il décrit une visite des photos sans propos, remplace-le par une proposition éditoriale étayée et réécris les étapes dans les mêmes pages." : "Les rôles validés sont conservés."}

`
    : "";

  const rules = [
    opts.scenarioOrigin === "automatic" ? "Plan automatique : conserve nombre, ordre, types et photos ; réécris librement le fil, les rôles, les titres et les développements pour porter une idée étayée. Les photos peuvent accompagner indirectement cette idée." : "Ne change NI l’ordre NI les rôles NI le nombre de slides",
    automatic ? "Les titres proposés sont des suggestions IA remplaçables, pas des formulations validées." : "Utilise les titres proposés comme base (tu peux les affiner légèrement)",
    `Génère uniquement le contenu (${contentFields}) pour chaque slide`,
    `Le JSON retourné doit contenir exactement ${confirmed_structure.length} slides`,
    "Si une slide a un photo_index, le champ photo_index doit être présent dans le JSON de sortie",
    ...extraRules,
  ];

  return `══════════════════════════════════════
${automatic ? "PLAN AUTOMATIQUE — RÉPARTITION À CONSERVER, PROPOS À CONSTRUIRE" : "STRUCTURE IMPOSÉE PAR L'UTILISATEUR·ICE — OBLIGATOIRE"}
══════════════════════════════════════
${narrativeBlock}Tu DOIS générer le contenu pour EXACTEMENT ces slides dans cet ordre :
${structureList}

RÈGLES ABSOLUES :
${rules.map((r) => `- ${r}`).join("\n")}

`;
}
