import { describe, expect, it } from "vitest";
import { createNormalizedRegion, isUsableRegion } from "./geometry";

describe("createNormalizedRegion", () => {
  it("normalizes a reverse drag", () => {
    expect(
      createNormalizedRegion("region-1", { x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }),
    ).toEqual({
      id: "region-1",
      x: 0.2,
      y: 0.1,
      width: 0.6000000000000001,
      height: 0.6,
    });
  });

  it("clamps points to the image", () => {
    expect(
      createNormalizedRegion("region-2", { x: -1, y: 0.3 }, { x: 2, y: 1.4 }),
    ).toEqual({ id: "region-2", x: 0, y: 0.3, width: 1, height: 0.7 });
  });
});

describe("isUsableRegion", () => {
  it("rejects accidental clicks", () => {
    expect(
      isUsableRegion({ id: "tiny", x: 0.2, y: 0.2, width: 0.01, height: 0.01 }),
    ).toBe(false);
  });
});
