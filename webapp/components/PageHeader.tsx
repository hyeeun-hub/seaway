import Link from "next/link";
import { MonthSelect } from "@/components/MonthSelect";

export function PageHeader({
  title,
  subtitle,
  months,
  selectedMonth,
  basePath = "/",
  reviewCount,
  extra,
}: {
  title: string;
  subtitle: string;
  months?: string[];
  selectedMonth?: string;
  basePath?: string;
  reviewCount: number;
  extra?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {extra}
        {months && months.length > 0 && selectedMonth && (
          <MonthSelect months={months} value={selectedMonth} basePath={basePath} />
        )}
        <Link
          href="/review"
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium px-3 py-1.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          검수 대상 {reviewCount}건
        </Link>
        <Link
          href="/#upload"
          className="rounded-lg bg-blue-600 text-white text-sm font-medium px-4 py-1.5"
        >
          분석 실행
        </Link>
      </div>
    </header>
  );
}
