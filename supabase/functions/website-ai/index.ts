import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WEBSITE_PRINCIPLES } from "../_shared/copywriting-prompts.ts";
import { getUserContext, formatContextForAI, CONTEXT_PRESETS } from "../_shared/user-context.ts";
import { checkAndIncrementUsage } from "../_shared/plan-limiter.ts";
import { callAnthropicSimple } from "../_shared/anthropic.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Branding data now fetched via getUserContext

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Auth requise" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Auth invalide" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Anthropic API key checked in shared helper

    // Check plan limits
    const usageCheck = await checkAndIncrementUsage(supabase, user.id, "generation");
    if (!usageCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "limit_reached", message: usageCheck.error, remaining: 0 }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();
    const ctx = await getUserContext(supabase, user.id);
    const context = formatContextForAI(ctx, CONTEXT_PRESETS.website);

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "generate-all") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere les textes complets pour une page d'accueil, section par section :\n\nSECTION 1 : TITRE (HOOK)\n- 1 titre principal (max 12 mots, percutant, benefice client)\n- 1 sous-titre (1-2 phrases)\n\nSECTION 2 : LE PROBLEME\n- 3 phrases max : accroche empathique + mission + promesse\n\nSECTION 3 : LES BENEFICES\n- 3 phrases max : vision + objectif incarne + promesse\n\nSECTION 4 : L'OFFRE\n- Titre engageant + 4-6 points cles\n\nSECTION 5 : QUI TU ES\n- 3-4 phrases basees sur le storytelling\n\nSECTION 6 : FAQ\n- 6 questions/reponses\n\nSECTION 7 : CTA\n- 3 suggestions\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"titre": "...", "sous_titre": "...", "probleme": "...", "benefices": "...", "offre": "...", "presentation": "...", "faq": [{"question": "...", "reponse": "..."}, ...], "cta": ["...", "...", "..."]}`;
      userPrompt = "Genere toute ma page d'accueil.";

    } else if (action === "titles") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere 5 titres punchline pour une page d'accueil. Max 10-12 mots chacun.\n\nReponds UNIQUEMENT en JSON sans backticks :\n["titre 1", "titre 2", "titre 3", "titre 4", "titre 5"]`;
      userPrompt = "Genere 5 titres pour ma page d'accueil.";

    } else if (action === "subtitles") {
      const { title } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\nTITRE CHOISI : "${title}"\n\n${context}\n\nGenere 3 sous-titres (1-2 phrases chacun).\n\nReponds UNIQUEMENT en JSON sans backticks :\n["sous-titre 1", "sous-titre 2", "sous-titre 3"]`;
      userPrompt = "Genere 3 sous-titres.";

    } else if (action === "problem") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere 2 versions du bloc "probleme" :\nVERSION EMPATHIQUE et VERSION DIRECTE\nChacune 3 phrases max.\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"empathique": "...", "directe": "..."}`;
      userPrompt = "Genere le bloc probleme.";

    } else if (action === "benefits") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere le bloc "benefices" : 3 phrases max.\n\nReponds avec le texte seul.`;
      userPrompt = "Genere le bloc benefices.";

    } else if (action === "offer") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere une presentation claire : titre engageant + 4-6 points cles.\n\nReponds avec le texte structure.`;
      userPrompt = "Genere la presentation de mon offre.";

    } else if (action === "presentation") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nCondense le storytelling en 3-4 phrases pour la page d'accueil.\n\nReponds avec le texte seul.`;
      userPrompt = "Genere ma presentation personnelle.";

    } else if (action === "faq") {
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere 8-10 questions/reponses pour une FAQ. Transparentes, humaines.\n\nReponds UNIQUEMENT en JSON sans backticks :\n[{"question": "...", "reponse": "..."}, ...]`;
      userPrompt = "Genere ma FAQ.";

    } else if (action === "faq-by-type") {
      const { offer_type, objections } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere une section FAQ pour une page de vente de type "${offer_type || "formation"}".\n\nOBJECTIONS SPECIFIQUES MENTIONNEES : ${objections || "aucune"}\n\nGENERE 5-7 questions-reponses.\n\nREGLES :\n- Les questions doivent etre formulees comme la CLIENTE les poserait (pas en langage corporate)\n- Les reponses sont directes, rassurantes, honnetes\n- Inclure TOUJOURS :\n  - Question sur le temps ("J'ai pas le temps")\n  - Question sur le prix/paiement\n  - Question sur les resultats ("Est-ce que ca marche pour mon cas ?")\n  - Question sur le niveau ("Je suis debutante, c'est grave ?")\n- Ton : direct, chaleureux, comme si tu repondais en DM\n- Pas de langue de bois : si la reponse est "non", dire non\n\nReponds UNIQUEMENT en JSON sans backticks :\n[{"question": "...", "reponse": "..."}, ...]`;
      userPrompt = "Genere ma FAQ par type d'offre.";

    } else if (action === "cta") {
      const { objective } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\nOBJECTIF : ${objective}\n\n${context}\n\nGenere 5 CTA (verbe a l'indicatif, direct, comme une invitation pas une pression).\n\nReponds UNIQUEMENT en JSON sans backticks :\n["cta 1", "cta 2", "cta 3", "cta 4", "cta 5"]`;
      userPrompt = "Genere mes CTA.";

    } else if (action === "cta-personalized") {
      const { page_type, section, objective: ctaObjective, offer_name } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere un CTA adapte pour cette section de page.\n\nTYPE DE PAGE : ${page_type || "vente"}\nOFFRE : ${offer_name || "voir contexte"}\nSECTION EN COURS : ${section || "general"}\nACTION SOUHAITEE : ${ctaObjective || "appel decouverte"}\n\nRETOURNE UNIQUEMENT en JSON sans backticks :\n{"button_text": "Je reserve mon appel decouverte", "micro_copy": "Gratuit. 30 minutes. Sans engagement.", "alternatives": [{"button_text": "On se parle ?", "micro_copy": "30 min pour faire le point sur ta com'"}, {"button_text": "Je veux en savoir plus", "micro_copy": "Zero engagement, promis"}]}`;
      userPrompt = "Genere un CTA personnalise.";

    } else if (action === "offer-price") {
      const { offer_name, offer_price, offer_included, offer_payment, offer_comparison } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere la section "Offre & Prix" de la page de vente.\n\nOFFRE :\n- Nom : ${offer_name || "voir contexte"}\n- Prix : ${offer_price || "non precise"}\n- Inclus : ${offer_included || "non precise"}\n- Paiement : ${offer_payment || "non precise"}\n- Comparaison : ${offer_comparison || "non fournie"}\n\nREGLES ETHIQUES ABSOLUES :\n- JAMAIS de prix gonfle barre\n- JAMAIS de fausse urgence\n- Prix presente honnetement\n- Si paiement mensuel : mettre le mensuel EN PREMIER, puis le total\n- Comparaison contextuelle OK si honnete\n- Transparence totale sur ce qui est inclus ET ce qui ne l'est pas\n\nSTRUCTURE :\n1. Recap de ce que l'offre inclut (liste claire, 5-8 points)\n2. Le prix, presente simplement\n3. Comparaison contextuelle (optionnel, 1 phrase)\n4. CTA + micro-copy de reassurance\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"title": "...", "included_list": ["...", "..."], "price_display": "...", "comparison": "...", "cta_text": "...", "cta_micro": "...", "full_text": "..."}`;
      userPrompt = "Genere la section offre et prix.";

    } else if (action === "for-who") {
      const { ideal_client, not_for } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere une section "Pour qui / Pas pour qui".\n\nCLIENTE IDEALE : ${ideal_client || "voir contexte"}\nPAS POUR : ${not_for || "non precise"}\n\nSTRUCTURE :\n"C'est pour toi si :" (4-5 points, empathiques, identification)\n"Ce n'est PAS pour toi si :" (3-4 points, honnetes, pas de shaming)\n\nTON : direct et bienveillant. Le "pas pour toi" n'est pas une punition, c'est un respect.\n\nREGLE ETHIQUE : le "pas pour toi" ne doit JAMAIS shamer.\nMAUVAIS : "Si tu n'es pas prete a investir en toi, ce n'est pas pour toi"\nBON : "Si tu cherches des resultats en 2 semaines sans t'impliquer, on ne sera pas alignees"\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"for_you": ["...", "..."], "not_for_you": ["...", "..."], "full_text": "..."}`;
      userPrompt = "Genere la section pour qui / pas pour qui.";

    } else if (action === "seo") {
      const { page_type } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere les elements SEO pour une page de type "${page_type || "accueil"}".\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"title_tag": "... (50-60 caracteres)", "meta_description": "... (150-160 caracteres)", "h1": "..."}`;
      userPrompt = "Genere le SEO de ma page.";

    } else if (action === "about-page") {
      const { angle } = params;
      const angleDesc = angle === "lettre" ? "Ton intimiste, comme une lettre ouverte a ta future cliente" : angle === "manifeste" ? "Ton engage, tes convictions d'abord, un manifeste" : "Ton narratif chronologique, ton parcours";
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nTu rediges une page "A propos" pour un site web. Ce n'est pas un CV, c'est une page qui cree une CONNEXION avec la visiteuse.\n\nANGLE CHOISI : ${angleDesc}\n\nRedige la page a propos :\n\n1. TITRE D'ACCROCHE : une phrase qui resume la conviction, pas "A propos de moi"\n2. MON HISTOIRE : version web du storytelling (plus fluide qu'un post, plus courte qu'un article). 150-250 mots.\n3. MES VALEURS : 3-4 blocs. Chaque bloc = titre court + 2-3 phrases.\n4. MON APPROCHE : ce qui rend sa methode unique. 100-150 mots.\n5. POUR QUI : description chaleureuse de sa cliente ideale. 50-100 mots.\n6. CTA : invitation douce a prendre contact ou decouvrir l'offre.\n\nREGLES :\n- Ecriture inclusive point median\n- JAMAIS de tiret cadratin\n- Ton aligne avec le branding\n- La page doit sonner HUMAIN, pas corporate\n- Elle doit donner envie de travailler avec cette personne\n- Chaque section est autonome\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"title": "...", "story": "...", "values": [{"title": "...", "description": "..."}, ...], "approach": "...", "for_whom": "...", "cta": "..."}`;
      userPrompt = "Genere ma page a propos.";

    } else if (action === "plan-steps") {
      const { offer_description } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nGenere un "Plan en 3 etapes" pour la page de vente.\n\nOFFRE : ${offer_description || "voir contexte"}\n\nREGLES :\n- EXACTEMENT 3 etapes (pas plus)\n- Chaque etape = 1 titre court (3-6 mots) + 1 phrase d'explication\n- Les etapes doivent montrer une PROGRESSION (debut > milieu > resultat)\n- Langage simple, concret, pas de jargon\n- La 3e etape = le resultat desire, pas une action\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"steps": [{"number": 1, "title": "...", "description": "..."}, {"number": 2, "title": "...", "description": "..."}, {"number": 3, "title": "...", "description": "..."}]}`;
      userPrompt = "Genere un plan en 3 etapes pour ma page de vente.";

    } else if (action === "guarantee") {
      const { guarantee_type, conditions, offer_name, offer_price } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nFormule une section garantie pour la page de vente.\n\nTYPE : ${guarantee_type}\nCONDITIONS : ${conditions || "non precisees"}\nOFFRE : ${offer_name || "voir contexte"} (${offer_price || "prix non precise"})\n\nREGLES :\n- Ton direct et rassurant, pas corporate\n- La garantie reduit le risque percu, pas la valeur percue\n- Formuler en "tu"\n- PAS de conditions cachees\n- PAS de ton "marketing bro"\n- La garantie doit etre CREDIBLE et HONNETE\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"title": "...", "body": "...", "micro_note": "..."}`;
      userPrompt = "Formule ma garantie.";

    } else if (action === "storybrand") {
      const { offer_name, offer_description, offer_price } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nTu generes une page de vente en utilisant le framework StoryBrand.\n\nPRINCIPE FONDAMENTAL : la cliente est l'heroine de l'histoire. Pas la marque. Pas l'offre. LA CLIENTE.\nToi (l'utilisatrice) tu es le GUIDE : empathie + autorite.\n\nOFFRE : ${offer_name || "voir contexte"} - ${offer_description || ""} (${offer_price || ""})\n\nSTRUCTURE STORYBRAND :\n\n1. HERO\nLe personnage (la cliente) veut quelque chose. Formuler clairement ce desir en 1-2 phrases.\n+ Le guide (toi) se positionne en 1 phrase.\n\n2. LE PROBLEME : 3 niveaux\na) Probleme EXTERNE (le truc concret)\nb) Probleme INTERNE (le ressenti)\nc) Probleme PHILOSOPHIQUE (l'injustice)\nLe probleme interne est le plus puissant.\n\n3. LE GUIDE (empathie + autorite)\na) Empathie : montrer qu'on comprend\nb) Autorite : preuves de credibilite\nL'empathie AVANT l'autorite. Toujours.\n\n4. LE PLAN EN 3 ETAPES\n3 etapes simples, claires, numerotees.\n\n5. CTA\na) CTA direct : l'action principale\nb) CTA transitionnel : pour celles qui ne sont pas pretes\n\n6. L'ECHEC (ce qui se passe si elle ne fait rien)\nUne pincee suffit. PAS de shaming. PAS de catastrophisme. MAX 2-3 phrases.\n\n7. LE SUCCES (la vie apres)\nBenefices emotionnels + concrets.\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"hero": "...", "problem_external": "...", "problem_internal": "...", "problem_philosophical": "...", "guide_empathy": "...", "guide_authority": "...", "plan": [{"number": 1, "title": "...", "description": "..."}, ...], "cta_direct": "...", "cta_transitional": "...", "failure": "...", "success": "...", "faq": [{"question": "...", "reponse": "..."}, ...]}`;
      userPrompt = "Genere ma page de vente StoryBrand.";

    } else if (action === "failure-section") {
      const { failure_description } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nFormule une section "echec" pour la page de vente StoryBrand.\n\nCE QUI SE PASSE SI RIEN NE CHANGE : ${failure_description}\n\nREGLES ETHIQUES ABSOLUES :\n- MAX 2-3 phrases. Pas plus.\n- Nommer la frustration que la personne ressent DEJA\n- NE PAS creer de peur nouvelle\n- NE PAS catastrophiser\n- NE PAS shamer\n- Ton : factuel et empathique, pas dramatique\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"failure_text": "..."}`;
      userPrompt = "Formule la section echec.";

    } else if (action === "structure-testimonial") {
      const { raw_testimonial } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nRestructure ce temoignage brut pour la page de vente.\n\nTEMOIGNAGE BRUT :\n"${raw_testimonial}"\n\nREGLES ABSOLUES :\n- NE CHANGE PAS les mots de la personne\n- Tu peux RACCOURCIR (couper les repetitions, les hesitations)\n- Tu peux REORGANISER (mettre le resultat en premier si plus impactant)\n- Tu NE PEUX PAS ajouter des mots qu'elle n'a pas dits\n- Tu NE PEUX PAS embellir ou exagerer\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"quote": "...", "name": "...", "context": "...", "result": "...", "full_version": "...", "highlight": "..."}`;
      userPrompt = "Structure ce temoignage.";

    } else if (action === "capture-page") {
      const { lead_magnet_name, lead_magnet_description } = params;
      systemPrompt = `${WEBSITE_PRINCIPLES}\n\n${context}\n\nTu generes le contenu d'une PAGE DE CAPTURE (lead magnet).\n\nOBJECTIF : recolter un email en echange d'un freebie.\nLONGUEUR : tres courte. 200-400 mots max.\nTON : direct, promesse claire, pas de blabla.\n\nLEAD MAGNET : ${lead_magnet_name || "voir contexte"}\nDESCRIPTION : ${lead_magnet_description || ""}\n\nSTRUCTURE :\n1. Titre benefice du lead magnet (6-12 mots)\n2. 3-4 bullet points de ce qu'il contient\n3. CTA clair\n4. Micro-copy reassurance ("Tes donnees restent privees")\n\nREGLE : chaque champ supplementaire = -4% de conversion. 2 champs suffisent (prenom + email).\n\nReponds UNIQUEMENT en JSON sans backticks :\n{"title": "...", "subtitle": "...", "bullets": ["...", "...", "..."], "cta_text": "...", "micro_copy": "..."}`;
      userPrompt = "Genere ma page de capture.";

    } else {
      return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = await callAnthropicSimple("claude-opus-4-6", systemPrompt, userPrompt, 0.8);
    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("website-ai error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
