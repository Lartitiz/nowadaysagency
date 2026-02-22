import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { type, objective, face_cam, subject, time_available, is_launch, branding_context, selected_hook } = await req.json();

    const systemPrompt = buildSystemPrompt(branding_context || "");

    let userPrompt = "";

    if (type === "hooks") {
      userPrompt = buildHooksPrompt(objective, face_cam, subject, time_available, is_launch);
    } else if (type === "script") {
      userPrompt = buildScriptPrompt(objective, face_cam, subject, time_available, is_launch, selected_hook);
    } else {
      return new Response(JSON.stringify({ error: "Type invalide" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
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

AVANT DE RÉDIGER, RÉFLÉCHIS EN INTERNE (ne montre PAS ce raisonnement) :
1. Quel est le problème principal de l'audience sur ce sujet ?
2. Quelle est l'accroche la plus forte possible ?
3. Est-ce que mon output contient des patterns "slop" ? Si oui, réécrire.
ENSUITE seulement, génère le contenu final.

GARDE-FOUS REELS OBLIGATOIRES :

1. HOOK : TOUJOURS un hook dans les 1,5 premières secondes.
   JAMAIS de "Salut, moi c'est [nom]..." en intro.
   50% des gens partent dans les 3 premières secondes.

2. SOUS-TITRES : TOUJOURS mentionner "Prévois les sous-titres"
   si face cam ou voix off (60-80% regardent sans le son).

3. DURÉE JUSTIFIÉE : chaque seconde doit servir. Pas de remplissage.
   Indiquer la durée cible ET la raison.

4. PATTERN INTERRUPTS : si le Reel dépasse 15 sec, TOUJOURS inclure
   des indications de CUT / changement de plan toutes les 3-5 sec.

5. CTA ÉTHIQUE : JAMAIS de CTA agressif. Toujours permission :
   "si ça te parle", "sauvegarde", "envoie à une amie qui".

6. ANTI-CLICKBAIT : si le hook promet quelque chose, le body DOIT délivrer.

7. TEXTE OVERLAY : toujours COURT (3-5 mots max), MAJUSCULES, contrasté.

8. CAPTION ≠ SCRIPT : la caption ne répète PAS le script.
   Elle développe un angle complémentaire + mots-clés SEO.

9. HASHTAGS : 3-5 max. Mix large (1-2) + niche (2-3).

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

function buildHooksPrompt(objective: string, face_cam: string, subject: string, time_available: string, is_launch: boolean): string {
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

RÈGLE CRITIQUE — HOOKS ANCRÉS DANS LE SUJET :
Chaque hook DOIT être directement lié à "${subject}".
Chaque hook doit :
- Mentionner ou référencer "${subject}" explicitement
- Être une PHRASE COMPLÈTE et SPÉCIFIQUE, prête à être dite face caméra
- PAS une formule à trous avec [sujet] remplacé mécaniquement

❌ INTERDIT (formules génériques à trous) :
"Le truc que personne ne te dit sur [sujet]..."
"3 erreurs qui tuent ta [sujet]."
"Tu galères avec [problème] ?"

✅ ATTENDU (hooks ancrés, spécifiques, finis) :
Si le sujet est "les erreurs en bio Instagram" :
- "J'ai refait ma bio 47 fois avant de comprendre ça."
- "Ta bio Instagram fait fuir les gens. Et tu sais même pas pourquoi."
- "Arrête de mettre ton métier dans ta bio. Voilà ce qu'il faut à la place."`
    : `PAS DE SUJET DONNÉ — propose un sujet pertinent basé sur le contexte branding, puis génère les hooks sur ce sujet. Précise le sujet choisi dans chaque hook.`;

  return `DEMANDE : Proposer 3 hooks pour un Reel Instagram.

Objectif : ${objectiveMap[objective] || objective}
Face cam : ${face_cam}
${subjectInstruction}
Temps tournage : ${time_available}
En lancement : ${is_launch ? "oui" : "non"}
Format suggéré : ${suggestedFormat}

Les 8 formules de hooks (choisis-en 3 différentes comme INSPIRATION, pas comme template) :
1. Curiosité gap — ex : "J'ai découvert un truc sur [aspect précis du sujet]"
2. Contrarian — ex : "Arrête de [conseil commun lié au sujet]. Voilà pourquoi."
3. Erreur — ex : "[Nombre] erreurs qui [conséquence spécifique au sujet]"
4. Liste numérotée — ex : "[Nombre] façons de [résultat spécifique au sujet]"
5. Question directe — ex : "Tu [frustration spécifique liée au sujet] ?"
6. Preuve sociale — ex : "Comment j'ai [résultat concret lié au sujet] en [durée]"
7. Story / confession — ex : "[Anecdote personnelle liée au sujet]"
8. Commande directe — ex : "Sauvegarde ce Reel si tu [situation liée au sujet]"

RAPPEL : chaque hook est une phrase FINIE et SPÉCIFIQUE au sujet, pas une formule à trous.

Retourne ce JSON exact :
{
  "hooks": [
    {
      "id": "A",
      "type": "curiosite",
      "type_label": "Curiosité",
      "text": "[PHRASE COMPLÈTE ancrée dans le sujet]",
      "text_overlay": "[3-5 MOTS EN MAJUSCULES liés au sujet]",
      "format_recommande": "mini_tuto",
      "format_label": "Mini-tuto",
      "duree_cible": "30 sec"
    },
    {
      "id": "B",
      "type": "erreur",
      "type_label": "Erreur",
      "text": "[PHRASE COMPLÈTE ancrée dans le sujet]",
      "text_overlay": "...",
      "format_recommande": "...",
      "format_label": "...",
      "duree_cible": "..."
    },
    {
      "id": "C",
      "type": "...",
      "type_label": "...",
      "text": "[PHRASE COMPLÈTE ancrée dans le sujet]",
      "text_overlay": "...",
      "format_recommande": "...",
      "format_label": "...",
      "duree_cible": "..."
    }
  ]
}`;
}

function buildScriptPrompt(objective: string, face_cam: string, subject: string, time_available: string, is_launch: boolean, selectedHook: any): string {
  return `DEMANDE : Générer un script Reel complet.

Objectif : ${objective}
Face cam : ${face_cam}
Sujet : ${subject || "(basé sur le hook choisi)"}
Temps tournage : ${time_available}
En lancement : ${is_launch ? "oui" : "non"}

HOOK CHOISI :
- Type : ${selectedHook.type} (${selectedHook.type_label})
- Texte : "${selectedHook.text}"
- Texte overlay : "${selectedHook.text_overlay}"
- Format recommandé : ${selectedHook.format_label}
- Durée cible : ${selectedHook.duree_cible}

ANCRAGE SUJET — RÈGLE CRITIQUE :
Le script ENTIER doit rester ancré dans le sujet "${subject || '(basé sur le hook)'}".
- Le hook parle de ce sujet
- Le body développe CE sujet (pas un sujet adjacent ou plus large)
- Le CTA est lié à CE sujet
- La caption développe un angle complémentaire de CE sujet
- Les hashtags sont liés à CE sujet
Ne PAS élargir au sujet général. Si le sujet est "les erreurs en bio", le Reel parle de la bio, pas d'Instagram en général.

Génère un script complet structuré avec timing seconde par seconde.
Chaque section body DOIT inclure une indication de CUT (changement de plan).

Retourne ce JSON exact :
{
  "format_type": "face_cam_confession",
  "format_label": "Face cam confession",
  "duree_cible": "45 sec",
  "duree_justification": "Le storytelling a besoin de contexte + tension + leçon",
  "objectif": "${objective}",
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
