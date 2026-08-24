import { describe, expect, it } from "vitest";
import {
  classifyDetectedText,
  GoogleTextDetectionProvider,
  normalizeGoogleTextDetection,
} from "./google-text-provider";

describe("classifyDetectedText", () => {
  it("classifies common sensitive text patterns", () => {
    expect(classifyDetectedText("hello@example.com")).toBe("email");
    expect(classifyDetectedText("010-1234-5678")).toBe("phone");
    expect(classifyDetectedText("www.example.com/account")).toBe("url");
    expect(classifyDetectedText("@private_user")).toBe("account");
    expect(classifyDetectedText("일반문장")).toBe("text");
  });
});

describe("normalizeGoogleTextDetection", () => {
  it("skips aggregate text and normalizes word boxes", () => {
    const result = normalizeGoogleTextDetection({
      responses: [{
        textAnnotations: [
          { description: "전체 문장" },
          {
            description: "hello@example.com",
            boundingPoly: { vertices: [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 40 }, { x: 10, y: 40 }] },
          },
        ],
      }],
    }, 200, 100);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "email", suggested: true, text: "hello@example.com" });
    expect(result[0].region.x).toBeCloseTo(0.035);
    expect(result[0].region.width).toBeCloseTo(0.53);
  });

  it("surfaces provider errors", () => {
    expect(() => normalizeGoogleTextDetection({ responses: [{ error: { message: "denied" } }] }, 10, 10)).toThrow();
  });
});

describe("GoogleTextDetectionProvider", () => {
  it("keeps the API key in a header and requests text detection", async () => {
    let capturedInit: RequestInit | undefined;
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ responses: [{ textAnnotations: [] }] }));
    }) as typeof fetch;
    const provider = new GoogleTextDetectionProvider("server-secret", fetcher);
    await provider.scan(new Uint8Array([1, 2, 3]), 100, 100);

    expect(new Headers(capturedInit?.headers).get("x-goog-api-key")).toBe("server-secret");
    expect(JSON.parse(String(capturedInit?.body)).requests[0].features).toEqual([
      { type: "TEXT_DETECTION", maxResults: 100 },
    ]);
  });
});
