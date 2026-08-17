// Relecture-gabarits du carrousel PHOTO (lot 13/07, suite du chantier gabarits).
//
// Constat : le modèle d'écriture, concentré sur le fil du récit, « oublie »
// souvent de choisir les gabarits en cours de carrousel (surtout avec une
// structure auto-validée) → tout retombe sur le gabarit par défaut, rendu
// monotone. Correction : une passe de RELECTURE dédiée, APRÈS les textes
// définitifs (post redac-gate) — le modèle relit ce qui est écrit et pose le
// gabarit qui sert chaque slide. Décision prise sur le texte réel → s'adapte à
// chaque contenu ; AUCUN quota de variété : un carrousel entièrement en
// « profonde » est un choix légitime.
//
// Anti-invention par CODE (pas par consigne) : un big_number qui n'apparaît
// pas verbatim dans le texte de la slide est rejeté ; des points qui ne
// reprennent pas des mots du texte sont rejetés ; la passe ne peut JAMAIS
// réécrire un overlay_text. Fail-open : toute erreur → contenu inchangé.

// Import PARESSEUX de anthropic.ts (au moment de l'appel seulement) : son
// chargement lit l'environnement, ce qui casserait les tests purs de ce module.
import type { AnthropicModel } from "./anthropic.ts";

const KNOWN_TEMPLATES = ["couverture", "profonde", "etiquette", "chiffre", "liste", "etape", "citation", "finale"];

export interface TemplateAssignment {
  slide_number: number;
  template?: string | null;
  big_number?: string | null;
  attribution?: string | null;
  cta_label?: string | null;
  points?: string[] | null;
  step_number?: number | null;
}

const ASSIGN_TOOL = {
  name: "poser_les_gabarits",
  description: "Pose le gabarit visuel de chaque slide en fonction de ce qui est écrit. Ne réécrit aucun texte.",
  input_schema: {
    type: "object",
    properties: {
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slide_number: { type: "number" },
            template: { type: "string", enum: KNOWN_TEMPLATES },
            big_number: { type: ["string", "null"], description: "Gabarit chiffre uniquement : le chiffre COPIÉ EXACTEMENT depuis l'overlay_text (ex '-40 %'). Jamais inventé." },
            attribution: { type: ["string", "null"], description: "Gabarit citation uniquement : qui parle, si le texte le dit (≤5 mots)." },
            cta_label: { type: ["string", "null"], description: "Gabarit finale uniquement : invitation courte (≤6 mots, ex 'Dites-le-moi en commentaire')." },
            points: { type: ["array", "null"], items: { type: "string" }, description: "Gabarit liste uniquement : les 2-3 items, repris des mots du texte (≤8 mots chacun)." },
            step_number: { type: ["number", "null"], description: "Gabarit etape uniquement : numéro de l'étape du processus décrit (1, 2, 3…)." },
          },
          required: ["slide_number", "template"],
        },
      },
    },
    required: ["slides"],
  },
};

function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Normalisation souple pour vérifier qu'un extrait vient bien du texte. */
function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
}

/**
 * Merge PUR et GARDÉ des assignations dans le JSON de contenu (testable sans
 * modèle). Ne touche jamais aux textes ; rejette la matière non issue du texte.
 */
