import { NextRequest, NextResponse } from "next/server";
import { resolveGeminiKeysServer } from "@/lib/server/geminiKey";
import {
  classifyUpstreamFailure,
  getModelChain,
  logFailover,
  sanitizeGenerationPayload,
} from "@/lib/ai/model-router";

/**
 * POST/GET /api/gemini/[...path]
 *
 * Auth-gated Proxy zum Gemini-API mit zentralem AI-Router:
 * - Der API-Key wird serverseitig aufgelöst (app_state
 *   `hybrid_athlete_gemini_key`, Fallback: Env GEMINI_API_KEY +
 *   optional GEMINI_BACKUP_API_KEY) und gelangt nie in den Browser.
 * - Bei 429 (Quota), 503 (Unavailable) und 404 (Modell nicht gefunden)
 *   wird das Payload ohne Verzögerung automatisch an das nächste Modell
 *   der Prioritäts-Kette (src/lib/ai/model-router.ts) und/oder den nächsten
 *   konfigurierten Key weitergereicht.
 * - Gemini-3.x-Parameter-Audit: veraltete Sampling-Parameter werden für
 *   3.6+/3.7-Endpunkte automatisch aus dem Payload entfernt.
 *
 * Beispiel: POST /api/gemini/v1beta/interactions
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

/** Endpunkte, für die die Modell-Kette angewendet wird. */
const GENERATIVE_ACTIONS = new Set(["generatecontent", "streamgeneratecontent"]);

type ParsedTarget = {
  /** Modell steht in der URL (`models/<modell>:<aktion>`). */
  kind: "url-model";
  model: string;
  action: string;
} | {
  /** Modell steht im Body (Interactions API). */
  kind: "body-model";
} | {
  /** Kein Modell im Spiel (Uploads, Datei-Downloads, …). */
  kind: "passthrough";
};

function parseTarget(segments: string[]): ParsedTarget {
  if (segments.length >= 2 && segments[1] === "interactions") {
    return { kind: "body-model" };
  }
  if (segments.length >= 3 && segments[1] === "models" && segments[2]) {
    const sep = segments[2].lastIndexOf(":");
    if (sep > 0) {
      const model = segments[2].slice(0, sep);
      const action = segments[2].slice(sep + 1);
      if (GENERATIVE_ACTIONS.has(action.toLowerCase())) {
        return { kind: "url-model", model, action };
      }
    }
  }
  return { kind: "passthrough" };
}

function validateSegments(
  segments: unknown
): segments is string[] {
  return (
    Array.isArray(segments) &&
    segments.length >= 1 &&
    ["v1", "v1beta"].includes(segments[0]) &&
    !segments.some((s) => s.includes(".."))
  );
}

