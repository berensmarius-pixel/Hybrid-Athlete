import type { KnowledgeUnit } from "@/types/knowledge";
import { sanitizeGenerationPayload } from "@/lib/ai/model-router";

/**
 * PDF-Ingestion über die Gemini File API:
 *
 *  1. PDF wird per Resumable-Upload zu files hochgeladen (File API).
 *  2. `generateContent` mit file_data + JSON-Schema-Enforcement extrahiert
 *     semantische Wissenseinheiten (Prinzip, Befunde, Guidelines, Zitation).
 *  3. sanitizeUnits() validiert die Modellantwort serverseitig nach.
 *
 * Kein PDF-Parsing im Node-Prozess nötig – Gemini liest das PDF nativ.
 */

// Konkrete IDs aus der zentralen Router-Kette (vgl. src/lib/ai/model-router.ts).
const EXTRACT_MODELS = ["gemini-3.7-flash", "gemini-3.5-flash"] as const;

/** OpenAPI-Subset (Gemini responseSchema) für die Extraktion. */
export const KNOWLEDGE_EXTRACTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    units: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          principle: { type: "STRING" },
          summary: { type: "STRING" },
          key_findings: { type: "ARRAY", items: { type: "STRING" } },
          practical_guidelines: { type: "ARRAY", items: { type: "STRING" } },
          citation: {
            type: "OBJECT",
            properties: {
              authors: { type: "STRING" },
              year: { type: "INTEGER" },
              title: { type: "STRING" },
              journal: { type: "STRING" },
              doi: { type: "STRING" },
            },
            required: ["authors", "title"],
          },
          topics: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "summary", "key_findings", "citation"],
      },
    },
  },
  required: ["units"],
} as const;

const GEMINI_BASE = "https://generativelanguage.googleapis.com";

function buildExtractionPrompt(documentName: string): string {
  return [
    `Du bist ein Sportwissenschaftler und annotierst das Dokument "${documentName}" (Fachpaper/Studie zum Training, zur Erholung oder zur Sporternährung).`,
    "",
    "Extrahiere die KERNPRINZIPIEN als eigenständige Wissenseinheiten (typisch 4-12, maximal 16):",
    "- Jede Einheit muss in sich verständlich sein (ohne Kontext des Papers).",
    '- "summary": ausführliche Zusammenfassung auf DEUTSCH (80-150 Wörter), Fachbegriffe dürfen englisch bleiben.',
    '- "key_findings": 3-6 konkrete, belegte Befunde (mit Kennzahlen, sofern im Paper vorhanden).',
    '- "practical_guidelines": 2-5 umsetzbare Richtlinien für Hybrid-Athleten (Kraft + Ausdauer).',
    '- "citation": exakte Autoren ("Nachname, Initiale." getrennt mit Semikolon), Jahr, Originaltitel des Papers (Englisch belassen), Zeitschrift; DOI nur wenn im Dokument sichtbar.',
    '- "topics": 3-6 englische Suchbegriffe (z.B. "concurrent training", "interference effect").',
    "",
    "Erfinde NIEMALS Inhalte, Zahlen oder DOIs, die nicht im Dokument stehen. Lasse Felder leer (bzw. weglassen), wenn keine belastbare Information vorliegt.",
  ].join("\n");
}

interface UploadedFileInfo {
  uri: string;
  name: string;
}

/** Schritt 1+2: Resumable Upload eines PDFs zur Gemini File API. */
async function uploadPdf(
  apiKey: string,
  bytes: Uint8Array,
  displayName: string
): Promise<UploadedFileInfo> {
  const initRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

  if (!initRes.ok) {
    throw new Error(`File-API-Upload-Init fehlgeschlagen (${initRes.status}).`);
  }

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("File-API: kein Upload-URL erhalten.");

  const finalizeRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes as unknown as BodyInit,
  });

  if (!finalizeRes.ok) {
    throw new Error(`File-API-Upload fehlgeschlagen (${finalizeRes.status}).`);
  }

  const json = (await finalizeRes.json().catch(() => null)) as {
    file?: { uri?: string; name?: string; state?: string };
  } | null;

  if (!json?.file?.uri || !json.file.name) {
    throw new Error("File-API: unvollständige Antwort nach dem Upload.");
  }
  return { uri: json.file.uri, name: json.file.name };
}

