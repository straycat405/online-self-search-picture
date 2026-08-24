import type { PrivacyCandidate } from "@/lib/privacy/types";

export type BarcodePoint = { x: number; y: number };
export type BarcodeDetection = {
  format: string;
  rawValue?: string;
  cornerPoints: BarcodePoint[];
};

export function normalizeQrDetections(
  detections: BarcodeDetection[],
  imageWidth: number,
  imageHeight: number,
): PrivacyCandidate[] {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return [];
  return detections.flatMap((detection, index) => {
    if (detection.format !== "qr_code" || detection.cornerPoints.length < 2) return [];
    const xs = detection.cornerPoints.map((point) => point.x);
    const ys = detection.cornerPoints.map((point) => point.y);
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const right = Math.min(imageWidth, Math.max(...xs));
    const bottom = Math.min(imageHeight, Math.max(...ys));
    if (right <= left || bottom <= top) return [];
    const id = `local-qr-${index}`;
    return [{
      id,
      kind: "qr",
      label: "QR 코드",
      text: detection.rawValue ? "내용이 포함된 QR 코드" : `QR 코드 ${index + 1}`,
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
}
