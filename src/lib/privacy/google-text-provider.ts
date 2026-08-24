import type {
  PrivacyCandidate,
  PrivacyCandidateKind,
} from "@/lib/privacy/types";

const GOOGLE_VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const MAX_INLINE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_CONTEXT_WORDS = 12;

type Vertex = { x?: unknown; y?: unknown };
type TextAnnotation = {
  description?: unknown;
  boundingPoly?: { vertices?: Vertex[] };
};
type GoogleTextResponse = {
  responses?: Array<{
    error?: { message?: unknown };
    textAnnotations?: TextAnnotation[];
    faceAnnotations?: Array<{
      boundingPoly?: { vertices?: Vertex[] };
      detectionConfidence?: unknown;
    }>;
  }>;
};
type TextBox = {
  index: number;
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerY: number;
  height: number;
};
type TextLine = { words: TextBox[]; centerY: number; height: number };
type SensitiveSpan = {
  words: TextBox[];
  kind: Exclude<PrivacyCandidateKind, "text">;
};

const labels: Record<PrivacyCandidateKind, string> = {
  email: "이메일",
  phone: "전화번호",
  url: "웹주소",
  account: "계정명",
  address: "주소",
  identifier: "식별번호",
  secret: "인증·비밀정보",
  face: "얼굴",
  qr: "QR 코드",
  license_plate: "차량번호",
  text: "텍스트",
};

const maxWordsByKind: Partial<Record<PrivacyCandidateKind, number>> = {
  email: 3,
  phone: 6,
  url: 3,
  account: 2,
  identifier: 7,
  secret: 6,
};

export function classifyDetectedText(text: string): PrivacyCandidateKind {
  const value = text.trim();
  const compact = value.replace(/\s+/g, "");
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(compact)) return "email";
  if (/^(?:\+?82[-]?)?0?(?:1[016789]|2|[3-6][1-5])[-]?\d{3,4}[-]?\d{4}$/.test(compact)) {
    return "phone";
  }
  if (/^\d{2,3}[가-힣]\d{4}$/.test(compact)) return "license_plate";
  if (/^\d{6}-?[1-4]\d{6}$/.test(compact) || /^(?:\d{4}-?){3}\d{4}$/.test(compact) || /^\d{2,6}(?:-\d{2,6}){2,4}$/.test(compact)) {
    return "identifier";
  }
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(compact) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?\S*$/i.test(compact)) {
    return "url";
  }
  if (/^(?:api[-_]?key|secret|password|passwd|비밀번호|인증번호|otp|token)[:=]?[a-z0-9_\-./+]{4,}$/i.test(compact)) {
    return "secret";
  }
  if (/^(?:대한민국)?(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주).{2,}(?:로|길|동|읍|면|리)\d*(?:-\d+)?$/.test(compact)) {
    return "address";
  }
  if (/^@[a-z0-9_.-]{2,}$/i.test(compact)) return "account";
  return "text";
}

function finiteCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toTextBoxes(annotations: TextAnnotation[]): TextBox[] {
  return annotations.slice(1).flatMap((annotation, index) => {
    const text = typeof annotation.description === "string" ? annotation.description.trim() : "";
    const vertices = annotation.boundingPoly?.vertices ?? [];
    if (!text || vertices.length < 2) return [];
    const xs = vertices.map((vertex) => finiteCoordinate(vertex.x));
    const ys = vertices.map((vertex) => finiteCoordinate(vertex.y));
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    if (right <= left || bottom <= top) return [];
    return [{
      index,
      text,
      left,
      top,
      right,
      bottom,
      centerY: (top + bottom) / 2,
      height: bottom - top,
    }];
  });
}

function groupIntoLines(words: TextBox[]): TextBox[][] {
  const lines: TextLine[] = [];
  for (const word of [...words].sort((a, b) => a.centerY - b.centerY || a.left - b.left)) {
    const line = lines.find(
      (candidate) => Math.abs(candidate.centerY - word.centerY) <= Math.max(candidate.height, word.height) * 0.65,
    );
    if (line) {
      line.words.push(word);
      line.centerY = line.words.reduce((sum, item) => sum + item.centerY, 0) / line.words.length;
      line.height = Math.max(line.height, word.height);
    } else {
      lines.push({ words: [word], centerY: word.centerY, height: word.height });
    }
  }

  return lines.flatMap((line) => {
    const sorted = line.words.sort((a, b) => a.left - b.left);
    const segments: TextBox[][] = [];
    for (const word of sorted) {
      const segment = segments.at(-1);
      const previous = segment?.at(-1);
      if (!segment || !previous || word.left - previous.right > Math.max(line.height * 4, 80)) {
        segments.push([word]);
      } else {
        segment.push(word);
      }
    }
    return segments;
  });
}

