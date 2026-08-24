"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  SearchCandidate,
  SearchJobCreatedResponse,
  SearchResponse,
} from "@/lib/search/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseBrowserConfigured } from "@/lib/supabase/env";

type FlowState = "upload" | "searching" | "results";
type Verdict = "self" | "not_self";

const progressSteps = [
  "사진 상태를 확인하고 있어요",
  "공개 웹의 동일 이미지를 찾고 있어요",
  "크롭되거나 편집된 이미지를 찾고 있어요",
  "중복 결과를 정리하고 있어요",
];

const MAX_FILE_SIZE = 7 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function isSupabaseResult(response: SearchResponse): boolean {
  return response.mode === "supabase-mock" || response.mode === "supabase-live";
}

export function PhotoSearchFlow() {
  const [flowState, setFlowState] = useState<FlowState>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [selfConfirmed, setSelfConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressIndex, setProgressIndex] = useState(0);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [uploadedPhotoPath, setUploadedPhotoPath] = useState<string | null>(null);
  const [photoDeletedAfterSearch, setPhotoDeletedAfterSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const canSearch = Boolean(file && adultConfirmed && selfConfirmed);

  const resultCounts = useMemo(() => {
    const candidates = response?.candidates ?? [];
    return {
      exact: candidates.filter((candidate) => candidate.matchType === "exact").length,
      partial: candidates.filter((candidate) => candidate.matchType === "partial").length,
    };
  }, [response]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    setError(null);

    if (!nextFile) return;
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      setError("JPG, PNG 또는 WebP 사진을 선택해주세요.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError("사진 용량은 7MB 이하로 선택해주세요.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  }

  async function startSearch() {
    if (!file || !canSearch) return;

    setError(null);
    setFlowState("searching");
    setProgressIndex(0);

    const timer = window.setInterval(() => {
      setProgressIndex((current) =>
        Math.min(current + 1, progressSteps.length - 1),
      );
    }, 650);

    let requestedJobId: string | undefined;
    let photoObjectPath: string | undefined;

    try {
      const result = await fetch("/api/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          adultConfirmed,
          selfConfirmed,
        }),
      });

      const data = (await result.json()) as
        | SearchResponse
        | SearchJobCreatedResponse
        | { message: string };
      if (!result.ok || "message" in data) {
        throw new Error("message" in data ? data.message : "검색을 시작하지 못했어요.");
      }

      let completedResponse: SearchResponse;
      if (data.mode === "supabase-pending") {
        const supabase = createSupabaseBrowserClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          throw new Error("익명 검색 세션을 확인하지 못했어요.");
        }
        requestedJobId = data.jobId;
        photoObjectPath = data.photoObjectPath;
        if (!photoObjectPath.startsWith(`${userData.user.id}/${requestedJobId}/`)) {
          throw new Error("검색 사진 경로를 확인하지 못했어요.");
        }

        const { error: uploadError } = await supabase.storage
          .from("search-photos")
          .upload(photoObjectPath, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          throw new Error("검색 사진을 안전하게 업로드하지 못했어요.");
        }
        setUploadedPhotoPath(photoObjectPath);

        const startResult = await fetch(`/api/search-jobs/${requestedJobId}/start`, {
          method: "POST",
        });
        const startData = (await startResult.json()) as SearchResponse | { message: string };
        if (!startResult.ok || !("candidates" in startData)) {
          throw new Error(
            "message" in startData ? startData.message : "검색을 시작하지 못했어요.",
          );
        }
        completedResponse = startData;

        const { error: removeAfterSearchError } = await supabase.storage
          .from("search-photos")
          .remove([photoObjectPath]);
        if (!removeAfterSearchError) {
          const { data: photoMarked, error: markError } = await supabase.rpc(
            "mark_search_photo_deleted",
            {
            requested_job_id: requestedJobId,
            },
          );
          if (!markError && photoMarked) {
            setUploadedPhotoPath(null);
          }
          setPhotoDeletedAfterSearch(true);
        }
      } else {
        completedResponse = data;
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
      setResponse(completedResponse);
      setFlowState("results");
    } catch (caught) {
      let cleanupFailed = false;
      if (photoObjectPath && isSupabaseBrowserConfigured()) {
        const { error: removeError } = await createSupabaseBrowserClient()
          .storage.from("search-photos")
          .remove([photoObjectPath]);
        cleanupFailed = Boolean(removeError);
        if (!removeError) setUploadedPhotoPath(null);
      }
      if (requestedJobId && isSupabaseBrowserConfigured() && !cleanupFailed) {
        const { data: deleted, error: deleteError } = await createSupabaseBrowserClient().rpc(
          "delete_search_job_if_photo_missing",
          { requested_job_id: requestedJobId },
        );
        cleanupFailed = Boolean(deleteError || !deleted);
      }
      setError(
        cleanupFailed
          ? "검색을 중단했지만 사진 정리를 완료하지 못했어요. 잠시 후 다시 시도해주세요."
          : caught instanceof Error
            ? caught.message
            : "잠시 후 다시 시도해주세요.",
      );
      setFlowState("upload");
    } finally {
      window.clearInterval(timer);
    }
  }

  async function resetSearch() {
    if (response && isSupabaseResult(response) && isSupabaseBrowserConfigured()) {
      const supabase = createSupabaseBrowserClient();
      if (uploadedPhotoPath) {
        const { error: removeError } = await supabase.storage
          .from("search-photos")
          .remove([uploadedPhotoPath]);
        if (removeError) {
          setError("사진을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
          return;
        }
      }
      const { data: deleted, error: deleteError } = await supabase.rpc(
        "delete_search_job_if_photo_missing",
        { requested_job_id: response.jobId },
      );
      if (deleteError || !deleted) {
        setError("검색 기록을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setResponse(null);
    setVerdicts({});
    setAdultConfirmed(false);
    setSelfConfirmed(false);
    setError(null);
    setUploadedPhotoPath(null);
    setPhotoDeletedAfterSearch(false);
    setFlowState("upload");
    if (inputRef.current) inputRef.current.value = "";
  }

  if (flowState === "searching") {
    return (
      <section className="flow-shell search-progress" aria-live="polite">
        <div className="progress-visual" aria-hidden="true">
          <div className="scan-line" />
          {previewUrl && <Image src={previewUrl} alt="" fill unoptimized />}
        </div>
        <p className="eyebrow">자동 검색 중</p>
        <h1>{progressSteps[progressIndex]}</h1>
        <p>페이지를 닫지 말고 잠시만 기다려주세요.</p>
        <div className="progress-bar" aria-label="검색 진행 상태">
          <span style={{ width: `${((progressIndex + 1) / progressSteps.length) * 100}%` }} />
        </div>
        <ol className="progress-list">
          {progressSteps.map((step, index) => (
            <li className={index <= progressIndex ? "is-active" : ""} key={step}>
              <span>{index < progressIndex ? "✓" : index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (flowState === "results" && response) {
    return (
      <section className="flow-shell results-shell">
        <div className="demo-banner">
          {response.mode === "supabase-live"
            ? "Google 공개 웹의 동일·부분 일치 이미지 검색 결과입니다"
            : response.mode === "supabase-mock"
              ? "비공개 저장 흐름을 사용한 데모 결과입니다"
              : "기능 확인용 데모 결과입니다"}
        </div>
        <div className="result-summary">
          <p className="eyebrow">검색 완료</p>
          <h1>
            {response.candidates.length
              ? `유력한 일치 결과가 ${response.candidates.length}건 있어요`
              : "유력한 일치 결과를 찾지 못했어요"}
          </h1>
          {response.candidates.length ? (
            <p>
              동일 이미지 {resultCounts.exact}건과 크롭·부분 일치 이미지{" "}
              {resultCounts.partial}건을 찾았어요.
            </p>
          ) : (
            <p>현재 확인 가능한 공개 웹 범위에서는 동일하거나 편집된 사진이 발견되지 않았어요.</p>
          )}
        </div>

        <div className="candidate-list">
          {response.candidates.map((candidate) => (
            <CandidateCard
              candidate={candidate}
              key={candidate.id}
              verdict={verdicts[candidate.id]}
              onVerdict={(verdict) =>
                setVerdicts((current) => ({ ...current, [candidate.id]: verdict }))
              }
            />
          ))}
        </div>

        <div className="scope-card">
          <h2>이번에 확인한 범위</h2>
          <ul>
            {response.searchedSources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          <p>
            결과가 없거나 적더라도 인터넷에 사진이 없다는 뜻은 아니에요. 비공개 SNS와
            로그인 필요한 페이지는 검색할 수 없습니다.
          </p>
        </div>

        <div className="delete-card">
          <div>
            <span className="delete-icon" aria-hidden="true">✓</span>
            <div>
              <h2>
                {isSupabaseResult(response) && photoDeletedAfterSearch
                  ? "검색이 끝나 등록 사진을 삭제했어요"
                  : isSupabaseResult(response)
                    ? "등록 사진은 비공개 공간에 저장했어요"
                  : "등록 사진은 서버에 전송하지 않았어요"}
              </h2>
              <p>
                {isSupabaseResult(response) && photoDeletedAfterSearch
                  ? "검색 결과만 남기고 원본 검색 사진은 즉시 정리했습니다."
                  : isSupabaseResult(response)
                    ? "처리가 중단된 사진은 업로드 후 1시간이 지나면 자동 삭제를 재시도합니다."
                  : "현재 데모에서는 브라우저 안에서 미리보기 용도로만 사용했습니다."}
              </p>
            </div>
          </div>
          <button
            className="button button-secondary"
            onClick={() => void resetSearch()}
            type="button"
          >
            결과 지우고 다시 검색
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="flow-shell upload-flow">
      <div className="flow-heading">
        <p className="eyebrow">사진 등록</p>
        <h1>인터넷 노출 여부를 확인할 사진을 선택해주세요</h1>
        <p>원본에 가까운 사진일수록 동일하거나 편집된 이미지를 찾는 데 유리해요.</p>
      </div>

      <button
        className={previewUrl ? "upload-box has-photo" : "upload-box"}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {previewUrl ? (
          <>
            <Image src={previewUrl} alt="선택한 사진 미리보기" fill unoptimized />
            <span className="change-photo">사진 바꾸기</span>
          </>
        ) : (
          <>
            <span className="upload-icon" aria-hidden="true">＋</span>
            <strong>사진 선택</strong>
            <span>JPG, PNG, WebP · 최대 7MB</span>
          </>
        )}
      </button>
      <input
        accept={ACCEPTED_TYPES.join(",")}
        className="visually-hidden"
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="photo-tips">
        <h2>이런 사진이 좋아요</h2>
        <ul>
          <li>메신저나 SNS에 올렸던 원본에 가까운 사진</li>
          <li>과도하게 축소되거나 흐려지지 않은 사진</li>
          <li>스크린샷보다 사진 파일 자체를 권장해요</li>
        </ul>
      </div>

      <div className="consent-list">
        <label>
          <input
            checked={adultConfirmed}
            onChange={(event) => setAdultConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>만 19세 이상입니다.</span>
        </label>
        <label>
          <input
            checked={selfConfirmed}
            onChange={(event) => setSelfConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>본인 사진만 검색하며 공개 웹에서 확인 가능한 범위에 한계가 있음을 확인했습니다.</span>
        </label>
      </div>

      <button
        className="button button-primary button-full"
        disabled={!canSearch}
        onClick={startSearch}
        type="button"
      >
        사진 검색 시작
      </button>
      <p className="privacy-note">
        {isSupabaseBrowserConfigured()
          ? "사진은 검색 직후 삭제하며, 중단된 경우에도 1시간 후 자동 정리를 재시도합니다."
          : "현재 데모에서는 선택한 사진이 서버로 전송되지 않습니다."}
      </p>
    </section>
  );
}

function CandidateCard({
  candidate,
  verdict,
  onVerdict,
}: {
  candidate: SearchCandidate;
  verdict?: Verdict;
  onVerdict: (verdict: Verdict) => void;
}) {
  const label =
    candidate.matchType === "exact"
      ? "동일 이미지"
      : candidate.matchType === "partial"
        ? "크롭·부분 일치"
        : "확인해 볼 후보";

  return (
    <article className="candidate-card">
      <div className="candidate-photo">
        <Image
          alt={`${candidate.title} 데모 이미지`}
          fill
          sizes="(max-width: 720px) 36vw, 210px"
          src={candidate.thumbnailUrl}
        />
      </div>
      <div className="candidate-content">
        <span className={`match-label match-label-${candidate.tier}`}>{label}</span>
        <h2>{candidate.title}</h2>
        <p>{candidate.sourceDomain}</p>
        <a href={candidate.sourceUrl} rel="noreferrer" target="_blank">
          원문 열기
        </a>
        <div className="verdict-group" aria-label="본인 여부 선택">
          <button
            className={verdict === "self" ? "is-selected" : ""}
            onClick={() => onVerdict("self")}
            type="button"
          >
            내 사진이 맞아요
          </button>
          <button
            className={verdict === "not_self" ? "is-selected" : ""}
            onClick={() => onVerdict("not_self")}
            type="button"
          >
            관련 없는 결과예요
          </button>
        </div>
      </div>
    </article>
  );
}
