"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  createNormalizedRegion,
  isUsableRegion,
  type NormalizedRegion,
} from "@/lib/redaction/geometry";
import type { PrivacyScanResponse } from "@/lib/privacy/types";

type ImageSize = { width: number; height: number };
type DragState = { pointerId: number; start: { x: number; y: number } };
type ReviewRegion = NormalizedRegion & {
  label: string;
  text?: string;
  source: "automatic" | "manual";
  selected: boolean;
};

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
  const scanRequestRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<ReviewRegion[]>([]);
  const [draftRegion, setDraftRegion] = useState<NormalizedRegion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [automaticScan, setAutomaticScan] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [showOtherText, setShowOtherText] = useState(false);

  const selectedRegions = regions.filter((region) => region.selected);
  const otherTextCount = regions.filter(
    (region) => region.source === "automatic" && !region.selected,
  ).length;
  const visibleRegions = regions.filter(
    (region) => region.selected || region.source === "manual" || showOtherText,
  );

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
      setScanNotice(null);
      setShowOtherText(false);
      if (automaticScan) void scanImage(nextFile, nextSize);
    } catch {
      setError("이미지를 읽지 못했어요. 다른 파일을 선택해주세요.");
    }
  }

  async function scanImage(image: File, size: ImageSize) {
    const requestId = ++scanRequestRef.current;
    setIsScanning(true);
    const formData = new FormData();
    formData.set("image", image);
    formData.set("width", String(size.width));
    formData.set("height", String(size.height));
    try {
      const response = await fetch("/api/privacy-scan", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as PrivacyScanResponse | { message: string };
      if (!response.ok || !("candidates" in data)) {
        throw new Error("message" in data ? data.message : "자동 탐지에 실패했어요.");
      }
      if (requestId !== scanRequestRef.current) return;
      const automaticRegions: ReviewRegion[] = data.candidates.map((candidate) => ({
        ...candidate.region,
        label: candidate.label,
        text: candidate.text,
        source: "automatic",
        selected: candidate.suggested,
      }));
      setRegions(automaticRegions);
      const suggestedCount = automaticRegions.filter((region) => region.selected).length;
      setScanNotice(
        automaticRegions.length
          ? `텍스트 ${automaticRegions.length}개를 찾았고, 민감 정보 후보 ${suggestedCount}개를 먼저 선택했어요.`
          : "자동으로 찾은 텍스트가 없어요. 필요한 영역을 직접 드래그해주세요.",
      );
    } catch (caught) {
      if (requestId !== scanRequestRef.current) return;
      setScanNotice(caught instanceof Error ? caught.message : "자동 탐지에 실패했어요. 수동 선택은 계속 사용할 수 있어요.");
    } finally {
      if (requestId === scanRequestRef.current) setIsScanning(false);
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
    if (isUsableRegion(region)) {
      setRegions((current) => [...current, {
        ...region,
        label: "직접 선택",
        source: "manual",
        selected: true,
      }]);
    }
    dragRef.current = null;
    setDraftRegion(null);
  }

  async function createSafeCopy() {
    if (!file || !imageSize || selectedRegions.length === 0) return;
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
      for (const region of selectedRegions) {
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
    scanRequestRef.current += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setImageSize(null);
    setPreviewUrl(null);
    setResultUrl(null);
    setRegions([]);
    setError(null);
    setScanNotice(null);
    setIsScanning(false);
    setShowOtherText(false);
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
        <label className="scan-option">
          <input
            checked={automaticScan}
            onChange={(event) => setAutomaticScan(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>자동 텍스트 탐지 사용</strong>
            <small>이미지를 저장하지 않고 Google Cloud Vision으로 텍스트 영역을 확인합니다.</small>
          </span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="local-processing-note">
          <strong>원본을 보관하지 않아요</strong>
          <p>자동 탐지를 켜면 이미지는 텍스트 분석을 위해 Google Cloud Vision에 한 번 전달되지만 서버나 데이터베이스에 저장하지 않습니다. 끄면 모든 편집이 브라우저 안에서만 처리됩니다.</p>
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
          {!resultUrl && visibleRegions.map((region) => (
            <span className={`redaction-region ${region.selected ? "" : "is-excluded"}`} key={region.id} style={regionStyle(region)}>
              <span>{regions.findIndex((item) => item.id === region.id) + 1}</span>
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
              <h2>{selectedRegions.length}개 영역을 가렸어요</h2>
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
              <span className="stage-label">
                {isScanning ? "텍스트를 찾는 중…" : `가릴 영역 ${selectedRegions.length}개`}
              </span>
              <h2>가릴 정보가 모두 포함됐나요?</h2>
              <p>{scanNotice ?? "자동으로 찾은 후보를 검토하거나 이미지 위를 직접 드래그해 영역을 추가해주세요."}</p>
              <ol className="region-list">
                {visibleRegions.map((region) => (
                  <li className={region.selected ? "is-selected" : ""} key={region.id}>
                    <span>
                      <strong>{regions.findIndex((item) => item.id === region.id) + 1}. {region.label}</strong>
                      {region.text && <small>{region.text}</small>}
                    </span>
                    <button
                      onClick={() => setRegions((current) => current.map((item) => item.id === region.id ? { ...item, selected: !item.selected } : item))}
                      type="button"
                    >
                      {region.selected ? "제외" : "포함"}
                    </button>
                  </li>
                ))}
              </ol>
              {otherTextCount > 0 && (
                <button className="show-other-text" onClick={() => setShowOtherText((current) => !current)} type="button">
                  {showOtherText ? "일반 텍스트 접기" : `다른 텍스트 ${otherTextCount}개 검토하기`}
                </button>
              )}
              {regions.length > 0 && (
                <button className="clear-regions" onClick={() => setRegions([])} type="button">모두 지우기</button>
              )}
              <button className="button button-primary button-full" disabled={selectedRegions.length === 0 || isExporting} onClick={() => void createSafeCopy()} type="button">
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
