import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Authentification invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Check plan limits
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch full context server-side
    const ctx = await getUserContext(supabase, user.id);
    const brandingContext = formatContextForAI(ctx, CONTEXT_PRESETS.reels);

    const { type, objective, face_cam, subject, time_available, is_launch, selected_hook, pre_gen_answers, image_urls, inspiration_context } = await req.json();

    const systemPrompt = buildSystemPrompt(brandingContext);

    let userPrompt = "";
    let messages: any[] = [];

    if (type === "analyze_inspiration") {
      // Multimodal: analyze inspiration screenshots
      const imageContent = (image_urls || []).map((url: string, i: number) => ({
        type: "image_url",
        image_url: { url },
      }));
      messages = [
        { role: "system", content: "Tu es experte en analyse de Reels Instagram. Analyse les screenshots fournis et identifie les patterns de succès." },
        { role: "user", content: [
          { type: "text", text: buildInspirationAnalysisPrompt() },
          ...imageContent,
        ]},
      ];
    } else if (type === "hooks") {
      userPrompt = buildHooksPrompt(objective, face_cam, subject, time_available, is_launch, inspiration_context);
    } else if (type === "script") {
      userPrompt = buildScriptPrompt(objective, face_cam, subject, time_available, is_launch, selected_hook, pre_gen_answers, inspiration_context);
    } else {
      return new Response(JSON.stringify({ error: "Type invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!messages.length) {
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans quelques secondes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA épuisés." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erreur IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reels-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildSystemPrompt(brandingContext: string): string {
  return `Tu es experte en création de Reels Instagram pour des solopreneuses créatives et engagées.

${brandingContext}

ANTI-SLOP — TU NE GÉNÈRES JAMAIS :
- "Dans un monde où…", "N'hésitez pas à…", "Il est important de noter que…"
- "Plongeons dans…", "Sans plus attendre", "En outre", "Par conséquent"
- "Cela étant dit", "Force est de constater", "Il convient de", "En définitive"
- "Décortiquons", "Explorons", "Découvrons", "Passons à", "Abordons"
- Tout tiret cadratin (—) → remplacer par : ou ;
SI TU DÉTECTES CES PATTERNS DANS TON OUTPUT, RÉÉCRIS AVANT DE RETOURNER.

ANTI-BIAIS — TU NE REPRODUIS JAMAIS :
- Ton paternaliste envers les femmes entrepreneures → Permission : "Tu as le droit de prendre de la place"
- Clichés genrés ("girl boss", "femmes inspirantes") → Parler de compétences, pas de genre
- Minimisation de l'expertise ("c'est tout simple !") → "C'est pas sorcier, mais ça demande de la méthode"
- Glorification du hustle → "Mieux vaut du mieux que du plus"
- Vocabulaire masculin par défaut → TOUJOURS écriture inclusive point médian

AVANT DE RÉDIGER, RÉFLÉCHIS EN INTERNE (ne montre PAS ce raisonnement) :
1. Quel est le problème principal de l'audience sur ce sujet ?
2. Quelle est l'accroche la plus forte possible ?
3. Est-ce que mon output contient des patterns "slop" ? Si oui, réécrire.
ENSUITE seulement, génère le contenu final.

GARDE-FOUS REELS OBLIGATOIRES :

1. HOOK : TOUJOURS un hook dans les 1,5 premières secondes.
   JAMAIS de "Salut, moi c'est [nom]..." en intro.
   65% des viewers décident de rester en 1,7 seconde.
   UN HOOK = 5-12 MOTS MAX. Si tu dépasses, COUPE.

2. SOUS-TITRES : TOUJOURS mentionner "Prévois les sous-titres"
   si face cam ou voix off (60-80% regardent sans le son).

3. DURÉE JUSTIFIÉE : chaque seconde doit servir. Pas de remplissage.

4. PATTERN INTERRUPTS : si le Reel dépasse 15 sec, TOUJOURS inclure
   des indications de CUT toutes les 3-5 sec.

5. CTA ÉTHIQUE : JAMAIS de CTA agressif. Toujours permission :
   "si ça te parle", "sauvegarde", "envoie à une amie qui".

6. ANTI-CLICKBAIT : si le hook promet quelque chose, le body DOIT délivrer.

7. TEXTE OVERLAY : toujours COURT (3-5 mots max), MAJUSCULES, contrasté.

8. CAPTION ≠ SCRIPT : la caption ne répète PAS le script.

9. HASHTAGS : 3-5 max. Mix large (1-2) + niche (2-3).

ANALOGIES VISUELLES — DOSAGE :
1 analogie par contenu généré. Maximum. Parfois 0.
L'analogie est un CONDIMENT, pas le plat principal.
QUAND UTILISER (1 seule) : dans le hook SI l'analogie EST le hook,
OU dans le body pour rendre un concept abstrait concret,
OU dans la punchline de fin.
JAMAIS 2 analogies dans le même script. Si l'idée est claire sans, n'en mets pas.
Un texte direct sans analogie > un texte farci d'images forcées.

RÈGLES DE GÉNÉRATION :
- Ton oral, direct, comme un message vocal
- Écriture inclusive point médian
- Expressions : "bon", "en vrai", "le truc c'est que"
- Apartés : "(oui, même toi)", "(franchement)"
- Phrases courtes qui claquent + phrases longues qui développent
- JAMAIS de jargon : pas de "ROI", "funnel", "leverage"
- JAMAIS de promesse exagérée
- Pas de markdown dans le JSON (pas de ** ni *)

RETOURNE UNIQUEMENT un JSON valide, sans texte avant ou après, sans backticks.`;
}

function buildInspirationAnalysisPrompt(): string {
  return `Analyse chaque screenshot de Reel et identifie :
- Le type de hook utilisé (text overlay, phrase face cam, visuel choc)
- Le format du Reel (face cam, montage, voix off, texte défilant)
- Le ton (punchy, intime, pédago, drôle, coup de gueule)
- La structure visible (hook → développement → CTA, ou autre)
- Les éléments visuels distinctifs (sous-titres stylés, couleurs, cadrage)
- Le texte visible sur le screenshot si lisible

RETOURNE UNIQUEMENT un JSON valide, sans backticks :
{
  "inspiration_analysis": [
    {
      "image_index": 1,
      "hook_type": "text overlay + face cam",
      "hook_text_visible": "Le texte visible sur le screenshot si lisible",
      "format": "face cam avec sous-titres stylés",
      "tone": "punchy et direct",
      "structure": "hook choc → démonstration → CTA",
      "visual_elements": "sous-titres jaunes sur fond noir, gros plan"
    }
  ],
  "patterns_communs": "Description des patterns communs identifiés",
  "recommandation": "Recommandation concrète pour le prochain Reel"
}`;
}

function buildHooksPrompt(objective: string, face_cam: string, subject: string, time_available: string, is_launch: boolean, inspirationContext?: string): string {
  const objectiveMap: Record<string, string> = {
    reach: "Reach / Viralité — toucher un max de nouvelles personnes",
    saves: "Saves / Expertise — contenu qu'on sauvegarde",
    engagement: "Engagement — faire réagir, commenter, partager",
    conversion: "Conversion — amener vers une offre",
    branding: "Branding / Ambiance — montrer son univers",
  };

  const formatMatrix: Record<string, Record<string, string>> = {
    reach: { "5min": "Trend adapté (7-15s)", "15min": "Astuce rapide / Listicle (15-30s)", "30min": "B-roll lifestyle (15-30s)" },
    saves: { "5min": "Texte overlay astuce (7-15s)", "15min": "Mini-tuto (15-45s)", "30min": "Listicle multi-plans (30-45s)" },
    engagement: { "5min": "Trend adapté (7-15s)", "15min": "Prise de position (15-30s)", "30min": "Face cam confession (30-60s)" },
    conversion: { "5min": "Texte overlay astuce (7-15s)", "15min": "Permission+Action (30-60s)", "30min": "Storytelling témoignage (30-60s)" },
    branding: { "5min": "B-roll + musique (15s)", "15min": "B-roll + voix off (15-30s)", "30min": "Mini-vlog (30-60s)" },
  };

  const suggestedFormat = formatMatrix[objective]?.[time_available] || "Mini-tuto (15-45s)";

  const subjectInstruction = subject
    ? `SUJET DONNÉ PAR L'UTILISATRICE : "${subject}"
Chaque hook DOIT être directement lié à "${subject}".`
    : `PAS DE SUJET DONNÉ — propose un sujet pertinent basé sur le contexte branding, puis génère les hooks sur ce sujet.`;

  return `DEMANDE : Proposer 3 hooks COURTS pour un Reel Instagram.

Objectif : ${objectiveMap[objective] || objective}
Face cam : ${face_cam}
${subjectInstruction}
Temps tournage : ${time_available}
En lancement : ${is_launch ? "oui" : "non"}
Format suggéré : ${suggestedFormat}
${inspirationContext ? `\nINSPIRATION ANALYSÉE :\n${inspirationContext}\n\nINSPIRE-TOI du style et du format identifiés dans les screenshots d'inspiration pour les hooks et le format. NE COPIE PAS le contenu.\n` : ""}
HOOKS REELS — RÈGLES NON-NÉGOCIABLES :

UN HOOK REEL = 5-12 MOTS MAXIMUM.
C'est une phrase qu'on DIT face cam en 1,5-3 secondes.
Pas une phrase qu'on LIT dans un carrousel.
Si ton hook dépasse 12 mots, COUPE. Toujours.

LE HOOK DOIT ÊTRE :
- Dicible en une respiration (teste : lis-le à voix haute)
- Spécifique au sujet (pas une formule à trous générique)
- Un pattern interrupt (quelque chose d'inattendu qui casse le scroll)

LE HOOK NE DOIT PAS ÊTRE :
- Une question longue à rallonge
- Une phrase avec des subordonnées
- Un résumé du contenu qui suit
- Une formule générique où on remplace [sujet]

TYPES DE HOOKS COURTS (choisis-en 3 DIFFÉRENTS) :

1. CONFESSION CHOC (5-8 mots)
   "J'ai fait cette erreur pendant 3 ans."
   "Je regrette d'avoir suivi ce conseil."

2. AFFIRMATION CONTRAIRE (5-10 mots)
   "Arrête de poster tous les jours."
   "Ta bio Instagram ne sert à rien."

3. RÉSULTAT CONCRET (6-10 mots)
   "0 à 15 000 vues. Sans pub."
   "3 mots dans ma bio ont tout changé."

4. INTERPELLATION DIRECTE (5-8 mots)
   "Toi qui postes sans stratégie."
   "Si ta com' te fatigue, écoute ça."

5. TEASER IRRÉSISTIBLE (5-8 mots)
   "Le truc que personne ne te dit."
   "Voilà pourquoi ça marche pas."

6. ANALOGIE FLASH (6-10 mots)
   "Ta com', c'est un CV sans photo."
   "Poster sans stratégie, c'est crier dans le désert."

RAPPEL : chaque hook est 5-12 MOTS, une phrase FINIE et SPÉCIFIQUE au sujet, pas une formule à trous.

GÉNÈRE aussi un TEXT OVERLAY pour chaque hook.
Le text overlay = version ENCORE PLUS COURTE du hook : 3-6 mots max, EN MAJUSCULES.
Exemples :
Hook : "J'ai refait ma bio 47 fois." → Overlay : "47 BIOS PLUS TARD..."
Hook : "Ta bio Instagram fait fuir les gens." → Overlay : "TA BIO FAIT FUIR"

Retourne ce JSON exact :
{
  "hooks": [
    {
      "id": "A",
      "type": "confession",
      "type_label": "Confession",
      "text": "[HOOK 5-12 MOTS]",
      "word_count": 7,
      "estimated_seconds": 2,
      "text_overlay": "[3-6 MOTS EN MAJUSCULES]",
      "format_recommande": "mini_tuto",
      "format_label": "Mini-tuto",
      "duree_cible": "30 sec"
    },
    {
      "id": "B",
      "type": "affirmation_contraire",
      "type_label": "Affirmation contraire",
      "text": "[HOOK 5-12 MOTS]",
      "word_count": 8,
      "estimated_seconds": 2,
      "text_overlay": "...",
      "format_recommande": "...",
      "format_label": "...",
      "duree_cible": "..."
    },
    {
      "id": "C",
      "type": "resultat_concret",
      "type_label": "Résultat concret",
      "text": "[HOOK 5-12 MOTS]",
      "word_count": 7,
      "estimated_seconds": 2,
      "text_overlay": "...",
      "format_recommande": "...",
      "format_label": "...",
      "duree_cible": "..."
    }
  ]
}`;
}

function buildScriptPrompt(objective: string, face_cam: string, subject: string, time_available: string, is_launch: boolean, selectedHook: any, preGenAnswers?: { anecdote?: string; emotion?: string; conviction?: string }, inspirationContext?: string): string {
  let preGenBlock = "";
  if (preGenAnswers && (preGenAnswers.anecdote || preGenAnswers.emotion || preGenAnswers.conviction)) {
    preGenBlock = `
L'UTILISATRICE A PARTAGÉ :
${preGenAnswers.anecdote ? `- Moment perso : "${preGenAnswers.anecdote}"` : ""}
${preGenAnswers.emotion ? `- Émotion visée : ${preGenAnswers.emotion}` : ""}
${preGenAnswers.conviction ? `- Punchline : "${preGenAnswers.conviction}"` : ""}

INTÈGRE dans le script :
- Le moment perso peut devenir le hook OU une illustration dans le body
- L'émotion guide le ton et le rythme du script
- La punchline doit apparaître telle quelle (ou quasi), idéalement comme phrase de fin ou pivot central
- NE CHANGE PAS le sens de ses mots, juste la structure si nécessaire
`;
  } else {
    preGenBlock = `
L'utilisatrice n'a pas fourni d'éléments personnels.
Génère le script normalement mais AJOUTE un champ "personal_tip" dans le JSON :
"Ce script sera 10x plus fort avec ton anecdote perso. Ajoute un truc vécu avant de filmer."
`;
  }

  return `DEMANDE : Générer un script Reel complet.

Objectif : ${objective}
Face cam : ${face_cam}
Sujet : ${subject || "(basé sur le hook choisi)"}
Temps tournage : ${time_available}
En lancement : ${is_launch ? "oui" : "non"}
${inspirationContext ? `\nINSPIRATION ANALYSÉE :\n${inspirationContext}\nINSPIRE-TOI du style identifié. NE COPIE PAS le contenu.\n` : ""}
HOOK CHOISI :
- Type : ${selectedHook.type} (${selectedHook.type_label})
- Texte : "${selectedHook.text}"
- Texte overlay : "${selectedHook.text_overlay}"
- Format recommandé : ${selectedHook.format_label}
- Durée cible : ${selectedHook.duree_cible}

${preGenBlock}

ANCRAGE SUJET — RÈGLE CRITIQUE :
Le script ENTIER doit rester ancré dans le sujet "${subject || '(basé sur le hook)'}".
Ne PAS élargir au sujet général.

ANALOGIES VISUELLES — DOSAGE :
1 analogie max dans le script. Parfois 0. Si l'idée est claire sans, n'en mets pas.
L'analogie doit être du QUOTIDIEN et VISUELLE. Jamais forcée.

Génère un script complet structuré avec timing seconde par seconde.
Chaque section body DOIT inclure une indication de CUT (changement de plan).

Retourne ce JSON exact :
{
  "format_type": "face_cam_confession",
  "format_label": "Face cam confession",
  "duree_cible": "45 sec",
  "duree_justification": "Le storytelling a besoin de contexte + tension + leçon",
  "objectif": "${objective}",
  "personal_tip": null,
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
      "texte_overlay": "SAUVEGARDE",
      "cut": null,
      "tip": null
    }
  ],
  "caption": {
    "text": "...",
    "cta": "..."
  },
  "hashtags": ["#...", "#...", "#...", "#...", "#..."],
  "cover_text": "...",
  "alt_text": "...",
  "amplification_stories": [
    {
      "text": "Nouveau Reel ! ...",
      "sticker_type": "sondage",
      "sticker_options": ["Oui", "Faut que je m'y mette"]
    },
    {
      "text": "...",
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
  "garde_fou_alerte": null
}

IMPORTANT :
- Le script doit avoir entre 3 et 6 sections (hook + body segments + cta)
- Chaque section body a une indication de cut
- Le texte overlay est COURT (3-5 mots), en MAJUSCULES
- La caption ne répète PAS le script, elle offre un angle complémentaire
- Les hashtags : 3-5 max, mix large + niche
- Les amplification_stories : 2 stories à poster dans l'heure
- Pas de markdown dans les valeurs JSON`;
}
