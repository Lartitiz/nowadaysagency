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

    // Get user from token
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
    const day = now.getDay(); // 0=Sun
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().split("T")[0];

    // Check if week already generated
    if (!forceRegenerate) {
      const { count } = await supabase
        .from("weekly_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("week_start", weekStart);

      if (count && count > 0) {
        // Already exists, return existing
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
      contactsRes,
      prospectsRes,
      commPlanRes,
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
        .lte("date", addDays(weekStart, 6))
        .order("date"),
      supabase
        .from("engagement_contacts")
        .select("id, pseudo, tag")
        .eq("user_id", userId)
        .order("sort_order")
        .limit(21),
      supabase
        .from("prospects")
        .select("id, name, instagram_handle, status")
        .eq("user_id", userId)
        .in("status", ["new", "contacted", "replied"])
        .limit(10),
      supabase
        .from("communication_plans")
        .select("*")
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

    const channels: string[] = (config.channels as string[]) || [];
    const calendarPosts = calendarRes.data || [];
    const contacts = contactsRes.data || [];
    const prospects = prospectsRes.data || [];
    const commPlan = commPlanRes.data;

    // Time budgets per day (in minutes)
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

    // Helper: add task
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
      tasks.push({
        user_id: userId,
        week_start: weekStart,
        day_of_week: dayOfWeek,
        task_type: taskType,
        title,
        description,
        estimated_minutes: minutes,
        link_to: linkTo,
        link_label: linkLabel,
        sort_order: sortOrder++,
        ...extras,
      });
    };

    // ── ENGAGEMENT: daily commenting if contacts exist ──
    const hasEngagement =
      channels.includes("instagram") && contacts.length > 0;
    if (hasEngagement) {
      for (let d = 1; d <= 5; d++) {
        const startIdx = ((d - 1) * 3) % contacts.length;
        const dayContacts = [];
        for (let i = 0; i < Math.min(3, contacts.length); i++) {
          dayContacts.push(contacts[(startIdx + i) % contacts.length]);
        }
        const names = dayContacts.map((c: any) => `@${c.pseudo}`).join(" · ");
        addTask(
          d,
          "engagement",
          "💬 Commenter 3 comptes stratégiques",
          `→ ${names}`,
          10,
          "/instagram/routine",
          "Ouvrir la routine →",
          { related_contacts: dayContacts.map((c: any) => c.pseudo) }
        );
      }
    }

    // ── CALENDAR POSTS: create/publish tasks ──
    for (const post of calendarPosts) {
      const postDate = new Date(post.date + "T00:00:00");
      const postDay = postDate.getDay();
      const dayOfWeek = postDay === 0 ? 7 : postDay;

      // Determine task based on status
      const isDraft = post.status === "draft" || !!post.content_draft;
      const isPublished = post.status === "published";

      if (isPublished) continue; // Skip already published

      const canalLabel =
        post.canal === "instagram"
          ? "Instagram"
          : post.canal === "linkedin"
          ? "LinkedIn"
          : post.canal;
      const formatEmoji =
        post.format === "reel"
          ? "🎥"
          : post.format === "stories"
          ? "📱"
          : "✍️";

      if (isDraft) {
        addTask(
          dayOfWeek,
          "publish_post",
          `${formatEmoji} Publier ton ${post.format || "post"} ${canalLabel}`,
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
        // Assign creation task 1 day before or same day
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
          createDay,
          "create_post",
          `${formatEmoji} Rédiger ton ${post.format || "post"} ${canalLabel}`,
          `📅 Prévu ${getDayLabel(dayOfWeek)} · Objectif : ${
            post.objectif || post.category || "Visibilité"
          }`,
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

    // ── PROSPECTION: DM tasks ──
    if (
      prospects.length > 0 &&
      (config.main_goal === "clients" || config.main_goal === "launch")
    ) {
      // Split prospects across 2 days (wed/thu)
      const half = Math.ceil(prospects.length / 2);
      const batch1 = prospects.slice(0, half);
      const batch2 = prospects.slice(half);

      if (batch1.length > 0) {
        const names = batch1
          .map(
            (p: any) => `@${p.instagram_handle || p.name}`
          )
          .join(" · ");
        addTask(
          3,
          "prospection_dm",
          `📩 Envoyer ${batch1.length} DM de prospection`,
          `Prospects : ${names}`,
          10,
          "/instagram/routine",
          "Ouvrir la prospection →",
          {
            related_prospect_ids: batch1.map((p: any) => p.id),
          }
        );
      }

      if (batch2.length > 0) {
        const names = batch2
          .map(
            (p: any) => `@${p.instagram_handle || p.name}`
          )
          .join(" · ");
        addTask(
          4,
          "prospection_dm",
          `📩 Envoyer ${batch2.length} DM de prospection`,
          `Prospects : ${names}`,
          10,
          "/instagram/routine",
          "Ouvrir la prospection →",
          {
            related_prospect_ids: batch2.map((p: any) => p.id),
          }
        );
      }
    }

    // ── STORIES: weekly preparation ──
    if (channels.includes("instagram")) {
      const storiesTarget = commPlan?.instagram_stories_week || 5;
      addTask(
        2,
        "create_stories",
        "📱 Préparer tes stories de la semaine",
        `${storiesTarget} stories prévues cette semaine`,
        15,
        "/instagram/stories",
        "Ouvrir le générateur de stories →"
      );
    }

    // ── LINKEDIN post ──
    if (channels.includes("linkedin")) {
      // Check if not already covered by calendar
      const hasLinkedInCalendar = calendarPosts.some(
        (p: any) => p.canal === "linkedin"
      );
      if (!hasLinkedInCalendar) {
        addTask(
          3,
          "create_linkedin",
          "💼 Rédiger ton post LinkedIn",
          "1 post LinkedIn par semaine",
          15,
          "/linkedin",
          "Ouvrir l'éditeur LinkedIn →"
        );
      }
    }

    // ── STATS: Friday ──
    addTask(
      5,
      "check_stats",
      "📊 Checker tes stats de la semaine",
      "Analyse de tes performances",
      5,
      "/instagram/stats",
      "Ouvrir le dashboard →"
    );

    // Insert all tasks
    if (tasks.length > 0) {
      await supabase.from("weekly_tasks").insert(tasks);
    }

    // Return all tasks for this week (including kept completed/custom ones)
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
