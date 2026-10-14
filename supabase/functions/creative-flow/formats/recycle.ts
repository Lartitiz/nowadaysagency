// Recyclage (creative-flow) : un contenu existant dérivé en plusieurs formats,
// un appel par format en parallèle. Extrait À L'IDENTIQUE d'index.ts au lot 3
// (13/10/2026). Modifier le recyclage = modifier CE fichier ; il s'appuie sur
// les modules des formats (stories, carrousel) et sur ../shared.ts.
// Voir docs/creation-contenu/CARTE.md.

import { FORMAT_STRUCTURES, WRITING_RESOURCES, CHAIN_OF_THOUGHT, ANTI_BIAS } from "../../_shared/copywriting-prompts.ts";
import { buildBrandGuardText } from "../../_shared/user-context.ts";
import { parseAudienceAddress } from "../../_shared/audience-address.ts";
import { enforceAudienceAddressInText } from "../../_shared/audience-address-fields.ts";
import { logUsage } from "../../_shared/plan-limiter.ts";
import { tryParseAiJson } from "../../_shared/parse-ai-json.ts";
import { callAnthropic, callAnthropicSimple, getModelForAction, type UsageSink } from "../../_shared/anthropic.ts";
import { RECYCLAGE_CARROUSEL_LONGUEUR, RECYCLAGE_CARROUSEL_SLIDES, RECYCLAGE_STORIES_LONGUEUR, STORY1_ACCROCHE, VOIX_PARLEE_PAS_HACHEE } from "../../_shared/socle.ts";
import { type CorrectionFormat } from "../../_shared/correction-pass.ts";
import { numbersIn, runRedacGate, runTextRedacGate, hookEchoesBefore } from "../../_shared/redac-gate.ts";
import { logContentQuality } from "../../_shared/content-quality.ts";
import { enforceCarouselObjectAudienceAddress } from "./carousel.ts";
import { finalizeRecycledStories } from "./stories.ts";
import { CORRECTION_ABORT_MS, GENERATE_ABORT_MS, addrOpts } from "../shared.ts";

/**
 * System prompt du RECYCLAGE, paramétré par format(s). Le pipeline parallèle
 * l'appelle avec UN format à la fois (un appel Sonnet par format) — le schéma
 * JSON de sortie ne contient alors que ce format, et la garantie
 * anti-chevauchement est portée par le PLAN (angles imposés dans le user
 * prompt), plus par une consigne d'auto-arbitrage.
 */
