import { NextResponse } from "next/server";
import { GoogleTextDetectionProvider } from "@/lib/privacy/google-text-provider";
import type { PrivacyScanResponse } from "@/lib/privacy/types";
import { verifyTurnstileToken } from "@/lib/privacy/turnstile";
import { isSupabaseBrowserConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 12 * 1024 * 1024;

function validDimension(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 20_000 ? parsed : null;
}

async function claimScanQuota() {
  const quotaRequired =
    process.env.PRIVACY_SCAN_QUOTA_REQUIRED !== "false" &&
    process.env.NODE_ENV === "production";
  if (!isSupabaseBrowserConfigured()) {
    if (quotaRequired) throw new Error("quota_unavailable");
    return undefined;
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    const { data: anonymousData, error: signInError } =
      await supabase.auth.signInAnonymously();
    if (signInError || !anonymousData.user) throw new Error("session_failed");
  }

  const { data, error } = await supabase.rpc("claim_privacy_scan");
  if (error) {
    if (quotaRequired) throw new Error("quota_unavailable");
    return undefined;
  }
  const quota = Array.isArray(data) ? data[0] : data;
  if (!quota || quota.allowed !== true) throw new Error("quota_exceeded");
  return typeof quota.remaining === "number" ? quota.remaining : undefined;
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { message: "자동 텍스트 탐지가 아직 설정되지 않았어요." },
      { status: 503 },
    );
  }

  const captchaRequired =
    process.env.NODE_ENV === "production" &&
    process.env.PRIVACY_SCAN_CAPTCHA_REQUIRED !== "false";
  if (captchaRequired) {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
    const token = request.headers.get("x-turnstile-token")?.trim() ?? "";
    if (!secret) {
      return NextResponse.json(
        { message: "자동 탐지 보안 설정을 확인해주세요." },
        { status: 503 },
      );
    }
    if (!(await verifyTurnstileToken(secret, token))) {
      return NextResponse.json(
        { message: "사람인지 확인한 뒤 다시 시도해주세요." },
        { status: 403 },
      );
    }
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

  let remainingScans: number | undefined;
  try {
    remainingScans = await claimScanQuota();
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : "quota_unavailable";
    if (code === "quota_exceeded") {
      return NextResponse.json(
        { message: "오늘 사용할 수 있는 자동 탐지 횟수를 모두 사용했어요. 수동 편집은 계속 사용할 수 있어요." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { message: "자동 탐지 사용량을 확인하지 못했어요. 수동 편집은 계속 사용할 수 있어요." },
      { status: 503 },
    );
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
      remainingScans,
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
