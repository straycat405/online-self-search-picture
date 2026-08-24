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
    expect(classifyDetectedText("12가3456")).toBe("license_plate");
    expect(classifyDetectedText("www.example.com/account")).toBe("url");
    expect(classifyDetectedText("@private_user")).toBe("account");
    expect(classifyDetectedText("서울특별시마포구월드컵북로12")).toBe("address");
    expect(classifyDetectedText("900101-1234567")).toBe("identifier");
    expect(classifyDetectedText("API_KEY=abcd-1234-secret")).toBe("secret");
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

  it("joins OCR words into contextual sensitive candidates", () => {
    const word = (description: string, left: number, right: number, top = 10) => ({
      description,
      boundingPoly: {
        vertices: [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: top + 18 },
          { x: left, y: top + 18 },
        ],
      },
    });
    const result = normalizeGoogleTextDetection({
      responses: [{
        textAnnotations: [
          { description: "hello @ example.com 010 - 1234 - 5678" },
          word("hello", 10, 50),
          word("@", 54, 60),
          word("example.com", 64, 140),
          word("010", 160, 184),
          word("-", 187, 190),
          word("1234", 193, 225),
          word("-", 228, 231),
          word("5678", 234, 266),
        ],
      }],
    }, 300, 100);

    expect(result.map((candidate) => candidate.kind).sort()).toEqual(["email", "phone"]);
    expect(result.every((candidate) => candidate.suggested)).toBe(true);
    expect(result.find((candidate) => candidate.kind === "email")?.text).toBe("hello @ example.com");
  });

  it("does not join distant columns on the same row", () => {
    const result = normalizeGoogleTextDetection({
      responses: [{
        textAnnotations: [
          { description: "hello @ example.com" },
          { description: "hello", boundingPoly: { vertices: [{ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 0, y: 30 }] } },
          { description: "@example.com", boundingPoly: { vertices: [{ x: 300, y: 10 }, { x: 380, y: 10 }, { x: 380, y: 30 }, { x: 300, y: 30 }] } },
        ],
      }],
    }, 400, 100);

    expect(result.map((candidate) => candidate.kind)).toEqual(["account", "text"]);
  });

  it("adds face regions as review candidates", () => {
    const result = normalizeGoogleTextDetection({
      responses: [{
        faceAnnotations: [{
          detectionConfidence: 0.98,
          boundingPoly: {
            vertices: [
              { x: 20, y: 10 },
              { x: 80, y: 10 },
              { x: 80, y: 70 },
              { x: 20, y: 70 },
            ],
          },
        }],
      }],
    }, 100, 100);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "face", label: "얼굴", suggested: true });
    expect(result[0].region).toMatchObject({ x: 0.2, y: 0.1, width: 0.6, height: 0.6 });
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
      { type: "FACE_DETECTION", maxResults: 20 },
    ]);
  });
});
