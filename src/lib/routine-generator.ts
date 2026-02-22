/**
 * Smart routine generator based on communication plan
 */

export interface CommPlan {
  daily_time: number;
  active_days: string[];
  channels: string[];
  instagram_posts_week: number;
  instagram_stories_week: number;
  instagram_reels_month: number;
  linkedin_posts_week: number;
  newsletter_frequency: string;
  monthly_goal: string;
}

export interface GeneratedTask {
  title: string;
  task_type: string;
  channel: string | null;
  duration_minutes: number;
  recurrence: string;
  day_of_week: string | null;
  week_of_month: number | null;
  linked_module: string | null;
  sort_order: number;
}

const DAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const DAY_LABELS: Record<string, string> = {
  lun: "Lundi", mar: "Mardi", mer: "Mercredi",
  jeu: "Jeudi", ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
};

export function getDayLabel(day: string) {
  return DAY_LABELS[day] || day;
}

/**
 * Get time allocation percentages based on monthly goal
 */
function getTimeAllocation(goal: string) {
  switch (goal) {
    case "launch":
      return { content: 0.45, engagement: 0.2, prospection: 0.25, admin: 0.1 };
    case "visibility":
      return { content: 0.4, engagement: 0.35, prospection: 0.15, admin: 0.1 };
    case "convert":
      return { content: 0.35, engagement: 0.2, prospection: 0.35, admin: 0.1 };
    case "network":
      return { content: 0.3, engagement: 0.35, prospection: 0.25, admin: 0.1 };
    case "foundations":
      return { content: 0.35, engagement: 0.15, prospection: 0.1, admin: 0.4 };
    default:
      return { content: 0.4, engagement: 0.3, prospection: 0.2, admin: 0.1 };
  }
}

/**
 * Distribute N tasks across active days as evenly as possible
 */
function distributeDays(activeDays: string[], count: number): string[] {
  if (count === 0) return [];
  const ordered = activeDays.filter(d => DAYS.includes(d)).sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
  if (ordered.length === 0) return [];
  
  const result: string[] = [];
  const step = ordered.length / count;
  for (let i = 0; i < Math.min(count, ordered.length); i++) {
    result.push(ordered[Math.floor(i * step)]);
  }
  return result;
}

export function generateRoutineTasks(plan: CommPlan): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];
  const activeDays = plan.active_days.filter(d => DAYS.includes(d));
  let order = 0;

  // === INSTAGRAM ===
  if (plan.channels.includes("instagram")) {
    // Posts
    const postDays = distributeDays(activeDays, plan.instagram_posts_week);
    postDays.forEach(day => {
      tasks.push({
        title: "Rédiger 1 post Instagram",
        task_type: "content_post",
        channel: "instagram",
        duration_minutes: 15,
        recurrence: "weekly",
        day_of_week: day,
        week_of_month: null,
        linked_module: "/atelier?canal=instagram",
        sort_order: order++,
      });
    });

    // Stories
    if (plan.instagram_stories_week > 0) {
      const storyDays = distributeDays(activeDays, Math.min(plan.instagram_stories_week, 3));
      storyDays.forEach(day => {
        tasks.push({
          title: "Créer des stories",
          task_type: "content_stories",
          channel: "instagram",
          duration_minutes: 10,
          recurrence: "weekly",
          day_of_week: day,
          week_of_month: null,
          linked_module: "/instagram/stories",
          sort_order: order++,
        });
      });
    }

    // Reels (monthly distribution)
    if (plan.instagram_reels_month > 0) {
      const reelWeeks = plan.instagram_reels_month >= 4 ? [1, 2, 3, 4] :
        plan.instagram_reels_month >= 2 ? [1, 3] : [2];
      reelWeeks.forEach(w => {
        tasks.push({
          title: "Tourner / monter 1 Reel",
          task_type: "content_reel",
          channel: "instagram",
          duration_minutes: 30,
          recurrence: "monthly",
          day_of_week: activeDays[0] || "lun",
          week_of_month: w,
          linked_module: "/instagram/reels",
          sort_order: order++,
        });
      });
    }

    // Engagement (daily on active days)
    tasks.push({
      title: "Engagement : commenter 3 comptes stratégiques",
      task_type: "engagement",
      channel: "instagram",
      duration_minutes: Math.max(5, Math.round(plan.daily_time * 0.3)),
      recurrence: "daily",
      day_of_week: null,
      week_of_month: null,
      linked_module: "/instagram/routine",
      sort_order: order++,
    });

    // Prospection
    tasks.push({
      title: "Envoyer 1 DM de prospection",
      task_type: "prospection",
      channel: "instagram",
      duration_minutes: Math.max(5, Math.round(plan.daily_time * 0.15)),
      recurrence: "daily",
      day_of_week: null,
      week_of_month: null,
      linked_module: "/instagram/routine",
      sort_order: order++,
    });
  }

  // === LINKEDIN ===
  if (plan.channels.includes("linkedin")) {
    const liDays = distributeDays(activeDays, plan.linkedin_posts_week);
    liDays.forEach(day => {
      tasks.push({
        title: "Rédiger 1 post LinkedIn",
        task_type: "content_linkedin",
        channel: "linkedin",
        duration_minutes: 15,
        recurrence: "weekly",
        day_of_week: day,
        week_of_month: null,
        linked_module: "/linkedin",
        sort_order: order++,
      });
    });
  }

  // === NEWSLETTER ===
  if (plan.channels.includes("newsletter") && plan.newsletter_frequency !== "none") {
    const freq = plan.newsletter_frequency;
    if (freq === "weekly") {
      tasks.push({
        title: "Rédiger la newsletter",
        task_type: "content_newsletter",
        channel: "newsletter",
        duration_minutes: 30,
        recurrence: "weekly",
        day_of_week: activeDays[activeDays.length - 1] || "ven",
        week_of_month: null,
        linked_module: null,
        sort_order: order++,
      });
    } else {
      const weeks = freq === "bimonthly" ? [1, 3] : [2];
      weeks.forEach(w => {
        tasks.push({
          title: "Rédiger la newsletter",
          task_type: "content_newsletter",
          channel: "newsletter",
          duration_minutes: 30,
          recurrence: "monthly",
          day_of_week: activeDays[activeDays.length - 1] || "ven",
          week_of_month: w,
          linked_module: null,
          sort_order: order++,
        });
      });
    }
  }

  // === ADMIN TASKS (monthly) ===
  tasks.push({
    title: "Créer le calendrier éditorial du mois prochain",
    task_type: "admin",
    channel: null,
    duration_minutes: 45,
    recurrence: "monthly",
    day_of_week: null,
    week_of_month: 4,
    linked_module: "/calendrier",
    sort_order: order++,
  });

  tasks.push({
    title: "Checker mes stats du mois",
    task_type: "admin",
    channel: null,
    duration_minutes: 15,
    recurrence: "monthly",
    day_of_week: null,
    week_of_month: 4,
    linked_module: "/instagram/stats",
    sort_order: order++,
  });

  // Admin daily: respond to comments
  tasks.push({
    title: "Répondre aux commentaires et DM",
    task_type: "admin",
    channel: null,
    duration_minutes: 5,
    recurrence: "daily",
    day_of_week: null,
    week_of_month: null,
    linked_module: null,
    sort_order: order++,
  });

  return tasks;
}