function findSensitiveSpans(lines: TextBox[][]): SensitiveSpan[] {
  const matches: SensitiveSpan[] = [];
  for (const words of lines) {
    const lineMatches: Array<SensitiveSpan & { start: number; end: number }> = [];
    for (let start = 0; start < words.length; start += 1) {
      for (let end = start; end < Math.min(words.length, start + MAX_CONTEXT_WORDS); end += 1) {
        const spanWords = words.slice(start, end + 1);
        const kind = classifyDetectedText(spanWords.map((word) => word.text).join(""));
        if (spanWords.length > (maxWordsByKind[kind] ?? MAX_CONTEXT_WORDS)) continue;
        if (kind !== "text") lineMatches.push({ words: spanWords, kind, start, end });
      }
    }
    const accepted: typeof lineMatches = [];
    for (const match of lineMatches.sort((a, b) => b.words.length - a.words.length || a.start - b.start)) {
      if (accepted.some((item) => match.start <= item.end && match.end >= item.start)) continue;
      accepted.push(match);
    }
    matches.push(...accepted);
  }
  return matches;
}

function candidateFromWords(
  id: string,
  words: TextBox[],
  kind: PrivacyCandidateKind,
  imageWidth: number,
  imageHeight: number,
  suggested: boolean,
): PrivacyCandidate {
  const left = Math.max(0, Math.min(...words.map((word) => word.left)) - 3);
  const top = Math.max(0, Math.min(...words.map((word) => word.top)) - 3);
  const right = Math.min(imageWidth, Math.max(...words.map((word) => word.right)) + 3);
  const bottom = Math.min(imageHeight, Math.max(...words.map((word) => word.bottom)) + 3);
  return {
    id,
    kind,
    label: labels[kind],
    text: words.map((word) => word.text).join(" "),
    suggested,
    region: {
      id,
      x: left / imageWidth,
      y: top / imageHeight,
      width: (right - left) / imageWidth,
      height: (bottom - top) / imageHeight,
    },
  };
}

export function normalizeGoogleTextDetection(
  payload: GoogleTextResponse,
  imageWidth: number,
  imageHeight: number,
): PrivacyCandidate[] {
  const response = payload.responses?.[0];
  if (response?.error) throw new Error("Google Text Detection returned an error");
  if (!(imageWidth > 0) || !(imageHeight > 0)) return [];

  const words = toTextBoxes(response?.textAnnotations ?? []);
  const sensitiveSpans = findSensitiveSpans(groupIntoLines(words));
  const coveredWordIndexes = new Set(
    sensitiveSpans.flatMap((span) => span.words.map((word) => word.index)),
  );
  const sensitiveCandidates = sensitiveSpans.map((span, index) =>
    candidateFromWords(
      `google-sensitive-${index}`,
      span.words,
      span.kind,
      imageWidth,
      imageHeight,
      true,
    ),
  );
  const genericCandidates = words
    .filter((word) => !coveredWordIndexes.has(word.index))
    .map((word) =>
      candidateFromWords(
        `google-text-${word.index}`,
        [word],
        "text",
        imageWidth,
        imageHeight,
        false,
      ),
    );
  const faceCandidates = (response?.faceAnnotations ?? []).flatMap((face, index) => {
    const vertices = face.boundingPoly?.vertices ?? [];
    if (vertices.length < 2) return [];
    const xs = vertices.map((vertex) => finiteCoordinate(vertex.x));
    const ys = vertices.map((vertex) => finiteCoordinate(vertex.y));
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const right = Math.min(imageWidth, Math.max(...xs));
    const bottom = Math.min(imageHeight, Math.max(...ys));
    if (right <= left || bottom <= top) return [];
    const id = `google-face-${index}`;
    return [{
      id,
      kind: "face",
      label: labels.face,
      text: `얼굴 ${index + 1}`,
      suggested: true,
      region: {
        id,
        x: left / imageWidth,
        y: top / imageHeight,
        width: (right - left) / imageWidth,
        height: (bottom - top) / imageHeight,
      },
    } satisfies PrivacyCandidate];
  });
  return [...faceCandidates, ...sensitiveCandidates, ...genericCandidates];
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
          features: [
            { type: "TEXT_DETECTION", maxResults: 100 },
            { type: "FACE_DETECTION", maxResults: 20 },
          ],
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
