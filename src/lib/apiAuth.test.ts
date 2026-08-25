import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "@/lib/apiAuth";

describe("constantTimeEqual", () => {
  it("gleiche Strings → true", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  it("unterschiedliche Inhalte gleicher Länge → false", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("000000", "ffffff")).toBe(false);
  });

  it("unterschiedliche Längen → false (Early-Exit)", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
