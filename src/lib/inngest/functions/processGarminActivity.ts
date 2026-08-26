// ─── Background-Pipeline: process-garmin-activity ────────────────────────────

import { NonRetriableError } from "inngest";
import { runGarminJson } from "@/lib/garmin/garminCli";
import {
  parseFit,
  type FitParseResult,
  type FitRecordSample,
} from "@/lib/fit/fitDecoder";
import {
  computePowerMetrics,
  PDC_DURATIONS_SECONDS,
  peakPowersForDurations,
  type PowerMetrics,
} from "@/lib/training/powerMetrics";
import { computeBanisterSeries } from "@/lib/training/banisterModel";
import {
  loadDailyTss,
  mergePeaksIntoPdc,
  recordActivityTss,
  saveActivityDebrief,
  saveFitnessSnapshot,
  type ActivityDebrief,
} from "@/lib/server/trainingState";
import { generateActivityDebrief } from "@/lib/server/debriefGenerator";
import { reconcileCalendarEvent } from "@/lib/calendar/calendarReconciliation";
import { inngest, GARMIN_ACTIVITY_RECEIVED } from "@/lib/inngest/client";

const DEFAULT_FTP_WATTS = 260;

interface CompactRecord {
  t: number;
  p: number | null;
  hr: number | null;
  cad: number | null;
  spd: number | null;
  alt: number | null;
}

interface DecodedActivity {
  records: CompactRecord[];
  intervalSeconds: number;
  session: FitParseResult["sessions"][number] | null;
  startTimeISO: string;
  byteCount: number;
}

function compactRecords(records: FitRecordSample[]): CompactRecord[] {
  return records.map((r) => ({
    t: r.timestamp,
    p: r.power,
    hr: r.heartRate,
    cad: r.cadence,
    spd: r.speed !== null ? Math.round(r.speed * 100) / 100 : null,
    alt: r.altitude !== null ? Math.round(r.altitude * 10) / 10 : null,
  }));
}

function inferIntervalSeconds(records: FitRecordSample[]): number {
  if (records.length < 2) return 1;
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(records.length, 60); i++) {
    const gap = records[i].timestamp - records[i - 1].timestamp;
    if (gap > 0 && gap <= 10) gaps.push(gap);
  }
  if (gaps.length === 0) return 1;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.max(1, Math.min(5, median));
}

function extractPowerSeries(records: CompactRecord[]): Array<number | null> {
  return records.map((r) => r.p);
}