export function applyTemplateAssignments(parsed: any, assignments: TemplateAssignment[]): { applied: number; rejected: string[] } {
  const rejected: string[] = [];
  let applied = 0;
  const slides: any[] = Array.isArray(parsed?.slides) ? parsed.slides : [];
  if (slides.length === 0) return { applied, rejected };
  const byNumber = new Map<number, TemplateAssignment>();
  for (const a of assignments || []) {
    if (Number.isInteger(a?.slide_number)) byNumber.set(a.slide_number, a);
  }
  const nums = slides.map((s, i) => Number(s?.slide_number) || i + 1);
  const minNum = Math.min(...nums);
  const maxNum = Math.max(...nums);

  slides.forEach((s: any, i: number) => {
    const a = byNumber.get(nums[i]);
    if (!a || !KNOWN_TEMPLATES.includes(String(a.template))) return;
    const text: string = s?.overlay_text || "";
    const t = String(a.template);

    // Cohérences de position (le filet du rendu les revérifie aussi).
    if (t === "couverture" && nums[i] !== minNum) return void rejected.push(`#${nums[i]} couverture hors slide 1`);
    if (t === "finale" && nums[i] !== maxNum) return void rejected.push(`#${nums[i]} finale hors dernière slide`);

    if (t === "chiffre") {
      const big = (a.big_number || "").trim();
      const existing = String(s?.big_number || "").trim();
      // Le chiffre du gabarit vit par DESIGN hors de l'overlay_text (prompt
      // d'écriture) : exiger sa présence verbatim dans le texte rendait la
      // relecture stérile sur ce gabarit. On accepte donc aussi la
      // re-confirmation du chiffre déjà posé par la passe d'écriture (dont la
      // véracité est contrôlée par le redac-gate, qui scanne big_number).
      const fromText = !!big && norm(text).includes(norm(big));
      const reaffirmed = !!big && !!existing && norm(existing) === norm(big);
      if (!fromText && !reaffirmed) {
        return void rejected.push(`#${nums[i]} chiffre sans big_number issu du texte`);
      }
      s.big_number = big;
    }
    if (t === "liste") {
      const pts = (a.points || []).filter((p) => typeof p === "string" && p.trim() && wordCount(p) <= 8).slice(0, 3);
      const textWords = new Set(norm(text).split(" "));
      const grounded = pts.filter((p) => norm(p).split(" ").some((w) => w.length > 3 && textWords.has(w)));
      // Même logique que chiffre : des points identiques à ceux déjà posés par
      // la passe d'écriture sont une re-confirmation, pas une invention.
      const existingPts = Array.isArray(s?.points) ? s.points.map((p: any) => norm(String(p))).join("|") : "";
      const reaffirmed = !!existingPts && pts.map((p) => norm(p)).join("|") === existingPts;
      if (grounded.length < 2 && !reaffirmed) return void rejected.push(`#${nums[i]} liste sans points ancrés dans le texte`);
      s.points = reaffirmed ? pts : grounded;
    }
    if (t === "citation" && a.attribution && wordCount(a.attribution) <= 5) s.attribution = a.attribution.trim();
    if (t === "finale" && a.cta_label && wordCount(a.cta_label) <= 8) s.cta_label = a.cta_label.trim();
    if (t === "etape" && Number.isInteger(a.step_number) && (a.step_number as number) > 0) s.step_number = a.step_number;

    s.template = t;
    // Purge la matière des AUTRES gabarits, périmée après réassignation : un
    // big_number restant sur une slide passée en « profonde » (ou dont le texte
    // édité ne contient plus le chiffre) ressortirait quand même au rendu.
    if (t !== "chiffre") delete s.big_number;
    if (t !== "liste") delete s.points;
    if (t !== "citation") delete s.attribution;
    if (t !== "finale") delete s.cta_label;
    if (t !== "etape") delete s.step_number;
    applied++;
  });
  return { applied, rejected };
}

/**
 * Passe de relecture : relit les textes DÉFINITIFS et pose les gabarits.
 * Fail-open : toute erreur → contenu retourné inchangé.
 */