/**
 * Get today's tasks from the full task list
 */
export function getTodayTasks(allTasks: GeneratedTask[], activeDays: string[]): GeneratedTask[] {
  const dayIndex = new Date().getDay();
  // JS: 0=sun, 1=mon...
  const dayMap: Record<number, string> = { 0: "dim", 1: "lun", 2: "mar", 3: "mer", 4: "jeu", 5: "ven", 6: "sam" };
  const today = dayMap[dayIndex];
  
  if (!activeDays.includes(today)) return [];

  const currentWeekOfMonth = Math.ceil(new Date().getDate() / 7);
  
  return allTasks.filter(t => {
    if (t.recurrence === "daily") return true;
    if (t.recurrence === "weekly" && t.day_of_week === today) return true;
    if (t.recurrence === "monthly" && t.week_of_month === currentWeekOfMonth && (t.day_of_week === today || !t.day_of_week)) return true;
    return false;
  });
}

export function getWeekTasks(allTasks: GeneratedTask[], activeDays: string[]) {
  const weekOfMonth = Math.ceil(new Date().getDate() / 7);
  const result: Record<string, GeneratedTask[]> = {};
  
  for (const day of DAYS) {
    if (!activeDays.includes(day)) continue;
    result[day] = allTasks.filter(t => {
      if (t.recurrence === "daily") return true;
      if (t.recurrence === "weekly" && t.day_of_week === day) return true;
      if (t.recurrence === "monthly" && t.week_of_month === weekOfMonth && (t.day_of_week === day || !t.day_of_week)) return true;
      return false;
    });
  }
  return result;
}

export function getMonthTasks(allTasks: GeneratedTask[]): GeneratedTask[] {
  return allTasks.filter(t => t.recurrence === "monthly");
}

export function getTaskEmoji(taskType: string): string {
  switch (taskType) {
    case "content_post": return "✍️";
    case "content_stories": return "📸";
    case "content_reel": return "🎬";
    case "content_linkedin": return "💼";
    case "content_newsletter": return "📧";
    case "engagement": return "💬";
    case "prospection": return "🎯";
    case "admin": return "📊";
    default: return "📌";
  }
}

export function getTaskCategory(taskType: string): string {
  if (taskType.startsWith("content")) return "Création";
  if (taskType === "engagement") return "Engagement";
  if (taskType === "prospection") return "Prospection";
  if (taskType === "admin") return "Admin";
  return "Autre";
}

export function getChannelEmoji(channel: string | null): string {
  switch (channel) {
    case "instagram": return "📱";
    case "linkedin": return "💼";
    case "newsletter": return "📧";
    case "blog": return "🌐";
    case "pinterest": return "📌";
    default: return "📋";
  }
}
