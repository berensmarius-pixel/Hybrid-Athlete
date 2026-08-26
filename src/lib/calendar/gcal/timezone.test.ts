import { describe, expect, it } from "vitest";
import {
  addMinutesToTime,
  berlinWeekdayIndex,
  timeDiffMinutes,
  upcomingBerlinDates,
  zonedDateString,
  zonedTimeString,
  zonedToUtcMs,
} from "./timezone";

describe("zonedToUtcMs (Europe/Berlin)", () => {
  it("löst Sommerzeit korrekt auf (CEST = UTC+2)", () => {
    const ms = zonedToUtcMs("2026-06-08", "12:00");
    expect(new Date(ms).toISOString()).toBe("2026-06-08T10:00:00.000Z");
  });

  it("löst Winterzeit korrekt auf (CET = UTC+1)", () => {
    const ms = zonedToUtcMs("2026-01-15", "12:00");
    expect(new Date(ms).toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("Roundtrip über Wand-Zeit ist stabil (inkl. DST-Wechseltag)", () => {
    for (const date of ["2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25"]) {
      const ms = zonedToUtcMs(date, "12:00");
      expect(zonedDateString(ms)).toBe(date);
      expect(zonedTimeString(ms)).toBe("12:00");
    }
  });
});

describe("berlinWeekdayIndex", () => {
  it("mappt Montag → 0 und Sonntag → 6", () => {
    expect(berlinWeekdayIndex("2026-06-08")).toBe(0); // Montag
    expect(berlinWeekdayIndex("2026-06-13")).toBe(5); // Samstag
    expect(berlinWeekdayIndex("2026-06-14")).toBe(6); // Sonntag
  });
});

describe("upcomingBerlinDates", () => {
  it("listet `days` aufeinanderfolgende Tage inkl. Starttag", () => {
    const from = zonedToUtcMs("2026-06-05", "09:00"); // Freitag
    const dates = upcomingBerlinDates(from, 4);
    expect(dates).toEqual(["2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08"]);
  });

  it("bleibt auch über Monatsgrenzen korrekt", () => {
    const from = zonedToUtcMs("2026-05-30", "23:00");
    const dates = upcomingBerlinDates(from, 3);
    expect(dates).toEqual(["2026-05-30", "2026-05-31", "2026-06-01"]);
  });
});

describe("addMinutesToTime / timeDiffMinutes", () => {
  it("addiert Minuten inkl. Stundenübertrag", () => {
    expect(addMinutesToTime("06:30", 90)).toBe("08:00");
    expect(addMinutesToTime("22:45", 20)).toBe("23:05");
  });

  it("klemmt an Tagesende", () => {
    expect(addMinutesToTime("23:50", 60)).toBe("23:59");
  });

  it("berechnet Differenzen", () => {
    expect(timeDiffMinutes("17:00", "06:30")).toBe(630);
    expect(timeDiffMinutes("06:30", "17:00")).toBe(-630);
  });
});
