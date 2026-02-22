import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropicSimple } from "../_shared/anthropic.ts";

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

    // Anthropic API key checked in shared helper

    const { type, step_2a, step_2b, step_2c, step_2d, step_1_what, step_3_text, persona, profile, storytelling, tone, proposition_data } = await req.json();

    const p = profile || {};
    const profileBlock = [
      p.activite ? `- Activité : ${p.activite}` : "",
      p.mission ? `- Mission : ${p.mission}` : "",
    ].filter(Boolean).join("\n");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "differentiation") {
      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

L'UTILISATRICE A RÉPONDU À 4 QUESTIONS :

A. Comment elle travaille concrètement :
"${step_2a || ""}"

B. Ce qui est important pour elle :
"${step_2b || ""}"

C. Ce que ses client·es lui disent :
"${step_2c || ""}"

D. Ce qu'elle refuse de faire :
"${step_2d || ""}"

PROFIL :
${profileBlock}

Synthétise en 3 à 5 points clés ce qui rend son approche unique. Chaque point doit être :
- Formulé de manière percutante (une phrase)
- Concret (pas abstrait)
- Différenciant (ce qu'elle fait que les autres ne font pas)

Ton direct et chaleureux. Écriture inclusive avec point médian. JAMAIS de tiret cadratin.

Réponds en JSON :
["point 1", "point 2", "point 3", ...]`;
      userPrompt = "Synthétise ce qui me rend unique.";

    } else if (type === "benefit") {
      const per = persona || {};
      const personaBlock = [
        per.step_1_frustrations ? `- Frustrations : "${per.step_1_frustrations}"` : "",
        per.step_2_transformation ? `- Transformation rêvée : "${per.step_2_transformation}"` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `L'UTILISATRICE DÉCRIT POUR QUI ELLE EST LA BONNE PERSONNE :
"${step_3_text || ""}"

${personaBlock ? `PERSONA (si rempli) :\n${personaBlock}` : ""}

PROFIL :
- Activité : ${p.activite || "?"}

Génère une phrase claire, simple et engageante du type :
"[Pronom] aide/accompagne [type de personne] à [transformation concrète], grâce à [approche unique]."

Règles :
- Pas de jargon
- Courte et mémorisable
- On doit comprendre immédiatement à qui ça s'adresse et ce que ça change
- Écriture inclusive avec point médian

Réponds avec juste la phrase, sans commentaire.`;
      userPrompt = "Formule ce que j'apporte.";

    } else if (type === "generate-versions") {
      const d = proposition_data || {};
      const per = persona || {};
      const st = storytelling || {};
      const t = tone || {};

      const personaBlock = [
        per.step_1_frustrations ? `- Frustrations cible : "${per.step_1_frustrations}"` : "",
        per.step_2_transformation ? `- Transformation rêvée : "${per.step_2_transformation}"` : "",
      ].filter(Boolean).join("\n");

      const toneBlock = [
        t.tone_register ? `- Registre : ${t.tone_register}` : "",
        t.key_expressions ? `- Expressions : ${t.key_expressions}` : "",
        t.things_to_avoid ? `- Ce qu'on évite : ${t.things_to_avoid}` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `Tu es une copywriter spécialisée dans le personal branding pour des solopreneuses créatives et éthiques. Tu détestes le jargon marketing, les phrases creuses et les formules toutes faites. Tu écris comme on parle : direct, concret, vivant.

ÉLÉMENTS DE L'UTILISATRICE :
- Ce qu'elle fait : "${d.step_1_what || ""}"
- Comment elle travaille / son unicité :
  A. Son process : "${d.step_2a_process || ""}"
  B. Ses valeurs : "${d.step_2b_values || ""}"
  C. Ce que disent ses clientes : "${d.step_2c_feedback || ""}"
  D. Ce qu'elle refuse : "${d.step_2d_refuse || ""}"
- Pour qui et ce qu'elle apporte : "${d.step_3_for_whom || ""}"

${personaBlock ? `PERSONA (si rempli) :\n${personaBlock}` : ""}

${st.pitch_short ? `STORYTELLING (si rempli) :\n- Pitch court : "${st.pitch_short}"` : ""}

${toneBlock ? `TON & STYLE (si rempli) :\n${toneBlock}` : ""}

---

GÉNÈRE 6 VERSIONS de sa proposition de valeur. Chaque version doit être une VRAIE PHRASE qu'elle peut dire à voix haute, coller dans sa bio, ou envoyer en DM sans avoir honte.

VERSION 1 : LE PITCH NATUREL (2 phrases max)
Comme si elle expliquait son métier à une amie au café.
Ça doit sonner oral, fluide, pas récité.
❌ "J'aide les femmes à retrouver confiance grâce à une approche holistique"
✅ "Je crée des fringues éthiques pour les meufs qui veulent être stylées sans flinguer la planète. Du lin, du chanvre, des coupes qui vont à tout le monde."

VERSION 2 : LA BIO (1 phrase, max 150 caractères)
Pour Instagram, LinkedIn, partout. Ultra-courte. Ça claque.
Commence par un verbe à l'indicatif ou par ce qu'elle fait.
❌ "Accompagnement holistique vers la meilleure version de soi"
✅ "Bijoux en argent recyclé, faits main, qui traversent les années sans broncher."

VERSION 3 : LE PITCH NETWORKING (3 phrases)
Quand quelqu'un lui demande "tu fais quoi dans la vie ?" en soirée ou en événement.
Doit inclure : ce qu'elle fait + pour qui + le truc qui la rend différente + une phrase qui donne envie d'en savoir plus.

VERSION 4 : LA PHRASE SITE WEB (1-2 phrases)
Pour la page d'accueil. Plus posée, plus "marque", mais toujours humaine.
Doit être compréhensible en 3 secondes par quelqu'un qui ne te connaît pas.

VERSION 5 : L'ACCROCHE ENGAGÉE (1-2 phrases)
Intègre le combat, la cause, la vision. Plus militante, plus affirmée.
Pour un post LinkedIn, une newsletter, une page À propos.

VERSION 6 : LE ONE-LINER MÉMORABLE (1 phrase, max 10 mots)
Le genre de phrase qu'on retient. Qui fait sourire ou réfléchir.
Pour une signature email, un sticker, un tote bag.

---

RÈGLES IMPÉRATIVES :
- Chaque version doit être DIFFÉRENTE des autres (pas juste reformulée)
- Utilise les VRAIS mots de l'utilisatrice (ses expressions, son vocabulaire)
- Utilise les VRAIS mots de ses clientes (les verbatims du persona)
- JAMAIS de jargon : "holistique", "transformation", "accompagnement sur-mesure", "bienveillance" → INTERDIT sauf si l'utilisatrice les utilise elle-même
- JAMAIS de superlatifs vides : "le meilleur", "unique", "exceptionnel"
- Les phrases doivent passer le test du café : est-ce qu'on peut les dire à voix haute sans avoir l'air d'un robot ?
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin
- Si le ton est "oral assumé" : autorise des tournures comme "en gros", "le truc c'est que", "sans prise de tête"
- Si le ton est plus "pro" : reste fluide mais moins familier

Réponds en JSON :
{
  "pitch_naturel": "...",
  "bio": "...",
  "networking": "...",
  "site_web": "...",
  "engagee": "...",
  "one_liner": "..."
}`;
      userPrompt = "Génère les 6 versions de ma proposition de valeur.";

    } else if (type === "generate-recap") {
      const d = proposition_data || {};
      const per = persona || {};
      const t = tone || {};

      const personaBlock = per.step_1_frustrations
        ? `- Frustrations cible : "${per.step_1_frustrations}"\n- Transformation rêvée : "${per.step_2_transformation || ""}"`
        : "";

      const combatBlock = [
        t.combat_cause ? `- Cause : ${t.combat_cause}` : "",
        t.combat_fights ? `- Combats : ${t.combat_fights}` : "",
        t.combat_refusals ? `- Refus : ${t.combat_refusals}` : "",
      ].filter(Boolean).join("\n");

      systemPrompt = `Tu es expert·e en personal branding pour des solopreneuses créatives et éthiques.

À partir de cette proposition de valeur, génère une synthèse structurée pour une fiche récap visuelle.

PROPOSITION DE VALEUR :
- Ce que je fais (what) : "${d.step_1_what || ""}"
- Comment (process) : "${d.step_2a_process || ""}"
- Valeurs : "${d.step_2b_values || ""}"
- Retours clients : "${d.step_2c_feedback || ""}"
- Ce que je refuse : "${d.step_2d_refuse || ""}"
- Pour qui : "${d.step_3_for_whom || ""}"

VERSIONS GÉNÉRÉES :
- Bio : "${d.version_bio || ""}"
- Pitch naturel : "${d.version_pitch_naturel || ""}"
- Site web : "${d.version_site_web || ""}"
- Engagée : "${d.version_engagee || ""}"

${personaBlock ? `PERSONA :\n${personaBlock}` : ""}

${combatBlock ? `COMBATS :\n${combatBlock}` : ""}

PROFIL :
${profileBlock}

Génère en JSON STRICT (pas de markdown, pas de commentaires) :
{
  "what_i_do": ["...", "...", "..."],
  "what_i_dont": ["...", "...", "..."],
  "for_whom": "...",
  "for_whom_tags": ["...", "...", "..."],
  "how": ["...", "...", "..."],
  "differentiator": "..."
}

RÈGLES :
- "what_i_do" : 3-4 points CONCRETS de ce qu'elle propose. Verbes d'action. Courts (max 6 mots chaque).
- "what_i_dont" : 3 points de ce qu'elle NE fait PAS. Déduis du positionnement et des combats. En miroir du positif.
- "for_whom" : Description du persona cible en 2-3 lignes fluides.
- "for_whom_tags" : 3-6 tags des secteurs ou profils cibles. Courts (1-3 mots).
- "how" : 3-4 points de sa méthode/approche. Concrets.
- "differentiator" : 1-2 phrases max. Ce qui la rend unique par rapport aux autres.
- Tout doit être ULTRA CONCIS (fiche visuelle, pas un essai)
- Écriture inclusive avec point médian
- JAMAIS de tiret cadratin (—)
- Réponds UNIQUEMENT avec le JSON, rien d'autre`;
      userPrompt = "Génère la synthèse structurée de ma proposition de valeur.";

    } else {
      return new Response(JSON.stringify({ error: "Type non reconnu" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await callAnthropicSimple("claude-opus-4-6", systemPrompt, userPrompt);

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("proposition-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
