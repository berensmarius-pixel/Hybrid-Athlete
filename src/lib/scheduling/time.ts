export const DAY_SHORT_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const DAY_FULL_NAMES = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export function dayShortName(dayIndex: number): string {
  return DAY_SHORT_NAMES[((dayIndex % 7) + 7) % 7];
}

export function dayFullName(dayIndex: number): string {
  return DAY_FULL_NAMES[((dayIndex % 7) + 7) % 7];
}

export function parseHhMm(value: string): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h === 24 && m === 0) return 1440;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function formatMinutes(total: number): string {
  const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function ceilToGrid(value: number, grid: number): number {
  if (grid <= 1) return Math.ceil(value);
  return Math.ceil(value / grid) * grid;
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function isoAddDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const y = utc.getUTCFullYear();
  const mo = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function currentMondayIso(now: Date = new Date()): string {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - offset);
  const y = local.getFullYear();
  const mo = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function weekdayIndexFromIso(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(utc.getTime())) return null;
  return (utc.getUTCDay() + 6) % 7;
}
