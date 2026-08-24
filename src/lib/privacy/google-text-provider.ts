import type {
  PrivacyCandidate,
  PrivacyCandidateKind,
} from "@/lib/privacy/types";

const GOOGLE_VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const MAX_INLINE_IMAGE_BYTES = 12 * 1024 * 1024;

type Vertex = { x?: unknown; y?: unknown };
type TextAnnotation = {
  description?: unknown;
  boundingPoly?: { vertices?: Vertex[] };
};
type GoogleTextResponse = {
  responses?: Array<{
    error?: { message?: unknown };
    textAnnotations?: TextAnnotation[];
  }>;
};

const labels: Record<PrivacyCandidateKind, string> = {
  email: "이메일",
  phone: "전화번호",
  url: "웹주소",
  account: "계정명",
  text: "텍스트",
};

export function classifyDetectedText(text: string): PrivacyCandidateKind {
  const value = text.trim();
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return "email";
  if (/^(?:\+?82[-\s]?)?0?(?:1[016789]|2|[3-6][1-5])[-\s]?\d{3,4}[-\s]?\d{4}$/.test(value)) {
    return "phone";
  }
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(value) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?\S*$/i.test(value)) {
    return "url";
  }
  if (/^@[a-z0-9_.-]{2,}$/i.test(value)) return "account";
  return "text";
}

function finiteCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeGoogleTextDetection(
  payload: GoogleTextResponse,
  imageWidth: number,
  imageHeight: number,
): PrivacyCandidate[] {
  const response = payload.responses?.[0];
  if (response?.error) throw new Error("Google Text Detection returned an error");
  if (!(imageWidth > 0) || !(imageHeight > 0)) return [];

  return (response?.textAnnotations ?? []).slice(1).flatMap((annotation, index) => {
    const text = typeof annotation.description === "string" ? annotation.description.trim() : "";
    const vertices = annotation.boundingPoly?.vertices ?? [];
    if (!text || vertices.length < 2) return [];
    const xs = vertices.map((vertex) => finiteCoordinate(vertex.x));
    const ys = vertices.map((vertex) => finiteCoordinate(vertex.y));
    const left = Math.max(0, Math.min(...xs) - 3);
    const top = Math.max(0, Math.min(...ys) - 3);
    const right = Math.min(imageWidth, Math.max(...xs) + 3);
    const bottom = Math.min(imageHeight, Math.max(...ys) + 3);
    if (right <= left || bottom <= top) return [];

    const kind = classifyDetectedText(text);
    return [{
      id: `google-text-${index}`,
      kind,
      label: labels[kind],
      text,
      suggested: kind !== "text",
      region: {
        id: `google-text-${index}`,
        x: left / imageWidth,
        y: top / imageHeight,
        width: (right - left) / imageWidth,
        height: (bottom - top) / imageHeight,
      },
    } satisfies PrivacyCandidate];
  });
}

export class GoogleTextDetectionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey.trim()) throw new Error("Google Vision API key is required");
  }

  async scan(imageBytes: Uint8Array, imageWidth: number, imageHeight: number) {
    if (!imageBytes.length || imageBytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
      throw new Error("Image size is invalid for Text Detection");
    }
    const response = await this.fetcher(GOOGLE_VISION_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        requests: [{
          image: { content: Buffer.from(imageBytes).toString("base64") },
          features: [{ type: "TEXT_DETECTION", maxResults: 100 }],
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Google Text Detection failed with ${response.status}`);
    return normalizeGoogleTextDetection(
      (await response.json()) as GoogleTextResponse,
      imageWidth,
      imageHeight,
    );
  }
}
