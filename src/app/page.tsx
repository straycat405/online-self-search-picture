import Link from "next/link";
import { AppHeader } from "@/components/app-header";

const facts = [
  { value: "1장", label: "검색에 필요한 사진" },
  { value: "약 2분", label: "예상 검색 시간" },
  { value: "자동 삭제", label: "검색 후 등록 사진" },
];

export default function Home() {
  return (
    <main>
      <AppHeader />
      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">온라인 사진 셀프검색</p>
          <h1>
            내 사진,
            <br />
            인터넷 어디엔가 있을까?
          </h1>
          <p className="hero-description">
            사진 한 장으로 공개 웹에 올라온 동일 이미지와 편집된 복사본을 찾아보세요.
            결과는 내가 직접 확인하고, 등록한 사진은 검색 후 삭제됩니다.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/search">
              내 사진 검색하기
            </Link>
            <a className="text-link" href="#how-it-works">
              어떻게 찾나요?
            </a>
          </div>
          <p className="hero-note">
            Google 공개 웹 색인을 검색하며, 결과가 없어도 인터넷에 사진이 없다는 뜻은 아닙니다.
          </p>
        </div>
        <div className="search-preview" aria-label="검색 결과 미리보기">
          <div className="preview-topline">
            <span>검색 결과</span>
            <span className="status-dot">검색 완료</span>
          </div>
          <div className="preview-photo-grid" aria-hidden="true">
            <div className="preview-photo preview-photo-main" />
            <div className="preview-photo" />
            <div className="preview-photo" />
          </div>
          <div className="preview-result-row">
            <span className="result-mark" />
            <div>
              <strong>동일 이미지 2건</strong>
              <p>공개된 원문 링크를 직접 확인할 수 있어요.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="fact-strip" aria-label="서비스 요약">
        <div className="shell fact-grid">
          {facts.map((fact) => (
            <div key={fact.label}>
              <strong>{fact.value}</strong>
              <span>{fact.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section shell" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">이용 방법</p>
          <h2>복잡한 조사 대신, 세 단계면 충분해요</h2>
        </div>
        <ol className="step-list">
          <li>
            <span>1</span>
            <div>
              <h3>사진 한 장 등록</h3>
              <p>인터넷 노출 여부를 확인하고 싶은 본인 사진을 선택해요.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>공개 웹 자동 검색</h3>
              <p>동일 이미지와 자르기·편집된 복사본이 있는 공개 페이지를 찾아요.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>내가 직접 확인</h3>
              <p>원문 페이지를 열어 실제 복사본인지 직접 확인해요.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section section-muted">
        <div className="shell trust-block">
          <div>
            <p className="eyebrow">먼저 지키는 것</p>
            <h2>검색을 위해 맡긴 사진이 새로운 걱정이 되지 않도록</h2>
          </div>
          <ul className="check-list">
            <li>본인 사진만 검색할 수 있어요.</li>
            <li>운영자가 결과를 판정하지 않아요.</li>
            <li>다른 사진 속 동일 인물을 찾는 얼굴인식 서비스가 아니에요.</li>
            <li>검색이 끝나면 등록 사진을 삭제해요.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