export const processGarminActivity = inngest.createFunction(
  {
    id: "process-garmin-activity",
    retries: 2,
    concurrency: { limit: 2 },
    // inngest ≥4: Trigger wandern in die Options (statt drittes Argument)
    triggers: [{ event: GARMIN_ACTIVITY_RECEIVED }],
  },
  async ({ event, step }) => {
    const { garminId, name, type } = event.data;

    // ── Schritt 1: FIT-Download & Binär-Decoding ────────────────────────────
    const decoded = await step.run("download-and-decode-fit", async () => {
      const raw = await runGarminJson(
        ["download_fit", "--activity-id", garminId],
        { timeoutMs: 120_000 }
      );
      const result = raw as {
        success?: boolean;
        error?: string;
        sizeBytes?: number;
        dataBase64?: string;
      };
      if (!result.success || !result.dataBase64) {
        throw new NonRetriableError(
          result.error ?? `FIT-Download fehlgeschlagen für ${garminId}`
        );
      }

      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(Buffer.from(result.dataBase64, "base64"));
      } catch {
        throw new NonRetriableError("Ungültige Base64-Daten vom Garmin-CLI.");
      }

      let parsed: FitParseResult;
      try {
        parsed = parseFit(bytes);
      } catch (err) {
        throw new NonRetriableError(
          err instanceof Error ? err.message : "FIT-Decoding fehlgeschlagen"
        );
      }

      if (parsed.records.length === 0) {
        throw new NonRetriableError("FIT enthält keine Record-Messages.");
      }

      return {
        records: compactRecords(parsed.records),
        intervalSeconds: inferIntervalSeconds(parsed.records),
        session: parsed.sessions[parsed.sessions.length - 1] ?? null,
        startTimeISO:
          event.data.startTime ??
          (parsed.timeCreated
            ? new Date(parsed.timeCreated * 1000).toISOString()
            : new Date(parsed.records[0].timestamp * 1000).toISOString()),
        byteCount: result.sizeBytes ?? bytes.byteLength,
      } satisfies DecodedActivity;
    });

    const dateISO = decoded.startTimeISO.slice(0, 10);

    // ── Schritt 2: Power Metrics & Peak-Power-Curve Engine ──────────────────
    const metricsResult: PowerMetrics = await step.run("compute-power-metrics", async () => {
      const powerSeries = extractPowerSeries(decoded.records);

      const hasPower = powerSeries.some((w) => w !== null && w > 0);
      if (!hasPower) {
        throw new NonRetriableError(
          "Keine Leistungswerte im FIT – TSS/NP/PDC nur mit Power-Meter berechenbar."
        );
      }

      return computePowerMetrics({
        power: powerSeries,
        intervalSeconds: decoded.intervalSeconds,
        ftpWatts: event.data.ftpWatts ?? DEFAULT_FTP_WATTS,
      });
    });

    const fullCurve = await step.run("update-power-duration-curve", async () => {
      const peaks = peakPowersForDurations(
        decoded.records.map((r) => r.p),
        decoded.intervalSeconds,
        PDC_DURATIONS_SECONDS
      );
      return mergePeaksIntoPdc(garminId, dateISO, peaks);
    });

    await step.run("record-daily-tss", async () => {
      await recordActivityTss(
        dateISO,
        metricsResult.trainingStressScore ?? 0,
        garminId
      );
      return { tss: metricsResult.trainingStressScore ?? 0, date: dateISO };
    });

    // ── Schritt 3: Banister-Modell & Fatigue-Update ─────────────────────────
    const fatigue = await step.run("update-banister-fatigue", async () => {
      const dailyTss = await loadDailyTss();
      const snapshot = computeBanisterSeries(dailyTss, new Date().toISOString().slice(0, 10));
      await saveFitnessSnapshot(snapshot);
      return { ctl: snapshot.ctl, atl: snapshot.atl, tsb: snapshot.tsb };
    });

    // ── Schritt 4a: AI Coach Debrief (überspringbar, siehe skipDebrief) ─────
    const debrief: ActivityDebrief = {
      garminId,
      activityName: name ?? "Garmin Aktivität",
      date: dateISO,
      generatedAt: new Date().toISOString(),
      source: "fallback",
      markdown: "",
    };

    if (!event.data.skipDebrief) {
      const generated: ActivityDebrief = await step.run("generate-ai-debrief", async () => {
        const { markdown, source } = await generateActivityDebrief({
          activityName: name ?? decoded.session?.sport ?? "Garmin Aktivität",
          activityType: type ?? decoded.session?.sport ?? "other",
          date: dateISO,
          durationSeconds:
            decoded.session?.totalTimerTimeSeconds ??
            decoded.records.length * decoded.intervalSeconds,
          distanceMeters: decoded.session?.totalDistanceMeters ?? null,
          avgHeartRate: decoded.session?.avgHeartRate ?? null,
          metrics: metricsResult,
          fatigue,
        });

        const debriefResult: ActivityDebrief = {
          garminId,
          activityName: name ?? "Garmin Aktivität",
          date: dateISO,
          generatedAt: new Date().toISOString(),
          source,
          markdown,
        };
        await saveActivityDebrief(debriefResult);
        return debriefResult;
      });
      Object.assign(debrief, generated);
    }

    // ── Schritt 4b: Calendar Reconciliation ────────────────────────────────
    const reconciliation = await step.run(
      "reconcile-calendar-event",
      async () => {
        try {
          return await reconcileCalendarEvent({
            dateISO,
            activityName: debrief.activityName,
            activityType: type,
            metrics: metricsResult,
            durationSeconds: decoded.session?.totalTimerTimeSeconds ?? decoded.records.length * decoded.intervalSeconds,
            debriefMarkdown: debrief.markdown,
          });
        } catch (err) {
          return {
            mode: "mirror" as const,
            matchedEvents: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    );

    return {
      garminId,
      date: dateISO,
      samples: decoded.records.length,
      byteCount: decoded.byteCount,
      metrics: {
        avgPowerWatts: metricsResult.avgPowerWatts,
        normalizedPower: metricsResult.normalizedPower,
        intensityFactor: metricsResult.intensityFactor,
        trainingStressScore: metricsResult.trainingStressScore,
        peakPowers: Object.fromEntries(
          metricsResult.peakPowers.map((p) => [`${p.durationSeconds}s`, p.watts])
        ),
      },
      curveDurations: Object.keys(fullCurve.entries).length,
      fatigue,
      debriefSource: debrief.source,
      calendar: reconciliation,
    };
  }
);
