"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  PieChart,
  TrendingUp,
  Receipt,
  CalendarClock,
  ClipboardCheck,
  StickyNote,
  FileText,
  Settings,
  Calculator,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: LayoutGrid },
  { href: "/projects", label: "프로젝트별 손익", icon: PieChart },
  { href: "/monthly", label: "월별 추이", icon: TrendingUp },
  { href: "/quote", label: "수주 판단", icon: Calculator },
  { href: "/admin-costs", label: "일반관리비", icon: Receipt },
  { href: "/calendar", label: "회수 캘린더", icon: CalendarClock },
  { href: "/review", label: "검수 대상", icon: ClipboardCheck, badgeKey: "review" as const },
  { href: "/memo", label: "메모 확인", icon: StickyNote, badgeKey: "memo" as const },
  { href: "/reports", label: "월간 리포트", icon: FileText },
  { href: "/settings", label: "설정·관리", icon: Settings },
];

export function Sidebar({
  reviewCount,
  memoCount,
  lastAnalysisAt,
  dataFileCount,
}: {
  reviewCount: number;
  memoCount: number;
  lastAnalysisAt: string | null;
  dataFileCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-slate-300 flex flex-col h-full">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">
          씨
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">씨웨이테크</p>
          <p className="text-slate-500 text-xs leading-tight">ERP 손익 분석</p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white text-slate-900 font-medium"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon size={17} strokeWidth={2} />
                {item.label}
              </span>
              {item.badgeKey === "review" && reviewCount > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-medium ${
                    active ? "bg-red-100 text-red-600" : "bg-red-500 text-white"
                  }`}
                >
                  {reviewCount}
                </span>
              )}
              {item.badgeKey === "memo" && memoCount > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 leading-none font-medium ${
                    active ? "bg-violet-100 text-violet-600" : "bg-violet-500 text-white"
                  }`}
                >
                  {memoCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <span>최근 분석</span>
          <span className="text-slate-400">{lastAnalysisAt ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span>데이터 파일</span>
          <span className="text-slate-400">{dataFileCount}건</span>
        </div>
      </div>
    </aside>
  );
}
