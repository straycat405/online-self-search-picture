import { NextResponse } from "next/server";
import { z } from "zod";
import { deduplicateCandidates } from "@/lib/search/normalize";
import { MockSearchProvider } from "@/lib/search/providers/mock-provider";

const requestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  adultConfirmed: z.literal(true),
  selfConfirmed: z.literal(true),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: "사진과 필수 동의 항목을 다시 확인해주세요." },
      { status: 400 },
    );
  }

  const provider = new MockSearchProvider();
  const candidates = await provider.search(parsed.data);

  return NextResponse.json({
    jobId: crypto.randomUUID(),
    mode: "mock",
    candidates: deduplicateCandidates(candidates),
    searchedSources: ["동일 이미지 검색 데모", "유사 얼굴 검색 데모"],
    completedAt: new Date().toISOString(),
  });
}
