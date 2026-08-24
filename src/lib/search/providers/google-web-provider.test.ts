import { describe, expect, it } from "vitest";
import {
  GoogleWebSearchProvider,
  normalizeGoogleWebDetection,
} from "./google-web-provider";

describe("normalizeGoogleWebDetection", () => {
  it("keeps full and partial page matches while ignoring visual similarity", () => {
    const candidates = normalizeGoogleWebDetection(
      {
        responses: [
          {
            webDetection: {
              pagesWithMatchingImages: [
                {
                  url: "https://Example.kr/article/one",
                  pageTitle: "원본 사진이 포함된 글",
                  fullMatchingImages: [{ url: "https://cdn.example.kr/full.jpg" }],
                },
                {
                  url: "https://blog.example.kr/crop",
                  partialMatchingImages: [{ url: "https://blog.example.kr/crop.jpg" }],
                },
                {
                  url: "https://example.kr/similar-only",
                },
              ],
            },
          },
        ],
      },
      "2026-08-24T00:00:00.000Z",
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      matchType: "exact",
      tier: "strong",
      sourceDomain: "example.kr",
    });
    expect(candidates[1]).toMatchObject({
      matchType: "partial",
      tier: "review",
      sourceDomain: "blog.example.kr",
    });
    expect(candidates.every((candidate) => candidate.thumbnailUrl.startsWith("/"))).toBe(true);
  });

  it("rejects non-web source URLs and provider-level errors", () => {
    expect(
      normalizeGoogleWebDetection({
        responses: [
          {
            webDetection: {
              pagesWithMatchingImages: [
                {
                  url: "file:///private/result",
                  fullMatchingImages: [{ url: "https://example.com/image.jpg" }],
                },
              ],
            },
          },
        ],
      }),
    ).toEqual([]);

    expect(() =>
      normalizeGoogleWebDetection({ responses: [{ error: { message: "denied" } }] }),
    ).toThrow("Google Web Detection returned an error");
  });

  it("sends the API key in a header and requests only Web Detection", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return new Response(JSON.stringify({ responses: [{ webDetection: {} }] }));
    }) as typeof fetch;
    const provider = new GoogleWebSearchProvider("server-secret", fetcher);

    await provider.search({
      fileName: "query.png",
      fileSize: 3,
      mimeType: "image/png",
      imageBytes: new Uint8Array([1, 2, 3]),
    });

    expect(capturedUrl).not.toContain("server-secret");
    expect(new Headers(capturedInit?.headers).get("x-goog-api-key")).toBe(
      "server-secret",
    );
    const requestBody = JSON.parse(String(capturedInit?.body));
    expect(requestBody.requests[0].features).toEqual([
      { type: "WEB_DETECTION", maxResults: 20 },
    ]);
  });
});
