import { NextResponse } from "next/server";
import { GoogleTextDetectionProvider } from "@/lib/privacy/google-text-provider";
import type { PrivacyScanResponse } from "@/lib/privacy/types";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 12 * 1024 * 1024;

function validDimension(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20_000 ? parsed : null;
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { message: "자동 텍스트 탐지가 아직 설정되지 않았어요." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: "이미지를 읽지 못했어요." }, { status: 400 });
  }
  const file = formData.get("image");
  const width = validDimension(formData.get("width"));
  const height = validDimension(formData.get("height"));
  if (!(file instanceof File) || !ACCEPTED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE || !width || !height) {
    return NextResponse.json({ message: "지원하지 않는 이미지예요." }, { status: 400 });
  }

  try {
    const provider = new GoogleTextDetectionProvider(apiKey);
    const candidates = await provider.scan(
      new Uint8Array(await file.arrayBuffer()),
      width,
      height,
    );
    const response: PrivacyScanResponse = {
      candidates,
      processedBy: "google-cloud-vision",
      retained: false,
    };
    return NextResponse.json(response, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "자동 텍스트 탐지에 실패했어요. 수동으로 영역을 지정할 수 있어요." },
      { status: 502 },
    );
  }
}