function buildUrl(segments: string[], modelId?: string, action?: string): string {
  const rewritten = [...segments];
  if (modelId && action) rewritten[2] = `${modelId}:${action}`;
  return `${GEMINI_BASE}/${rewritten.join("/")}`;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/gemini/[...path]">
) {
  const { path: segments } = await ctx.params;

  if (!validateSegments(segments)) {
    return NextResponse.json(
      { error: { message: "Ungültiger Gemini-Pfad." } },
      { status: 400 }
    );
  }

  const keys = await resolveGeminiKeysServer();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: { message: "Kein Gemini API-Key konfiguriert.", status: "NO_KEY" } },
      { status: 400 }
    );
  }

  const target = parseTarget(segments);

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json(
      { error: { message: "Gemini-Anfrage fehlgeschlagen." } },
      { status: 400 }
    );
  }

  // Body einmal parsen (falls JSON) – für Modell-Rewrite + Parameter-Audit.
  let jsonBody: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = rawBody ? JSON.parse(rawBody) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      jsonBody = parsed as Record<string, unknown>;
    }
  } catch { /* kein JSON → unverändert durchreichen */ }

  const urlModel =
    target.kind === "url-model" ? target.model : undefined;
  const bodyModel =
    target.kind === "body-model" && typeof jsonBody?.model === "string"
      ? jsonBody.model
      : undefined;

  const requestedModel = urlModel ?? bodyModel;
  const applyModelChain = target.kind !== "passthrough";
  const chain = applyModelChain
    ? getModelChain(requestedModel)
    : [requestedModel ?? ""];

  let lastStatus = 502;
  let lastText = JSON.stringify({ error: { message: "Gemini-Anfrage fehlgeschlagen." } });
  let lastContentType = "application/json";

  for (let m = 0; m < chain.length; m++) {
    const modelId = chain[m];

    // Ziel-URL (URL-Modell ggf. umschreiben) und Body aufbauen.
    const url =
      target.kind === "url-model"
        ? buildUrl(segments, modelId, target.action)
        : buildUrl(segments);
    let bodyText = rawBody;
    if (jsonBody) {
      if (target.kind === "body-model" && modelId) jsonBody.model = modelId;
      bodyText = JSON.stringify(sanitizeGenerationPayload(modelId || "", jsonBody));
    }

    for (let k = 0; k < keys.length; k++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": keys[k],
          },
          body: bodyText,
          signal: req.signal,
        });
      } catch (err) {
        console.error("[AI Router] network error on", modelId || segments.join("/"), err);
        continue; // Netzwerkfehler → nächster Versuch (Key/Modell)
      }

      // Streaming-Requests: erfolgreiche SSE-Responses werden 1:1
      // durchgereicht (kein Buffering). Failover ist zu diesem Zeitpunkt
      // bereits abgeschlossen – Fehler-Responses sind kein Stream und
      // durchlaufen unten die normale Klassifikation.
      const wantsStream = jsonBody?.stream === true;
      if (wantsStream && res.ok && res.body) {
        return new NextResponse(res.body, {
          status: res.status,
          headers: {
            "Content-Type": res.headers.get("Content-Type") ?? "text/event-stream",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
            ...(applyModelChain && modelId ? { "x-ai-router-model": modelId } : {}),
          },
        });
      }

      const text = await res.text();

      if (res.ok) {
        return new NextResponse(text, {
          status: res.status,
          headers: {
            "Content-Type": res.headers.get("Content-Type") ?? "application/json",
            "Cache-Control": "no-store",
            ...(applyModelChain && modelId ? { "x-ai-router-model": modelId } : {}),
          },
        });
      }

      lastStatus = res.status;
      lastText = text;
      lastContentType = res.headers.get("Content-Type") ?? "application/json";

      let apiStatus: string | null = null;
      let apiMessage: string | null = null;
      try {
        const errJson = JSON.parse(text) as {
          error?: { status?: string; message?: string };
        };
        apiStatus = errJson.error?.status ?? null;
        apiMessage = errJson.error?.message ?? null;
      } catch { /* nicht-JSON-Fehler */ }

      const cls = classifyUpstreamFailure({
        status: res.status,
        apiStatus,
        message: apiMessage,
      });
      if (!cls.retryNext) {
        // Harte Fehler (400/401/403/…) sofort durchreichen – kein Failover.
        return new NextResponse(text, {
          status: res.status,
          headers: { "Content-Type": lastContentType, "Cache-Control": "no-store" },
        });
      }

      // Nächster Key desselben Modells (stilles Rotieren), sonst nächstes Modell.
      if (k < keys.length - 1) continue;
      const nextModel = chain[m + 1];
      if (nextModel) logFailover(modelId || "(unbekannt)", nextModel, cls.kind);
    }
  }

  return new NextResponse(lastText, {
    status: lastStatus,
    headers: { "Content-Type": lastContentType, "Cache-Control": "no-store" },
  });
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/gemini/[...path]">
) {
  const { path: segments } = await ctx.params;

  if (!validateSegments(segments)) {
    return NextResponse.json(
      { error: { message: "Ungültiger Gemini-Pfad." } },
      { status: 400 }
    );
  }

  const keys = await resolveGeminiKeysServer();
  if (keys.length === 0) {
    return NextResponse.json(
      { error: { message: "Kein Gemini API-Key konfiguriert.", status: "NO_KEY" } },
      { status: 400 }
    );
  }

  const url = buildUrl(segments);
  let lastStatus = 502;
  let lastText = JSON.stringify({ error: { message: "Gemini-Anfrage fehlgeschlagen." } });
  let lastContentType = "application/json";

  for (let k = 0; k < keys.length; k++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: { "x-goog-api-key": keys[k] },
      });
    } catch (err) {
      console.error("[api/gemini proxy GET] failed:", err);
      continue;
    }

    const text = await res.text();

    if (res.ok) {
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("Content-Type") ?? "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    lastStatus = res.status;
    lastText = text;
    lastContentType = res.headers.get("Content-Type") ?? "application/json";

    let apiStatus: string | null = null;
    try {
      const errJson = JSON.parse(text) as { error?: { status?: string } };
      apiStatus = errJson.error?.status ?? null;
    } catch { /* nicht-JSON-Fehler */ }

    const cls = classifyUpstreamFailure({ status: res.status, apiStatus });
    if (!cls.retryNext) break;
  }

  return new NextResponse(lastText, {
    status: lastStatus,
    headers: { "Content-Type": lastContentType, "Cache-Control": "no-store" },
  });
}
