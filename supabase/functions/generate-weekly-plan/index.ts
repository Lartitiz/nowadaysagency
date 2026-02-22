import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const {
      data: { user },
    } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const body = await req.json().catch(() => ({}));
    const forceRegenerate = body.force === true;

    // Get monday of current week
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().split("T")[0];
    const weekEnd = addDays(weekStart, 6);

    // Check if week already generated
    if (!forceRegenerate) {
      const { count } = await supabase
        .from("weekly_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("week_start", weekStart);

      if (count && count > 0) {
        const { data: existing } = await supabase
          .from("weekly_tasks")
          .select("*")
          .eq("user_id", userId)
          .eq("week_start", weekStart)
          .order("day_of_week")
          .order("sort_order");

        return new Response(
          JSON.stringify({ tasks: existing, week_start: weekStart }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If force regenerate, delete non-completed, non-custom tasks
    if (forceRegenerate) {
      await supabase
        .from("weekly_tasks")
        .delete()
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .eq("is_completed", false)
        .eq("is_custom", false);
    }

    // Fetch all context in parallel
    const [
      configRes,
      calendarRes,
      networkContactsRes,
      prospectsFollowupRes,
      prospectsToContactRes,
      commPlanRes,
      profileRes,
    ] = await Promise.all([
      supabase
        .from("user_plan_config")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("calendar_posts")
        .select("id, date, canal, theme, status, format, content_draft, objectif, category")
        .eq("user_id", userId)
        .gte("date", weekStart)
        .lte("date", weekEnd)
        .neq("status", "published")
        .order("date"),
      // Network contacts ordered by oldest interaction first (rotation)
      supabase
        .from("contacts")
        .select("id, username, display_name, network_category, platform, last_interaction_at")
        .eq("user_id", userId)
        .eq("contact_type", "network")
        .neq("network_category", "inspiration")
        .order("last_interaction_at", { ascending: true, nullsFirst: true })
        .limit(30),
      // Prospects with followup this week
      supabase
        .from("contacts")
        .select("id, username, display_name, prospect_stage, next_followup_at, target_offer")
        .eq("user_id", userId)
        .eq("contact_type", "prospect")
        .gte("next_followup_at", weekStart + "T00:00:00")
        .lte("next_followup_at", weekEnd + "T23:59:59")
        .order("next_followup_at"),
      // Prospects never contacted
      supabase
        .from("contacts")
        .select("id, username, display_name, prospect_stage, target_offer")
        .eq("user_id", userId)
        .eq("contact_type", "prospect")
        .eq("prospect_stage", "to_contact")
        .order("created_at")
        .limit(6),
      supabase
        .from("communication_plans")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("canaux")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const config = configRes.data;
    if (!config) {
      return new Response(
        JSON.stringify({ error: "no_config", message: "Plan config not set" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Resolve active channels: profiles.canaux > config.channels
    const profileChannels = profileRes.data?.canaux;
    const channels: string[] =
      Array.isArray(profileChannels) && profileChannels.length > 0
        ? profileChannels
        : (config.channels as string[]) || ["instagram"];

    const calendarPosts = calendarRes.data || [];
    const networkContacts = networkContactsRes.data || [];
    const prospectsFollowup = prospectsFollowupRes.data || [];
    const prospectsToContact = prospectsToContactRes.data || [];
    const commPlan = commPlanRes.data;

    // Time budgets
    const weeklyBudgets: Record<string, number> = {
      less_2h: 90,
      "2_5h": 210,
      "5_10h": 450,
      more_10h: 720,
    };
    const totalWeeklyMinutes = weeklyBudgets[config.weekly_time] || 210;
    const dailyBudget = Math.floor(totalWeeklyMinutes / 5);

    const tasks: any[] = [];
    let sortOrder = 0;
    // Track minutes per day to respect budget
    const dayMinutes: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    const addTask = (
      dayOfWeek: number,
      taskType: string,
      title: string,
      description: string,
      minutes: number,
      linkTo: string,
      linkLabel: string,
      extras: any = {}
    ) => {
      // Clamp to valid weekdays
      const d = Math.max(1, Math.min(5, dayOfWeek));
      tasks.push({
        user_id: userId,
        week_start: weekStart,
        day_of_week: d,
        task_type: taskType,
        title,
        description,
        estimated_minutes: minutes,
        link_to: linkTo,
        link_label: linkLabel,
        sort_order: sortOrder++,
        ...extras,
      });
      dayMinutes[d] = (dayMinutes[d] || 0) + minutes;
    };

    // Find least loaded day among candidates
    const leastLoadedDay = (candidates: number[]): number => {
      let best = candidates[0] || 3;
      let bestMin = dayMinutes[best] || 0;
      for (const d of candidates) {
        if ((dayMinutes[d] || 0) < bestMin) {
          best = d;
          bestMin = dayMinutes[d] || 0;
        }
      }
      return best;
    };

    // ═══════════════════════════════════════════════
    // 1. ENGAGEMENT: daily commenting (smart rotation)
    // ═══════════════════════════════════════════════
    if (channels.includes("instagram") && networkContacts.length > 0) {
      const contactPool = [...networkContacts];
      for (let d = 1; d <= 5; d++) {
        const count = Math.min(3, contactPool.length);
        if (count === 0) break;
        // Pick the first `count` contacts (already sorted by oldest interaction)
        const startIdx = ((d - 1) * 3) % contactPool.length;
        const dayContacts = [];
        for (let i = 0; i < count; i++) {
          dayContacts.push(contactPool[(startIdx + i) % contactPool.length]);
        }
        const names = dayContacts
          .map((c: any) => `@${c.username || c.display_name}`)
          .join(" · ");

        let desc = `→ ${names}`;
        if (networkContacts.length < 3) {
          desc += `\n💡 Ajoute des contacts pour compléter ta routine`;
        }

        addTask(
          d,
          "engagement",
          "💬 Commenter 3 comptes stratégiques",
          desc,
          10,
          "/contacts",
          "Ouvrir mes contacts →",
          { related_contacts: dayContacts.map((c: any) => c.username) }
        );
      }
    }

    // ═══════════════════════════════════════════════
    // 2. CALENDAR POSTS: only for active channels
    // ═══════════════════════════════════════════════
    const filteredPosts = calendarPosts.filter((p: any) =>
      channels.includes(p.canal)
    );

    for (const post of filteredPosts) {
      const postDate = new Date(post.date + "T00:00:00");
      const postDay = postDate.getDay();
      const dayOfWeek = postDay === 0 ? 7 : postDay;

      const canalLabel =
        post.canal === "instagram"
          ? "Instagram"
          : post.canal === "linkedin"
          ? "LinkedIn"
          : post.canal;
      const formatLabel = post.format === "reel" ? "Reel" : post.format === "stories" ? "stories" : post.format === "carrousel" ? "carrousel" : "post";
      const formatEmoji =
        post.format === "reel"
          ? "🎥"
          : post.format === "stories"
          ? "📱"
          : post.format === "carrousel"
          ? "📑"
          : "✍️";

      const isDraft = post.status === "draft" || !!post.content_draft;

      if (isDraft) {
        addTask(
          Math.min(dayOfWeek, 5),
          "publish_post",
          `${formatEmoji} Publier ton ${formatLabel} ${canalLabel}`,
          `📅 "${post.theme}" · 🟡 Rédigé, prêt à publier`,
          5,
          "/calendrier",
          "Voir dans le calendrier →",
          {
            related_calendar_post_id: post.id,
            suggested_objective: post.objectif || post.category,
          }
        );
      } else {
        // Create task 1 day before publication
        const createDay = dayOfWeek > 1 ? dayOfWeek - 1 : dayOfWeek;
        const linkTo =
          post.canal === "linkedin"
            ? "/linkedin"
            : post.format === "reel"
            ? "/instagram/reels"
            : post.format === "stories"
            ? "/instagram/stories"
            : "/atelier";

        addTask(
          Math.min(createDay, 5),
          "create_post",
          `${formatEmoji} Rédiger : "${post.theme}"`,
          `${canalLabel} · ${formatLabel} · Objectif : ${
            post.objectif || post.category || "Visibilité"
          } · Prévu ${getDayLabel(dayOfWeek)}`,
          20,
          linkTo,
          "Ouvrir l'atelier créatif →",
          {
            related_calendar_post_id: post.id,
            suggested_format: post.format,
            suggested_objective: post.objectif || post.category,
          }
        );
      }
    }

    // No calendar posts message is handled in frontend

    // ═══════════════════════════════════════════════
    // 3. PROSPECTION: followups + first contacts
    // ═══════════════════════════════════════════════
    // Followups with scheduled dates
    for (const prospect of prospectsFollowup) {
      const followDate = new Date(prospect.next_followup_at);
      let dow = followDate.getDay();
      dow = dow === 0 ? 5 : dow; // Move Sunday to Friday
      dow = Math.min(dow, 5);

      addTask(
        dow,
        "prospection_dm",
        `📩 Relancer @${prospect.username || prospect.display_name}`,
        prospect.target_offer ? `Offre : ${prospect.target_offer}` : "Relance prévue",
        10,
        "/contacts",
        "Ouvrir la prospection →",
        { related_prospect_ids: [prospect.id] }
      );
    }

    // First contacts - spread across 2-3 days
    if (prospectsToContact.length > 0) {
      const spreadDays = [2, 4, 5]; // Tue, Thu, Fri
      const perDay = Math.ceil(prospectsToContact.length / spreadDays.length);
      let idx = 0;
      for (let si = 0; si < spreadDays.length && idx < prospectsToContact.length; si++) {
        const batch = prospectsToContact.slice(idx, idx + perDay);
        if (batch.length === 0) break;
        idx += perDay;

        const d = leastLoadedDay(spreadDays);
        const names = batch
          .map((p: any) => `@${p.username || p.display_name}`)
          .join(" · ");
        addTask(
          d,
          "prospection_dm",
          `📩 Premier DM : ${names}`,
          `${batch.length} prospect${batch.length > 1 ? "s" : ""} à contacter`,
          batch.length * 5,
          "/contacts",
          "Ouvrir la prospection →",
          { related_prospect_ids: batch.map((p: any) => p.id) }
        );
      }
    }

    // ═══════════════════════════════════════════════
    // 4. STORIES prep (only if Instagram active)
    // ═══════════════════════════════════════════════
    if (channels.includes("instagram")) {
      const storiesTarget = commPlan?.instagram_stories_week || 5;
      addTask(
        leastLoadedDay([1, 2]),
        "create_stories",
        "📱 Préparer tes stories de la semaine",
        `${storiesTarget} stories prévues`,
        15,
        "/instagram/stories",
        "Ouvrir le générateur →"
      );
    }

    // ═══════════════════════════════════════════════
    // 5. LINKEDIN generic post (only if no calendar)
    // ═══════════════════════════════════════════════
    if (channels.includes("linkedin")) {
      const hasLinkedInCalendar = filteredPosts.some(
        (p: any) => p.canal === "linkedin"
      );
      if (!hasLinkedInCalendar) {
        addTask(
          leastLoadedDay([2, 3, 4]),
          "create_linkedin",
          "💼 Rédiger ton post LinkedIn",
          "1 post LinkedIn cette semaine",
          15,
          "/linkedin",
          "Ouvrir l'éditeur LinkedIn →"
        );
      }
    }

    // ═══════════════════════════════════════════════
    // 6. ADMIN: stats on Friday
    // ═══════════════════════════════════════════════
    addTask(
      5,
      "check_stats",
      "📊 Checker tes stats de la semaine",
      "Analyse de tes performances",
      5,
      channels.includes("instagram") ? "/instagram/stats" : "/dashboard",
      "Ouvrir le dashboard →"
    );

    // ═══════════════════════════════════════════════
    // 7. FILL light days with bonus tasks
    // ═══════════════════════════════════════════════
    const bonusTasks = [
      { title: "💡 Optimiser ta bio Instagram", link: "/instagram/profil/bio", label: "Ouvrir →", channel: "instagram" },
      { title: "💡 Trouver 3 idées de contenu", link: "/atelier", label: "Ouvrir l'atelier →", channel: null },
      { title: "💡 Répondre aux commentaires et DM", link: "/contacts", label: "Ouvrir →", channel: null },
    ];

    for (let d = 1; d <= 5; d++) {
      if ((dayMinutes[d] || 0) < dailyBudget * 0.5) {
        // Day is too light, add a bonus
        for (const bonus of bonusTasks) {
          if (bonus.channel && !channels.includes(bonus.channel)) continue;
          // Check not already added
          const alreadyHas = tasks.some(
            (t) => t.day_of_week === d && t.title === bonus.title
          );
          if (!alreadyHas) {
            addTask(d, "bonus", bonus.title, "Tâche recommandée", 10, bonus.link, bonus.label);
            break; // Max 1 bonus per day
          }
        }
      }
    }

    // Insert all tasks
    if (tasks.length > 0) {
      await supabase.from("weekly_tasks").insert(tasks);
    }

    // Return all tasks for this week
    const { data: allTasks } = await supabase
      .from("weekly_tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .order("day_of_week")
      .order("sort_order");

    return new Response(
      JSON.stringify({ tasks: allTasks || [], week_start: weekStart }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating weekly plan:", error);
    return new Response(
      JSON.stringify({ error: "internal", message: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function getDayLabel(dayOfWeek: number): string {
  const labels: Record<number, string> = {
    1: "lundi",
    2: "mardi",
    3: "mercredi",
    4: "jeudi",
    5: "vendredi",
    6: "samedi",
    7: "dimanche",
  };
  return labels[dayOfWeek] || "";
}
