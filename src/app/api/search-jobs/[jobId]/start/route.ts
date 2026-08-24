import { NextResponse } from "next/server";
import { deduplicateCandidates } from "@/lib/search/normalize";
import { MockSearchProvider } from "@/lib/search/providers/mock-provider";
import type { SearchCandidate } from "@/lib/search/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.json(
      { message: "익명 검색 세션을 확인하지 못했어요." },
      { status: 401 },
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("search_jobs")
    .select("id, mime_type, file_size, photo_object_path, status")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (jobError || !job || job.status !== "created") {
    return NextResponse.json(
      { message: "시작할 수 있는 검색 작업을 찾지 못했어요." },
      { status: 404 },
    );
  }

  if (typeof job.photo_object_path !== "string") {
    return NextResponse.json(
      { message: "검색 사진이 이미 삭제됐어요." },
      { status: 409 },
    );
  }

  const pathParts = job.photo_object_path.split("/");
  const fileName = pathParts.at(-1);
  const folder = pathParts.slice(0, -1).join("/");
  const { data: objects, error: storageError } = await supabase.storage
    .from("search-photos")
    .list(folder, { search: fileName, limit: 1 });

  if (storageError || !fileName || !objects?.some((object) => object.name === fileName)) {
    return NextResponse.json(
      { message: "업로드된 검색 사진을 확인하지 못했어요." },
      { status: 400 },
    );
  }

  const { data: claimedJob, error: searchingError } = await supabase.rpc(
    "claim_search_job",
    { requested_job_id: jobId },
  );
  if (searchingError || !claimedJob) {
    return NextResponse.json({ message: "이미 시작된 검색 작업이에요." }, { status: 409 });
  }

  const provider = new MockSearchProvider();
  let rawCandidates: SearchCandidate[];
  try {
    rawCandidates = await provider.search({
      fileName,
      fileSize: job.file_size,
      mimeType: job.mime_type,
    });
  } catch {
    await supabase.rpc("fail_search_job", {
      requested_job_id: jobId,
      failure_code: "provider_failed",
    });
    return NextResponse.json(
      { message: "검색 공급자 연결에 실패했어요." },
      { status: 502 },
    );
  }
  const candidates: SearchCandidate[] = deduplicateCandidates(rawCandidates).map(
    (candidate) => ({ ...candidate, id: crypto.randomUUID() }),
  );
  const completedAt = new Date().toISOString();
  const { data: savedResults, error: candidateError } = await supabase.rpc(
    "save_search_results",
    {
      requested_job_id: jobId,
      candidate_payload: candidates.map((candidate) => ({
        id: candidate.id,
        provider: provider.name,
        match_type: candidate.matchType,
        tier: candidate.tier,
        source_url: candidate.sourceUrl,
        source_domain: candidate.sourceDomain,
        thumbnail_url: candidate.thumbnailUrl,
        title: candidate.title,
        found_at: candidate.foundAt,
      })),
      outcome_completed_at: completedAt,
    },
  );

  if (candidateError || !savedResults) {
    await supabase.rpc("fail_search_job", {
      requested_job_id: jobId,
      failure_code: "candidate_insert_failed",
    });
    return NextResponse.json(
      { message: "검색 결과를 저장하지 못했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    jobId,
    mode: "supabase-mock",
    candidates,
    searchedSources: ["동일 이미지 검색 데모", "유사 얼굴 검색 데모"],
    completedAt,
  });
}
