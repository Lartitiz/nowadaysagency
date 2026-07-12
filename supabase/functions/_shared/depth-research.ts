// Recherche « creuser le sujet » (lot D-bis, audit qualité carrousels 11-12/07/2026).
//
// Objectif : quand l'utilisatrice n'a fourni AUCUNE matière (pas de réponses
// d'approfondissement), donner au moteur ce qu'il y a SOUS le sujet — mécanisme
// réel, contre-intuitif, limites, savoir de praticien·ne — pour éviter le
// traitement de surface qui fait les contenus bateaux. Les chiffres sourcés sont
// un sous-produit (ils rejoignent la liste blanche du redac-gate via gateInputText).
//
// Contrat : la recherche est un CONDIMENT. Tout échec (timeout, 4xx/5xx, réponse
// vide, web_search non activé) est SILENCIEUX : on retourne "" et la génération
// se fait sans, comme avant. Jamais bloquant, jamais d'erreur remontée.

import { forcesDisabledThinking } from "./anthropic.ts";

const RESEARCH_TIMEOUT_MS = 25_000;

/** Enveloppe la matière trouvée dans le bloc d'injection prompt. "" si rien d'utilisable. */
export function buildDepthBlock(material: string): string {
  const cleaned = (material || "").trim();
  // Le prompt de recherche répond exactement "VIDE" quand il n'a rien trouvé de solide.
  if (!cleaned || cleaned.length < 80 || /^VIDE\b/i.test(cleaned)) return "";
  return `

══════════════════════════════════════
MATIÈRE DE PROFONDEUR (recherche fraîche sur le sujet)
══════════════════════════════════════
${cleaned}

CONSIGNE D'USAGE (impérative) :
- Cette matière sert la slide « fond du sujet » / « mécanisme » (cf. DEPTH_LAYER) : le mécanisme expliqué est un mécanisme RÉEL et DOCUMENTÉ du sujet, pas un concept psycho plaqué.
- C'est un CONDIMENT, pas le plat : le carrousel reste porté par la voix, l'angle et le vécu de l'utilisatrice. INTERDIT d'en faire un résumé d'article ou une revue de presse.
- Toute donnée chiffrée reprise reste attachée à sa source (mention discrète : nom, année). Ne reprends JAMAIS un chiffre sans sa source.
- Si un élément contredit le positionnement de l'utilisatrice, ignore-le plutôt que de tordre son propos.`;
}

/**
 * Interroge Claude + web_search pour ramener de la matière de profondeur sur un sujet.
 * Retourne le texte brut de la matière ("" si rien / échec). Borné : 2 recherches,
 * 25 s au total, 2 tours max (pause_turn).
 */
export async function fetchDepthMaterial(opts: {
  subject: string;
  activity?: string;
  model: string;
  apiKey: string;
  logger?: (msg: string) => void;
}): Promise<string> {
  const { subject, activity, model, apiKey, logger } = opts;
  if (!subject || !apiKey) return "";

  const prompt = `Tu prépares la MATIÈRE DE PROFONDEUR pour un contenu Instagram sur le sujet suivant, écrit par ${activity ? `une professionnelle (${activity})` : "une professionnelle indépendante"} :

"${subject}"

Fais 1 à 2 recherches web ciblées, puis rédige un bloc COURT (200 mots max, en français) qui donne ce qu'il y a SOUS la surface du sujet :
1. LE MÉCANISME RÉEL en jeu (technique, économique, sectoriel — comment ça marche vraiment, qui gagne quoi). Explique-le simplement.
2. UN ANGLE CONTRE-INTUITIF ou une controverse actuelle sur ce sujet (ce que les contenus grand public ne disent pas, ou disent faux).
3. UNE LIMITE OU NUANCE de praticien·ne (« ça marche sauf si… », le détail que seuls les gens du métier connaissent).
4. SI et seulement si tu en trouves une solide : 1 donnée chiffrée récente AVEC sa source et son année, format « chiffre (Source, année) ».

RÈGLES STRICTES :
- Des FAITS et des mécanismes, pas des conseils ni des opinions.
- Aucun chiffre sans source vérifiée dans tes résultats de recherche. Dans le doute, pas de chiffre.
- Pas de biais psycho générique (Zajonc, Kahneman…) sauf s'il est LE cœur documenté du sujet.
- Réponds UNIQUEMENT avec le bloc de matière (prose compacte, éventuellement 3-4 puces). Pas de préambule, pas de titre.
- Si tes recherches ne donnent rien de solide ou de spécifique, réponds exactement : VIDE`;

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 2048,
    ...(forcesDisabledThinking(model) ? { thinking: { type: "disabled" } } : {}),
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    messages: [{ role: "user", content: prompt }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);
  try {
    const allContent: unknown[] = [];
    let data: any;
    // pause_turn : l'API peut interrompre un tour long à base d'outils serveur
    // (même garde que newsjacking-ai) — on relance une fois pour obtenir la fin.
    for (let turn = 0; turn < 2; turn++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) {
        logger?.(`[depth-research] HTTP ${response.status} — génération sans matière`);
        return "";
      }
      data = await response.json();
      allContent.push(...(data.content || []));
      if (data.stop_reason !== "pause_turn") break;
      requestBody.messages = [
        ...(requestBody.messages as unknown[]),
        { role: "assistant", content: data.content },
        { role: "user", content: "Termine : renvoie maintenant le bloc de matière demandé (ou VIDE)." },
      ];
    }
    // Les réponses web_search intercalent des blocs texte entre les résultats.
    const text = (allContent as Array<{ type?: string; text?: string }>)
      .filter((b) => b?.type === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim();
    logger?.(`[depth-research] ok — ${text.length} chars, stop=${data?.stop_reason}`);
    return text;
  } catch (e) {
    logger?.(`[depth-research] échec silencieux : ${e instanceof Error ? e.message : e}`);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}
