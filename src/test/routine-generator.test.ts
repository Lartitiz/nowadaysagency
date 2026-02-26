import { describe, it, expect } from "vitest";
import {
  generateRoutineTasks,
  getDayLabel,
  getTaskEmoji,
  getTaskCategory,
  getChannelEmoji,
  getMonthTasks,
  type CommPlan,
  type GeneratedTask,
} from "@/lib/routine-generator";

function makePlan(overrides: Partial<CommPlan> = {}): CommPlan {
  return {
    daily_time: 30,
    active_days: ["lun", "mar", "mer", "jeu", "ven"],
    channels: ["instagram", "linkedin", "newsletter"],
    instagram_posts_week: 3,
    instagram_stories_week: 3,
    instagram_reels_month: 2,
    linkedin_posts_week: 2,
    newsletter_frequency: "weekly",
    monthly_goal: "visibility",
    ...overrides,
  };
}

describe("generateRoutineTasks", () => {
  it("1. Plan complet → génère des tâches cohérentes", () => {
    const tasks = generateRoutineTasks(makePlan());
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.title && t.task_type)).toBe(true);
  });

  it("2. 0 posts Instagram → pas de tâche content_post Instagram", () => {
    const tasks = generateRoutineTasks(
      makePlan({ instagram_posts_week: 0, instagram_stories_week: 0, instagram_reels_month: 0 }),
    );
    const igPosts = tasks.filter((t) => t.task_type === "content_post" && t.channel === "instagram");
    expect(igPosts).toHaveLength(0);
  });

  it("3. Newsletter hebdomadaire → une tâche newsletter weekly", () => {
    const tasks = generateRoutineTasks(makePlan({ newsletter_frequency: "weekly" }));
    const nl = tasks.filter((t) => t.task_type === "content_newsletter");
    expect(nl).toHaveLength(1);
    expect(nl[0].recurrence).toBe("weekly");
  });

  it("4. Newsletter mensuelle → une tâche newsletter monthly", () => {
    const tasks = generateRoutineTasks(makePlan({ newsletter_frequency: "monthly" }));
    const nl = tasks.filter((t) => t.task_type === "content_newsletter");
    expect(nl).toHaveLength(1);
    expect(nl[0].recurrence).toBe("monthly");
  });

  it("5. daily_time 15 min → tâches daily ≤ 15 min", () => {
    const tasks = generateRoutineTasks(makePlan({ daily_time: 15 }));
    const dailyTasks = tasks.filter((t) => t.recurrence === "daily");
    for (const t of dailyTasks) {
      expect(t.duration_minutes).toBeLessThanOrEqual(15);
    }
  });

  it("6. sort_order est strictement croissant", () => {
    const tasks = generateRoutineTasks(makePlan());
    for (let i = 1; i < tasks.length; i++) {
      expect(tasks[i].sort_order).toBeGreaterThan(tasks[i - 1].sort_order);
    }
  });

  it("7. Tâches weekly distribuées sur les active_days uniquement", () => {
    const activeDays = ["lun", "mer", "ven"];
    const tasks = generateRoutineTasks(makePlan({ active_days: activeDays }));
    const weeklyTasks = tasks.filter((t) => t.recurrence === "weekly");
    for (const t of weeklyTasks) {
      expect(activeDays).toContain(t.day_of_week);
    }
  });

  it("8. Plan avec channels vide → retourne seulement les tâches admin", () => {
    const tasks = generateRoutineTasks(
      makePlan({ channels: [], instagram_posts_week: 0, instagram_stories_week: 0, instagram_reels_month: 0, linkedin_posts_week: 0, newsletter_frequency: "none" }),
    );
    expect(tasks.every((t) => t.task_type === "admin")).toBe(true);
  });

  it("9. Seulement LinkedIn → uniquement tâches LinkedIn + admin", () => {
    const tasks = generateRoutineTasks(
      makePlan({ channels: ["linkedin"], instagram_posts_week: 0, instagram_stories_week: 0, instagram_reels_month: 0, newsletter_frequency: "none" }),
    );
    const nonAdmin = tasks.filter((t) => t.task_type !== "admin");
    expect(nonAdmin.every((t) => t.channel === "linkedin")).toBe(true);
    expect(nonAdmin.length).toBeGreaterThan(0);
  });
});

describe("getDayLabel", () => {
  it("retourne le label français", () => {
    expect(getDayLabel("lun")).toBe("Lundi");
  });
  it("retourne le jour brut si inconnu", () => {
    expect(getDayLabel("xyz")).toBe("xyz");
  });
});

describe("getTaskEmoji / getTaskCategory / getChannelEmoji", () => {
  it("retourne un emoji pour chaque type connu", () => {
    expect(getTaskEmoji("content_post")).toBe("✍️");
    expect(getTaskEmoji("unknown")).toBe("📌");
  });
  it("retourne la catégorie correcte", () => {
    expect(getTaskCategory("content_post")).toBe("Création");
    expect(getTaskCategory("engagement")).toBe("Engagement");
    expect(getTaskCategory("admin")).toBe("Admin");
  });
  it("retourne l'emoji canal correct", () => {
    expect(getChannelEmoji("instagram")).toBe("📱");
    expect(getChannelEmoji(null)).toBe("📋");
  });
});

describe("getMonthTasks", () => {
  it("filtre uniquement les tâches monthly", () => {
    const tasks = generateRoutineTasks(makePlan());
    const monthly = getMonthTasks(tasks);
    expect(monthly.every((t) => t.recurrence === "monthly")).toBe(true);
    expect(monthly.length).toBeGreaterThan(0);
  });
});
