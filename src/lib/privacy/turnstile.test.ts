import { describe, expect, it } from "vitest";
import { verifyTurnstileToken } from "./turnstile";

describe("verifyTurnstileToken", () => {
  it("accepts only successful tokens for the privacy scan action", async () => {
    const fetcher = (async () => new Response(JSON.stringify({
      success: true,
      action: "privacy-scan",
    }))) as typeof fetch;
    expect(await verifyTurnstileToken("secret", "token", fetcher)).toBe(true);
  });

  it("rejects wrong actions and missing credentials", async () => {
    const fetcher = (async () => new Response(JSON.stringify({
      success: true,
      action: "different-action",
    }))) as typeof fetch;
    expect(await verifyTurnstileToken("secret", "token", fetcher)).toBe(false);
    expect(await verifyTurnstileToken("", "token", fetcher)).toBe(false);
  });

  it("fails closed when the verification service is unavailable", async () => {
    const fetcher = (async () => {
      throw new Error("network unavailable");
    }) as typeof fetch;
    expect(await verifyTurnstileToken("secret", "token", fetcher)).toBe(false);
  });
});
