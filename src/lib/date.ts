// All dates are shown in India time (Asia/Kolkata).
const TZ = "Asia/Kolkata";

/** YYYY-MM-DD for a moment, in India time. */
export function istDay(d: Date | string = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
  return parts; // en-CA gives YYYY-MM-DD
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Start of an IST day as an ISO timestamp (UTC). */
export function istDayStart(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00+05:30`) : new Date(d);
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...opts }).format(date);
}

export function fmtTime(d: string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

export function fmtLong(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function relTime(d: string | null | undefined) {
  if (!d) return "never";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(d);
}
