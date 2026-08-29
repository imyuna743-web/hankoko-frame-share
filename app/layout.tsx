import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한코코 프레임 공유소",
  description: "한코코 프로필 프레임을 올리고, 발견하고, 바로 불러오는 공유 갤러리",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
