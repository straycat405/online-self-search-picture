"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  createNormalizedRegion,
  isUsableRegion,
  type NormalizedRegion,
} from "@/lib/redaction/geometry";

type ImageSize = { width: number; height: number };
type DragState = { pointerId: number; start: { x: number; y: number } };

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 12 * 1024 * 1024;

async function readImageSize(file: File): Promise<ImageSize> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function regionStyle(region: NormalizedRegion) {
  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  };
}

export function SafeUploadFlow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<NormalizedRegion[]>([]);
  const [draftRegion, setDraftRegion] = useState<NormalizedRegion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    setError(null);
    if (!nextFile) return;
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      setError("JPG, PNG 또는 WebP 이미지를 선택해주세요.");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError("이미지 용량은 12MB 이하로 선택해주세요.");
      return;
    }

    try {
      const nextSize = await readImageSize(nextFile);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setFile(nextFile);
      setImageSize(nextSize);
      setPreviewUrl(URL.createObjectURL(nextFile));
      setResultUrl(null);
      setRegions([]);
    } catch {
      setError("이미지를 읽지 못했어요. 다른 파일을 선택해주세요.");
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!previewUrl || resultUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = pointFromEvent(event);
    dragRef.current = { pointerId: event.pointerId, start };
    setDraftRegion(createNormalizedRegion("draft", start, start));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDraftRegion(createNormalizedRegion("draft", drag.start, pointFromEvent(event)));
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const region = createNormalizedRegion(
      `region-${crypto.randomUUID()}`,
      drag.start,
      pointFromEvent(event),
    );
    if (isUsableRegion(region)) setRegions((current) => [...current, region]);
    dragRef.current = null;
    setDraftRegion(null);
  }

  async function createSafeCopy() {
    if (!file || !imageSize || regions.length === 0) return;
    setIsExporting(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = imageSize.width;
      canvas.height = imageSize.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      context.fillStyle = "#111318";
      for (const region of regions) {
        context.fillRect(
          Math.round(region.x * canvas.width),
          Math.round(region.y * canvas.height),
          Math.ceil(region.width * canvas.width),
          Math.ceil(region.height * canvas.height),
        );
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("blob");
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
    } catch {
      setError("안전한 사본을 만들지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsExporting(false);
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setImageSize(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setRegions([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!file || !previewUrl || !imageSize) {
    return (
      <section className="flow-shell upload-flow">
        <div className="flow-heading">
          <p className="eyebrow">1. 이미지 불러오기</p>
          <h1>공유하기 전에 한 번 더 확인하세요</h1>
          <p>화면 캡처나 사진을 선택하면, 가릴 부분을 직접 표시해 안전한 사본을 만들 수 있어요.</p>
        </div>
        <button className="upload-box" onClick={() => inputRef.current?.click()} type="button">
          <span className="upload-icon" aria-hidden="true">＋</span>
          <strong>이미지 선택</strong>
          <span>JPG, PNG, WebP · 최대 12MB</span>
        </button>
        <input
          accept={ACCEPTED_TYPES.join(",")}
          className="visually-hidden"
          onChange={handleFileChange}
          ref={inputRef}
          type="file"
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="local-processing-note">
          <strong>현재 편집은 브라우저 안에서만 처리돼요</strong>
          <p>선택한 원본 이미지를 서버에 업로드하지 않으며, 다운로드한 안전 사본은 메타데이터가 제거된 PNG로 만들어집니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="redaction-shell">
      <div className="redaction-heading">
        <div>
          <p className="eyebrow">{resultUrl ? "3. 안전한 사본 확인" : "2. 가릴 영역 선택"}</p>
          <h1>{resultUrl ? "안전한 사본을 만들었어요" : "가릴 부분을 드래그해주세요"}</h1>
          <p>{resultUrl ? "원본은 그대로 두고, 가림 처리된 PNG 사본만 내려받을 수 있어요." : "이름, 이메일, 계정명, 주소처럼 공개하고 싶지 않은 부분을 박스로 표시하세요."}</p>
        </div>
        <button className="button button-secondary" onClick={reset} type="button">다른 이미지</button>
      </div>

      <div className="redaction-workspace">
        <div
          className={resultUrl ? "redaction-canvas is-result" : "redaction-canvas"}
          onPointerCancel={finishDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }}
        >
          <Image
            alt={resultUrl ? "가림 처리된 안전한 사본" : "선택한 원본 이미지"}
            fill
            priority
            src={resultUrl ?? previewUrl}
            unoptimized
          />
          {!resultUrl && regions.map((region, index) => (
            <span className="redaction-region" key={region.id} style={regionStyle(region)}>
              <span>{index + 1}</span>
            </span>
          ))}
          {!resultUrl && draftRegion && (
            <span className="redaction-region is-draft" style={regionStyle(draftRegion)} />
          )}
        </div>

        <aside className="redaction-panel">
          {resultUrl ? (
            <>
              <div className="completion-mark" aria-hidden="true">✓</div>
              <h2>{regions.length}개 영역을 가렸어요</h2>
              <p>다운로드한 파일을 열어 민감한 내용이 충분히 가려졌는지 마지막으로 확인해주세요.</p>
              <a className="button button-primary button-full" download={`safe-${file.name.replace(/\.[^.]+$/, "")}.png`} href={resultUrl}>
                안전한 사본 다운로드
              </a>
              <button className="button button-secondary button-full" onClick={() => setResultUrl(null)} type="button">
                영역 다시 수정
              </button>
            </>
          ) : (
            <>
              <span className="stage-label">선택한 영역 {regions.length}개</span>
              <h2>가릴 정보가 모두 포함됐나요?</h2>
              <p>자동 탐지는 다음 단계에서 연결됩니다. 지금은 이미지 위를 직접 드래그해 영역을 추가해주세요.</p>
              <ol className="region-list">
                {regions.map((region, index) => (
                  <li key={region.id}>
                    <span>영역 {index + 1}</span>
                    <button onClick={() => setRegions((current) => current.filter((item) => item.id !== region.id))} type="button">삭제</button>
                  </li>
                ))}
              </ol>
              {regions.length > 0 && (
                <button className="clear-regions" onClick={() => setRegions([])} type="button">모두 지우기</button>
              )}
              <button className="button button-primary button-full" disabled={regions.length === 0 || isExporting} onClick={() => void createSafeCopy()} type="button">
                {isExporting ? "사본 만드는 중…" : "안전한 사본 만들기"}
              </button>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>
    </section>
  );
}
