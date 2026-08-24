import Link from "next/link";

export function AppHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={compact ? "app-header app-header-compact" : "app-header"}>
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="모를 권리 홈">
          <span className="brand-symbol" aria-hidden="true">
            모
          </span>
          <span>모를 권리</span>
        </Link>
        {!compact && (
          <nav aria-label="주요 메뉴">
            <a href="#how-it-works">이용 방법</a>
            <Link href="/search">검색 시작</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
