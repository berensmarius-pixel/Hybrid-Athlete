import type { BusyBlockInput, FreeWindow, SchedulingPreferences } from "./types";
import { parseHhMm } from "./time";

interface NormalizedBusy {
  start: number;
  end: number;
}

export function sanitizeBusyEvents(raw: unknown): BusyBlockInput[] {
  if (!Array.isArray(raw)) return [];
  const result: BusyBlockInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const b = item as Partial<BusyBlockInput>;
    const dayIndex = Number(b.day_index);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) continue;
    const start = parseHhMm(String(b.start_time ?? ""));
    const end = parseHhMm(String(b.end_time ?? ""));
    if (start === null || end === null || end <= start) continue;
    result.push({
      id: typeof b.id === "string" ? b.id : undefined,
      title: typeof b.title === "string" ? b.title : undefined,
      day_index: dayIndex,
      start_time: String(b.start_time),
      end_time: String(b.end_time),
    });
  }
  return result;
}

function normalizeBusyBlocks(
  busyEvents: BusyBlockInput[]
): Map<number, NormalizedBusy[]> {
  const byDay = new Map<number, NormalizedBusy[]>();
  for (const event of busyEvents) {
    const start = parseHhMm(event.start_time);
    const end = parseHhMm(event.end_time);
    if (start === null || end === null || end <= start) continue;
    const list = byDay.get(event.day_index) ?? [];
    list.push({ start, end });
    byDay.set(event.day_index, list);
  }
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: NormalizedBusy[] = [];
    for (const block of list) {
      const last = merged[merged.length - 1];
      if (last && block.start <= last.end) {
        last.end = Math.max(last.end, block.end);
      } else {
        merged.push({ ...block });
      }
    }
    byDay.set(day, merged);
  }
  return byDay;
}

export function computeFreeWindows(
  busyEvents: BusyBlockInput[],
  prefs: SchedulingPreferences
): FreeWindow[] {
  const { startMin: dayStart, endMin: dayEnd } = prefs.day_window;
  const buffer = prefs.buffer_minutes;
  const busyByDay = normalizeBusyBlocks(busyEvents);
  const windows: FreeWindow[] = [];

  for (let day = 0; day < 7; day++) {
    const blocks = (busyByDay.get(day) ?? [])
      .map((b) => ({
        start: Math.max(dayStart, b.start - buffer),
        end: Math.min(dayEnd, b.end + buffer),
      }))
      .filter((b) => b.end > b.start);

    let cursor = dayStart;
    for (const block of blocks) {
      if (block.start > cursor) {
        windows.push({ dayIndex: day, startMin: cursor, endMin: block.start });
      }
      cursor = Math.max(cursor, block.end);
    }
    if (cursor < dayEnd) {
      windows.push({ dayIndex: day, startMin: cursor, endMin: dayEnd });
    }
  }

  return windows;
}

export function largestWindowLengthByDay(windows: FreeWindow[]): number[] {
  const lengths = new Array<number>(7).fill(0);
  for (const w of windows) {
    lengths[w.dayIndex] = Math.max(lengths[w.dayIndex], w.endMin - w.startMin);
  }
  return lengths;
}

export function dayIndexOfLargestWindow(lengths: number[]): number {
  let bestDay = 0;
  for (let day = 1; day < 7; day++) {
    if (lengths[day] > lengths[bestDay]) bestDay = day;
  }
  return bestDay;
}

export function findContainingWindow(
  windows: FreeWindow[],
  dayIndex: number,
  startMin: number,
  endMin: number
): FreeWindow | null {
  for (const w of windows) {
    if (w.dayIndex === dayIndex && w.startMin <= startMin && w.endMin >= endMin) {
      return w;
    }
  }
  return null;
}
