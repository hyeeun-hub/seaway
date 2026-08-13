import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { CalendarGrid } from "@/components/CalendarGrid";
import { AddCalendarEntryButton } from "@/components/AddCalendarEntryButton";
import { getCalendarSummary, getMemoNoteEntries, todayInKorea } from "@/lib/calendar";
import { getReviewSummary } from "@/lib/aggregate";
import { won, shortWon } from "@/lib/format";

export const dynamic = "force-dynamic";

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; ym?: string }>;
}) {
  const [{ entries, summary }, reviewSummary, memoNotes, { view, ym }] = await Promise.all([
    getCalendarSummary(),
    getReviewSummary(),
    getMemoNoteEntries(),
    searchParams,
  ]);

  const view2 = view === "list" ? "list" : "calendar";
  const today = todayInKorea();
  const currentYm = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : today.slice(0, 7);
  const [year, month] = currentYm.split("-").map(Number);

  const monthEntries = entries.filter((e) => e.settleDate.startsWith(currentYm));
  const monthTotal = monthEntries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="회수 캘린더"
        subtitle={`확정·예정 계약 회수 일정 · ${today} 기준`}
        reviewCount={reviewSummary.needsReview}
      />

      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-sm">
          <Link
            href={`/calendar?view=calendar&ym=${currentYm}`}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              view2 === "calendar" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
            }`}
          >
            캘린더 뷰
          </Link>
          <Link
            href={`/calendar?view=list&ym=${currentYm}`}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              view2 === "list" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
            }`}
          >
            목록 뷰
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-blue-700 font-medium">
            ↓ 매출 확정 {shortWon(summary.confirmedAmount)}{" "}
            <span className="text-blue-400 font-normal">· 예정 {shortWon(summary.pendingAmount)}</span>
          </span>
          <span className="text-orange-700 font-medium">
            ↑ 매입 확정 {shortWon(summary.purchaseConfirmedAmount)}{" "}
            <span className="text-orange-400 font-normal">
              · 예정 {shortWon(summary.purchasePendingAmount)}
            </span>
          </span>
          <AddCalendarEntryButton />
        </div>
      </div>

      <Card padding="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/calendar?view=${view2}&ym=${shiftMonth(currentYm, -1)}`}
              className="text-slate-400 hover:text-slate-700"
            >
              <ChevronLeft size={18} />
            </Link>
            <p className="text-sm font-semibold text-slate-900">
              {year}년 {month}월
            </p>
            <Link
              href={`/calendar?view=${view2}&ym=${shiftMonth(currentYm, 1)}`}
              className="text-slate-400 hover:text-slate-700"
            >
              <ChevronRight size={18} />
            </Link>
          </div>
          <p className="text-xs text-slate-400">
            회수 예정 총 {won(monthTotal)} · {monthEntries.length}건
          </p>
        </div>

        {view2 === "calendar" && (
          <div className="flex items-center gap-3 text-xs text-slate-600 mb-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-500" />↓ 매출(수금)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-orange-500" />↑ 매입(결제)
            </span>
          </div>
        )}

        {view2 === "calendar" ? (
          <CalendarGrid year={year} month={month} entries={monthEntries} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-2 px-3 font-medium">예정일</th>
                  <th className="py-2 px-3 font-medium">구분</th>
                  <th className="py-2 px-3 font-medium">프로젝트/현장</th>
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium text-right">금액</th>
                  <th className="py-2 px-3 font-medium">수단</th>
                  <th className="py-2 px-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 px-3 text-slate-700">{e.settleDate}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          e.side === "매출" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                        }`}
                      >
                        {e.side === "매출" ? "↓" : "↑"} {e.side}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{e.proj || "—"}</td>
                    <td className="py-2 px-3 text-slate-600">
                      {e.place || "—"}
                      {e.isManual && <span className="ml-1 text-xs text-slate-400">(수동)</span>}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-900 font-medium">{won(e.amount)}</td>
                    <td className="py-2 px-3 text-slate-500">{e.settleMethod ?? "—"}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-xs rounded-full px-2 py-0.5 ${
                          e.status === "확정" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {e.status}
                        {e.isPassThrough && "(통과거래)"}
                      </span>
                    </td>
                  </tr>
                ))}
                {monthEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 px-3 text-slate-400">
                      이 달에 회수예정일이 등록된 거래가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-400">
        회수예정일 없는 매입 {summary.excludedNoSettle}건은 현금·카드 즉시결제로 추정해 캘린더 대상에서
        제외됩니다.
      </p>

      {memoNotes.length > 0 && (
        <Card padding="p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-900">메모가 있는 거래 (참고)</h2>
            <p className="text-xs text-slate-400">
              {memoNotes.length}건 · 합계 {won(memoNotes.reduce((s, e) => s + (e.amount ?? 0), 0))}
            </p>
          </div>
          <p className="text-xs text-slate-400 mb-2">
            원본 메모는 자유 서술이라 일정을 자동으로 인식하지 않습니다. 지급/입금 시기 언급이 있는지
            원문을 직접 확인하세요.
          </p>
          <ul className="divide-y divide-slate-50 text-sm">
            {memoNotes.map((e) => (
              <li key={e.id} className="py-2 flex flex-wrap items-baseline gap-2">
                <span className="text-slate-500 shrink-0">{e.date}</span>
                <span className="text-slate-700">{e.place}</span>
                {e.proj && <span className="text-slate-400">· {e.proj}</span>}
                <span className="text-slate-900 font-medium">{won(e.amount)}</span>
                <span className="text-xs text-violet-600">&ldquo;{e.memo}&rdquo;</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
