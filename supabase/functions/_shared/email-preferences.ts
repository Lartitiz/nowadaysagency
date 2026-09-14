// Only explicit categories are affected. Billing and other transactional mail
// keep their existing path; global unsubscription is checked separately.
const TIPS = new Set(["not_activated", "credits_exhausted"]);
const REMINDERS = new Set(["inactive_7d", "inactive_14d", "inactive_30d", "forgotten_draft_reminder"]);
export async function emailPreferenceAllows(db: any, userId: string, event: string): Promise<boolean> {
  const field = TIPS.has(event) ? "notification_tips" : REMINDERS.has(event) ? "notification_reminders" : event === "weekly_digest" ? "weekly_ritual_enabled" : null;
  if (!field) return true;
  const {data, error} = await db.from("profiles").select(field).eq("user_id",userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Email preferences unavailable");
  return data[field] !== false;
}
