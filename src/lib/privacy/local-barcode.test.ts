import { describe, expect, it } from "vitest";
import { normalizeQrDetections } from "./local-barcode";

describe("normalizeQrDetections", () => {
  it("normalizes QR corners without exposing the encoded value", () => {
    const result = normalizeQrDetections([{
      format: "qr_code",
      rawValue: "https://private.example/token",
      cornerPoints: [
        { x: 20, y: 10 },
        { x: 80, y: 10 },
        { x: 80, y: 70 },
        { x: 20, y: 70 },
      ],
    }], 100, 100);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "qr", suggested: true, text: "내용이 포함된 QR 코드" });
    expect(result[0].text).not.toContain("private.example");
    expect(result[0].region).toMatchObject({ x: 0.2, y: 0.1, width: 0.6, height: 0.6 });
  });

  it("ignores non-QR barcode formats", () => {
    expect(normalizeQrDetections([{
      format: "ean_13",
      cornerPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    }], 100, 100)).toEqual([]);
  });
});
