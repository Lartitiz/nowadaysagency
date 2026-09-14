/** Calendar weeks use date-only values; UTC arithmetic avoids DST shifts. */
export function calendarWeek(start?: string, now = new Date()) {
  const date = start ? new Date(`${start}T12:00:00Z`) : new Date(now);
  if (Number.isNaN(date.getTime()) || (start && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || date.toISOString().slice(0, 10) !== start))) throw new Error("invalid_calendar_week");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}
