import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "안심 업로드 | 공유 전 개인정보 가림",
  description: "사진과 화면 캡처 속 민감한 정보를 확인하고 가린 안전한 사본을 만드세요.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html data-scroll-behavior="smooth" lang="ko">
      <body>{children}</body>
    </html>
  );
}
