import { describe, expect, it } from "vitest";
import { deduplicateCandidates, normalizeSourceUrl } from "./normalize";
import type { SearchCandidate } from "./types";

describe("normalizeSourceUrl", () => {
  it("removes tracking parameters and fragments", () => {
    expect(
      normalizeSourceUrl(
        "https://Example.com/photo/?utm_source=test&id=3#comments",
      ),
    ).toBe("https://example.com/photo?id=3");
  });
});

describe("deduplicateCandidates", () => {
  it("keeps the first candidate for the same normalized URL", () => {
    const base: SearchCandidate = {
      id: "one",
      matchType: "exact",
      tier: "strong",
      sourceUrl: "https://example.com/photo?utm_source=one",
      sourceDomain: "example.com",
      thumbnailUrl: "https://example.com/one.jpg",
      title: "첫 번째",
      foundAt: "2026-08-24T00:00:00.000Z",
    };

    const result = deduplicateCandidates([
      base,
      { ...base, id: "two", sourceUrl: "https://example.com/photo" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("one");
  });
});
