import Link from "next/link";
import { AppHeader } from "@/components/app-header";

const facts = [
  { value: "내가 결정", label: "가릴 정보와 영역" },
  { value: "원본 유지", label: "내 기기의 원본 파일" },
  { value: "PNG 사본", label: "공유할 안전한 이미지" },
];

export default function Home() {
  return (
    <main>
      <AppHeader />
      <section className="hero shell safe-hero">
        <div className="hero-copy">
          <p className="eyebrow">생성형 AI·커뮤니티 업로드 전 개인정보 점검</p>
          <h1>올리기 전에,<br />숨길 건 숨기세요</h1>
          <p className="hero-description">
            화면 캡처와 사진 속 이름, 연락처, 계정정보처럼 공개하고 싶지 않은 부분을
            확인하고 가린 안전한 사본을 만드세요. 무엇을 가릴지는 사용자가 직접 결정합니다.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/protect">안전한 사본 만들기</Link>
            <a className="text-link" href="#how-it-works">어떻게 작동하나요?</a>
          </div>
          <p className="hero-note">현재 1차 편집기는 이미지가 브라우저 밖으로 전송되지 않습니다.</p>
        </div>
        <div className="privacy-preview" aria-label="개인정보 가림 처리 미리보기">
          <div className="preview-topline">
            <span>업로드 전 점검</span><span className="status-dot">확인 완료</span>
          </div>
          <div className="screenshot-preview" aria-hidden="true">
            <div className="mock-toolbar" />
            <div className="mock-profile"><span /><div><i /><i /></div></div>
            <div className="mock-lines"><i /><i /><i /></div>
            <b className="mock-redaction redaction-one">가림</b>
            <b className="mock-redaction redaction-two">가림</b>
          </div>
          <div className="preview-result-row">
            <span className="result-mark" />
            <div><strong>공유할 안전한 사본 준비 완료</strong><p>원본은 그대로 두고 가린 이미지 한 장만 새로 만들어요.</p></div>
          </div>
        </div>
      </section>

      <section className="fact-strip" aria-label="서비스 요약">
        <div className="shell fact-grid">
          {facts.map((fact) => <div key={fact.label}><strong>{fact.value}</strong><span>{fact.label}</span></div>)}
        </div>
      </section>

      <section className="section shell" id="how-it-works">
        <div className="section-heading"><p className="eyebrow">이용 방법</p><h2>찾아보고, 결정하고, 안전하게 공유해요</h2></div>
        <ol className="step-list">
          <li><span>1</span><div><h3>이미지 불러오기</h3><p>AI나 커뮤니티에 올리려는 사진 또는 화면 캡처를 선택해요.</p></div></li>
          <li><span>2</span><div><h3>가릴 정보 확인</h3><p>민감할 수 있는 영역을 확인하고 직접 추가하거나 제외해요.</p></div></li>
          <li><span>3</span><div><h3>안전한 사본 받기</h3><p>선택한 부분만 가린 새 이미지를 내려받아 안심하고 공유해요.</p></div></li>
        </ol>
      </section>

      <section className="section section-muted">
        <div className="shell trust-block">
          <div><p className="eyebrow">서비스 원칙</p><h2>대신 판단하지 않고, 놓치지 않게 도와드려요</h2></div>
          <ul className="check-list">
            <li>자동 탐지 결과는 확정이 아닌 검토 후보로 보여드려요.</li>
            <li>가릴지 말지는 언제나 사용자가 선택해요.</li>
            <li>원본 파일은 사용자의 기기에서 지우지 않아요.</li>
            <li>처리용 파일을 보관해야 할 때는 짧게 두고 자동 삭제해요.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