/** Wartet bis die Datei ACTIVE ist (Polling, max. ~20s). */
async function waitForFileActive(
  apiKey: string,
  fileName: string
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/v1beta/${fileName}`, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`File-API-Statusabfrage fehlgeschlagen (${res.status}).`);
    const json = (await res.json().catch(() => null)) as { state?: string } | null;
    if (json?.state === "ACTIVE") return;
    if (json?.state === "FAILED") throw new Error("File-API: Verarbeitung des PDFs fehlgeschlagen.");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("File-API: Zeitüberschreitung beim Verarbeiten des PDFs.");
}

interface ExtractResult {
  units: KnowledgeUnit[];
  usedModel: string;
}

/** Schritt 3: Schema-behaftete Extraktion der Wissenseinheiten aus dem PDF. */
export async function extractKnowledgeUnitsFromPdf(
  pdfBytes: Uint8Array,
  documentName: string,
  apiKey: string
): Promise<ExtractResult> {
  const uploaded = await uploadPdf(apiKey, pdfBytes, documentName);
  await waitForFileActive(apiKey, uploaded.name);

  let lastError: Error = new Error("Extraktion fehlgeschlagen.");

  for (const model of EXTRACT_MODELS) {
    try {
      // Gemini-3.x-Parameter-Audit: Sampling-Parameter fallen auf
      // 3.6+/3.7-Endpunkten automatisch aus dem Payload.
      const payload = sanitizeGenerationPayload(model, {
        contents: [
          {
            role: "user",
            parts: [
              { file_data: { file_uri: uploaded.uri, mime_type: "application/pdf" } },
              { text: buildExtractionPrompt(documentName) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
          responseSchema: KNOWLEDGE_EXTRACTION_SCHEMA,
        },
      });

      const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        lastError = new Error(json?.error?.message ?? `Gemini-Fehler ${res.status}`);
        continue; // Quota/503 → nächstes Modell
      }

      const text =
        json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) {
        lastError = new Error("Leere Antwort vom Extraktionsmodell.");
        continue;
      }

      const parsed: unknown = JSON.parse(text);
      const units = sanitizeUnits(parsed);
      if (units.length === 0) {
        lastError = new Error("Keine verwertbaren Wissenseinheiten extrahiert.");
        continue;
      }
      return { units, usedModel: model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError;
}

// ─── Validierung / Hydratation ────────────────────────────────────────────────

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 4000) : "";
}

function asTrimmedList(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asTrimmedString(item))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

/**
 * Validiert die rohe Modellantwort (JSON) zu KnowledgeUnits:
 * entfernt leere/ungültige Einheiten, klemmt Listenlängen, erzwingt Topics.
 * Rein synchron & testbar ohne Netzwerk.
 */
export function sanitizeUnits(raw: unknown): KnowledgeUnit[] {
  const container = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawUnits = Array.isArray(container.units) ? container.units.slice(0, 24) : [];

  const units: KnowledgeUnit[] = [];
  const seenTitles = new Set<string>();

  for (const item of rawUnits) {
    if (!item || typeof item !== "object") continue;
    const u = item as Record<string, unknown>;

    const title = asTrimmedString(u.title);
    const summary = asTrimmedString(u.summary);
    if (title.length < 3 || summary.length < 30) continue;

    const dedupeKey = title.toLowerCase();
    if (seenTitles.has(dedupeKey)) continue;
    seenTitles.add(dedupeKey);

    const citationRaw =
      u.citation && typeof u.citation === "object"
        ? (u.citation as Record<string, unknown>)
        : {};
    const yearNum = Number(citationRaw.year);

    units.push({
      title: title.slice(0, 200),
      principle: asTrimmedString(u.principle) || undefined,
      summary,
      keyFindings: asTrimmedList(u.key_findings),
      practicalGuidelines: asTrimmedList(u.practical_guidelines),
      citation: {
        authors: asTrimmedString(citationRaw.authors) || "Unbekannte Autoren",
        year: Number.isInteger(yearNum) && yearNum > 1900 && yearNum <= 2100 ? yearNum : undefined,
        title: asTrimmedString(citationRaw.title) || title,
        journal: asTrimmedString(citationRaw.journal) || undefined,
        doi: asTrimmedString(citationRaw.doi) || undefined,
      },
      topics: asTrimmedList(u.topics, 10).map((t) => t.toLowerCase()),
    });
  }

  return units;
}
