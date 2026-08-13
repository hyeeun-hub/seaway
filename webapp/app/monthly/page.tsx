import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { MonthlyComparisonChart } from "@/components/MonthlyComparisonChart";
import { RevenueRealProfitChart } from "@/components/RevenueRealProfitChart";
import { ExpandableMonthRow } from "@/components/ExpandableMonthRow";
import { monthLabel } from "@/lib/format";
import {
  getMonthlyPnl,
  getReviewSummary,
  getDerivedCostByMonth,
  getProjectPnl,
  getAdminCategoryBreakdown,
} from "@/lib/aggregate";

export const dynamic = "force-dynamic";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [rows, reviewSummary, derivedByMonth, { month: requestedMonth }] = await Promise.all([
    getMonthlyPnl(),
    getReviewSummary(),
    getDerivedCostByMonth(),
    searchParams,
  ]);
  const derivedOf = (month: string) => derivedByMonth.find((d) => d.month === month)?.total ?? 0;

  // "보조 표"의 각 월 근거(그 달 진행 프로젝트·일반관리비) — 5개월치라 매 요청마다
  // 다시 계산해도 부담이 적다.
  const [projectsByMonth, adminByMonth] = await Promise.all([
    Promise.all(rows.map((r) => getProjectPnl({ month: r.month }))),
    Promise.all(rows.map((r) => getAdminCategoryBreakdown({ month: r.month }))),
  ]);
  const projectsMap = new Map(rows.map((r, i) => [r.month, projectsByMonth[i]]));
  const adminMap = new Map(rows.map((r, i) => [r.month, adminByMonth[i]]));

  const months = rows.map((r) => r.month);
  const selectedMonth = requestedMonth && months.includes(requestedMonth) ? requestedMonth : months.at(-1);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="월별 추이"
        subtitle={`최근 ${rows.length}개월 매출·매입·손익 흐름 · ${
          selectedMonth ? monthLabel(selectedMonth) : "—"
        } 기준`}
        months={months}
        selectedMonth={selectedMonth}
        basePath="/monthly"
        reviewCount={reviewSummary.needsReview}
      />

      <Card
        title="월별 매출 vs 매입"
        subtitle={`단위: 백만원 · 최근 ${rows.length}개월 · 막대에 커서를 올리면 정확한 금액이 표시됩니다`}
      >
        <MonthlyComparisonChart
          data={rows.map((r) => ({
            label: r.month.slice(2).replace("-", "."),
            revenue: Math.round(r.revenue / 1_000_000),
            cost: Math.round(r.cost / 1_000_000),
            revenueWon: r.revenue,
            costWon: r.cost,
          }))}
        />
      </Card>

      <Card
        title="월별 손익 변화"
        subtitle="단위: 백만원 · 0 기준선 위 흑자 / 아래 적자 · 막대에 커서를 올리면 정확한 금액이 표시됩니다"
      >
        <RevenueRealProfitChart
          data={rows.map((r) => {
            const realProfitWon = r.profit - derivedOf(r.month);
            return {
              label: r.month.slice(2).replace("-", "."),
              month: r.month,
              revenue: Math.round(r.revenue / 1_000_000),
              realProfit: Math.round(realProfitWon / 1_000_000),
              revenueWon: r.revenue,
              realProfitWon,
            };
          })}
        />
      </Card>

      <Card title="보조 표" subtitle="단위 원">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium">월</th>
                <th className="py-2 pr-4 font-medium text-right">매출액</th>
                <th className="py-2 pr-4 font-medium text-right">매입액</th>
                <th className="py-2 pr-4 font-medium text-right">변동비 기준 손익</th>
                <th className="py-2 pr-4 font-medium text-right">이익률</th>
                <th className="py-2 pr-4 font-medium text-right">파생원가</th>
                <th className="py-2 pr-4 font-medium text-right">진짜 손익</th>
                <th className="py-2 font-medium text-right">전월 대비(진짜 손익)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...rows].reverse().map((r, i) => {
                const prev = rows[rows.length - 1 - i - 1];
                const derived = derivedOf(r.month);
                const realProfit = r.profit - derived;
                const prevRealProfit = prev ? prev.profit - derivedOf(prev.month) : null;
                const diff = prevRealProfit !== null ? realProfit - prevRealProfit : null;
                // 매출 0원 월은 이익률이 정의되지 않는다 — NaN/Infinity/0% 대신 "—".
                const marginRate = r.revenue > 0 ? (r.profit / r.revenue) * 100 : null;
                const derivedRow = derivedByMonth.find((d) => d.month === r.month) ?? null;
                return (
                  <ExpandableMonthRow
                    key={r.month}
                    month={r.month}
                    revenue={r.revenue}
                    cost={r.cost}
                    profit={r.profit}
                    derived={derived}
                    derivedBreakdown={derivedRow}
                    realProfit={realProfit}
                    marginRate={marginRate}
                    diff={diff}
                    isSelected={r.month === selectedMonth}
                    projects={projectsMap.get(r.month) ?? []}
                    adminRows={adminMap.get(r.month) ?? []}
                  />
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-slate-400">
                    아직 데이터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.some((r) => r.revenue === 0) && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mt-3">
            ⚠ 매출 미입력? 표시된 달은 매출이 실제로 0원이었다는 뜻이 아니라, 매출 세금계산서
            등 원본 자료가 아직 시스템에 입력되지 않았을 가능성이 있습니다. 원본 업로드 여부를
            확인해 주세요.
          </p>
        )}
      </Card>
    </div>
  );
}
