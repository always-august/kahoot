import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MatrixBackground } from "@/components/ui/modern-animated-hero-section";

export const metadata: Metadata = {
  title: "PLAY IMWEB",
  description: "실시간 퀴즈 · 럭키드로우 게임",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <MatrixBackground />
        {children}
      </body>
    </html>
  );
}
