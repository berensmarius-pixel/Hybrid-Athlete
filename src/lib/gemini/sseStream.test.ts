import { describe, it, expect } from "vitest";
import { InteractionStreamAccumulator, parseSseChunk } from "@/lib/gemini/sseStream";
import { parseInteractionSteps } from "@/lib/gemini/coachTools";

describe("parseSseChunk", () => {
  it("trennt vollständige Events und behält Trailing-Reste", () => {
    const buffer =
      'event: step.delta\ndata: {"a":1}\n\nevent: step.delta\ndata: {"a":2}\n\nevent: step.del';
    const { events, rest } = parseSseChunk(buffer);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "step.delta", data: '{"a":1}' });
    expect(events[1]).toEqual({ event: "step.delta", data: '{"a":2}' });
    expect(rest).toBe("event: step.del");
  });

  it("unterstützt CRLF-Seperatoren", () => {
    const { events } = parseSseChunk('event: step.stop\r\ndata: {}\r\n\r\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("step.stop");
  });

  it("fasst mehrzeilige data:-Felder zusammen", () => {
    const { events } = parseSseChunk('event: x\ndata: {"a":\ndata: 1}\n\n');
    expect(events[0]?.data).toBe('{"a":\n1}');
  });

  it("ignoriert SSE-Kommentare", () => {
    const { events } = parseSseChunk(': keep-alive\n\nevent: ping\ndata: {}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("ping");
  });
});

function sse(events: Array<{ event: string; data: unknown }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
}

describe("InteractionStreamAccumulator", () => {
  it("akkumuliert Text-Deltas zu einem model_output-Step", () => {
    const acc = new InteractionStreamAccumulator();
    const chunks: string[] = [];
    const stream = sse([
      { event: "interaction.created", data: { interaction: { id: "abc" } } },
      { event: "step.start", data: { step: { type: "model_output", index: 0 } } },
      { event: "step.delta", data: { delta: { type: "text", text: "Hallo " } } },
      { event: "step.delta", data: { delta: { type: "text", text: "Welt" } } },
      { event: "step.stop", data: {} },
      { event: "interaction.completed", data: { interaction: { id: "abc" } } },
    ]);
    for (const evt of parseSseChunk(stream).events) {
      acc.handleEvent(evt.event, JSON.parse(evt.data));
    }
    const result = acc.buildResult();
    expect(acc.interactionId).toBe("abc");
    expect(result.steps).toEqual([
      { type: "model_output", content: [{ text: "Hallo Welt" }] },
    ]);
    void chunks;
  });

  it("akkumuliert arguments_delta zu einem geparsten function_call", () => {
    const acc = new InteractionStreamAccumulator();
    const stream = sse([
      { event: "step.start", data: { step: { type: "function_call", name: "save_memory" } } },
      { event: "step.delta", data: { delta: { type: "arguments_delta", arguments_delta: '{"facts":["' } } },
      { event: "step.delta", data: { delta: { type: "arguments_delta", arguments_delta: 'Test"]}' } } },
      { event: "step.stop", data: {} },
    ]);
    for (const evt of parseSseChunk(stream).events) {
      acc.handleEvent(evt.event, JSON.parse(evt.data));
    }
    const parsed = parseInteractionSteps(acc.buildResult());
    expect(parsed.toolCalls).toEqual([{ name: "save_memory", args: { facts: ["Test"] } }]);
    expect(parsed.text).toBe("");
  });

  it("onText-Callback erhält jedes Delta", () => {
    const deltas: string[] = [];
    const acc = new InteractionStreamAccumulator({ onText: (d) => deltas.push(d) });
    acc.handleEvent("step.start", { step: { type: "model_output" } });
    acc.handleEvent("step.delta", { delta: { type: "text", text: "a" } });
    acc.handleEvent("step.delta", { delta: { type: "text", text: "b" } });
    acc.handleEvent("step.stop", {});
    expect(deltas).toEqual(["a", "b"]);
  });

  it("ignoriert thought_signature und unbekannte Delta-Typen", () => {
    const acc = new InteractionStreamAccumulator();
    acc.handleEvent("step.start", { step: { type: "thought" } });
    acc.handleEvent("step.delta", { delta: { type: "thought_signature", text: "x" } });
    acc.handleEvent("step.stop", {});
    acc.handleEvent("step.start", { step: { type: "model_output" } });
    acc.handleEvent("step.delta", { delta: { type: "text", text: "ok" } });
    acc.handleEvent("step.stop", {});
    const result = acc.buildResult();
    expect(result.steps).toEqual([{ type: "model_output", content: [{ text: "ok" }] }]);
  });

  it("schließt offene Steps bei interaction.completed automatisch", () => {
    const acc = new InteractionStreamAccumulator();
    acc.handleEvent("step.start", { step: { type: "model_output" } });
    acc.handleEvent("step.delta", { delta: { type: "text", text: "ende" } });
    acc.handleEvent("interaction.completed", { interaction: {} });
    expect(acc.buildResult().steps).toEqual([
      { type: "model_output", content: [{ text: "ende" }] },
    ]);
  });

  it("Chunk-übergreifend: geteilter SSE-Frame über zwei Reads", () => {
    const full = sse([
      { event: "step.start", data: { step: { type: "model_output" } } },
      { event: "step.delta", data: { delta: { type: "text", text: "split" } } },
      { event: "step.stop", data: {} },
    ]);
    const cut = full.indexOf("data") + 8;
    const acc = new InteractionStreamAccumulator();

    let buffer = "";
    for (const part of [full.slice(0, cut), full.slice(cut)]) {
      buffer += part;
      const { events, rest } = parseSseChunk(buffer);
      buffer = rest;
      for (const evt of events) {
        acc.handleEvent(evt.event, JSON.parse(evt.data));
      }
    }
    expect(acc.buildResult().steps).toEqual([
      { type: "model_output", content: [{ text: "split" }] },
    ]);
  });

  it("parseIntegration mit accumulator-Output funktioniert", () => {
    const acc = new InteractionStreamAccumulator();
    acc.handleEvent("step.start", { step: { type: "model_output", index: 0 } });
    acc.handleEvent("step.delta", { delta: { type: "text", text: "Hallo " } });
    acc.handleEvent("step.delta", { delta: { type: "text", text: "Welt" } });
    acc.handleEvent("step.stop", {});
    acc.handleEvent("step.start", { step: { type: "function_call", name: "save_memory" } });
    acc.handleEvent("step.delta", { delta: { type: "arguments_delta", arguments_delta: '{"facts":["Test"]}' } });
    acc.handleEvent("step.stop", {});
    const parsed = parseInteractionSteps(acc.buildResult());
    expect(parsed.text).toBe("Hallo Welt");
    expect(parsed.toolCalls).toEqual([{ name: "save_memory", args: { facts: ["Test"] } }]);
  });
});