export async function assignPhotoTemplates(
  content: string,
  opts: { model: AnthropicModel; logger?: (m: string) => void },
): Promise<string> {
  const log = opts.logger || (() => {});
  try {
    const parsed = JSON.parse(content);
    const slides: any[] = Array.isArray(parsed?.slides) ? parsed.slides : [];
    const withText = slides.filter((s) => (s?.overlay_text || "").trim());
    if (withText.length < 2) return content;

    const digest = slides.map((s: any, i: number) => ({
      slide_number: Number(s?.slide_number) || i + 1,
      overlay_text: s?.overlay_text || null,
      role: s?.role || null,
      template_actuel: s?.template || null,
      // Matière déjà posée par la passe d'écriture : sans elle, la relecture ne
      // peut ni re-confirmer un gabarit chiffre/liste ni juger sa cohérence.
      ...(s?.big_number ? { big_number: s.big_number } : {}),
      ...(Array.isArray(s?.points) && s.points.length ? { points: s.points } : {}),
    }));

    const { callAnthropic } = await import("./anthropic.ts");
    const raw = await callAnthropic({
      model: opts.model,
      system: `Tu poses le GABARIT VISUEL de chaque slide d'un carrousel photo Instagram, en relisant les textes DÉFINITIFS. Tu ne réécris RIEN.

GABARITS : ${KNOWN_TEMPLATES.join(", ")}.
- couverture : première slide uniquement.
- profonde : le DÉFAUT — une vraie phrase posée sur la photo. C'est le bon choix pour la plupart des slides ; un carrousel entièrement en profonde est légitime si le récit est un fil continu.
- etiquette : texte très court (≤4 mots) qui marque un pivot (AVANT, APRÈS, un mot-étendard).
- chiffre : SEULEMENT si le texte contient déjà un chiffre marquant → big_number = ce chiffre copié EXACTEMENT. Au plus 1 par carrousel.
- liste : SEULEMENT si le texte énumère 2-3 items distincts → points = les items, avec les mots du texte. Au plus 1 par carrousel.
- etape : la slide décrit une étape numérotable d'un processus annoncé.
- citation : le texte est un propos rapporté (guillemets, « m'a dit »…) → attribution si le texte dit qui parle.
- finale : dernière slide UNIQUEMENT si elle pose une question au lecteur → cta_label = invitation courte (≤6 mots).

RÈGLE D'OR : le gabarit sert le texte tel qu'il est écrit. N'invente ni chiffre, ni citation, ni liste. Ne force AUCUNE variété artificielle. Si template_actuel est déjà juste, garde-le.`,
      messages: [{ role: "user", content: `SLIDES (textes définitifs) :\n${JSON.stringify(digest, null, 2)}\n\nPose le gabarit de chaque slide via le tool.` }],
      max_tokens: 1500,
      temperature: 0.2,
      tool: ASSIGN_TOOL,
      // Petit tool call (1500 tokens) en bout de chaîne carousel-ai : jamais tourné
      // sans limite avant ce correctif (audit timeouts 17/08).
      abortTimeoutMs: 30_000,
    });
    const out = JSON.parse(raw);
    const { applied, rejected } = applyTemplateAssignments(parsed, out?.slides || []);
    if (rejected.length) log(`[template-assign] rejets anti-invention : ${rejected.join(" ; ")}`);
    log(`[template-assign] ${applied}/${slides.length} gabarit(s) posé(s) : ${slides.map((s: any) => s.template || "∅").join(", ")}`);
    return applied > 0 ? JSON.stringify(parsed, null, 2) : content;
  } catch (err) {
    log(`[template-assign] passe ignorée (fail-open) : ${err instanceof Error ? err.message.slice(0, 200) : "erreur"}`);
    return content;
  }
}

/**
 * Type « assign_templates » de carousel-ai (mode « Mes slides », 15/07) : pose
 * les gabarits sur des slides DÉJÀ ÉCRITES par l'utilisatrice. AUCUNE
 * génération, AUCUN redac-gate, aucun texte modifié. Fail-open intégral :
 * n'importe quel pépin → slides retournées telles quelles (le rendu dérive de
 * toute façon un gabarit sûr via resolvePhotoTemplate).
 *
 * Verbatim garanti PAR CODE : quel que soit ce que renvoie la passe,
 * overlay_text est réécrasé par le texte source de chaque slide.
 * `assignFn` injectable pour les tests (défaut : assignPhotoTemplates).
 */
export async function assignTemplatesToProvidedSlides(
  slides: unknown,
  opts: {
    model: AnthropicModel;
    logger?: (m: string) => void;
    assignFn?: typeof assignPhotoTemplates;
  },
): Promise<any[]> {
  const input = Array.isArray(slides)
    ? slides.filter((s) => s && typeof s === "object")
    : [];
  if (input.length === 0) return [];
  try {
    const fn = opts.assignFn ?? assignPhotoTemplates;
    const out = await fn(JSON.stringify({ slides: input }), {
      model: opts.model,
      logger: opts.logger,
    });
    const parsed = JSON.parse(out);
    if (!Array.isArray(parsed?.slides) || parsed.slides.length !== input.length) {
      return input;
    }
    return parsed.slides.map((s: any, i: number) => ({
      ...s,
      overlay_text: (input[i] as any).overlay_text ?? null,
    }));
  } catch (err) {
    opts.logger?.(
      `[template-assign] endpoint fail-open : ${err instanceof Error ? err.message.slice(0, 200) : "erreur"}`,
    );
    return input;
  }
}
