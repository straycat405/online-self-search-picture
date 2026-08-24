import type {
  SearchCandidate,
  SearchInput,
  SearchProvider,
} from "@/lib/search/types";

const GOOGLE_VISION_ENDPOINT =
  "https://vision.googleapis.com/v1/images:annotate";
const MAX_INLINE_IMAGE_BYTES = 7 * 1024 * 1024;

type GoogleWebImage = { url?: unknown };
type GoogleWebPage = {
  url?: unknown;
  pageTitle?: unknown;
  fullMatchingImages?: GoogleWebImage[];
  partialMatchingImages?: GoogleWebImage[];
};
type GoogleVisionResponse = {
  responses?: Array<{
    error?: { message?: unknown };
    webDetection?: {
      pagesWithMatchingImages?: GoogleWebPage[];
    };
  }>;
};

function safeHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function normalizeGoogleWebDetection(
  payload: GoogleVisionResponse,
  foundAt = new Date().toISOString(),
): SearchCandidate[] {
  const response = payload.responses?.[0];
  if (response?.error) {
    throw new Error("Google Web Detection returned an error");
  }

  const pages = response?.webDetection?.pagesWithMatchingImages ?? [];
  return pages.flatMap((page, pageIndex) => {
    const source = safeHttpUrl(page.url);
    if (!source) return [];

    const hasFullMatch = page.fullMatchingImages?.some(
      (image) => safeHttpUrl(image.url) !== null,
    );
    const hasPartialMatch = page.partialMatchingImages?.some(
      (image) => safeHttpUrl(image.url) !== null,
    );
    if (!hasFullMatch && !hasPartialMatch) return [];

    const matchType = hasFullMatch ? "exact" : "partial";
    const title =
      typeof page.pageTitle === "string" && page.pageTitle.trim()
        ? page.pageTitle.trim()
        : source.hostname;

    return [
      {
        id: `google-web-${pageIndex}`,
        matchType,
        tier: hasFullMatch ? "strong" : "review",
        sourceUrl: source.toString(),
        sourceDomain: source.hostname.toLowerCase(),
        // Do not load third-party thumbnails in the user's browser. That would
        // disclose their IP address to a matched site before they open it.
        thumbnailUrl: "/search-result-placeholder.svg",
        title,
        foundAt,
      } satisfies SearchCandidate,
    ];
  });
}

export class GoogleWebSearchProvider implements SearchProvider {
  readonly name = "google-web-detection";
  readonly mode = "live";
  readonly searchedSources = [
    "Google 공개 웹의 동일 이미지",
    "Google 공개 웹의 크롭·부분 일치 이미지",
  ];

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("Google Vision API key is required");
  }

  async search(input: SearchInput): Promise<SearchCandidate[]> {
    if (!input.imageBytes?.length) {
      throw new Error("Search image bytes are required");
    }
    if (input.imageBytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
      throw new Error("Search image is too large for inline Web Detection");
    }

    const response = await this.fetcher(
      GOOGLE_VISION_ENDPOINT,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: Buffer.from(input.imageBytes).toString("base64") },
              features: [{ type: "WEB_DETECTION", maxResults: 20 }],
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Google Web Detection failed with ${response.status}`);
    }
    return normalizeGoogleWebDetection(
      (await response.json()) as GoogleVisionResponse,
    );
  }
}
