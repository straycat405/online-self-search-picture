import { NextResponse } from "next/server";
import { z } from "zod";
import { deduplicateCandidates } from "@/lib/search/normalize";
import { MockSearchProvider } from "@/lib/search/providers/mock-provider";
import { isSupabaseBrowserConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  if (isSupabaseBrowserConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    let userId = claimsData?.claims?.sub;

    if (!userId) {
      const { data: anonymousData, error: signInError } =
        await supabase.auth.signInAnonymously();
      if (signInError || !anonymousData.user) {
        return NextResponse.json(
          { message: "익명 검색 세션을 만들지 못했어요." },
          { status: 401 },
        );
      }
      userId = anonymousData.user.id;
    }

    const jobId = crypto.randomUUID();
    const extension =
      parsed.data.mimeType === "image/png"
        ? "png"
        : parsed.data.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const photoObjectPath = `${userId}/${jobId}/query.${extension}`;

    const { error: jobError } = await supabase.from("search_jobs").insert({
      id: jobId,
      user_id: userId,
      status: "created",
      mode: "mock",
      mime_type: parsed.data.mimeType,
      file_size: parsed.data.fileSize,
      photo_object_path: photoObjectPath,
      provider_plan: "mock",
    });

    if (jobError) {
      return NextResponse.json(
        { message: "검색 작업을 저장하지 못했어요." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      jobId,
      mode: "supabase-pending",
      photoObjectPath,
    });
  }

  const provider = new MockSearchProvider();
  const candidates = await provider.search(parsed.data);
  const completedAt = new Date().toISOString();

  return NextResponse.json({
    jobId: crypto.randomUUID(),
    mode: "mock",
    candidates: deduplicateCandidates(candidates),
    searchedSources: ["동일 이미지 검색 데모", "유사 얼굴 검색 데모"],
    completedAt,
  });
}
