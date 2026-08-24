import Link from "next/link";

export function AppHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={compact ? "app-header app-header-compact" : "app-header"}>
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="안심 업로드 홈">
          <span className="brand-symbol" aria-hidden="true">
            모
          </span>
          <span>안심 업로드</span>
        </Link>
        {!compact && (
          <nav aria-label="주요 메뉴">
            <a href="#how-it-works">이용 방법</a>
            <Link href="/protect">사본 만들기</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
