import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ChatWidget } from "@/components/ChatWidget";
import { Sidebar } from "@/components/Sidebar";
import { prisma } from "@/lib/prisma";
import { getReviewSummary } from "@/lib/aggregate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "씨웨이테크 · ERP 손익 분석",
  description: "ERP 손익 분석 · 검수 · 회수 캘린더 대시보드",
};

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(",", "");
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [reviewSummary, memoCount, dataFileCount, lastFile] = await Promise.all([
    getReviewSummary(),
    prisma.reviewDecision.count({
      where: { transaction: { memo: { not: "" } }, memoAcknowledgedAt: null },
    }),
    prisma.processedFile.count(),
    prisma.processedFile.findFirst({ orderBy: { uploadedAt: "desc" } }),
  ]);

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-slate-100 text-slate-900">
        <div className="flex h-full">
          <Sidebar
            reviewCount={reviewSummary.needsReview}
            memoCount={memoCount}
            lastAnalysisAt={lastFile ? formatDateTime(lastFile.uploadedAt) : null}
            dataFileCount={dataFileCount}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <ChatWidget />
      </body>
    </html>
  );
}
