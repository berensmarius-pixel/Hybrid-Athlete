/**
 * SSE-Parser + Step-Akkumulator für die Gemini Interactions API (stream:true).
 *
 * Event-Fluss (Google-Doku): interaction.created → step.start → step.delta*
 * → step.stop → … → interaction.completed. Der Akkumulator baut aus den
 * Deltas dieselbe `steps`-Struktur, die die Non-Streaming-Antwort liefert –
 * parseInteractionSteps() bleibt damit unverändert nutzbar.
 *
 * Rein synchron, kein fetch/React → isoliert unit-testbar.
 */

export interface SseEvent {
  event: string | null;
  data: string;
}

/**
 * Parst einen SSE-Puffer in vollständige Events. Unvollständige Trailing-
 * Daten werden als `rest` zurückgegeben (im nächsten Chunk vorne anstellen).
 */
export function parseSseChunk(buffer: string): {
  events: SseEvent[];
  rest: string;
} {
  const events: SseEvent[] = [];
  let rest = buffer;

  for (;;) {
    const sepIndex = findEventSeparator(rest);
    if (sepIndex === -1) break;

    const rawEvent = rest.slice(0, sepIndex.index);
    rest = rest.slice(sepIndex.index + sepIndex.length);
    const parsed = parseSingleEvent(rawEvent);
    if (parsed) events.push(parsed);
  }

  return { events, rest };
}

function findEventSeparator(buf: string): { index: number; length: number } | -1 {
  const lf = buf.indexOf("\n\n");
  const crlf = buf.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) return -1;
  if (lf === -1) return { index: crlf, length: 4 };
  if (crlf === -1) return { index: lf, length: 2 };
  return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
}

function parseSingleEvent(raw: string): SseEvent | null {
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(":")) continue; // SSE-Kommentar
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (event === null && dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

interface OpenStep {
  type: string;
  name?: string;
  textParts: string[];
  argsJson: string;
}

interface StreamDelta {
  type?: unknown;
  text?: unknown;
  arguments_delta?: unknown;
  argumentsDelta?: unknown;
}

interface StreamStepStart {
  type?: unknown;
  name?: unknown;
  index?: unknown;
}

export interface StreamCallbacks {
  /** Inkrementeller Ausgabe-Text (für Live-Rendering). */
  onText?: (delta: string) => void;
  /** Thinking-Summary-Delta (optional für „denkt nach…"-Indikator). */
  onThought?: (delta: string) => void;
}

/**
 * Akkumuliert Interactions-Streaming-Events zu einer `steps`-Struktur,
 * die kompatibel zu parseInteractionSteps() ist.
 */
export class InteractionStreamAccumulator {
  private readonly steps: Record<string, unknown>[] = [];
  private open: OpenStep | null = null;
  private interactionIdValue: string | null = null;
  private readonly callbacks: StreamCallbacks;

  constructor(callbacks: StreamCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get interactionId(): string | null {
    return this.interactionIdValue;
  }

  /** Verarbeitet ein einzelnes SSE-Event (event-Name + JSON-Data). */
  handleEvent(eventName: string | null, jsonData: unknown): void {
    if (!jsonData || typeof jsonData !== "object") return;
    const data = jsonData as Record<string, unknown>;
    // Google sendet den Typ zusätzlich im Data-Objekt ("event_type") –
    // explizit übergebener Name hat Vorrang.
    const type =
      eventName ??
      (typeof data.event_type === "string" ? (data.event_type as string) : null);
    if (!type) return;

    switch (type) {
      case "interaction.created": {
        const interaction = data.interaction as Record<string, unknown> | undefined;
        if (interaction && typeof interaction.id === "string") {
          this.interactionIdValue = interaction.id;
        }
        break;
      }
      case "step.start":
        this.handleStepStart(data.step as StreamStepStart | undefined);
        break;
      case "step.delta":
        this.handleStepDelta(data.delta as StreamDelta | undefined);
        break;
      case "step.stop":
        this.closeStep();
        break;
      case "interaction.completed":
        this.closeStep();
        break;
      default:
        break; // unbekannte Events still überspringen (zukunftssicher)
    }
  }

  private handleStepStart(step: StreamStepStart | undefined): void {
    this.closeStep(); // falls ein stop-Event fehlt
    if (!step || typeof step.type !== "string") return;
    this.open = {
      type: step.type,
      name: typeof step.name === "string" ? step.name : undefined,
      textParts: [],
      argsJson: "",
    };
  }

  private handleStepDelta(delta: StreamDelta | undefined): void {
    if (!this.open || !delta) return;

    switch (delta.type) {
      case "text": {
        if (typeof delta.text === "string" && delta.text.length > 0) {
          this.open.textParts.push(delta.text);
          this.callbacks.onText?.(delta.text);
        }
        break;
      }
      case "thought_summary": {
        const text =
          typeof delta.text === "string"
            ? delta.text
            : extractThoughtText(delta);
        if (text) this.callbacks.onThought?.(text);
        break;
      }
      case "arguments_delta": {
        const raw = delta.arguments_delta ?? delta.argumentsDelta;
        if (typeof raw === "string") this.open.argsJson += raw;
        break;
      }
      default:
        break; // thought_signature u. a. → ignorieren
    }
  }

  private closeStep(): void {
    const open = this.open;
    this.open = null;
    if (!open) return;
    if (open.type === "model_output") {
      if (open.textParts.length === 0) return; // leere Steps überspringen
      this.steps.push({
        type: "model_output",
        content: [{ text: open.textParts.join("") }],
      });
    } else if (open.type === "function_call") {
      if (!open.name) return;
      let args: Record<string, unknown> = {};
      if (open.argsJson.trim()) {
        try {
          const parsed: unknown = JSON.parse(open.argsJson);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          args = {}; // defektes Argument-JSON → leerer Call, wird im Dispatch übersprungen
        }
      }
      this.steps.push({ type: "function_call", name: open.name, arguments: args });
    }
    // Andere Step-Typen (thought, server-side tools) sind für den Coach
    // irrelevant → bewusst nicht in die Result-Steps aufnehmen.
  }

  /** Finale Steps (kompatibel zur Non-Streaming-Response). */
  buildResult(): { steps: Record<string, unknown>[] } {
    this.closeStep();
    return { steps: this.steps };
  }
}

function extractThoughtText(delta: object): string | null {
  const content = (delta as Record<string, unknown>).content as
    | Record<string, unknown>
    | undefined;
  if (content && typeof content.text === "string") return content.text;
  return null;
}