export function buildRecycleSystemPrompt(
  fmtIds: string[],
  formatLabels: Record<string, string>,
  commonPrefix: string,
  objectiveBlock: string,
  activity: string,
  target: string,
  piliers: string,
): string {
  const requestedFormats = fmtIds.map((f) => formatLabels[f] || f);
  // Stories recyclées (04/10/2026) : séquence STRUCTURÉE comme le flux stories
  // principal (texte lu + sticker + photo), mise en page posée ensuite par le
  // code. Seule la ligne stories change, et seulement dans le prompt stories :
  // les prompts des autres formats restent identiques à l'octet.
  const storiesStructured = fmtIds.includes("stories");
  // Une idée par story (socle, 05/10/2026) : plus de nombre fixe, la longueur
  // suit le découpage (RECYCLAGE_STORIES_LONGUEUR, bornes 3 à 10).
  const storiesLengthLine = storiesStructured
    ? RECYCLAGE_STORIES_LONGUEUR
    : `- Stories : une idée par story, le nombre suit le découpage. Chaque story = ce qui est affiché (texte, sticker, sondage) + indication visuelle. Une story d'interaction au milieu ou vers la fin.`;
  return `${commonPrefix}

${ANTI_BIAS}

${CHAIN_OF_THOUGHT}

${FORMAT_STRUCTURES}

${WRITING_RESOURCES}
${objectiveBlock}
═══════════════════════════════════════════════════
MISSION : RECYCLAGE DE CONTENU
═══════════════════════════════════════════════════

Tu vas recycler un contenu existant en ${requestedFormats.length} format(s) : ${requestedFormats.join(", ")}.

Ce n'est pas du reformatage (dire la même chose en plus court). C'est de la dérivation (explorer une facette différente du même sujet).

Matrice d'angles par format :
- Carrousel : prend l'idée la plus PÉDAGOGIQUE. Développe-la en profondeur. Structure en progression logique (constat > bascule > solution > application).
- Reel : prend l'idée la plus PROVOCANTE ou CONTRE-INTUITIVE. Hook en 3 secondes. Oral, direct, une seule idée martelée.
- Stories : prend l'angle le plus INTIME ou PERSONNEL. Comme un message vocal à une amie. Confidences, coulisses, réactions spontanées.
- LinkedIn : garde la voix et l'intention de la source. Un récit personnel peut rester personnel ; une analyse peut creuser un point de vue. Ne fabrique ni conflit ni anecdote.
- Newsletter : prend l'angle le plus PROFOND. C'est le format qui a le plus de place : développe une réflexion complète avec nuances, apartés, exemples concrets.

RÉDACTION : pour chaque format, rédige un contenu COMPLET et PRÊT À POSTER. Pas un brouillon.

${activity ? `L'utilisatrice est : ${activity}.` : ""}
${target ? `Sa cible : ${target}. Adapte le vocabulaire et les exemples à cette audience.` : ""}
${piliers ? `Ses piliers de contenu : ${piliers}. Le recyclage doit rester cohérent avec ces piliers.` : ""}

LONGUEURS OBLIGATOIRES :
${RECYCLAGE_CARROUSEL_LONGUEUR}
- Reel : script complet avec timecodes (0-3s hook, 3-15s contexte, 15-45s coeur, 45-60s CTA), une idée par plan, et le reel reste court. Indique les cuts et le texte à l'écran : un extrait de 3 à 8 mots de ce qu'elle dit dans ce plan (ses mots, son mot ou chiffre fort), sans majuscules imposées.
${storiesLengthLine}
- LinkedIn : longueur selon la matière disponible. Prose fluide et ouverture qui situe le sujet. 0-2 hashtags si utiles.
- Instagram (Carrousel, Reel, Stories) : 3 hashtags maximum en fin de légende. Jamais plus, même si la légende est longue. Choisis-les ciblés (pas de #love #life génériques).
- Newsletter : 1500-3000 caractères. Objet d'email accrocheur. Structure : hook personnel > développement > leçon > CTA.

RÈGLE DE PROFONDEUR :
Tu ne raccourcis JAMAIS une idée pour "faire court" ou "tout faire rentrer".
Un carrousel qui va au bout d'UNE idée, une slide par pas du raisonnement > un carrousel qui survole 3 idées.
Un reel de 45 secondes sur UN point percutant > un reel de 60 secondes qui liste des conseils.

RÈGLE DE VOIX :
Chaque format doit sonner comme si l'utilisatrice l'avait écrit elle-même. Si le contenu source contient des expressions ou tournures caractéristiques de sa voix, RÉUTILISE-les telles quelles, sans les remplacer par une formulation plus "propre". L'IA structure et amplifie, elle ne réécrit pas.
${VOIX_PARLEE_PAS_HACHEE}

SOURCE FICTIVE OU TEST :
Un exemple explicitement fictif est une source valable. Rédige le contenu demandé en indiquant clairement dans le résultat que le cas est fictif ; garde uniquement les faits donnés. Ne refuse pas de rédiger au motif que le vécu n'est pas réel et ne transforme pas cet exemple en témoignage authentique.
Si la source décrit un produit fictif, présente ce produit avec ses seuls attributs fournis. Ne fais pas de l'essai QA, de la méthode de recyclage ou de l'éthique rédactionnelle le sujet du post, sauf si la source demande explicitement de publier sur ce thème. N'attribue pas à l'utilisatrice d'opinion, de raison de choix, d'expérience, de pratique ou de promesse absente de la source. Si la matière est courte, rédige un post court au lieu d'inventer une réflexion pour l'allonger.

SELF-CHECK FINAL (fais-le en interne avant de répondre) :
- Si un ANGLE t'est imposé dans le message : est-ce que tu l'as vraiment suivi, sans déborder sur les angles des autres formats ? Les repères de contexte indispensables peuvent être répétés dans chaque version : chacune doit se comprendre seule.
- Est-ce que les accroches sont assez fortes pour stopper le scroll ?
- Est-ce que le contenu passe le test du café (lisible à voix haute sans sonner robot) ?
- Est-ce que j'ai utilisé des expressions de la source ou est-ce que j'ai tout réécrit en mode IA ?
- Est-ce que les longueurs sont respectées ?

Réponds UNIQUEMENT en JSON valide :
{
  "results": {
    ${fmtIds.map((f: string) => f === "carrousel"
      ? `"carrousel": {
      "slides": [
        { "slide_number": 1, "title": "accroche de 4 à 10 mots", "body": "sous-titre facultatif (12 mots max) ou vide" },
        { "slide_number": 2, "title": "...", "body": "une idée" },
        { "slide_number": 3, "title": "...", "body": "une idée" },
        { "slide_number": 4, "title": "...", "body": "une idée" },
        { "slide_number": 5, "title": "...", "body": "une idée" },
        { "slide_number": 6, "title": "punchline + CTA (la dernière slide : son numéro suit le découpage)", "body": "..." }
      ],
      "caption": { "hook": "1-2 phrases d'accroche", "body": "développement de la légende", "cta": "appel à l'action final", "hashtags": ["3 hashtags ciblés maximum, sans #, en rapport avec le sujet"] }
    }`
      : f === "stories"
      ? `"stories": {
      "stories": [
        {
          "number": 1,
          "role": "Hook",
          "text": "ce qui est écrit sur la story, tel qu'on le lit",
          "sticker": null,
          "visual": {
            "title_pill": null,
            "mot_cle": "story 1 seulement : le mot fort de l'accroche, recopié exactement ; null ailleurs",
            "photo_directive": "la photo qui porte cette story, concrète, ancrée dans l'activité",
            "photo_query_en": "2-4 mots anglais, scène photographiable"
          },
          "face_cam": false
        }
      ]
    }`
      : `"${f}": "contenu complet ici"`).join(",\n    ")}
  },
  "topics": {
    ${fmtIds.map((f: string) => `"${f}": "le sujet réel de ce contenu en 5-10 mots (pas 'recyclage', le VRAI sujet traité)"`).join(",\n    ")}
  }
}
${fmtIds.includes("carrousel") ? `\nIMPORTANT pour le carrousel : tu DOIS renvoyer un OBJET structuré avec de ${RECYCLAGE_CARROUSEL_SLIDES.min} à ${RECYCLAGE_CARROUSEL_SLIDES.max} slides numérotées à la suite (slide_number 1 à N ; slide 1 = title-accroche de 10 mots max + body sous-titre facultatif de 12 mots max ; les suivantes = une idée chacune, title facultatif + body) et une caption {hook, body, cta}. Pas une string. Le nombre de slides suit le découpage : une idée par slide, n'ajoute rien pour remplir et ne tasse pas deux idées sur une slide. Arc narratif : slide 1 = accroche, puis le développement, la dernière = punchline + CTA.` : ""}${storiesStructured ? `\nIMPORTANT pour les stories : tu DOIS renvoyer un OBJET { "stories": [...] } avec une entrée par story, pas une string. "text" = ce qui est écrit sur la story, tel que l'abonnée le lit : aucune indication visuelle ni de mise en scène dedans. L'indication visuelle va dans "photo_directive" (et "photo_query_en"). "sticker" = { "type", "label", "options" } sur la story d'interaction, null ailleurs. "title_pill" reste null, sauf si la story annonce une liste, une question, une offre ou une date. ${STORY1_ACCROCHE} La mise en page de l'image (pastilles, liste, citation, fond, position) est décidée après, à partir de ton texte : tu n'en écris rien.` : ""}`;
}

// ═══ RECYCLAGE — PIPELINE PARALLÈLE PAR FORMAT ═══
// Avant : UN appel Sonnet écrivait TOUS les formats demandés (max_tokens
// 12288) → attente = somme des formats, et un échec/troncature emportait
// tout (« coche moins de formats à la fois »). Même remède que les visuels
// carrousel (#364) : un petit appel de PLAN (Haiku, sortie structurée)
// analyse la source UNE fois et attribue à chaque format sa sous-idée —
// la garantie anti-chevauchement est décidée là, pas ré-improvisée par
// chaque appel — puis UN appel Sonnet PAR FORMAT en parallèle. L'attente
// tombe au format le plus lent, et un format qui échoue est retenté seul
// sans emporter les autres.
export async function handleRecycleStep(params: {
  corsHeaders: Record<string, string>;
  userId: string;
  workspace_id?: string | null;
  formats: string[] | undefined;
  sourceText?: string | null;
  body: any;
  formatLabels: Record<string, string>;
  COMMON_PREFIX: string;
  objectiveBlock: string;
  ctx: any;
  profile: any;
}): Promise<Response> {
  const { corsHeaders, userId, formats, sourceText, body, formatLabels, COMMON_PREFIX, objectiveBlock, ctx, profile } = params;
  const workspace_id = params.workspace_id ?? undefined;
  const filesArray: any[] = body.files || (body.fileBase64 ? [{ base64: body.fileBase64, mimeType: body.fileMimeType, name: "fichier" }] : []);

  const tRecycle = Date.now();
  const fmtIds: string[] = formats || [];
  if (fmtIds.length === 0) {
    return new Response(JSON.stringify({ error: "Aucun format demandé." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const recActivity = ctx?.profile?.activite || profile?.activite || "";
  const recTarget = ctx?.profile?.cible || profile?.cible || "";
  const recPiliers = ctx?.profile?.piliers || "";
  const recBrandGuardText = buildBrandGuardText(ctx || {});
  // Tu ou vous : le contenu recyclé suit le réglage de la fiche de marque,
  // quelle que soit la forme du texte source (qui, lui, n'est jamais réécrit).
  const recAddress = parseAudienceAddress(ctx?.tone?.tone_register);
  const requestedLabels = fmtIds.map((f) => formatLabels[f] || f);

  // ── Fichiers : mêmes validations que l'ancien chemin ──
  const filesContent: any[] = [];
  let pdfWarning = "";
  if (filesArray.length > 0) {
    let totalSize = 0;
    for (const f of filesArray) totalSize += (f.base64?.length || 0);
    if (totalSize > 27_000_000) { // ~20 Mo in base64
      return new Response(
        JSON.stringify({ error: "La taille totale des fichiers dépasse 20 Mo. Réduis le nombre ou la taille des fichiers." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Anthropic limit: max 5 PDFs
    let pdfCount = 0;
    for (const f of filesArray.slice(0, 10)) {
      if (f.mimeType === "application/pdf") {
        pdfCount++;
        if (pdfCount > 5) {
          pdfWarning = "\n⚠️ Note : seuls les 5 premiers PDFs ont été analysés (limite technique).";
          continue;
        }
        filesContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
      } else if (f.mimeType?.startsWith("image/")) {
        filesContent.push({ type: "image", source: { type: "base64", media_type: f.mimeType, data: f.base64 } });
      }
    }
  }

  // ── 1. PLAN (Haiku, tool forcé) : analyse, angle par format, synthèse ──
  // Les fichiers ne sont envoyés qu'ICI (une fois) : la synthèse fidèle
  // sert ensuite de source texte aux appels par format (pas de re-envoi
  // vision × N formats).
  const PLAN_TOOL = {
    name: "plan_recyclage",
    description: "Analyse du contenu source et attribution d'un angle DISTINCT à chaque format.",
    input_schema: {
      type: "object",
      properties: {
        message_central: { type: "string", description: "La thèse du contenu source en 1 phrase." },
        synthese_source: { type: "string", description: "Synthèse FIDÈLE du contenu source (10-20 phrases) : sujet et situation de départ, acteurs et attributions, définitions nécessaires, thèse, sous-idées, exemples et anecdotes, chiffres, et les expressions typiques de l'auteure recopiées VERBATIM. N'invente rien." },
        angles: {
          type: "array",
          description: "Un élément par format demandé.",
          items: {
            type: "object",
            properties: {
              format: { type: "string", description: "Le nom du format tel que fourni." },
              sous_idee: { type: "string", description: "La sous-idée de la source attribuée à ce format." },
              angle: { type: "string", description: "L'angle d'attaque, clairement différent des autres formats." },
            },
            required: ["format", "sous_idee", "angle"],
          },
        },
      },
      required: ["message_central", "synthese_source", "angles"],
    },
  };

  const planUsage: UsageSink = {};
  let plan: any = null;
  try {
    const planText = `Analyse ce contenu source pour le recycler en ${fmtIds.length} format(s) : ${requestedLabels.join(", ")}.

Matrice d'affinités pour l'attribution :
- Carrousel : l'idée la plus PÉDAGOGIQUE.
- Reel : l'idée la plus PROVOCANTE ou CONTRE-INTUITIVE.
- Stories : l'angle le plus INTIME ou PERSONNEL.
- LinkedIn : le regard personnel le plus fidèle à la source, qu’il s’agisse d’un vécu ou d’une idée.
- Newsletter : l'angle le plus PROFOND (réflexion complète).

Chaque format DOIT recevoir une sous-idée DIFFÉRENTE (dérivation, pas reformatage). Si deux formats risquent de se chevaucher, force un pivot : point d'entrée, question posée ou public visé différent.${pdfWarning}${sourceText ? `\n\nCONTENU SOURCE :\n"""\n${sourceText}\n"""` : ""}${filesContent.length > 0 ? `\n\n${sourceText ? "Le reste du" : "Le"} contenu source est dans les fichiers ci-dessus. Synthétise les informations clés de TOUS les fichiers, ne traite pas chaque fichier isolément.` : ""}`;
    const planRaw = await callAnthropic({
      model: getModelForAction("questions"),
      system: "Tu prépares le recyclage d'un contenu en plusieurs formats. Tu es FIDÈLE à la source : tu n'inventes aucun fait, aucun chiffre, aucune anecdote.",
      messages: [{ role: "user", content: [...filesContent, { type: "text", text: planText }] }],
      max_tokens: 2048,
      abortTimeoutMs: 60000,
      tool: PLAN_TOOL,
    }, planUsage);
    plan = tryParseAiJson<any>(planRaw, "creative-flow:recycle-plan");
  } catch (e: any) {
    console.warn("[creative-flow] recycle: plan échoué → angles libres par format", e?.message || e);
  }

  // Source des appels par format : le texte fourni, complété (ou remplacé,
  // cas fichiers-seuls) par la synthèse du plan.
  const sourceForFormats = [
    sourceText ? `"""\n${sourceText}\n"""` : "",
    filesArray.length > 0 && plan?.synthese_source ? `SYNTHÈSE FIDÈLE DES FICHIERS SOURCES :\n"""\n${plan.synthese_source}\n"""` : "",
  ].filter(Boolean).join("\n\n");
  if (!sourceForFormats) {
    return new Response(
      JSON.stringify({ error: "Impossible d'analyser les fichiers sources. Réessaie." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const angleFor = (f: string): { sous_idee?: string; angle?: string } => {
    const arr = Array.isArray(plan?.angles) ? plan.angles : [];
    const label = (formatLabels[f] || f).toLowerCase();
    const found = arr.find((a: any) => {
      const af = String(a?.format || "").toLowerCase();
      return af && (af.includes(label) || label.includes(af) || af.includes(f.toLowerCase()));
    });
    return found || arr[fmtIds.indexOf(f)] || {};
  };

  // ── 2. UN appel Sonnet PAR FORMAT, en parallèle ──
  const runFormat = async (f: string) => {
    const label = formatLabels[f] || f;
    const a = angleFor(f);
    // Un exemple explicitement fictif ne doit pas hériter d'un angle de plan
    // sur la « méthode » ni de faits tirés du profil de l'utilisatrice.
    const fictionalLinkedIn = f === "linkedin" && /\b(?:fictif|fictive|fictifs|fictives|imaginaire|imaginaires)\b/i.test(sourceText || "");
    const others = fmtIds
      .filter((x) => x !== f)
      .map((x) => {
        const ox = angleFor(x);
        return `- ${formatLabels[x] || x}${ox.angle ? ` : ${ox.angle}` : ""}`;
      })
      .join("\n");
    const angleBlock = a.angle
      ? `\n\nTON ANGLE (imposé par le plan éditorial, respecte-le) :\n- Sous-idée : ${a.sous_idee || ""}\n- Angle : ${a.angle}${others ? `\n\nLes AUTRES formats couvrent déjà ces angles — ne les reprends PAS :\n${others}` : ""}`
      : (others ? `\n\nD'autres formats recyclent aussi ce contenu (${fmtIds.filter((x) => x !== f).map((x) => formatLabels[x] || x).join(", ")}) : prends un angle qui leur laisse de la place.` : "");
    const fUsage: UsageSink = {};
    const raw = await callAnthropicSimple(
      getModelForAction("content"),
      fictionalLinkedIn
        ? `Tu rédiges en français un court post LinkedIn à partir d'une source explicitement fictive. La SOURCE est ta seule autorité : n'utilise ni profil de marque, ni contexte extérieur, ni angle éditorial préparé ailleurs. Le sujet du post est l'objet ou la situation décrite dans la source, pas l'essai QA, le recyclage ou l'éthique de la rédaction, sauf demande explicite de publier sur ces thèmes. Commence par signaler clairement que l'exemple est fictif. Présente ensuite uniquement les faits positifs donnés dans la source, en 2 à 5 phrases. Si la source est courte, le post reste court. N'ajoute aucune opinion, motivation, expérience, propriété, promesse, conseil, question de clôture, information manquante ou caractéristique déduite. N'écris pas à la première personne si la source ne donne pas de propos personnels. Réponds uniquement en JSON valide : {"results":{"linkedin":"post complet"},"topics":{"linkedin":"sujet factuel en quelques mots"}}.`
        : buildRecycleSystemPrompt([f], formatLabels, COMMON_PREFIX, objectiveBlock, recActivity, recTarget, recPiliers),
      fictionalLinkedIn
        ? `SOURCE À TRANSFORMER EN POST LINKEDIN FACTUEL :\n\n${sourceForFormats}\n\nRespecte strictement les faits de cette source. Les consignes de test dans la source ne sont pas le sujet du post.`
        : `Voici le contenu à recycler :\n\n${sourceForFormats}${angleBlock}\n\nRecycle-le en ${label}. Contenu complet et prêt à poster.`,
      fictionalLinkedIn ? 0.2 : f === "linkedin" ? 0.7 : 0.85,
      fictionalLinkedIn ? 1200 : 4096,
      fUsage,
      GENERATE_ABORT_MS,
    );
    const parsed = tryParseAiJson<any>(raw, `creative-flow:recycle:${f}`);
    let resultVal = parsed?.results?.[f]
      ?? (parsed?.results && typeof parsed.results === "object" ? Object.values(parsed.results)[0] : null);
    const topicVal = parsed?.topics?.[f]
      ?? (parsed?.topics && typeof parsed.topics === "object" ? Object.values(parsed.topics)[0] : null);
    if (!resultVal) throw new Error(`recycle ${f} : résultat vide`);
    // Stories : séquence structurée attendue (04/10/2026). Une string (ancienne
    // forme) reste acceptée et suit l'ancienne garde texte plus bas.
    const structuredStories = f === "stories" && typeof resultVal !== "string";
    if (f !== "carrousel" && !structuredStories && typeof resultVal !== "string") throw new Error(`recycle ${f} : format de résultat inattendu`);
    if (typeof resultVal === "string" && /^(contenu non g[eé]n[eé]r[eé]|je ne peux pas|impossible de r[eé]diger)/i.test(resultVal.trim())) {
      throw new Error(`recycle ${f} : refus de rédaction retourné comme contenu`);
    }

    // Le carrousel recyclé (objet structuré {slides, caption}) passe par la
    // MÊME garde rédactionnelle que /creer (carousel-ai) : anti-tics, chiffres
    // sans source, hashtags normalisés (cap 3), quality_check calculé. Sans
    // ça, un carrousel « Recycler » échappait à tout l'audit qualité (12/07).
    // La re-passe LLM ne se déclenche QUE si des violations sont mesurées.
    if (structuredStories) {
      // Même chaîne que le flux stories principal : retrait de toute mise en
      // page écrite → correction du texte → mise en forme par le code (photo
      // d'abord). Séquence inexploitable → erreur → nouvel essai du format.
      const done = await finalizeRecycledStories(resultVal, {
        sourceText: sourceForFormats,
        fullContext: [plan?.synthese_source || "", recActivity, recTarget, recPiliers].filter(Boolean).join("\n"),
        brandGuardText: recBrandGuardText,
        audienceAddress: recAddress,
      });
      if (!done) throw new Error(`recycle ${f} : séquence de stories vide`);
      resultVal = done.sequence;
      if (done.gate) {
        await logContentQuality(
          userId,
          `recycle_${f}`,
          { score: done.gate.score, violations: done.gate.violations, repassed: done.gate.repassed, content: JSON.stringify(done.sequence.stories.map((s: any) => s?.text ?? "")) },
          (fUsage as any)?.model,
          workspace_id,
          typeof topicVal === "string" ? topicVal : undefined,
        );
      }
    } else if ((f === "carrousel" || f === "carousel") && resultVal && typeof resultVal === "object" && Array.isArray(resultVal.slides)) {
      try {
        const gated = await runRedacGate(JSON.stringify(resultVal), {
          isLinkedIn: false,
          correction: { enabled: true, skipIfShorterThan: 300, logger: (m) => console.log(`[creative-flow recycle carrousel] ${m}`), model: "claude-haiku-4-5", abortTimeoutMs: CORRECTION_ABORT_MS },
          // Liste blanche des chiffres : ceux de la source recyclée (le contenu
          // vient d'elle, ses chiffres sont légitimes) + réponses/actu/branding.
          inputText: [sourceForFormats, plan?.synthese_source || "", recActivity, recTarget, recPiliers].filter(Boolean).join("\n"),
          brandGuardText: recBrandGuardText,
          // Témoignages et vécus au passé : seuls ceux de la source recyclée sont admis.
          testimonySource: sourceForFormats,
        });
        const reparsed = tryParseAiJson<any>(gated.content, "creative-flow:recycle:carrousel:gated");
        if (reparsed && Array.isArray(reparsed.slides)) resultVal = reparsed;
        await logContentQuality(userId, `recycle_${f}`, gated, (fUsage as any)?.model, workspace_id, typeof topicVal === "string" ? topicVal : undefined);
      } catch (e) {
        console.error("[creative-flow recycle carrousel] garde rédactionnelle échouée, contenu conservé :", e);
      }
    } else if (
      (f === "linkedin" || f === "reel" || f === "stories" || f === "newsletter") &&
      typeof resultVal === "string" && resultVal.length >= 200
    ) {
      // Même garde que le carrousel recyclé (ci-dessus), version texte simple :
      // jusqu'ici seul le carrousel passait par un contrôle qualité, les 4 autres
      // formats recyclés sortaient bruts alors qu'ils partent directement en
      // publication (audit slop 18/08). runTextRedacGate mesure, corrige, RE-mesure
      // et ne garde la correction que si elle n'a dégradé aucun compteur (l'échantillon
      // live du 18/08 a montré la passe Haiku INTRODUISANT des retournements).
      try {
        const textAllowed = numbersIn(
          [sourceForFormats, plan?.synthese_source || "", recActivity, recTarget, recPiliers].filter(Boolean).join("\n"),
        );
        const gate = await runTextRedacGate(resultVal, {
          format: f as CorrectionFormat,
          correction: {
            logger: (m) => console.log(`[creative-flow recycle ${f}] ${m}`),
            sourceContext: sourceForFormats,
            authoredText: sourceForFormats,
            model: "claude-haiku-4-5",
            abortTimeoutMs: CORRECTION_ABORT_MS,
          },
          allowedNumbers: textAllowed,
          brandGuardText: recBrandGuardText,
          testimonySource: sourceForFormats,
        });
        resultVal = gate.content;
        await logContentQuality(
          userId,
          `recycle_${f}`,
          { score: gate.score, violations: gate.violations, repassed: gate.repassed, content: gate.content, hookEchoesBefore: gate.hookEchoesBefore },
          (fUsage as any)?.model,
          workspace_id,
          typeof topicVal === "string" ? topicVal : undefined,
        );
      } catch (e) {
        console.error(`[creative-flow recycle ${f}] garde rédactionnelle échouée, contenu conservé :`, e);
      }
    }
    // Tu ou vous (stories structurées : déjà fait avant la mise en forme).
    if (recAddress && !structuredStories) {
      if (typeof resultVal === "string") {
        resultVal = await enforceAudienceAddressInText(resultVal, recAddress, addrOpts(`recycle-${f}`));
      } else if (resultVal && typeof resultVal === "object") {
        resultVal = await enforceCarouselObjectAudienceAddress(resultVal, recAddress, `recycle-${f}`);
      }
    }
    return { f, resultVal, topicVal, usage: fUsage };
  };

  const settled: (Awaited<ReturnType<typeof runFormat>> | null)[] = await Promise.all(
    fmtIds.map((f) => runFormat(f).catch((e) => {
      console.error(`[creative-flow] recycle: format ${f} en échec (1er essai)`, e?.message || e);
      return null;
    })),
  );
  // 2e chance séquentielle pour les formats tombés (surcharge transitoire) —
  // un format qui échoue n'emporte plus les autres.
  for (let i = 0; i < fmtIds.length; i++) {
    if (!settled[i]) {
      settled[i] = await runFormat(fmtIds[i]).catch((e) => {
        console.error(`[creative-flow] recycle: format ${fmtIds[i]} abandonné après 2 essais`, e?.message || e);
        return null;
      });
    }
  }

  const ok = settled.filter(Boolean) as Awaited<ReturnType<typeof runFormat>>[];
  if (ok.length === 0) {
    // Aucun crédit consommé sur une génération entièrement ratée (pas de logUsage).
    return new Response(
      JSON.stringify({ error: "La génération a échoué en cours de route. Réessaie." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const results: Record<string, unknown> = {};
  const topics: Record<string, unknown> = {};
  for (const r of ok) {
    results[r.f] = r.resultVal;
    if (r.topicVal) topics[r.f] = r.topicVal;
  }
  const failedFormats = fmtIds.filter((f) => !(f in results));

  const totalTokens = (planUsage.total_tokens || 0) + ok.reduce((s, r) => s + (r.usage.total_tokens || 0), 0);
  await logUsage(userId, "content", "creative_flow", totalTokens || undefined, ok[0]?.usage.model, workspace_id);
  console.log(JSON.stringify({
    type: "recycle_timing",
    formats: fmtIds.length,
    failed: failedFormats.length,
    with_files: filesArray.length,
    duration_ms: Date.now() - tRecycle,
  }));
  return new Response(
    JSON.stringify({ results, topics, ...(failedFormats.length > 0 ? { failed_formats: failedFormats } : {}) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
