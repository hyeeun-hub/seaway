import { PageHeader } from "@/components/PageHeader";
import { ReportSummaryEditor } from "@/components/ReportSummaryEditor";
import { won, signedWon, monthLabel } from "@/lib/format";
import { getMonthlyPnl, getProjectPnl, getReviewSummary } from "@/lib/aggregate";
import { generateSummaryText } from "@/lib/monthlyReport";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatGeneratedAt(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [monthlyRows, reviewSummary, totalTx, { month: requestedMonth }] = await Promise.all([
    getMonthlyPnl(),
    getReviewSummary(),
    prisma.transaction.count(),
    searchParams,
  ]);

  const months = monthlyRows.map((m) => m.month);
  const selectedMonth = requestedMonth && months.includes(requestedMonth) ? requestedMonth : months.at(-1);

  if (!selectedMonth) {
    return (
      <div className="p-6">
        <h1 className="text-lg font-bold text-slate-900">월간 리포트</h1>
        <p className="text-sm text-slate-500 mt-2">아직 분석된 데이터가 없습니다.</p>
      </div>
    );
  }

  const idx = months.indexOf(selectedMonth);
  const current = monthlyRows[idx];
  const prev = monthlyRows[idx - 1];
  const [projectRows, reportState] = await Promise.all([
    getProjectPnl({ month: selectedMonth }),
    prisma.monthlyReportState.findUnique({ where: { month: selectedMonth } }),
  ]);

  const summaryText =
    reportState?.summaryText ?? generateSummaryText(selectedMonth, monthlyRows, projectRows);

  const totals = projectRows.reduce(
    (acc, p) => ({ revenue: acc.revenue + p.revenue, cost: acc.cost + p.cost, profit: acc.profit + p.profit }),
    { revenue: 0, cost: 0, profit: 0 },
  );
  // 매출 0원이면 이익률이 정의되지 않는다 — "0.0%" 대신 "—".
  const totalMarginRate = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : null;

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="월간 리포트"
        subtitle={`기준 월 손익 리포트 초안 · ${monthLabel(selectedMonth)} 기준`}
        months={months}
        selectedMonth={selectedMonth}
        basePath="/reports"
        reviewCount={reviewSummary.needsReview}
      />

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-semibold text-blue-600 tracking-wide">MONTHLY REPORT</p>
            <h2 className="text-xl font-bold text-slate-900 mt-1">
              {monthLabel(selectedMonth)} 손익 리포트
            </h2>
          </div>
          <div className="text-xs text-slate-400 text-right">
            <p>작성 기준 {formatGeneratedAt()}</p>
            <p>
              대상 프로젝트 {projectRows.length}개 · 거래 {totalTx.toLocaleString()}건
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 pt-4">
          <div className="px-4">
            <p className="text-xs text-slate-500">총 매출액</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{won(current.revenue)}</p>
            {prev && (
              <p className={`text-xs mt-1 ${current.revenue < prev.revenue ? "text-red-600" : "text-emerald-600"}`}>
                전월 대비 {signedWon(current.revenue - prev.revenue)} (
                {prev.revenue !== 0
                  ? `${(((current.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1)}%`
                  : "—"}
                )
              </p>
            )}
          </div>
          <div className="px-4">
            <p className="text-xs text-slate-500">총 매입액</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{won(current.cost)}</p>
            {prev && (
              <p className={`text-xs mt-1 ${current.cost > prev.cost ? "text-red-600" : "text-emerald-600"}`}>
                전월 대비 {signedWon(current.cost - prev.cost)} (
                {prev.cost !== 0 ? `${(((current.cost - prev.cost) / prev.cost) * 100).toFixed(1)}%` : "—"})
              </p>
            )}
          </div>
          <div className="px-4">
            <p className="text-xs text-slate-500">총 손익</p>
            <p className={`text-lg font-bold mt-1 ${current.profit < 0 ? "text-red-600" : "text-blue-600"}`}>
              {won(current.profit)}
            </p>
            {prev && (
              <p className={`text-xs mt-1 ${current.profit < prev.profit ? "text-red-600" : "text-emerald-600"}`}>
                전월 대비 {signedWon(current.profit - prev.profit)} (
                {prev.profit !== 0
                  ? `${(((current.profit - prev.profit) / Math.abs(prev.profit)) * 100).toFixed(1)}%`
                  : "—"}
                )
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">프로젝트별 매출 / 매입 / 손익</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium">프로젝트명</th>
                <th className="py-2 pr-4 font-medium text-right">매출액</th>
                <th className="py-2 pr-4 font-medium text-right">매입액</th>
                <th className="py-2 pr-4 font-medium text-right">손익</th>
                <th className="py-2 font-medium text-right">이익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {projectRows.map((p) => (
                <tr key={p.proj}>
                  <td className="py-2.5 pr-4 text-slate-700">{p.proj}</td>
                  <td className="py-2.5 pr-4 text-right text-slate-700">{won(p.revenue)}</td>
                  <td className="py-2.5 pr-4 text-right text-slate-700">{won(p.cost)}</td>
                  <td
                    className={`py-2.5 pr-4 text-right font-semibold ${
                      p.profit < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {won(p.profit)}
                  </td>
                  <td className="py-2.5 text-right text-slate-500">
                    {p.revenue > 0 ? `${((p.profit / p.revenue) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              {projectRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-slate-400">
                    이 달에 반영된 프로젝트 거래가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
            {projectRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="py-2.5 pr-4 text-slate-700">합계</td>
                  <td className="py-2.5 pr-4 text-right text-slate-900">{won(totals.revenue)}</td>
                  <td className="py-2.5 pr-4 text-right text-slate-900">{won(totals.cost)}</td>
                  <td className="py-2.5 pr-4 text-right text-emerald-700">{won(totals.profit)}</td>
                  <td className="py-2.5 text-right text-slate-500">
                    {totalMarginRate !== null ? `${totalMarginRate.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <ReportSummaryEditor
        month={selectedMonth}
        initialText={summaryText}
        initialConfirmedAt={reportState?.confirmedAt?.toISOString() ?? null}
      />

      <p className="text-xs text-slate-400">
        기준 정보: 거래 {totalTx.toLocaleString()}건 중 검수 미확정 {reviewSummary.needsReview}건은
        확정 시 수치가 변동될 수 있습니다.
      </p>
    </div>
  );
}
